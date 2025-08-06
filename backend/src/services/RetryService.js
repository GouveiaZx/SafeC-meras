import logger from '../utils/logger.js';

/**
 * Serviço de Retry com Backoff Exponencial
 * Implementa estratégias avançadas de retry para operações críticas
 */
class RetryService {
  constructor() {
    this.defaultConfig = {
      maxAttempts: 3,
      baseDelay: 1000, // 1 segundo
      maxDelay: 30000, // 30 segundos
      backoffFactor: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EPIPE',
        'ECONNABORTED',
        'NetworkError',
        'TimeoutError',
        'ServiceUnavailable',
        'InternalServerError',
        'BadGateway',
        'GatewayTimeout'
      ]
    };
  }

  /**
   * Executa uma operação com retry automático
   * @param {Function} operation - Função a ser executada
   * @param {Object} config - Configurações de retry
   * @param {string} operationName - Nome da operação para logs
   * @returns {Promise} Resultado da operação
   */
  async executeWithRetry(operation, config = {}, operationName = 'Operation') {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError;
    
    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        logger.debug(`[RetryService] Tentativa ${attempt}/${finalConfig.maxAttempts} para ${operationName}`);
        
        const result = await operation(attempt);
        
        if (attempt > 1) {
          logger.info(`[RetryService] ${operationName} bem-sucedida na tentativa ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        logger.warn(`[RetryService] Tentativa ${attempt} falhou para ${operationName}:`, {
          error: error.message,
          code: error.code,
          attempt,
          maxAttempts: finalConfig.maxAttempts
        });
        
        // Verificar se o erro é retryable
        if (!this.isRetryableError(error, finalConfig.retryableErrors)) {
          logger.error(`[RetryService] Erro não retryable para ${operationName}:`, error.message);
          throw error;
        }
        
        // Se não é a última tentativa, aguardar antes de tentar novamente
        if (attempt < finalConfig.maxAttempts) {
          const delay = this.calculateDelay(attempt, finalConfig);
          logger.debug(`[RetryService] Aguardando ${delay}ms antes da próxima tentativa`);
          await this.sleep(delay);
        }
      }
    }
    
    logger.error(`[RetryService] Todas as tentativas falharam para ${operationName}`);
    throw lastError;
  }

  /**
   * Executa upload com retry específico para S3
   * @param {Function} uploadOperation - Função de upload
   * @param {Object} uploadData - Dados do upload
   * @returns {Promise} Resultado do upload
   */
  async executeUploadWithRetry(uploadOperation, uploadData) {
    const uploadConfig = {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffFactor: 2.5,
      jitter: true,
      retryableErrors: [
        ...this.defaultConfig.retryableErrors,
        'RequestTimeout',
        'SlowDown',
        'ServiceUnavailable',
        'InternalError',
        'NoSuchUpload',
        'InvalidPart'
      ]
    };

    return this.executeWithRetry(
      async (attempt) => {
        logger.info(`[RetryService] Iniciando upload - Tentativa ${attempt}`, {
          recordingId: uploadData.recordingId,
          fileSize: uploadData.fileSize
        });
        
        return await uploadOperation(uploadData, attempt);
      },
      uploadConfig,
      `Upload ${uploadData.recordingId}`
    );
  }

  /**
   * Executa operação de banco de dados com retry
   * @param {Function} dbOperation - Função de banco de dados
   * @param {Object} operationData - Dados da operação
   * @param {string} operationName - Nome da operação
   * @returns {Promise} Resultado da operação
   */
  async executeDatabaseWithRetry(dbOperation, operationData, operationName) {
    const dbConfig = {
      maxAttempts: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'connection_timeout',
        'connection_error',
        'database_error',
        'temporary_failure'
      ]
    };

    return this.executeWithRetry(
      async (attempt) => {
        logger.debug(`[RetryService] Operação DB - Tentativa ${attempt}:`, operationName);
        return await dbOperation(operationData, attempt);
      },
      dbConfig,
      `Database ${operationName}`
    );
  }

  /**
   * Executa requisição HTTP com retry
   * @param {Function} httpOperation - Função de requisição HTTP
   * @param {Object} requestData - Dados da requisição
   * @param {string} operationName - Nome da operação
   * @returns {Promise} Resultado da requisição
   */
  async executeHttpWithRetry(httpOperation, requestData, operationName) {
    const httpConfig = {
      maxAttempts: 4,
      baseDelay: 1000,
      maxDelay: 15000,
      backoffFactor: 2,
      jitter: true,
      retryableErrors: [
        ...this.defaultConfig.retryableErrors,
        'ENOTFOUND',
        'ECONNABORTED',
        'ERR_NETWORK',
        'ERR_INTERNET_DISCONNECTED'
      ]
    };

    return this.executeWithRetry(
      async (attempt) => {
        logger.debug(`[RetryService] HTTP Request - Tentativa ${attempt}:`, operationName);
        return await httpOperation(requestData, attempt);
      },
      httpConfig,
      `HTTP ${operationName}`
    );
  }

  /**
   * Verifica se um erro é retryable
   * @param {Error} error - Erro a ser verificado
   * @param {Array} retryableErrors - Lista de erros retryable
   * @returns {boolean} Se o erro é retryable
   */
  isRetryableError(error, retryableErrors) {
    if (!error) return false;
    
    // Verificar código do erro
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }
    
    // Verificar mensagem do erro
    if (error.message) {
      const message = error.message.toLowerCase();
      return retryableErrors.some(retryableError => 
        message.includes(retryableError.toLowerCase())
      );
    }
    
    // Verificar status HTTP
    if (error.response && error.response.status) {
      const status = error.response.status;
      return status >= 500 || status === 408 || status === 429;
    }
    
    // Verificar nome do erro
    if (error.name && retryableErrors.includes(error.name)) {
      return true;
    }
    
    return false;
  }

  /**
   * Calcula o delay para a próxima tentativa
   * @param {number} attempt - Número da tentativa atual
   * @param {Object} config - Configurações de retry
   * @returns {number} Delay em milissegundos
   */
  calculateDelay(attempt, config) {
    // Backoff exponencial
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
    
    // Aplicar limite máximo
    delay = Math.min(delay, config.maxDelay);
    
    // Adicionar jitter para evitar thundering herd
    if (config.jitter) {
      const jitterRange = delay * 0.1; // 10% de jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  /**
   * Função de sleep
   * @param {number} ms - Milissegundos para aguardar
   * @returns {Promise} Promise que resolve após o delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cria um wrapper de retry para uma função
   * @param {Function} fn - Função a ser wrappada
   * @param {Object} config - Configurações de retry
   * @param {string} operationName - Nome da operação
   * @returns {Function} Função wrappada com retry
   */
  createRetryWrapper(fn, config = {}, operationName = 'Operation') {
    return async (...args) => {
      return this.executeWithRetry(
        async (attempt) => {
          return await fn.apply(this, [...args, attempt]);
        },
        config,
        operationName
      );
    };
  }

  /**
   * Executa múltiplas operações com retry em paralelo
   * @param {Array} operations - Array de operações
   * @param {Object} config - Configurações de retry
   * @returns {Promise} Array com resultados
   */
  async executeParallelWithRetry(operations, config = {}) {
    const promises = operations.map((operation, index) => {
      return this.executeWithRetry(
        operation.fn,
        { ...config, ...operation.config },
        operation.name || `Operation ${index + 1}`
      );
    });

    return Promise.allSettled(promises);
  }

  /**
   * Executa operações em sequência com retry
   * @param {Array} operations - Array de operações
   * @param {Object} config - Configurações de retry
   * @returns {Promise} Array com resultados
   */
  async executeSequentialWithRetry(operations, config = {}) {
    const results = [];
    
    for (const operation of operations) {
      try {
        const result = await this.executeWithRetry(
          operation.fn,
          { ...config, ...operation.config },
          operation.name || 'Sequential Operation'
        );
        results.push({ status: 'fulfilled', value: result });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
        
        // Se uma operação falhar e stopOnError for true, parar a sequência
        if (operation.stopOnError) {
          break;
        }
      }
    }
    
    return results;
  }

  /**
   * Obtém estatísticas de retry para monitoramento
   * @param {string} operationName - Nome da operação
   * @returns {Object} Estatísticas
   */
  getRetryStats(operationName) {
    // Esta implementação pode ser expandida para incluir métricas persistentes
    return {
      operationName,
      timestamp: new Date().toISOString(),
      defaultConfig: this.defaultConfig
    };
  }
}

export default new RetryService();