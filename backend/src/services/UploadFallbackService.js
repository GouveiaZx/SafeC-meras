/**
 * UploadFallbackService - Sistema de fallback robusto para uploads
 * Garante que uploads falhos sejam reprocessados automaticamente
 * com retry inteligente e escalação de prioridades
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from './UploadQueueService.js';

const logger = createModuleLogger('UploadFallbackService');

class UploadFallbackService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.uploadQueueService = UploadQueueService;
    this.isRunning = false;
    this.interval = null;
    this.failbackIntervalMs = 5 * 60 * 1000; // 5 minutos
    this.maxRetryAttempts = 5;
    
    logger.info('UploadFallbackService initialized');
  }

  /**
   * Iniciar serviço de fallback
   * @param {Object} io - Socket.IO instance
   */
  start(io = null) {
    if (this.isRunning) {
      logger.warn('UploadFallbackService already running');
      return;
    }

    this.isRunning = true;
    this.uploadQueueService.setSocketIO(io);
    
    logger.info('🔄 UploadFallbackService started - checking every 5 minutes');
    
    // Executar imediatamente
    this.checkAndRetryFailedUploads();
    
    // Configurar intervalo
    this.interval = setInterval(() => {
      this.checkAndRetryFailedUploads();
    }, this.failbackIntervalMs);
  }

  /**
   * Parar serviço
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isRunning = false;
    logger.info('🛑 UploadFallbackService stopped');
  }

  /**
   * Verificar e reprocessar uploads falhos
   */
  async checkAndRetryFailedUploads() {
    try {
      logger.debug('🔍 Checking for failed uploads...');
      
      // 1. Buscar uploads que falharam e precisam de retry
      const failedUploads = await this.getFailedUploads();
      
      // 2. Buscar uploads que estão "uploading" há muito tempo (possível crash)
      const stuckUploads = await this.getStuckUploads();
      
      // 3. Buscar gravações que deveriam estar na fila mas não estão
      const missedUploads = await this.getMissedUploads();
      
      const totalFound = failedUploads.length + stuckUploads.length + missedUploads.length;
      
      if (totalFound > 0) {
        logger.info(`📊 Found uploads needing attention: ${totalFound} (failed: ${failedUploads.length}, stuck: ${stuckUploads.length}, missed: ${missedUploads.length})`);
        
        // Processar cada categoria
        await this.retryFailedUploads(failedUploads);
        await this.resetStuckUploads(stuckUploads);
        await this.enqueueMissedUploads(missedUploads);
      }
      
    } catch (error) {
      logger.error('Error checking failed uploads:', error);
    }
  }

  /**
   * Buscar uploads que falharam mas podem ser tentados novamente
   */
  async getFailedUploads() {
    try {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('status', 'completed')
        .eq('upload_status', 'failed')
        .lt('upload_attempts', this.maxRetryAttempts)
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24h
        .order('updated_at', { ascending: true })
        .limit(20);

      if (error) {
        logger.error('Error fetching failed uploads:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in getFailedUploads:', error);
      return [];
    }
  }

  /**
   * Buscar uploads que estão "uploading" há muito tempo
   */
  async getStuckUploads() {
    try {
      // Considerar "stuck" uploads que estão em "uploading" por mais de 30 minutos
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('upload_status', 'uploading')
        .lte('upload_started_at', thirtyMinutesAgo)
        .order('upload_started_at', { ascending: true })
        .limit(10);

      if (error) {
        logger.error('Error fetching stuck uploads:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in getStuckUploads:', error);
      return [];
    }
  }

  /**
   * Buscar gravações que deveriam estar na fila mas não estão
   */
  async getMissedUploads() {
    try {
      // S3 deve estar habilitado para considerar "missed"
      const s3Enabled = process.env.S3_UPLOAD_ENABLED === 'true';
      const queueEnabled = process.env.ENABLE_UPLOAD_QUEUE === 'true';
      
      if (!s3Enabled || !queueEnabled) {
        return [];
      }

      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('status', 'completed')
        .eq('upload_status', 'pending')
        .is('s3_key', null)
        .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()) // Últimas 12h
        .order('created_at', { ascending: true })
        .limit(30);

      if (error) {
        logger.error('Error fetching missed uploads:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in getMissedUploads:', error);
      return [];
    }
  }

  /**
   * Reprocessar uploads que falharam
   */
  async retryFailedUploads(recordings) {
    for (const recording of recordings) {
      try {
        // Calcular delay baseado no número de tentativas (exponential backoff)
        const baseDelay = 5 * 60 * 1000; // 5 minutos base
        const delay = baseDelay * Math.pow(2, recording.upload_attempts || 0);
        const timeSinceLastAttempt = Date.now() - new Date(recording.updated_at).getTime();
        
        if (timeSinceLastAttempt < delay) {
          logger.debug(`⏰ Waiting for retry delay: ${recording.id} (${Math.round((delay - timeSinceLastAttempt) / 1000 / 60)} min remaining)`);
          continue;
        }

        logger.info(`🔄 Retrying failed upload: ${recording.id} (attempt ${(recording.upload_attempts || 0) + 1})`);
        
        const result = await this.uploadQueueService.enqueue(recording.id, {
          priority: 'high', // Prioridade alta para retries
          force: true,
          source: 'fallback_retry'
        });
        
        if (result.success) {
          logger.info(`✅ Successfully re-enqueued: ${recording.id}`);
        } else {
          logger.warn(`⚠️ Failed to re-enqueue: ${recording.id} - ${result.reason}`);
        }
        
      } catch (error) {
        logger.error(`Error retrying upload for ${recording.id}:`, error);
      }
      
      // Pequena pausa entre tentativas
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Resetar uploads que travaram
   */
  async resetStuckUploads(recordings) {
    for (const recording of recordings) {
      try {
        logger.warn(`⚠️ Resetting stuck upload: ${recording.id} (stuck since ${recording.upload_started_at})`);
        
        // Resetar para pending
        const { error: updateError } = await this.supabase
          .from('recordings')
          .update({
            upload_status: 'pending',
            upload_started_at: null,
            upload_progress: 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);

        if (updateError) {
          logger.error(`Failed to reset stuck upload ${recording.id}:`, updateError);
          continue;
        }

        // Re-enfileirar
        const result = await this.uploadQueueService.enqueue(recording.id, {
          priority: 'normal',
          force: true,
          source: 'fallback_stuck_reset'
        });
        
        if (result.success) {
          logger.info(`✅ Reset and re-enqueued stuck upload: ${recording.id}`);
        } else {
          logger.warn(`⚠️ Failed to re-enqueue after reset: ${recording.id} - ${result.reason}`);
        }
        
      } catch (error) {
        logger.error(`Error resetting stuck upload for ${recording.id}:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Enfileirar uploads que foram perdidos
   */
  async enqueueMissedUploads(recordings) {
    for (const recording of recordings) {
      try {
        logger.info(`📤 Enqueuing missed upload: ${recording.id}`);
        
        const result = await this.uploadQueueService.enqueue(recording.id, {
          priority: 'normal',
          source: 'fallback_missed'
        });
        
        if (result.success) {
          logger.info(`✅ Successfully enqueued missed upload: ${recording.id}`);
        } else {
          logger.warn(`⚠️ Failed to enqueue missed upload: ${recording.id} - ${result.reason}`);
        }
        
      } catch (error) {
        logger.error(`Error enqueuing missed upload for ${recording.id}:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Forçar reprocessamento de gravação específica
   */
  async forceRetry(recordingId) {
    try {
      logger.info(`🔧 Force retry requested for: ${recordingId}`);
      
      // Buscar gravação
      const { data: recording, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();

      if (error || !recording) {
        throw new Error(`Recording not found: ${recordingId}`);
      }

      // Resetar status se necessário
      if (recording.upload_status === 'uploading') {
        await this.supabase
          .from('recordings')
          .update({
            upload_status: 'pending',
            upload_started_at: null,
            upload_progress: 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', recordingId);
      }

      // Forçar enqueue
      const result = await this.uploadQueueService.enqueue(recordingId, {
        priority: 'high',
        force: true,
        source: 'manual_force_retry'
      });

      logger.info(`Force retry result for ${recordingId}:`, result);
      return result;

    } catch (error) {
      logger.error(`Error in force retry for ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Obter estatísticas do fallback service
   */
  async getStats() {
    try {
      const [failed, stuck, missed] = await Promise.all([
        this.getFailedUploads(),
        this.getStuckUploads(),
        this.getMissedUploads()
      ]);

      return {
        isRunning: this.isRunning,
        checkInterval: this.failbackIntervalMs,
        pending: {
          failed: failed.length,
          stuck: stuck.length,
          missed: missed.length,
          total: failed.length + stuck.length + missed.length
        },
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting fallback stats:', error);
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }
}

export default UploadFallbackService;