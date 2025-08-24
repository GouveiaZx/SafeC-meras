#!/usr/bin/env node

/**
 * Script simplificado para extrair duração de gravações sem duração
 * Usa apenas ffprobe e conexão direta com banco
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Configuração simples do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Extrai duração usando ffprobe (local ou S3)
 */
async function extractDurationWithFfprobe(filePath, isS3Url = false) {
  try {
    if (isS3Url) {
      // Para URLs S3, usar ffprobe diretamente na URL
      console.log(`🌐 Extraindo duração de S3: ${filePath.substring(0, 50)}...`);
      
      const ffprobeCmd = `docker exec newcam-zlmediakit ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
      
      const { stdout } = await execAsync(ffprobeCmd, { timeout: 60000 });
      const duration = parseFloat(stdout.trim());
      
      if (duration && duration > 0) {
        return Math.round(duration);
      }
    } else {
      // Para arquivos locais
      const dockerPath = filePath
        .replace(/\\/g, '/')
        .replace(/.*www\/record\/live/, 'www/record/live');
      
      console.log(`🔍 Extraindo duração local: ${dockerPath}`);
      
      const ffprobeCmd = `docker exec newcam-zlmediakit ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${dockerPath}"`;
      
      const { stdout } = await execAsync(ffprobeCmd, { timeout: 30000 });
      const duration = parseFloat(stdout.trim());
      
      if (duration && duration > 0) {
        return Math.round(duration);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Erro ao extrair duração: ${error.message}`);
    return null;
  }
}

/**
 * Gera URL presigned do S3 para ffprobe
 */
async function getS3PresignedUrl(s3Key) {
  try {
    // Usar o S3Service para gerar URL presigned
    const S3Service = (await import('../services/S3Service.js')).default;
    const presignedUrl = await S3Service.getSignedUrl(s3Key, {
      expiresIn: 3600 // 1 hora
    });
    return presignedUrl;
  } catch (error) {
    console.error(`❌ Erro ao gerar URL S3: ${error.message}`);
    return null;
  }
}

/**
 * Busca arquivo simples
 */
async function findRecordingFileSimple(recording) {
  const projectRoot = process.cwd() + '/../';
  
  // Caminhos possíveis para buscar
  const possiblePaths = [
    recording.local_path,
    recording.file_path,
    `storage/www/record/live/${recording.camera_id}/${recording.filename}`,
    `../storage/www/record/live/${recording.camera_id}/${recording.filename}`
  ].filter(Boolean);
  
  for (const relativePath of possiblePaths) {
    let fullPath;
    if (path.isAbsolute(relativePath)) {
      fullPath = relativePath;
    } else {
      fullPath = path.resolve(projectRoot, relativePath);
    }
    
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Processa uma gravação
 */
async function processRecordingSimple(recording) {
  try {
    console.log(`📹 Processando: ${recording.filename}`);
    
    let duration = null;
    
    // Primeiro tentar arquivo local
    const filePath = await findRecordingFileSimple(recording);
    
    if (filePath) {
      console.log(`📁 Arquivo local encontrado`);
      duration = await extractDurationWithFfprobe(filePath, false);
    } 
    // Se não encontrou local, tentar S3
    else if (recording.upload_status === 'uploaded' && recording.s3_key) {
      console.log(`🌐 Arquivo não encontrado localmente, tentando S3...`);
      
      const s3Url = await getS3PresignedUrl(recording.s3_key);
      if (s3Url) {
        duration = await extractDurationWithFfprobe(s3Url, true);
      } else {
        console.log(`❌ Não foi possível gerar URL S3`);
        return 'duration_extraction_failed';
      }
    } else {
      console.log(`⚠️ Arquivo não encontrado (local e S3): ${recording.filename}`);
      return 'file_not_found';
    }
    
    if (!duration) {
      console.log(`⚠️ Não foi possível extrair duração: ${recording.filename}`);
      return 'duration_extraction_failed';
    }
    
    // Atualizar banco
    const { error } = await supabase
      .from('recordings')
      .update({ 
        duration,
        updated_at: new Date().toISOString()
      })
      .eq('id', recording.id);
    
    if (error) {
      console.error(`❌ Erro ao atualizar banco: ${error.message}`);
      return 'database_update_failed';
    }
    
    console.log(`✅ Duração atualizada: ${recording.filename} = ${duration}s`);
    return 'success';
    
  } catch (error) {
    console.error(`❌ Erro ao processar: ${error.message}`);
    return 'error';
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Iniciando extração simplificada de duração...\n');
    
    // Buscar gravações sem duração
    console.log('🔍 Buscando gravações sem duração...');
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .or('duration.is.null,duration.eq.0')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Erro ao buscar gravações: ${error.message}`);
    }
    
    if (!recordings || recordings.length === 0) {
      console.log('✅ Todas as gravações já possuem duração definida');
      return;
    }
    
    console.log(`📊 Encontradas ${recordings.length} gravações sem duração\n`);
    
    // Processar cada gravação
    const results = { success: 0, file_not_found: 0, duration_extraction_failed: 0, database_update_failed: 0, error: 0 };
    
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      console.log(`\n[${i + 1}/${recordings.length}] ${recording.filename}`);
      
      const result = await processRecordingSimple(recording);
      results[result]++;
      
      // Pausa pequena
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Relatório
    console.log('\n' + '='.repeat(50));
    console.log('📊 RELATÓRIO FINAL:');
    console.log('='.repeat(50));
    console.log(`✅ Sucessos: ${results.success}`);
    console.log(`⚠️ Arquivos não encontrados: ${results.file_not_found}`);
    console.log(`⚠️ Falhas na extração: ${results.duration_extraction_failed}`);
    console.log(`❌ Falhas no banco: ${results.database_update_failed}`);
    console.log(`❌ Outros erros: ${results.error}`);
    
    if (results.success > 0) {
      console.log(`\n🎉 ${results.success} gravações foram atualizadas!`);
    }
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar
main().then(() => {
  console.log('\n🏁 Script concluído!');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Script falhou:', error);
  process.exit(1);
});