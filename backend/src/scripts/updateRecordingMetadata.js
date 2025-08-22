#!/usr/bin/env node

/**
 * Script para corrigir filenames que começam com ponto (.) nas gravações
 * Remove o prefixo de ponto dos campos filename, file_path e local_path
 */

import { createClient } from '@supabase/supabase-js';
import winston from 'winston';

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message} ${metaString}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Remove o prefixo de ponto do início de um path/filename
 */
function removeDotPrefix(path) {
  if (!path) return path;
  
  // Se o path termina com um arquivo que começa com ponto, remover apenas do filename
  const parts = path.split('/');
  const lastPart = parts[parts.length - 1];
  
  if (lastPart && lastPart.startsWith('.')) {
    parts[parts.length - 1] = lastPart.substring(1);
    return parts.join('/');
  }
  
  return path;
}

/**
 * Atualizar recordings com filenames que começam com ponto
 */
async function updateRecordingsWithDotPrefix() {
  try {
    logger.info('🔍 Buscando recordings com filenames que começam com ponto...');
    
    // Buscar todas as gravações que têm filename começando com ponto
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('id, filename, file_path, local_path, camera_id, created_at')
      .ilike('filename', '.%'); // Filename começa com ponto
      
    if (fetchError) {
      logger.error('❌ Erro ao buscar recordings:', fetchError);
      return false;
    }
    
    if (!recordings || recordings.length === 0) {
      logger.info('✅ Nenhuma recording com filename iniciado por ponto encontrada');
      return true;
    }
    
    logger.info(`📊 Encontradas ${recordings.length} recordings para corrigir`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const recording of recordings) {
      try {
        const originalFilename = recording.filename;
        const originalFilePath = recording.file_path;
        const originalLocalPath = recording.local_path;
        
        // Remover prefixo de ponto
        const cleanFilename = originalFilename.startsWith('.') ? originalFilename.substring(1) : originalFilename;
        const cleanFilePath = removeDotPrefix(originalFilePath);
        const cleanLocalPath = removeDotPrefix(originalLocalPath);
        
        logger.info(`🔧 Corrigindo recording ${recording.id}:`, {
          original: {
            filename: originalFilename,
            file_path: originalFilePath,
            local_path: originalLocalPath
          },
          clean: {
            filename: cleanFilename,
            file_path: cleanFilePath,
            local_path: cleanLocalPath
          }
        });
        
        // Atualizar no banco de dados
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            filename: cleanFilename,
            file_path: cleanFilePath,
            local_path: cleanLocalPath,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);
          
        if (updateError) {
          logger.error(`❌ Erro ao atualizar recording ${recording.id}:`, updateError);
          errorCount++;
        } else {
          logger.info(`✅ Recording ${recording.id} atualizada com sucesso`);
          successCount++;
        }
        
      } catch (recordingError) {
        logger.error(`❌ Erro ao processar recording ${recording.id}:`, recordingError);
        errorCount++;
      }
    }
    
    logger.info('📊 RESUMO DA EXECUÇÃO:', {
      total: recordings.length,
      sucesso: successCount,
      erro: errorCount
    });
    
    return errorCount === 0;
    
  } catch (error) {
    logger.error('❌ Erro geral no script:', error);
    return false;
  }
}

/**
 * Verificar se há inconsistências após a correção
 */
async function verifyRecordings() {
  try {
    logger.info('🔍 Verificando recordings após correção...');
    
    // Buscar gravações que ainda tenham filename com ponto
    const { data: stillWithDot, error } = await supabase
      .from('recordings')
      .select('id, filename')
      .ilike('filename', '.%');
      
    if (error) {
      logger.error('❌ Erro na verificação:', error);
      return false;
    }
    
    if (stillWithDot && stillWithDot.length > 0) {
      logger.warn(`⚠️ Ainda existem ${stillWithDot.length} recordings com filename iniciado por ponto:`, 
        stillWithDot.map(r => ({ id: r.id, filename: r.filename }))
      );
      return false;
    }
    
    logger.info('✅ Verificação concluída: nenhuma recording com filename iniciado por ponto encontrada');
    return true;
    
  } catch (error) {
    logger.error('❌ Erro na verificação:', error);
    return false;
  }
}

/**
 * Script principal
 */
async function main() {
  logger.info('🚀 Iniciando correção de filenames com prefixo de ponto...');
  
  const updateSuccess = await updateRecordingsWithDotPrefix();
  
  if (!updateSuccess) {
    logger.error('❌ Falha na atualização das recordings');
    process.exit(1);
  }
  
  const verifySuccess = await verifyRecordings();
  
  if (!verifySuccess) {
    logger.error('❌ Falha na verificação pós-correção');
    process.exit(1);
  }
  
  logger.info('🎉 Script concluído com sucesso! Todas as recordings foram corrigidas.');
  process.exit(0);
}

// Executar script
main().catch(error => {
  logger.error('💥 Erro fatal no script:', error);
  process.exit(1);
});