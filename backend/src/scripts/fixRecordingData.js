#!/usr/bin/env node

/**
 * Script de Correção Completa do Sistema de Gravação
 * 
 * Este script corrige problemas conhecidos no sistema:
 * 1. Vincula arquivos órfãos aos registros no banco
 * 2. Calcula duração faltante usando ffprobe
 * 3. Normaliza paths inconsistentes
 * 4. Remove registros duplicados
 * 5. Adiciona dados de câmera faltantes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do banco
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações
const DRY_RUN = process.env.DRY_RUN === 'true';
const STORAGE_PATHS = [
  path.join(__dirname, '../../../storage/www/record/live'),
  path.join(__dirname, '../../../storage/www/record'),
  path.join(__dirname, '../../../storage/www'),
  path.join(__dirname, '../../../storage/bin/www/record/live'),
  path.join(__dirname, '../../../storage/bin/www/record'),
];

console.log(`🔧 Iniciando correção do sistema de gravação ${DRY_RUN ? '(DRY RUN)' : '(MODO REAL)'}`);

/**
 * Calcula duração do arquivo usando ffprobe
 */
async function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ]);
    
    let output = '';
    ffprobe.stdout.on('data', (data) => output += data);
    ffprobe.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve(Math.round(parseFloat(output.trim())));
      } else {
        resolve(null);
      }
    });
    ffprobe.on('error', () => resolve(null));
  });
}

/**
 * Normaliza path para formato consistente
 */
function normalizePath(filePath) {
  if (!filePath) return null;
  
  // Converter caminhos Docker para Windows
  let normalized = filePath
    .replace(/^\/opt\/media\/bin\/www\//, 'storage/www/')
    .replace(/^\/opt\/media\/www\//, 'storage/www/')
    .replace(/^\/opt\/media\/bin\//, 'storage/')
    .replace(/^\/opt\/media\//, 'storage/')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  
  // Garantir que comece com storage/
  if (!normalized.startsWith('storage/')) {
    const pathParts = normalized.split('/');
    const storageIndex = pathParts.findIndex(part => part === 'storage');
    if (storageIndex !== -1) {
      normalized = pathParts.slice(storageIndex).join('/');
    }
  }
  
  return normalized;
}

/**
 * Busca arquivos MP4 em todos os diretórios
 */
async function findAllMP4Files() {
  const files = [];
  
  for (const basePath of STORAGE_PATHS) {
    try {
      await scanDirectory(basePath, files);
    } catch (error) {
      console.warn(`⚠️ Erro ao escanear ${basePath}:`, error.message);
    }
  }
  
  return files;
}

/**
 * Escaneia diretório recursivamente
 */
async function scanDirectory(dirPath, files) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await scanDirectory(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(path.join(__dirname, '../../..'), fullPath).replace(/\\/g, '/');
        
        files.push({
          fullPath,
          relativePath: normalizePath(relativePath),
          filename: entry.name,
          size: stats.size,
          mtime: stats.mtime,
          // Extrair camera_id do caminho se possível
          cameraId: extractCameraIdFromPath(relativePath)
        });
      }
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao ler diretório ${dirPath}:`, error.message);
  }
}

/**
 * Extrai camera_id do caminho do arquivo
 */
function extractCameraIdFromPath(filePath) {
  // Formato esperado: storage/www/record/live/{camera_id}/{date}/{filename}
  const match = filePath.match(/storage\/www\/record\/live\/([a-f0-9-]{36})\//);
  return match ? match[1] : null;
}

/**
 * Busca gravações no banco de dados
 */
async function getRecordings() {
  const { data, error } = await supabase
    .from('recordings')
    .select(`
      id,
      camera_id,
      filename,
      file_path,
      local_path,
      file_size,
      duration,
      start_time,
      end_time,
      status,
      created_at,
      cameras (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Erro ao buscar gravações: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Busca câmeras no banco de dados
 */
async function getCameras() {
  const { data, error } = await supabase
    .from('cameras')
    .select('id, name');
  
  if (error) {
    throw new Error(`Erro ao buscar câmeras: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Vincula arquivo órfão a gravação existente
 */
async function linkOrphanFile(file, recording, calculatedDuration) {
  const updateData = {
    filename: file.filename,
    file_path: file.relativePath,
    local_path: file.relativePath,
    file_size: file.size,
    updated_at: new Date().toISOString()
  };
  
  if (calculatedDuration) {
    updateData.duration = calculatedDuration;
    if (recording.start_time) {
      updateData.end_time = new Date(new Date(recording.start_time).getTime() + (calculatedDuration * 1000)).toISOString();
    }
  }
  
  if (!DRY_RUN) {
    const { error } = await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recording.id);
    
    if (error) {
      throw new Error(`Erro ao atualizar gravação ${recording.id}: ${error.message}`);
    }
  }
  
  return updateData;
}

/**
 * Cria nova gravação para arquivo órfão
 */
async function createRecordingForOrphanFile(file, cameras, calculatedDuration) {
  const camera = cameras.find(c => c.id === file.cameraId);
  
  if (!camera && file.cameraId) {
    console.warn(`⚠️ Câmera ${file.cameraId} não encontrada para arquivo ${file.filename}`);
    return null;
  }
  
  const now = new Date().toISOString();
  const recordingData = {
    camera_id: file.cameraId,
    filename: file.filename,
    file_path: file.relativePath,
    local_path: file.relativePath,
    file_size: file.size,
    duration: calculatedDuration,
    start_time: new Date(file.mtime.getTime() - (calculatedDuration * 1000)).toISOString(),
    end_time: file.mtime.toISOString(),
    started_at: new Date(file.mtime.getTime() - (calculatedDuration * 1000)).toISOString(),
    ended_at: file.mtime.toISOString(),
    status: 'completed',
    quality: 'medium',
    format: 'mp4',
    created_at: now,
    updated_at: now,
    metadata: {
      created_by: 'fixRecordingData_script',
      source: 'orphan_file_recovery'
    }
  };
  
  if (!DRY_RUN) {
    const { data, error } = await supabase
      .from('recordings')
      .insert(recordingData)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erro ao criar gravação para ${file.filename}: ${error.message}`);
    }
    
    return data;
  }
  
  return recordingData;
}

/**
 * Remove registros duplicados
 */
async function removeDuplicates(recordings) {
  const duplicates = [];
  const seen = new Map();
  
  for (const recording of recordings) {
    const key = `${recording.camera_id}_${recording.filename || 'no_filename'}`;
    
    if (seen.has(key)) {
      const existing = seen.get(key);
      // Manter o registro com mais dados
      if (recording.file_path && !existing.file_path) {
        duplicates.push(existing.id);
        seen.set(key, recording);
      } else {
        duplicates.push(recording.id);
      }
    } else {
      seen.set(key, recording);
    }
  }
  
  if (duplicates.length > 0) {
    console.log(`🗑️ Encontradas ${duplicates.length} gravações duplicadas`);
    
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('recordings')
        .delete()
        .in('id', duplicates);
      
      if (error) {
        throw new Error(`Erro ao remover duplicatas: ${error.message}`);
      }
    }
  }
  
  return duplicates.length;
}

/**
 * Função principal
 */
async function main() {
  try {
    console.log('🔍 Buscando arquivos MP4...');
    const files = await findAllMP4Files();
    console.log(`📁 Encontrados ${files.length} arquivos MP4`);
    
    console.log('🔍 Buscando gravações no banco...');
    const recordings = await getRecordings();
    console.log(`📊 Encontradas ${recordings.length} gravações no banco`);
    
    console.log('🔍 Buscando câmeras...');
    const cameras = await getCameras();
    console.log(`📹 Encontradas ${cameras.length} câmeras`);
    
    // Estatísticas
    let linkedFiles = 0;
    let createdRecordings = 0;
    let updatedDurations = 0;
    let normalizedPaths = 0;
    
    // 1. Remover duplicatas primeiro
    console.log('\\n🧹 Removendo registros duplicados...');
    const removedDuplicates = await removeDuplicates(recordings);
    console.log(`✅ ${removedDuplicates} duplicatas ${DRY_RUN ? 'seriam removidas' : 'removidas'}`);
    
    // 2. Processar arquivos órfãos
    console.log('\\n🔗 Processando arquivos órfãos...');
    
    for (const file of files) {
      // Buscar gravação correspondente
      let matchedRecording = recordings.find(r => 
        r.filename === file.filename && r.camera_id === file.cameraId
      );
      
      if (!matchedRecording) {
        // Buscar por gravação sem file_path da mesma câmera
        matchedRecording = recordings.find(r => 
          r.camera_id === file.cameraId && !r.file_path && r.status === 'recording'
        );
      }
      
      // Calcular duração se necessário
      let calculatedDuration = null;
      if (file.size > 1000) { // Apenas para arquivos > 1KB
        calculatedDuration = await getVideoDuration(file.fullPath);
      }
      
      if (matchedRecording && !matchedRecording.file_path) {
        // Vincular arquivo a gravação existente
        console.log(`🔗 Vinculando ${file.filename} à gravação ${matchedRecording.id}`);
        
        const updateData = await linkOrphanFile(file, matchedRecording, calculatedDuration);
        linkedFiles++;
        
        if (calculatedDuration) updatedDurations++;
        
      } else if (!matchedRecording && file.cameraId) {
        // Criar nova gravação para arquivo órfão
        console.log(`➕ Criando gravação para arquivo órfão ${file.filename}`);
        
        const newRecording = await createRecordingForOrphanFile(file, cameras, calculatedDuration);
        if (newRecording) {
          createdRecordings++;
        }
      }
    }
    
    // 3. Normalizar paths existentes
    console.log('\\n🔧 Normalizando paths...');
    for (const recording of recordings) {
      if (recording.file_path) {
        const normalizedPath = normalizePath(recording.file_path);
        if (normalizedPath !== recording.file_path) {
          console.log(`🔧 Normalizando path: ${recording.file_path} → ${normalizedPath}`);
          
          if (!DRY_RUN) {
            const { error } = await supabase
              .from('recordings')
              .update({ 
                file_path: normalizedPath,
                local_path: normalizedPath,
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);
            
            if (error) {
              console.error(`❌ Erro ao normalizar path da gravação ${recording.id}:`, error);
            }
          }
          
          normalizedPaths++;
        }
      }
    }
    
    // 4. Calcular durações faltantes
    console.log('\\n⏱️ Calculando durações faltantes...');
    for (const recording of recordings) {
      if (!recording.duration && recording.file_path && recording.start_time && recording.end_time) {
        const startTime = new Date(recording.start_time);
        const endTime = new Date(recording.end_time);
        const calculatedDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        
        if (calculatedDuration > 0) {
          console.log(`⏱️ Calculando duração para gravação ${recording.id}: ${calculatedDuration}s`);
          
          if (!DRY_RUN) {
            const { error } = await supabase
              .from('recordings')
              .update({ 
                duration: calculatedDuration,
                updated_at: new Date().toISOString()
              })
              .eq('id', recording.id);
            
            if (error) {
              console.error(`❌ Erro ao atualizar duração da gravação ${recording.id}:`, error);
            }
          }
          
          updatedDurations++;
        }
      }
    }
    
    // Resumo final
    console.log('\\n' + '='.repeat(60));
    console.log('📊 RESUMO DA CORREÇÃO');
    console.log('='.repeat(60));
    console.log(`📁 Arquivos processados: ${files.length}`);
    console.log(`🔗 Arquivos vinculados: ${linkedFiles}`);
    console.log(`➕ Gravações criadas: ${createdRecordings}`);
    console.log(`⏱️ Durações calculadas: ${updatedDurations}`);
    console.log(`🔧 Paths normalizados: ${normalizedPaths}`);
    console.log(`🗑️ Duplicatas removidas: ${removedDuplicates}`);
    console.log('');
    console.log(`✅ Correção ${DRY_RUN ? 'simulada' : 'aplicada'} com sucesso!`);
    
    if (DRY_RUN) {
      console.log('');
      console.log('💡 Para aplicar as correções, execute novamente sem DRY_RUN=true');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a correção:', error);
    process.exit(1);
  }
}

// Executar script
main();