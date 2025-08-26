/**
 * Script para enfileirar todas as gravações pendentes
 * Força o processo de upload para gravações que ficaram "stuck" em pending
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('EnqueuePendingRecordings');

class PendingRecordingEnqueuer {
  constructor() {
    this.supabase = supabaseAdmin;
    this.processed = 0;
    this.enqueued = 0;
    this.errors = 0;
    this.skipped = 0;
  }

  /**
   * Executar enfileiramento de gravações pendentes
   */
  async run() {
    logger.info('🚀 Iniciando enfileiramento de gravações pendentes...');

    try {
      // Buscar gravações com status 'completed' e upload_status 'pending'
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('status', 'completed')
        .eq('upload_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100); // Processar até 100 por vez

      if (error) {
        logger.error('❌ Erro ao buscar gravações pendentes:', error);
        return;
      }

      if (!recordings || recordings.length === 0) {
        logger.info('✅ Nenhuma gravação pendente encontrada');
        return;
      }

      logger.info(`📊 Encontradas ${recordings.length} gravações pendentes para processar`);

      for (const recording of recordings) {
        this.processed++;
        
        logger.info(`🔄 Processando gravação: ${recording.id}`, {
          filename: recording.filename,
          camera_id: recording.camera_id,
          created_at: recording.created_at
        });

        try {
          // Tentar enfileirar com força
          const result = await UploadQueueService.enqueue(recording.id, {
            priority: 'normal',
            force: true,
            source: 'pending_cleanup_script'
          });

          if (result.success) {
            this.enqueued++;
            logger.info(`✅ Gravação enfileirada: ${recording.id}`, {
              reason: result.reason,
              s3_key: result.s3_key || null
            });
          } else {
            this.skipped++;
            logger.warn(`⚠️ Gravação não enfileirada: ${recording.id}`, {
              reason: result.reason
            });
          }

        } catch (enqueueError) {
          this.errors++;
          logger.error(`❌ Erro ao enfileirar gravação ${recording.id}:`, enqueueError.message);
        }

        // Pequena pausa para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Relatório final
      logger.info('🎉 Enfileiramento de gravações pendentes concluído:', {
        processadas: this.processed,
        enfileiradas: this.enqueued,
        puladas: this.skipped,
        erros: this.errors
      });

      // Mostrar estatísticas da fila após processamento
      const queueStats = await UploadQueueService.getQueueStats();
      logger.info('📊 Estatísticas da fila após processamento:', queueStats);

    } catch (error) {
      logger.error('❌ Erro geral no script de enfileiramento:', error);
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const enqueuer = new PendingRecordingEnqueuer();
  
  enqueuer.run()
    .then(() => {
      logger.info('✅ Script concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falhou:', error);
      process.exit(1);
    });
}

export default PendingRecordingEnqueuer;