import schedulerService from '../config/scheduler.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('RecordingJobs');

/**
 * Jobs relacionados ao sistema de gravações
 * Substitui os setInterval/setTimeout do server.js por jobs cron
 */
class RecordingJobs {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Inicializa todos os jobs de gravação
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('RecordingJobs já foi inicializado');
      return;
    }

    try {
      logger.info('Inicializando jobs de gravação...');
      
      await this.scheduleUploadQueueJob();
      await this.scheduleStatisticsUpdateJob();
      await this.scheduleRecordingCleanupJob();
      await this.scheduleCameraInitializationJob();
      
      this.isInitialized = true;
      logger.info('Jobs de gravação inicializados com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar jobs de gravação:', error);
      throw error;
    }
  }

  /**
   * Agenda processamento da fila de uploads
   */
  async scheduleUploadQueueJob() {
    const intervalMinutes = parseInt(process.env.UPLOAD_QUEUE_INTERVAL_MINUTES) || 5;
    
    await schedulerService.scheduleInterval(
      'upload-queue-processing',
      intervalMinutes,
      async () => {
        try {
          const RecordingService = (await import('../services/RecordingService.js')).default;
          const result = await RecordingService.processUploadQueue();
          
          if (result && result.processed > 0) {
            logger.info(`Processados ${result.processed} uploads da fila`);
          }
        } catch (error) {
          logger.error('Erro ao processar fila de uploads:', error);
        }
      },
      {
        onError: (error) => {
          logger.error('Erro crítico no job de upload queue:', error);
        }
      }
    );
    
    logger.info(`Job de processamento de uploads agendado (${intervalMinutes} minutos)`);
  }

  /**
   * Agenda atualização de estatísticas das gravações
   */
  async scheduleStatisticsUpdateJob() {
    await schedulerService.scheduleInterval(
      'recording-statistics-update',
      60, // A cada 1 hora
      async () => {
        try {
          const RecordingService = (await import('../services/RecordingService.js')).default;
          const result = await RecordingService.updateRecordingStatistics();
          
          if (result) {
            logger.info('Estatísticas de gravação atualizadas');
          }
        } catch (error) {
          logger.error('Erro ao atualizar estatísticas de gravação:', error);
        }
      },
      {
        onError: (error) => {
          logger.error('Erro crítico no job de estatísticas:', error);
        }
      }
    );
    
    logger.info('Job de atualização de estatísticas agendado (1 hora)');
  }

  /**
   * Agenda limpeza de gravações antigas (diariamente às 2:00 AM)
   */
  async scheduleRecordingCleanupJob() {
    await schedulerService.scheduleDaily(
      'recording-cleanup',
      2, // 2:00 AM
      0, // 0 minutos
      async () => {
        try {
          logger.info('Iniciando limpeza de gravações antigas...');
          const RecordingService = (await import('../services/RecordingService.js')).default;
          const result = await RecordingService.cleanupOldRecordings();
          
          if (result) {
            logger.info(`Limpeza concluída: ${result.deletedCount || 0} gravações removidas`);
          }
        } catch (error) {
          logger.error('Erro durante limpeza de gravações:', error);
        }
      },
      {
        onError: (error) => {
          logger.error('Erro crítico no job de limpeza:', error);
        }
      }
    );
    
    logger.info('Job de limpeza de gravações agendado (diariamente às 2:00 AM)');
  }

  /**
   * Agenda inicialização das câmeras após delay
   */
  async scheduleCameraInitializationJob() {
    const delaySeconds = parseInt(process.env.CAMERA_INIT_DELAY_SECONDS) || 10;
    
    await schedulerService.scheduleOnce(
      'camera-initialization',
      delaySeconds * 1000,
      async () => {
        try {
          logger.info('Iniciando câmeras automaticamente...');
          const { default: startCameraStreaming } = await import('../scripts/startCameraStreaming.js');
          await startCameraStreaming();
          logger.info('Câmeras inicializadas com sucesso');
        } catch (error) {
          logger.error('Erro ao inicializar câmeras:', error);
        }
      }
    );
    
    logger.info(`Job de inicialização de câmeras agendado (${delaySeconds} segundos)`);
  }

  /**
   * Para todos os jobs de gravação
   */
  async shutdown() {
    try {
      logger.info('Finalizando jobs de gravação...');
      
      schedulerService.cancelJob('upload-queue-processing');
      schedulerService.cancelJob('recording-statistics-update');
      schedulerService.cancelJob('recording-cleanup');
      schedulerService.cancelJob('camera-initialization');
      
      this.isInitialized = false;
      logger.info('Jobs de gravação finalizados');
    } catch (error) {
      logger.error('Erro ao finalizar jobs de gravação:', error);
    }
  }

  /**
   * Obtém status dos jobs
   */
  getJobsStatus() {
    const jobs = schedulerService.listJobs();
    return jobs.filter(job => 
      job.name.includes('upload-queue') ||
      job.name.includes('recording-statistics') ||
      job.name.includes('recording-cleanup') ||
      job.name.includes('camera-initialization')
    );
  }
}

// Instância singleton
const recordingJobs = new RecordingJobs();

export default recordingJobs;
export { RecordingJobs };