#!/usr/bin/env node

/**
 * Script para atualizar durações de gravações
 * Calcula duração baseada em start_time e timestamps de arquivo, ou usa ffprobe via Docker
 */

import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

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
 * Obter duração via ffprobe usando Docker
 */
async function getDurationViaFFProbe(filePath) {
  try {
    const dockerPath = filePath.replace(/\\/g, '/').replace('storage/', '/opt/media/bin/');
    
    const result = await new Promise((resolve, reject) => {
      const ffprobe = spawn('docker', [
        'exec', 'newcam-zlmediakit', 'ffprobe',
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        dockerPath
      ]);
      
      let output = '';
      ffprobe.stdout.on('data', (data) => output += data);
      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const duration = parseFloat(output.trim());
          resolve(isNaN(duration) ? null : Math.round(duration));
        } else {
          resolve(null);
        }
      });
      ffprobe.on('error', () => resolve(null));
    });
    
    return result;
  } catch (error) {
    logger.debug(`Erro ao usar ffprobe: ${error.message}`);
    return null;
  }
}

/**
 * Calcular duração baseada em arquivo
 */
async function getDurationFromFile(recording) {
  try {
    // Tentar ffprobe via Docker primeiro
    if (recording.file_path) {
      const fullPath = path.resolve(process.cwd(), recording.file_path);
      const ffprobeDuration = await getDurationViaFFProbe(fullPath);
      
      if (ffprobeDuration && ffprobeDuration > 0) {
        logger.debug(`FFProbe duração: ${ffprobeDuration}s para ${recording.filename}`);
        return ffprobeDuration;
      }
    }
    
    // Fallback: usar stats do arquivo e tempo de criação
    if (recording.file_path && recording.start_time) {
      const fullPath = path.resolve(process.cwd(), recording.file_path);
      
      try {
        const stats = await fs.stat(fullPath);
        const startTime = new Date(recording.start_time);
        const fileModified = stats.mtime;
        
        // Calcular duração baseada na diferença de tempo
        const estimatedDuration = Math.round((fileModified.getTime() - startTime.getTime()) / 1000);
        
        if (estimatedDuration > 0 && estimatedDuration < 7200) { // Máximo 2 horas
          logger.debug(`Duração estimada por timestamps: ${estimatedDuration}s para ${recording.filename}`);
          return estimatedDuration;
        }
      } catch (error) {
        logger.debug(`Erro ao acessar arquivo ${recording.file_path}: ${error.message}`);
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Erro ao calcular duração: ${error.message}`);
    return null;
  }
}

/**
 * Atualizar duração de uma gravação
 */
async function updateRecordingDuration(recording) {
  try {
    // Verificar se já tem duração válida
    if (recording.duration && recording.duration > 0) {
      logger.debug(`✅ Gravação ${recording.id} já tem duração: ${recording.duration}s`);
      return { updated: false, reason: 'already_has_duration' };
    }
    
    // Calcular duração
    const calculatedDuration = await getDurationFromFile(recording);
    
    if (!calculatedDuration || calculatedDuration <= 0) {
      logger.warn(`⚠️ Não foi possível calcular duração para ${recording.filename}`);
      return { updated: false, reason: 'could_not_calculate' };
    }
    
    // Calcular end_time baseado na duração
    const endTime = recording.start_time ? 
      new Date(new Date(recording.start_time).getTime() + (calculatedDuration * 1000)).toISOString() :
      null;
    
    const updateData = {
      duration: calculatedDuration,
      end_time: endTime,
      metadata: {
        ...recording.metadata,
        duration_calculated_by: 'updateRecordingDurations',
        duration_calculated_at: new Date().toISOString(),
        duration_method: 'ffprobe_or_timestamp'
      },
      updated_at: new Date().toISOString()
    };
    
    if (DRY_RUN) {
      logger.info(`[DRY RUN] Atualizaria gravação ${recording.id}:`, {
        filename: recording.filename,
        duration: `${recording.duration || 0} → ${calculatedDuration}s`,
        end_time: `${recording.end_time || 'null'} → ${endTime}`
      });
      return { updated: true, reason: 'dry_run' };
    }
    
    const { error } = await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recording.id);
    
    if (error) {
      logger.error(`❌ Erro ao atualizar gravação ${recording.id}:`, error);
      return { updated: false, reason: 'database_error', error };
    }
    
    logger.info(`✅ Duração atualizada ${recording.id}:`, {
      filename: recording.filename,
      duration: `${calculatedDuration}s`,
      end_time: endTime
    });
    
    return { updated: true, reason: 'success' };
    
  } catch (error) {
    logger.error(`❌ Erro ao processar gravação ${recording.id}:`, error);
    return { updated: false, reason: 'error', error };
  }
}

/**
 * Script principal
 */
async function main() {
  logger.info(`🕐 Iniciando atualização de durações${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  
  let stats = {
    found: 0,
    updated: 0,
    already_valid: 0,
    errors: 0
  };
  
  try {
    // Buscar gravações sem duração ou com duração 0
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, filename, file_path, local_path, duration, start_time, end_time, metadata, status')
      .in('status', ['completed', 'recording'])
      .or('duration.is.null,duration.eq.0')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      throw new Error(`Erro ao buscar gravações: ${error.message}`);
    }
    
    stats.found = recordings.length;
    logger.info(`📊 Encontradas ${stats.found} gravações sem duração`);
    
    if (stats.found === 0) {
      logger.info('✅ Todas as gravações já possuem duração válida');
      return;
    }
    
    // Mostrar amostras
    logger.info('📝 Amostras de gravações a processar:');
    recordings.slice(0, 3).forEach(rec => {
      logger.info(`  - ${rec.filename} (${rec.status})`);
    });
    
    // Processar gravações
    for (const recording of recordings) {
      const result = await updateRecordingDuration(recording);
      
      if (result.updated) {
        stats.updated++;
      } else if (result.reason === 'already_has_duration') {
        stats.already_valid++;
      } else {
        stats.errors++;
      }
    }
    
    // Estatísticas finais
    logger.info('📊 RESUMO DA ATUALIZAÇÃO:', {
      encontradas: stats.found,
      atualizadas: stats.updated,
      ja_validas: stats.already_valid,
      erros: stats.errors,
      modo: DRY_RUN ? 'DRY RUN' : 'EXECUÇÃO'
    });
    
    if (DRY_RUN && stats.updated > 0) {
      logger.info('💡 Para executar as atualizações, execute sem DRY_RUN=true');
    }
    
    logger.info('🎉 Atualização de durações concluída!');
    process.exit(0);
    
  } catch (error) {
    logger.error('💥 Erro durante a atualização:', error);
    process.exit(1);
  }
}

// Executar script
main().catch(error => {
  logger.error('💥 Erro fatal:', error);
  process.exit(1);
});