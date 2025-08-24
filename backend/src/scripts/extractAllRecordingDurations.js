#!/usr/bin/env node

/**
 * Script para extrair duração de TODAS as gravações sem duração no banco
 * Usa ffprobe via Docker para obter metadados dos arquivos
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const execAsync = promisify(exec);
const logger = createModuleLogger('ExtractAllRecordingDurations');

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
 * Extrai duração usando ffprobe via Docker
 */
async function extractDuration(filePath) {
  try {
    // Converter para path do Docker
    const dockerPath = filePath
      .replace(/\\/g, '/')
      .replace(/.*www\/record\/live/, 'www/record/live');
    
    logger.info(`🔍 Extraindo duração: ${dockerPath}`);
    
    const ffprobeCmd = `docker exec newcam-zlmediakit ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${dockerPath}"`;
    
    const { stdout } = await execAsync(ffprobeCmd, { timeout: 30000 });
    const duration = parseFloat(stdout.trim());
    
    if (duration && duration > 0) {
      return Math.round(duration);
    }
    
    return null;
  } catch (error) {
    logger.error(`❌ Erro ao extrair duração: ${error.message}`);
    return null;
  }
}

/**
 * Busca arquivo físico para uma gravação
 */
async function findRecordingFile(recording) {
  try {
    // Tentar usando PathResolver primeiro
    const fileInfo = await PathResolver.findRecordingFile(recording);
    if (fileInfo && fileInfo.exists) {
      return fileInfo.absolutePath;
    }
    
    // Fallback: busca manual baseada nos paths conhecidos
    const projectRoot = path.join(process.cwd(), '..');
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
  } catch (error) {
    logger.error(`❌ Erro ao buscar arquivo: ${error.message}`);
    return null;
  }
}

/**
 * Processa uma gravação para extrair duração
 */
async function processRecording(recording) {
  try {
    logger.info(`📹 Processando: ${recording.filename} (ID: ${recording.id.substring(0, 8)}...)`);
    
    // Buscar arquivo físico
    const filePath = await findRecordingFile(recording);
    
    if (!filePath) {
      logger.warn(`⚠️ Arquivo não encontrado: ${recording.filename}`);
      return { id: recording.id, status: 'file_not_found' };
    }
    
    // Extrair duração
    const duration = await extractDuration(filePath);
    
    if (!duration) {
      logger.warn(`⚠️ Não foi possível extrair duração: ${recording.filename}`);
      return { id: recording.id, status: 'duration_extraction_failed' };
    }
    
    // Atualizar no banco
    const { error } = await supabase
      .from('recordings')
      .update({ 
        duration,
        updated_at: new Date().toISOString()
      })
      .eq('id', recording.id);
    
    if (error) {
      logger.error(`❌ Erro ao atualizar duração no banco: ${error.message}`);
      return { id: recording.id, status: 'database_update_failed', error: error.message };
    }
    
    logger.info(`✅ Duração atualizada: ${recording.filename} = ${duration}s`);
    return { id: recording.id, status: 'success', duration };
    
  } catch (error) {
    logger.error(`❌ Erro ao processar gravação ${recording.id}: ${error.message}`);
    return { id: recording.id, status: 'error', error: error.message };
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    console.log('🚀 Iniciando extração de duração para TODAS as gravações...\n');
    
    // Verificar conexão com banco
    const { error: connectionError } = await supabase.from('recordings').select('count').limit(1);
    if (connectionError) {
      throw new Error(`Erro de conexão com Supabase: ${connectionError.message}`);
    }
    
    // Buscar gravações sem duração
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
    
    // Confirmar processamento
    console.log('⚠️  ATENÇÃO: Este script irá processar todas as gravações sem duração.');
    console.log('   Isso pode levar vários minutos dependendo da quantidade de arquivos.\n');
    
    // Processar cada gravação
    const results = {
      success: 0,
      file_not_found: 0,
      duration_extraction_failed: 0,
      database_update_failed: 0,
      error: 0
    };
    
    const startTime = Date.now();
    
    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      const progress = `[${i + 1}/${recordings.length}]`;
      
      console.log(`${progress} Processando ${recording.filename}...`);
      
      const result = await processRecording(recording);
      results[result.status]++;
      
      // Log de progresso a cada 10 gravações
      if ((i + 1) % 10 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const estimated = Math.round((elapsed / (i + 1)) * recordings.length);
        console.log(`\n📊 Progresso: ${i + 1}/${recordings.length} (${((i + 1) / recordings.length * 100).toFixed(1)}%)`);
        console.log(`⏱️  Tempo decorrido: ${elapsed}s | Estimado: ${estimated}s\n`);
      }
      
      // Pequena pausa para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Relatório final
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 RELATÓRIO FINAL:');
    console.log('='.repeat(50));
    console.log(`✅ Sucessos: ${results.success}`);
    console.log(`⚠️ Arquivos não encontrados: ${results.file_not_found}`);
    console.log(`⚠️ Falhas na extração: ${results.duration_extraction_failed}`);
    console.log(`❌ Falhas no banco: ${results.database_update_failed}`);
    console.log(`❌ Outros erros: ${results.error}`);
    
    const total = recordings.length;
    const processed = results.success + results.file_not_found + results.duration_extraction_failed;
    console.log(`\n🎯 Total processado: ${processed}/${total} (${((processed/total)*100).toFixed(1)}%)`);
    console.log(`⏱️  Tempo total: ${totalTime}s (${(totalTime/60).toFixed(1)} minutos)`);
    
    if (results.success > 0) {
      console.log(`\n🎉 ${results.success} gravações foram atualizadas com sucesso!`);
    }
    
    if (results.file_not_found > 0) {
      console.log(`\n⚠️  ${results.file_not_found} arquivos não foram encontrados.`);
      console.log(`   Isso pode indicar que os arquivos foram movidos ou deletados.`);
    }
    
  } catch (error) {
    logger.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('\n🏁 Script concluído com sucesso!');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Script falhou:', error);
    process.exit(1);
  });
}

export default { extractDuration, processRecording, main };