import cron from 'node-cron';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('SchedulerService');

/**
 * Serviço de agendamento de tarefas usando node-cron
 * Substitui setInterval/setTimeout por jobs cron mais robustos
 */
class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Inicializa o serviço de agendamento
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('SchedulerService já foi inicializado');
      return;
    }

    try {
      logger.info('Inicializando SchedulerService...');
      this.isInitialized = true;
      logger.info('SchedulerService inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar SchedulerService:', error);
      throw error;
    }
  }

  /**
   * Agenda uma tarefa usando cron expression
   * @param {string} name - Nome único da tarefa
   * @param {string} cronExpression - Expressão cron (ex: '0 2 * * *' para 2:00 AM diariamente)
   * @param {Function} task - Função a ser executada
   * @param {Object} options - Opções adicionais
   */
  scheduleJob(name, cronExpression, task, options = {}) {
    try {
      if (this.jobs.has(name)) {
        logger.warn(`Job '${name}' já existe. Cancelando job anterior.`);
        this.cancelJob(name);
      }

      const job = cron.schedule(cronExpression, async () => {
        try {
          logger.debug(`Executando job '${name}'`);
          await task();
          logger.debug(`Job '${name}' executado com sucesso`);
        } catch (error) {
          logger.error(`Erro ao executar job '${name}':`, error);
          if (options.onError) {
            options.onError(error);
          }
        }
      }, {
        scheduled: false,
        timezone: options.timezone || 'America/Sao_Paulo'
      });

      this.jobs.set(name, {
        job,
        cronExpression,
        task,
        options,
        createdAt: new Date()
      });

      if (options.immediate !== false) {
        job.start();
        logger.info(`Job '${name}' agendado: ${cronExpression}`);
      }

      return job;
    } catch (error) {
      logger.error(`Erro ao agendar job '${name}':`, error);
      throw error;
    }
  }

  /**
   * Agenda uma tarefa para execução em intervalos regulares
   * @param {string} name - Nome único da tarefa
   * @param {number} intervalMinutes - Intervalo em minutos
   * @param {Function} task - Função a ser executada
   * @param {Object} options - Opções adicionais
   */
  scheduleInterval(name, intervalMinutes, task, options = {}) {
    // Converte minutos para expressão cron
    const cronExpression = `*/${intervalMinutes} * * * *`;
    return this.scheduleJob(name, cronExpression, task, options);
  }

  /**
   * Agenda uma tarefa para execução diária em horário específico
   * @param {string} name - Nome único da tarefa
   * @param {number} hour - Hora (0-23)
   * @param {number} minute - Minuto (0-59)
   * @param {Function} task - Função a ser executada
   * @param {Object} options - Opções adicionais
   */
  scheduleDaily(name, hour, minute, task, options = {}) {
    const cronExpression = `${minute} ${hour} * * *`;
    return this.scheduleJob(name, cronExpression, task, options);
  }

  /**
   * Agenda uma tarefa para execução única após um delay
   * @param {string} name - Nome único da tarefa
   * @param {number} delayMs - Delay em milissegundos
   * @param {Function} task - Função a ser executada
   */
  scheduleOnce(name, delayMs, task) {
    try {
      const timeoutId = setTimeout(async () => {
        try {
          logger.debug(`Executando tarefa única '${name}'`);
          await task();
          logger.debug(`Tarefa única '${name}' executada com sucesso`);
          this.jobs.delete(name);
        } catch (error) {
          logger.error(`Erro ao executar tarefa única '${name}':`, error);
          this.jobs.delete(name);
        }
      }, delayMs);

      this.jobs.set(name, {
        timeoutId,
        type: 'once',
        delayMs,
        task,
        createdAt: new Date()
      });

      logger.info(`Tarefa única '${name}' agendada para ${delayMs}ms`);
      return timeoutId;
    } catch (error) {
      logger.error(`Erro ao agendar tarefa única '${name}':`, error);
      throw error;
    }
  }

  /**
   * Cancela um job agendado
   * @param {string} name - Nome do job
   */
  cancelJob(name) {
    try {
      const jobData = this.jobs.get(name);
      if (!jobData) {
        logger.warn(`Job '${name}' não encontrado`);
        return false;
      }

      if (jobData.type === 'once') {
        clearTimeout(jobData.timeoutId);
      } else {
        jobData.job.stop();
      }

      this.jobs.delete(name);
      logger.info(`Job '${name}' cancelado`);
      return true;
    } catch (error) {
      logger.error(`Erro ao cancelar job '${name}':`, error);
      return false;
    }
  }

  /**
   * Lista todos os jobs ativos
   */
  listJobs() {
    const jobList = [];
    for (const [name, data] of this.jobs) {
      jobList.push({
        name,
        type: data.type || 'cron',
        cronExpression: data.cronExpression,
        createdAt: data.createdAt,
        isRunning: data.type === 'once' ? true : data.job.running
      });
    }
    return jobList;
  }

  /**
   * Para todos os jobs e limpa o serviço
   */
  async shutdown() {
    try {
      logger.info('Finalizando SchedulerService...');
      
      for (const [name] of this.jobs) {
        this.cancelJob(name);
      }
      
      this.jobs.clear();
      this.isInitialized = false;
      
      logger.info('SchedulerService finalizado');
    } catch (error) {
      logger.error('Erro ao finalizar SchedulerService:', error);
    }
  }
}

// Instância singleton
const schedulerService = new SchedulerService();

export default schedulerService;
export { SchedulerService };