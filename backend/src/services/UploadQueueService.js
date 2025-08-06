/**
 * Serviço de Fila de Upload para Wasabi S3
 * Gerencia uploads em background com retry automático
 */

import Bull from 'bull';
import Redis from 'ioredis';
import { createModuleLogger } from '../config/logger.js';
import s3Service from './S3Service.js';
import RetryService from './RetryService.js';
import UploadMonitoringService from './UploadMonitoringService.js';
import UploadLogService from './UploadLogService.js';
import { supabase } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createModuleLogger('UploadQueueService');

class UploadQueueService {
  constructor() {
    this.redis = null;
    this.uploadQueue = null;
    this.s3Service = s3Service;
    this.isInitialized = false;
    
    // Configurações de retry
    this.maxRetries = 3;
    this.retryDelays = [5000, 15000, 60000]; // 5s, 15s, 1min
  }

  /**
   * Inicializa o serviço de fila
   */
  async initialize() {
    try {
      // Configurar Redis
      let redisConfig;
      
      if (process.env.REDIS_URL) {
        // Usar REDIS_URL se disponível (formato: redis://host:port)
        redisConfig = process.env.REDIS_URL;
      } else {
        // Fallback para configuração individual
        redisConfig = {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          db: process.env.REDIS_DB || 0,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        };
      }

      this.redis = new Redis(redisConfig);
      
      // Configurar fila Bull
      this.uploadQueue = new Bull('upload-queue', {
        redis: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 10, // Manter apenas 10 jobs completos
          removeOnFail: 50,     // Manter 50 jobs falhados para debug
          attempts: this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      });

      // Configurar processador da fila
      this.uploadQueue.process('upload-recording', this.processUpload.bind(this));
      
      // Configurar eventos da fila
      this.setupQueueEvents();
      
      this.isInitialized = true;
      logger.info('UploadQueueService inicializado com sucesso');
      
      // Inicializar serviço de logs
      await UploadLogService.initialize();
      UploadLogService.logInfo('UploadQueueService inicializado', { service: 'UploadQueueService' });
      
    } catch (error) {
      logger.error('Erro ao inicializar UploadQueueService:', error);
      throw error;
    }
  }

  /**
   * Configura eventos da fila para monitoramento
   */
  setupQueueEvents() {
    this.uploadQueue.on('completed', (job, result) => {
      logger.info(`Upload concluído: ${job.id}`, {
        recordingId: job.data.recordingId,
        s3Url: result.s3Url,
        duration: Date.now() - job.timestamp
      });
    });

    this.uploadQueue.on('failed', (job, err) => {
      logger.error(`Upload falhou: ${job.id}`, {
        recordingId: job.data.recordingId,
        error: err.message,
        attempts: job.attemptsMade
      });
    });

    this.uploadQueue.on('stalled', (job) => {
      logger.warn(`Upload travado: ${job.id}`, {
        recordingId: job.data.recordingId
      });
    });

    this.uploadQueue.on('progress', (job, progress) => {
      logger.debug(`Progresso do upload: ${job.id} - ${progress}%`, {
        recordingId: job.data.recordingId
      });
    });
  }

  /**
   * Adiciona um arquivo à fila de upload
   * @param {Object} uploadData - Dados do upload
   * @param {string} uploadData.recordingId - ID da gravação
   * @param {string} uploadData.filePath - Caminho do arquivo local
   * @param {string} uploadData.cameraId - ID da câmera
   * @param {Object} uploadData.metadata - Metadados adicionais
   * @param {string} uploadData.priority - Prioridade do upload (high, normal, low)
   */
  async addToQueue(uploadData) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { recordingId, filePath, cameraId, metadata = {}, priority = 'normal' } = uploadData;
      
      // Verificar se arquivo existe
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      // Verificar se já existe um job para esta gravação
      const existingJobs = await this.uploadQueue.getJobs(['waiting', 'active', 'delayed']);
      const duplicateJob = existingJobs.find(job => job.data.recordingId === recordingId);
      
      if (duplicateJob) {
        logger.warn(`Upload já está na fila: ${recordingId}`);
        return duplicateJob;
      }

      // Criar job na fila
      const jobOptions = {
        priority: this.getPriorityValue(priority),
        delay: 0, // Upload imediato
      };

      const job = await this.uploadQueue.add('upload-recording', {
        recordingId,
        filePath,
        cameraId,
        metadata,
        addedAt: new Date().toISOString()
      }, jobOptions);

      // Atualizar status no banco
      await this.updateRecordingStatus(recordingId, 'uploading', {
        upload_status: 'uploading',
        metadata: {
          upload_job_id: job.id,
          upload_started_at: new Date().toISOString()
        }
      });

      logger.info(`Arquivo adicionado à fila de upload: ${recordingId}`, {
        jobId: job.id,
        filePath,
        priority
      });

      return job;
      
    } catch (error) {
      logger.error('Erro ao adicionar arquivo à fila:', error);
      throw error;
    }
  }

  /**
   * Processa um upload da fila
   * @param {Object} job - Job do Bull
   */
  async processUpload(job) {
    const { recordingId, filePath, cameraId, metadata } = job.data;
    
    try {
      logger.info(`Iniciando upload: ${recordingId}`, { filePath });
      
      // Notificar serviço de monitoramento
      UploadMonitoringService.startUpload({
        recordingId,
        cameraId,
        filePath,
        fileSize: undefined, // Will be set after getting file stats
        jobId: job.id,
        priority: job.opts.priority || 'normal'
      });
      
      // Log detalhado de início
      UploadLogService.logUploadStart(recordingId, {
        cameraId,
        filePath,
        jobId: job.id,
        priority: job.opts.priority || 'normal'
      });
      
      // Atualizar progresso
      await job.progress(10);
      
      // Gerar chave S3
      const fileName = path.basename(filePath);
      const s3Key = `recordings/${cameraId}/${recordingId}/${fileName}`;
      
      await job.progress(20);
      
      // Obter informações do arquivo
      const fileStats = await fs.stat(filePath);
      const fileSize = fileStats.size;
      
      await job.progress(30);
      
      // Upload para S3 com retry e callback de progresso
      const uploadResult = await RetryService.executeUploadWithRetry(
        async (uploadData, attempt) => {
          logger.info(`Tentativa ${attempt} de upload S3:`, {
            recordingId: uploadData.recordingId,
            s3Key: uploadData.s3Key
          });
          
          return await this.s3Service.uploadFile(uploadData.filePath, uploadData.s3Key, {
            onProgress: async (progress) => {
              const totalProgress = 30 + (progress * 0.6); // 30% + 60% do upload
              await job.progress(Math.round(totalProgress));
              
              // Atualizar monitoramento
              const progressData = {
                percentage: Math.round(totalProgress),
                bytesUploaded: Math.round((progress / 100) * uploadData.fileSize),
                attempt: attempt
              };
              
              UploadMonitoringService.updateProgress(
                uploadData.recordingId, 
                progressData.percentage,
                {
                  bytesUploaded: progressData.bytesUploaded,
                  attempt: progressData.attempt
                }
              );
              
              // Log de progresso (apenas a cada 10%)
              if (progressData.percentage % 10 === 0) {
                UploadLogService.logUploadProgress(uploadData.recordingId, progressData);
              }
            }
          });
        },
        {
          recordingId,
          filePath,
          s3Key,
          fileSize
        }
      );
      
      await job.progress(90);
      
      // Atualizar banco de dados com retry
      await RetryService.executeDatabaseWithRetry(
        async (data) => {
          return await this.updateRecordingStatus(data.recordingId, 'completed', {
            upload_status: 'uploaded',
            s3_url: data.s3Url,
            s3_key: data.s3Key,
            file_size: data.fileSize,
            uploaded_at: new Date().toISOString(),
            metadata: {
              upload_job_id: null
            }
          });
        },
        {
          recordingId,
          s3Url: uploadResult.Location || uploadResult.url,
          s3Key,
          fileSize
        },
        `Update recording ${recordingId} after upload`
      );
      
      await job.progress(95);
      
      // Limpar arquivo local (opcional)
      if (process.env.DELETE_LOCAL_AFTER_UPLOAD === 'true') {
        await this.cleanupLocalFile(filePath);
      }
      
      await job.progress(100);
      
      const uploadResultData = {
        s3Url: uploadResult.Location || uploadResult.url,
        s3Key,
        finalFileSize: fileSize
      };
      
      // Notificar conclusão do upload
      UploadMonitoringService.completeUpload(recordingId, uploadResultData);
      
      // Log detalhado de conclusão
      UploadLogService.logUploadComplete(recordingId, uploadResultData);
      
      logger.info(`Upload concluído com sucesso: ${recordingId}`, {
        s3Url: uploadResult.Location || uploadResult.url,
        fileSize
      });
      
      return {
        success: true,
        recordingId,
        s3Url: uploadResult.Location || uploadResult.url,
        s3Key,
        fileSize
      };
      
    } catch (error) {
      logger.error(`[UploadQueueService] Erro crítico no upload para Wasabi S3: ${recordingId}`, {
        error: error.message,
        stack: error.stack,
        recordingId,
        cameraId,
        filePath,
        jobId: job.id,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        s3Config: {
          bucketName: process.env.WASABI_BUCKET_NAME || 'não configurado',
          endpoint: process.env.WASABI_ENDPOINT || 'não configurado',
          accessKey: process.env.WASABI_ACCESS_KEY ? 'configurado' : 'não configurado',
          secretKey: process.env.WASABI_SECRET_KEY ? 'configurado' : 'não configurado'
        },
        timestamp: new Date().toISOString(),
        errorType: error.constructor.name
      });
      
      // Log detalhado de erro
      UploadLogService.logUploadError(recordingId, error, {
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        cameraId,
        filePath
      });
      
      // Notificar falha do upload
      UploadMonitoringService.failUpload(recordingId, error, {
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
      
      // Atualizar status de erro no banco com retry
      await this.handleUploadFailure(job, error);
      
      throw error;
    }
  }

  /**
   * Limpa arquivo local após upload
   * @param {string} filePath - Caminho do arquivo
   */
  async cleanupLocalFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.info(`Arquivo local removido: ${filePath}`);
    } catch (error) {
      logger.warn(`Erro ao remover arquivo local: ${filePath}`, error);
    }
  }

  /**
   * Atualiza status da gravação no banco
   * @param {string} recordingId - ID da gravação
   * @param {string} status - Novo status
   * @param {Object} additionalData - Dados adicionais
   */
  async updateRecordingStatus(recordingId, status, additionalData = {}) {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString(),
        ...additionalData
      };
      
      const { error } = await supabase
        .from('recordings')
        .update(updateData)
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error(`Erro ao atualizar status da gravação: ${recordingId}`, error);
      throw error;
    }
  }

  /**
   * Converte prioridade em valor numérico
   * @param {string} priority - Prioridade (high, normal, low)
   */
  getPriorityValue(priority) {
    const priorities = {
      high: 10,
      normal: 5,
      low: 1
    };
    return priorities[priority] || 5;
  }

  /**
   * Obtém estatísticas da fila
   */
  async getQueueStats() {
    try {
      if (!this.isInitialized) {
        return null;
      }
      
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.uploadQueue.getWaiting(),
        this.uploadQueue.getActive(),
        this.uploadQueue.getCompleted(),
        this.uploadQueue.getFailed(),
        this.uploadQueue.getDelayed()
      ]);
      
      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas da fila:', error);
      return null;
    }
  }

  /**
   * Limpa jobs antigos da fila
   */
  async cleanupOldJobs() {
    try {
      if (!this.isInitialized) {
        return;
      }
      
      // Limpar jobs completos com mais de 24h
      await this.uploadQueue.clean(24 * 60 * 60 * 1000, 'completed');
      
      // Limpar jobs falhados com mais de 7 dias
      await this.uploadQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
      
      logger.info('Limpeza de jobs antigos concluída');
      
    } catch (error) {
      logger.error('Erro na limpeza de jobs antigos:', error);
    }
  }

  /**
   * Processar falha de upload com retry inteligente
   * @param {Object} job - Job que falhou
   * @param {Error} error - Erro ocorrido
   */
  async handleUploadFailure(job, error) {
    const { recordingId } = job.data;
    
    logger.error(`Falha no upload: ${recordingId}`, {
      error: error.message,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts
    });
    
    // Verificar se deve tentar novamente
    const shouldRetry = RetryService.isRetryableError(error, [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'RequestTimeout',
      'SlowDown',
      'ServiceUnavailable'
    ]);
    
    if (shouldRetry && job.attemptsMade < job.opts.attempts) {
      logger.info(`Reagendando upload: ${recordingId}`);
      
      const retryInfo = {
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
        reason: error.message
      };
      
      // Log de retry
      UploadLogService.logUploadRetry(recordingId, retryInfo);
      
      // Notificar retry
      UploadMonitoringService.retryUpload(recordingId, job.attemptsMade + 1);
      
      // Atualizar status para retry
      await RetryService.executeDatabaseWithRetry(
        async (data) => {
          return await this.updateRecordingStatus(data.recordingId, 'uploading', {
            error_message: data.error,
            metadata: {
              upload_retry_count: data.attempts,
              upload_last_retry: new Date().toISOString()
            }
          });
        },
        {
          recordingId,
          error: error.message,
          attempts: job.attemptsMade
        },
        `Update recording ${recordingId} for retry`
      );
    } else {
      logger.error(`Upload definitivamente falhou: ${recordingId}`);
      
      // Log de falha definitiva
      UploadLogService.logUploadError(recordingId, new Error('Upload falhou definitivamente'), {
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        finalFailure: true
      });
      
      // Marcar como falha definitiva
      await RetryService.executeDatabaseWithRetry(
        async (data) => {
          return await this.updateRecordingStatus(data.recordingId, 'failed', {
            upload_status: 'failed',
            error_message: data.error,
            metadata: {
              upload_failed_at: new Date().toISOString(),
              upload_final_attempt: data.attempts
            }
          });
        },
        {
          recordingId,
          error: error.message,
          attempts: job.attemptsMade
        },
        `Update recording ${recordingId} as failed`
      );
    }
  }

  /**
   * Fecha conexões e limpa recursos
   */
  async close() {
    try {
      if (this.uploadQueue) {
        await this.uploadQueue.close();
      }
      if (this.redis) {
        await this.redis.quit();
      }
      this.isInitialized = false;
      logger.info('UploadQueueService fechado');
    } catch (error) {
      logger.error('Erro ao fechar UploadQueueService:', error);
    }
  }
}

// Singleton instance
const uploadQueueService = new UploadQueueService();

export default uploadQueueService;