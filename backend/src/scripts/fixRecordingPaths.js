#!/usr/bin/env node

/**
 * Script para corrigir paths com prefixos de ponto em gravações existentes
 * Remove pontos dos nomes de arquivo em filename, file_path e local_path
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
const DRY_RUN = process.env.DRY_RUN === 'true';

/**
 * Remover ponto do início de filename se existir
 */
function cleanFilename(filename) {
  if (!filename || typeof filename !== 'string') return filename;
  
  if (filename.startsWith('.') && filename.endsWith('.mp4')) {
    return filename.substring(1);
  }
  
  return filename;
}

/**
 * Remover ponto do início do filename em um path
 */
function cleanPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  
  const pathParts = filePath.split('/');
  const filename = pathParts[pathParts.length - 1];
  
  if (filename && filename.startsWith('.') && filename.endsWith('.mp4')) {
    pathParts[pathParts.length - 1] = filename.substring(1);
    return pathParts.join('/');
  }
  
  return filePath;
}

/**
 * Buscar gravações com pontos nos filenames ou paths
 */
async function findRecordingsWithDots() {
  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id, filename, file_path, local_path, camera_id, created_at, status')
    .or('filename.like.%.%,file_path.like.%/.%,local_path.like.%/.%')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erro ao buscar gravações: ${error.message}`);
  }

  // Filtrar apenas as que realmente têm pontos problemáticos
  const problematicRecordings = recordings.filter(rec => {
    const hasProblematicFilename = rec.filename && rec.filename.startsWith('.');
    const hasProblematicFilePath = rec.file_path && rec.file_path.includes('/.');
    const hasProblematicLocalPath = rec.local_path && rec.local_path.includes('/.');
    
    return hasProblematicFilename || hasProblematicFilePath || hasProblematicLocalPath;
  });

  return problematicRecordings;
}

/**
 * Corrigir uma gravação específica
 */
async function fixRecording(recording) {
  const originalFilename = recording.filename;
  const originalFilePath = recording.file_path;
  const originalLocalPath = recording.local_path;

  const cleanedFilename = cleanFilename(originalFilename);
  const cleanedFilePath = cleanPath(originalFilePath);
  const cleanedLocalPath = cleanPath(originalLocalPath);

  const hasChanges = (
    cleanedFilename !== originalFilename ||
    cleanedFilePath !== originalFilePath ||
    cleanedLocalPath !== originalLocalPath
  );

  if (!hasChanges) {
    logger.debug(`⏭️ Gravação ${recording.id} já está correta`);
    return { fixed: false, reason: 'already_correct' };
  }

  const updateData = {
    filename: cleanedFilename,
    file_path: cleanedFilePath,
    local_path: cleanedLocalPath,
    metadata: {
      ...recording.metadata,
      path_fixed_by: 'fixRecordingPaths',
      path_fixed_at: new Date().toISOString(),
      original_filename: originalFilename,
      original_file_path: originalFilePath,
      original_local_path: originalLocalPath
    },
    updated_at: new Date().toISOString()
  };

  if (DRY_RUN) {
    logger.info(`[DRY RUN] Corrigiria gravação ${recording.id}:`, {
      original: {
        filename: originalFilename,
        file_path: originalFilePath,
        local_path: originalLocalPath
      },
      cleaned: {
        filename: cleanedFilename,
        file_path: cleanedFilePath,
        local_path: cleanedLocalPath
      }
    });
    return { fixed: true, reason: 'dry_run' };
  }

  const { error } = await supabase
    .from('recordings')
    .update(updateData)
    .eq('id', recording.id);

  if (error) {
    logger.error(`❌ Erro ao corrigir gravação ${recording.id}:`, error);
    return { fixed: false, reason: 'database_error', error };
  }

  logger.info(`✅ Gravação corrigida ${recording.id}:`, {
    filename: `${originalFilename} → ${cleanedFilename}`,
    file_path: `${originalFilePath} → ${cleanedFilePath}`,
    local_path: `${originalLocalPath} → ${cleanedLocalPath}`
  });

  return { fixed: true, reason: 'success' };
}

/**
 * Script principal
 */
async function main() {
  logger.info(`🔧 Iniciando correção de paths com pontos${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  let stats = {
    found: 0,
    fixed: 0,
    already_correct: 0,
    errors: 0
  };

  try {
    // Buscar gravações problemáticas
    const problematicRecordings = await findRecordingsWithDots();
    stats.found = problematicRecordings.length;

    logger.info(`📊 Encontradas ${stats.found} gravações com pontos problemáticos`);

    if (stats.found === 0) {
      logger.info('✅ Nenhuma gravação com pontos encontrada');
      return;
    }

    // Mostrar algumas amostras
    logger.info('📝 Amostras de gravações problemáticas:');
    problematicRecordings.slice(0, 5).forEach(rec => {
      logger.info(`  - ID: ${rec.id}`);
      logger.info(`    Filename: ${rec.filename}`);
      logger.info(`    File Path: ${rec.file_path}`);
      logger.info(`    Local Path: ${rec.local_path}`);
    });

    // Corrigir gravações
    for (const recording of problematicRecordings) {
      try {
        const result = await fixRecording(recording);
        
        if (result.fixed) {
          if (result.reason === 'success' || result.reason === 'dry_run') {
            stats.fixed++;
          }
        } else if (result.reason === 'already_correct') {
          stats.already_correct++;
        } else {
          stats.errors++;
        }

      } catch (error) {
        logger.error(`❌ Erro ao processar gravação ${recording.id}:`, error);
        stats.errors++;
      }
    }

    // Estatísticas finais
    logger.info('📊 RESUMO DA CORREÇÃO:', {
      encontradas: stats.found,
      corrigidas: stats.fixed,
      ja_corretas: stats.already_correct,
      erros: stats.errors,
      modo: DRY_RUN ? 'DRY RUN' : 'EXECUÇÃO'
    });

    if (DRY_RUN && stats.fixed > 0) {
      logger.info('💡 Para executar as correções, execute sem DRY_RUN=true');
    }

    logger.info('🎉 Correção concluída com sucesso!');
    process.exit(0);

  } catch (error) {
    logger.error('💥 Erro durante a correção:', error);
    process.exit(1);
  }
}

// Executar script
main().catch(error => {
  logger.error('💥 Erro fatal:', error);
  process.exit(1);
});