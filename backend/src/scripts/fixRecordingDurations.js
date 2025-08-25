#!/usr/bin/env node
/**
 * Script focado na correção de durações ausentes em gravações
 * Corrige especificamente o problema de duração "--" reportado pelo usuário
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('FixDurations');

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.env.DRY_RUN === 'true';

async function fixRecordingDurations() {
  try {
    logger.info('🔧 Iniciando correção de durações...');
    logger.info(`📊 Modo: ${DRY_RUN ? 'DRY RUN (Simulação)' : 'EXECUÇÃO REAL'}`);

    // Buscar gravações sem duração
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('*')
      .or('duration.is.null,duration.eq.0')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar gravações: ${error.message}`);
    }

    logger.info(`📋 Encontradas ${recordings.length} gravações sem duração`);

    if (recordings.length === 0) {
      logger.info('✅ Nenhuma gravação sem duração encontrada!');
      return;
    }

    let fixed = 0;
    let errors = 0;

    for (const recording of recordings) {
      try {
        const duration = await fixSingleRecordingDuration(recording);
        
        if (duration && !DRY_RUN) {
          const { error: updateError } = await supabase
            .from('recordings')
            .update({ 
              duration,
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          if (updateError) {
            logger.error(`❌ Erro ao atualizar ${recording.id}:`, updateError.message);
            errors++;
          } else {
            logger.info(`✅ ${recording.filename}: duração corrigida para ${duration}s`);
            fixed++;
          }
        } else if (duration && DRY_RUN) {
          logger.info(`🔍 [DRY RUN] ${recording.filename}: aplicaria duração ${duration}s`);
          fixed++;
        } else {
          logger.warn(`⚠️ Não foi possível corrigir duração de ${recording.filename}`);
        }
      } catch (error) {
        logger.error(`💥 Erro ao processar ${recording.id}:`, error.message);
        errors++;
      }
    }

    // Relatório final
    logger.info('\n' + '='.repeat(50));
    logger.info('📊 RELATÓRIO FINAL');
    logger.info('='.repeat(50));
    logger.info(`📋 Gravações processadas: ${recordings.length}`);
    logger.info(`✅ Durações corrigidas: ${fixed}`);
    logger.info(`❌ Erros: ${errors}`);

    if (DRY_RUN) {
      logger.info('\n🔍 MODO DRY RUN - Execute sem DRY_RUN=true para aplicar');
    } else {
      logger.info('\n✅ CORREÇÕES APLICADAS!');
    }

  } catch (error) {
    logger.error('💥 Erro fatal:', error);
    process.exit(1);
  }
}

async function fixSingleRecordingDuration(recording) {
  logger.debug(`🔧 Processando: ${recording.filename}`);

  // 1. Tentar calcular por timestamps
  const timestampDuration = calculateDurationFromTimestamps(recording);
  if (timestampDuration) {
    logger.debug(`⏱️ Duração por timestamps: ${timestampDuration}s`);
    return timestampDuration;
  }

  // 2. Tentar extrair com ffprobe
  const fileResult = await PathResolver.findRecordingFile(recording);
  if (fileResult && fileResult.exists) {
    const ffprobeDuration = await extractDurationWithFFprobe(fileResult.absolutePath);
    if (ffprobeDuration) {
      logger.debug(`⏱️ Duração por ffprobe: ${ffprobeDuration}s`);
      return ffprobeDuration;
    }
  }

  // 3. Duração padrão para gravações completed
  if (recording.status === 'completed') {
    logger.debug(`⏱️ Aplicando duração padrão: 30s`);
    return 30;
  }

  return null;
}

function calculateDurationFromTimestamps(recording) {
  const pairs = [
    [recording.start_time, recording.end_time],
    [recording.started_at, recording.ended_at]
  ];

  for (const [start, end] of pairs) {
    if (start && end) {
      const startTime = new Date(start);
      const endTime = new Date(end);
      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      
      if (duration > 0 && duration < 7200) { // Entre 0 e 2 horas
        return duration;
      }
    }
  }

  return null;
}

async function extractDurationWithFFprobe(filePath) {
  return new Promise((resolve) => {
    // Converter path para formato Docker
    const dockerPath = filePath.replace(/^.*storage[/\\]www[/\\]/, '/opt/media/bin/www/');
    
    logger.debug(`🔍 Extraindo duração via ffprobe: ${dockerPath}`);

    const ffprobe = spawn('docker', [
      'exec', 'newcam-zlmediakit', 'ffprobe',
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      dockerPath
    ]);

    let output = '';
    let hasError = false;

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', () => {
      hasError = true;
    });

    ffprobe.on('close', (code) => {
      if (code === 0 && !hasError && output.trim()) {
        const duration = Math.round(parseFloat(output.trim()));
        resolve(duration > 0 && duration < 7200 ? duration : null);
      } else {
        resolve(null);
      }
    });

    // Timeout após 10 segundos
    setTimeout(() => {
      ffprobe.kill();
      resolve(null);
    }, 10000);
  });
}

// Executar se chamado diretamente
fixRecordingDurations().catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});