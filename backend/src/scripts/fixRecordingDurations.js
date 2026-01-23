/**
 * Script para corrigir durações de gravações existentes
 * Usa FFprobe para extrair a duração real dos arquivos MP4
 * Suporta arquivos locais e download temporário do S3
 *
 * Uso: node src/scripts/fixRecordingDurations.js [--dry-run] [--camera=CAMERA_NAME] [--limit=N]
 */

import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

dotenv.config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure S3 client for Wasabi
const s3 = new AWS.S3({
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
  region: process.env.WASABI_REGION || 'us-east-1',
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.WASABI_BUCKET || 'newcam-recordings';

// Paths where recordings might be stored locally
const RECORDING_PATHS = [
  '/var/lib/docker/volumes/newcam_srs_data/_data/record/live',
  '/root/NewCAM/backend/storage/www/record/live',
  './storage/www/record/live'
];

// Temp directory for S3 downloads
const TEMP_DIR = path.join(os.tmpdir(), 'newcam-duration-fix');

/**
 * Initialize temp directory
 */
async function initTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log(`📁 Diretório temporário: ${TEMP_DIR}`);
  } catch (error) {
    console.error('Erro ao criar diretório temporário:', error);
  }
}

/**
 * Clean up temp directory
 */
async function cleanupTempDir() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    for (const file of files) {
      await fs.unlink(path.join(TEMP_DIR, file)).catch(() => {});
    }
    console.log(`🧹 Diretório temporário limpo`);
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Download file from S3 to temp location
 */
async function downloadFromS3(s3Key) {
  const tempPath = path.join(TEMP_DIR, `temp_${Date.now()}_${path.basename(s3Key)}`);

  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    const data = await s3.getObject(params).promise();
    await fs.writeFile(tempPath, data.Body);

    return tempPath;
  } catch (error) {
    console.error(`  Erro ao baixar do S3 ${s3Key}:`, error.message);
    return null;
  }
}

/**
 * Stream download from S3 (for large files)
 */
async function streamDownloadFromS3(s3Key) {
  const tempPath = path.join(TEMP_DIR, `temp_${Date.now()}_${path.basename(s3Key)}`);

  return new Promise((resolve, reject) => {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    const writeStream = createWriteStream(tempPath);
    const readStream = s3.getObject(params).createReadStream();

    readStream.on('error', (err) => {
      writeStream.destroy();
      fs.unlink(tempPath).catch(() => {});
      reject(err);
    });

    writeStream.on('error', (err) => {
      readStream.destroy();
      fs.unlink(tempPath).catch(() => {});
      reject(err);
    });

    writeStream.on('finish', () => {
      resolve(tempPath);
    });

    readStream.pipe(writeStream);
  });
}

/**
 * Delete temp file
 */
async function deleteTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore deletion errors
  }
}

/**
 * Extract duration from MP4 file using FFprobe
 */
async function extractDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 60000 }
    );
    const duration = parseFloat(stdout.trim());
    if (isNaN(duration) || duration <= 0) {
      return null;
    }
    return Math.round(duration);
  } catch (error) {
    console.error(`  FFprobe error:`, error.message);
    return null;
  }
}

/**
 * Find recording file in various local paths
 */
async function findLocalFile(recording) {
  const possiblePaths = [];

  // Try local_path first
  if (recording.local_path) {
    possiblePaths.push(recording.local_path);
  }

  // Try file_path
  if (recording.file_path) {
    for (const basePath of RECORDING_PATHS) {
      possiblePaths.push(path.join(basePath, recording.file_path));
    }
  }

  // Try constructing path from filename
  if (recording.filename) {
    const streamMatch = recording.filename.match(/^(stream\d+)/);
    if (streamMatch) {
      const streamKey = streamMatch[1];
      const date = recording.created_at ? new Date(recording.created_at).toISOString().split('T')[0] : null;
      if (date) {
        for (const basePath of RECORDING_PATHS) {
          possiblePaths.push(path.join(basePath, streamKey, date, recording.filename));
        }
      }
    }
  }

  // Check each path
  for (const filePath of possiblePaths) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist at this path
    }
  }

  return null;
}

/**
 * Get file for duration extraction (local or S3)
 */
async function getFileForDuration(recording) {
  // First try local file
  const localPath = await findLocalFile(recording);
  if (localPath) {
    return { path: localPath, isTemp: false };
  }

  // If recording has s3_key, download from S3
  if (recording.s3_key) {
    console.log(`    📥 Baixando do S3...`);
    try {
      const tempPath = await streamDownloadFromS3(recording.s3_key);
      return { path: tempPath, isTemp: true };
    } catch (error) {
      console.error(`    ❌ Falha no download S3:`, error.message);
      return null;
    }
  }

  return null;
}

/**
 * Main function
 */
async function fixDurations() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cameraArg = args.find(a => a.startsWith('--camera='));
  const limitArg = args.find(a => a.startsWith('--limit='));
  const cameraFilter = cameraArg ? cameraArg.split('=')[1] : null;
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;

  console.log('='.repeat(60));
  console.log('📊 Script de Correção de Durações de Gravações');
  console.log('='.repeat(60));
  console.log(`Modo: ${dryRun ? 'DRY RUN (sem alterações)' : 'PRODUÇÃO'}`);
  console.log(`Limite: ${limit} gravações`);
  if (cameraFilter) {
    console.log(`Filtro de câmera: ${cameraFilter}`);
  }
  console.log('');

  // Initialize temp directory
  await initTempDir();

  // Build query - focus on recordings with potentially wrong durations
  let query = supabase
    .from('recordings')
    .select('id, filename, duration, file_path, local_path, s3_key, created_at, camera_id, metadata, cameras!inner(name)')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Filter by camera name if specified
  if (cameraFilter) {
    query = query.ilike('cameras.name', `%${cameraFilter}%`);
  }

  const { data: recordings, error } = await query;

  if (error) {
    console.error('Erro ao buscar gravações:', error);
    process.exit(1);
  }

  console.log(`📋 Total de gravações encontradas: ${recordings.length}`);
  console.log('');

  let fixed = 0;
  let notFound = 0;
  let unchanged = 0;
  let errors = 0;
  let s3Downloads = 0;

  for (const recording of recordings) {
    const cameraName = recording.cameras?.name || 'Unknown';
    const currentDuration = recording.duration;
    const currentMinutes = currentDuration ? Math.round(currentDuration / 60) : 0;
    const hasS3Key = !!recording.s3_key;

    process.stdout.write(`\n[${recording.filename}] (${cameraName}) - Atual: ${currentMinutes} min${hasS3Key ? ' [S3]' : ''}... `);

    // Get file path (local or S3 download)
    const fileInfo = await getFileForDuration(recording);

    if (!fileInfo) {
      process.stdout.write('❌ Arquivo não encontrado');
      notFound++;
      continue;
    }

    if (fileInfo.isTemp) {
      s3Downloads++;
    }

    // Extract real duration
    const realDuration = await extractDuration(fileInfo.path);

    // Clean up temp file if it was downloaded from S3
    if (fileInfo.isTemp) {
      await deleteTempFile(fileInfo.path);
    }

    if (!realDuration) {
      process.stdout.write('⚠️ FFprobe falhou');
      errors++;
      continue;
    }

    const realMinutes = Math.round(realDuration / 60);
    const diff = Math.abs(realDuration - (currentDuration || 0));

    // Only update if difference is significant (more than 60 seconds)
    if (diff > 60) {
      if (dryRun) {
        process.stdout.write(`🔄 Seria corrigido: ${currentMinutes}min → ${realMinutes}min`);
        fixed++;
      } else {
        // Update database
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            duration: realDuration,
            end_time: new Date(new Date(recording.created_at).getTime() + realDuration * 1000).toISOString(),
            metadata: {
              ...recording.metadata,
              duration_source: 'ffprobe_fix',
              duration_fixed_at: new Date().toISOString(),
              previous_duration: currentDuration
            }
          })
          .eq('id', recording.id);

        if (updateError) {
          process.stdout.write(`❌ Erro ao atualizar: ${updateError.message}`);
          errors++;
        } else {
          process.stdout.write(`✅ Corrigido: ${currentMinutes}min → ${realMinutes}min`);
          fixed++;
        }
      }
    } else {
      process.stdout.write(`✓ OK (${realMinutes}min)`);
      unchanged++;
    }
  }

  // Cleanup
  await cleanupTempDir();

  console.log('\n');
  console.log('='.repeat(60));
  console.log('📊 Resumo:');
  console.log(`  ✅ Corrigidas: ${fixed}`);
  console.log(`  ✓ Sem alteração: ${unchanged}`);
  console.log(`  ❌ Arquivo não encontrado: ${notFound}`);
  console.log(`  ⚠️ Erros: ${errors}`);
  console.log(`  📥 Downloads S3: ${s3Downloads}`);
  console.log('='.repeat(60));

  if (dryRun && fixed > 0) {
    console.log('\n💡 Execute sem --dry-run para aplicar as correções.');
  }
}

fixDurations().catch(console.error);
