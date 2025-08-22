import cron from 'node-cron';
import { createModuleLogger } from '../config/logger.js';
import metricsService from '../services/MetricsService.js';
import authHealthService from '../services/AuthHealthService.js';
import cameraMonitoringService from '../services/CameraMonitoringService.js';
import { reportService } from '../services/ReportService.js';

const logger = createModuleLogger('SystemJobs');

class SystemJobs {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Inicializar todos os jobs do sistema
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('SystemJobs já foi inicializado');
      return;
    }

    try {
      // Job de coleta de métricas (a cada 5 segundos)
      this.scheduleMetricsCollection();

      // Job de reset de métricas de autenticação (a cada hora)
      this.scheduleAuthMetricsReset();

      // Job de verificação de saúde da autenticação (a cada 5 minutos)
      this.scheduleAuthHealthCheck();

      // Job de monitoramento de câmeras (a cada 30 segundos)
      this.scheduleCameraMonitoring();

      // Job de limpeza de relatórios antigos (diariamente às 02:00)
      this.scheduleReportsCleanup();

      // Job de limpeza de conexões socket inativas (a cada minuto)
      this.scheduleSocketCleanup();

      // Job de limpeza de arquivos antigos (diariamente às 02:00)
      this.scheduleFileCleanup();

      // Job de limpeza de tentativas de login falhadas (a cada hora)
      this.scheduleFailedAttemptsCleanup();

      this.isInitialized = true;
      logger.info('SystemJobs inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar SystemJobs:', error);
      throw error;
    }
  }

  /**
   * Agendar coleta de métricas do sistema
   */
  scheduleMetricsCollection() {
    const job = cron.schedule('*/5 * * * * *', async () => {
      try {
        if (metricsService.isCollecting) {
          await metricsService.collectMetrics();
        }
      } catch (error) {
        logger.error('Erro na coleta de métricas agendada:', error);
      }
    }, {
      scheduled: false,
      name: 'metrics-collection'
    });

    this.jobs.set('metrics-collection', job);
    job.start();
    logger.info('Job de coleta de métricas agendado (a cada 5 segundos)');
  }

  /**
   * Agendar reset de métricas de autenticação
   */
  scheduleAuthMetricsReset() {
    const job = cron.schedule('0 * * * *', () => {
      try {
        authHealthService.resetMetrics();
        logger.debug('Métricas de autenticação resetadas');
      } catch (error) {
        logger.error('Erro ao resetar métricas de autenticação:', error);
      }
    }, {
      scheduled: false,
      name: 'auth-metrics-reset'
    });

    this.jobs.set('auth-metrics-reset', job);
    job.start();
    logger.info('Job de reset de métricas de autenticação agendado (a cada hora)');
  }

  /**
   * Agendar verificação de saúde da autenticação
   */
  scheduleAuthHealthCheck() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await authHealthService.checkHealth();
      } catch (error) {
        logger.error('Erro na verificação de saúde da autenticação:', error);
      }
    }, {
      scheduled: false,
      name: 'auth-health-check'
    });

    this.jobs.set('auth-health-check', job);
    job.start();
    logger.info('Job de verificação de saúde da autenticação agendado (a cada 5 minutos)');
  }

  /**
   * Agendar monitoramento de câmeras
   */
  scheduleCameraMonitoring() {
    const job = cron.schedule('*/30 * * * * *', async () => {
      try {
        if (cameraMonitoringService.isRunning) {
          await cameraMonitoringService.checkAllCameras();
        }
      } catch (error) {
        logger.error('Erro no monitoramento de câmeras agendado:', error);
      }
    }, {
      scheduled: false,
      name: 'camera-monitoring'
    });

    this.jobs.set('camera-monitoring', job);
    job.start();
    logger.info('Job de monitoramento de câmeras agendado (a cada 30 segundos)');
  }

  /**
   * Agendar limpeza de relatórios antigos
   */
  scheduleReportsCleanup() {
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        await reportService.cleanupOldReports();
        logger.info('Limpeza de relatórios antigos executada');
      } catch (error) {
        logger.error('Erro na limpeza de relatórios antigos:', error);
      }
    }, {
      scheduled: false,
      name: 'reports-cleanup'
    });

    this.jobs.set('reports-cleanup', job);
    job.start();
    logger.info('Job de limpeza de relatórios agendado (diariamente às 02:00)');
  }

  /**
   * Agendar limpeza de conexões socket inativas
   */
  scheduleSocketCleanup() {
    const job = cron.schedule('* * * * *', () => {
      try {
        // Importar dinamicamente para evitar dependência circular
        import('../controllers/socketController.js').then(({ cleanupInactiveConnections }) => {
          if (cleanupInactiveConnections) {
            cleanupInactiveConnections();
          }
        }).catch(error => {
          logger.error('Erro ao importar socketController para limpeza:', error);
        });
      } catch (error) {
        logger.error('Erro na limpeza de conexões socket:', error);
      }
    }, {
      scheduled: false,
      name: 'socket-cleanup'
    });

    this.jobs.set('socket-cleanup', job);
    job.start();
    logger.info('Job de limpeza de conexões socket agendado (a cada minuto)');
  }

  /**
   * Agendar limpeza de arquivos antigos
   */
  scheduleFileCleanup() {
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        const { getService } = await import('../config/services.js');
        const fileService = getService('fileService');
        if (fileService && fileService.cleanupOldFiles) {
          await fileService.cleanupOldFiles();
          logger.info('Limpeza de arquivos antigos executada');
        }
      } catch (error) {
        logger.error('Erro na limpeza de arquivos antigos:', error);
      }
    }, {
      scheduled: false,
      name: 'file-cleanup'
    });

    this.jobs.set('file-cleanup', job);
    job.start();
    logger.info('Job de limpeza de arquivos antigos agendado (diariamente às 02:00)');
  }

  /**
   * Agendar limpeza de tentativas de login falhadas
   */
  scheduleFailedAttemptsCleanup() {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        const { getService } = await import('../config/services.js');
        const userService = getService('userService');
        if (userService && userService.cleanupFailedAttempts) {
          await userService.cleanupFailedAttempts();
          logger.debug('Limpeza de tentativas de login falhadas executada');
        }
      } catch (error) {
        logger.error('Erro na limpeza de tentativas de login falhadas:', error);
      }
    }, {
      scheduled: false,
      name: 'failed-attempts-cleanup'
    });

    this.jobs.set('failed-attempts-cleanup', job);
    job.start();
    logger.info('Job de limpeza de tentativas de login falhadas agendado (a cada hora)');
  }

  /**
   * Parar um job específico
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      logger.info(`Job '${jobName}' parado`);
    } else {
      logger.warn(`Job '${jobName}' não encontrado`);
    }
  }

  /**
   * Parar todos os jobs
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Parando todos os jobs do sistema...');
    
    for (const [jobName, job] of this.jobs) {
      try {
        job.stop();
        logger.debug(`Job '${jobName}' parado`);
      } catch (error) {
        logger.error(`Erro ao parar job '${jobName}':`, error);
      }
    }

    this.jobs.clear();
    this.isInitialized = false;
    logger.info('Todos os jobs do sistema foram parados');
  }

  /**
   * Obter status de todos os jobs
   */
  getJobsStatus() {
    const status = {};
    for (const [jobName, job] of this.jobs) {
      status[jobName] = {
        running: job.running || false,
        scheduled: job.scheduled || false
      };
    }
    return status;
  }
}

const systemJobs = new SystemJobs();
export default systemJobs;
export { SystemJobs };