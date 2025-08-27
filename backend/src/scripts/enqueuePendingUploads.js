/**
 * Script para enfileirar gravações pendentes de upload
 * Busca todas as gravações com upload_status 'queued' ou 'pending'
 * e as adiciona na tabela upload_queue para processamento
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';

const logger = createModuleLogger('EnqueuePendingUploads');

async function enqueuePendingUploads() {
  try {
    logger.info('🔍 Iniciando enfileiramento de gravações pendentes...');

    // Buscar todas as gravações que precisam ser enviadas para S3
    const { data: recordings, error } = await supabaseAdmin
      .from('recordings')
      .select('id, filename, upload_status, local_path, created_at')
      .in('upload_status', ['queued', 'pending'])
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Erro ao buscar gravações: ${error.message}`);
    }

    if (!recordings || recordings.length === 0) {
      logger.info('✅ Nenhuma gravação pendente encontrada');
      return;
    }

    logger.info(`📹 Encontradas ${recordings.length} gravações pendentes de upload`);

    // Inicializar UploadQueueService
    const uploadQueueService = new UploadQueueService();

    let successCount = 0;
    let errorCount = 0;

    // Processar cada gravação
    for (const recording of recordings) {
      try {
        logger.info(`📤 Enfileirando gravação: ${recording.filename} (${recording.id})`);
        
        // Enfileirar para upload
        const result = await uploadQueueService.enqueue(recording.id, {
          priority: 'normal',
          force: false
        });

        if (result.success) {
          successCount++;
          logger.info(`✅ Gravação ${recording.filename} enfileirada com sucesso`);
        } else {
          errorCount++;
          logger.warn(`⚠️ Erro ao enfileirar ${recording.filename}: ${result.message}`);
        }

      } catch (error) {
        errorCount++;
        logger.error(`❌ Erro ao processar gravação ${recording.filename}:`, error.message);
      }
    }

    // Relatório final
    logger.info(`📊 RELATÓRIO FINAL:`);
    logger.info(`✅ Sucessos: ${successCount}`);
    logger.info(`❌ Erros: ${errorCount}`);
    logger.info(`📋 Total processado: ${recordings.length}`);

    if (successCount > 0) {
      logger.info('🎉 Gravações enfileiradas! O UploadWorker deve processar automaticamente');
    }

  } catch (error) {
    logger.error('💥 Erro crítico durante enfileiramento:', error);
    throw error;
  }
}

// Executar apenas se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  enqueuePendingUploads()
    .then(() => {
      logger.info('🎯 Script concluído com sucesso');
      process.exit(0);
    })
    .catch(error => {
      logger.error('💥 Script falhou:', error);
      process.exit(1);
    });
}

export default enqueuePendingUploads;