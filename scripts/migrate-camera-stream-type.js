#!/usr/bin/env node

/**
 * Script de migração para adicionar campo stream_type às câmeras existentes
 * 
 * Este script deve ser executado uma vez para garantir que todas as câmeras
 * criadas antes da correção do bug RTMP tenham um stream_type definido.
 * 
 * Uso:
 * node scripts/migrate-camera-stream-type.js
 */

import { supabaseAdmin, TABLES } from '../backend/src/config/database.js';
import { createModuleLogger } from '../backend/src/config/logger.js';

const logger = createModuleLogger('Migration');

async function migrateCameras() {
  try {
    logger.info('Iniciando migração de câmeras...');

    // Buscar todas as câmeras que não têm stream_type definido
    const { data: cameras, error: fetchError } = await supabaseAdmin
      .from(TABLES.CAMERAS)
      .select('id, name, rtsp_url, rtmp_url, stream_type')
      .or('stream_type.is.null,stream_type.eq.""');

    if (fetchError) {
      logger.error('Erro ao buscar câmeras:', fetchError);
      process.exit(1);
    }

    if (!cameras || cameras.length === 0) {
      logger.info('Nenhuma câmera precisa de migração.');
      return;
    }

    logger.info(`Encontradas ${cameras.length} câmeras para migrar`);

    let updatedCount = 0;
    for (const camera of cameras) {
      try {
        // Determinar o stream_type baseado nas URLs disponíveis
        let streamType = 'rtsp'; // Padrão
        
        if (camera.rtmp_url && camera.rtmp_url.trim() !== '') {
          streamType = 'rtmp';
        } else if (camera.rtsp_url && camera.rtsp_url.trim() !== '') {
          streamType = 'rtsp';
        }

        logger.info(`Atualizando câmera ${camera.name} (${camera.id}): stream_type = ${streamType}`);

        const { error: updateError } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .update({ stream_type: streamType })
          .eq('id', camera.id);

        if (updateError) {
          logger.error(`Erro ao atualizar câmera ${camera.id}:`, updateError);
        } else {
          updatedCount++;
          logger.info(`✅ Câmera ${camera.id} atualizada com sucesso`);
        }

      } catch (error) {
        logger.error(`Erro ao processar câmera ${camera.id}:`, error);
      }
    }

    logger.info(`Migração concluída! ${updatedCount} câmeras atualizadas.`);

  } catch (error) {
    logger.error('Erro na migração:', error);
    process.exit(1);
  }
}

// Verificar se está sendo executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateCameras()
    .then(() => {
      logger.info('Script de migração finalizado.');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Erro fatal:', error);
      process.exit(1);
    });
}

export default migrateCameras;