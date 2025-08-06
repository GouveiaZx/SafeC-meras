import winston from 'winston';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Serviço especializado para logs detalhados de upload
 * Gerencia logs estruturados para debugging e monitoramento
 */
class UploadLogService {
  constructor() {
    this.logger = null;
    this.logDir = path.join(__dirname, '../../logs/uploads');
    this.initialized = false;
  }

  /**
   * Inicializa o serviço de logs
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Criar diretório de logs se não existir
      await fs.mkdir(this.logDir, { recursive: true });

      // Configurar logger específico para uploads
      this.logger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          winston.format.errors({ stack: true }),
          winston.format.json(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const logEntry = {
              timestamp,
              level,
              message,
              ...meta
            };
            return JSON.stringify(logEntry, null, 2);
          })
        ),
        transports: [
          // Log de uploads geral
          new winston.transports.File({
            filename: path.join(this.logDir, 'uploads.log'),
            maxsize: 50 * 1024 * 1024, // 50MB
            maxFiles: 10,
            tailable: true
          }),
          // Log de erros de upload
          new winston.transports.File({
            filename: path.join(this.logDir, 'upload-errors.log'),
            level: 'error',
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            tailable: true
          }),
          // Log de performance
          new winston.transports.File({
            filename: path.join(this.logDir, 'upload-performance.log'),
            maxsize: 30 * 1024 * 1024, // 30MB
            maxFiles: 7,
            tailable: true,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                // Filtrar apenas logs de performance
                if (meta.type === 'performance' || message.includes('performance')) {
                  return JSON.stringify({ timestamp, level, message, ...meta }, null, 2);
                }
                return '';
              })
            )
          })
        ]
      });

      // Adicionar console em desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        this.logger.add(new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [UPLOAD] ${level}: ${message} ${metaStr}`;
            })
          )
        }));
      }

      this.initialized = true;
      this.logInfo('UploadLogService inicializado com sucesso');

    } catch (error) {
      console.error('Erro ao inicializar UploadLogService:', error);
      throw error;
    }
  }

  /**
   * Log de início de upload
   */
  logUploadStart(recordingId, metadata = {}) {
    this.logInfo('Upload iniciado', {
      recordingId,
      type: 'upload_start',
      metadata: {
        fileSize: metadata.fileSize,
        fileName: metadata.fileName,
        cameraId: metadata.cameraId,
        startTime: new Date().toISOString(),
        ...metadata
      }
    });
  }

  /**
   * Log de progresso de upload
   */
  logUploadProgress(recordingId, progress) {
    this.logDebug('Progresso de upload', {
      recordingId,
      type: 'upload_progress',
      progress: {
        percentage: progress.percentage,
        uploadedBytes: progress.uploadedBytes,
        totalBytes: progress.totalBytes,
        speed: progress.speed,
        eta: progress.eta,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log de conclusão de upload
   */
  logUploadComplete(recordingId, result = {}) {
    this.logInfo('Upload concluído com sucesso', {
      recordingId,
      type: 'upload_complete',
      result: {
        duration: result.duration,
        finalSize: result.finalSize,
        s3Key: result.s3Key,
        s3Url: result.s3Url,
        completedAt: new Date().toISOString(),
        ...result
      }
    });

    // Log de performance
    this.logPerformance(recordingId, {
      action: 'upload_complete',
      duration: result.duration,
      fileSize: result.finalSize,
      speed: result.finalSize && result.duration ? (result.finalSize / result.duration) : null
    });
  }

  /**
   * Log de falha de upload
   */
  logUploadError(recordingId, error, metadata = {}) {
    this.logError('Falha no upload', {
      recordingId,
      type: 'upload_error',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString()
      },
      metadata: {
        attempt: metadata.attempt,
        maxRetries: metadata.maxRetries,
        nextRetryAt: metadata.nextRetryAt,
        ...metadata
      }
    });
  }

  /**
   * Log de retry de upload
   */
  logUploadRetry(recordingId, retryInfo) {
    this.logWarn('Tentativa de retry de upload', {
      recordingId,
      type: 'upload_retry',
      retry: {
        attempt: retryInfo.attempt,
        maxRetries: retryInfo.maxRetries,
        delay: retryInfo.delay,
        reason: retryInfo.reason,
        scheduledFor: retryInfo.scheduledFor,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log de cancelamento de upload
   */
  logUploadCancel(recordingId, reason = '') {
    this.logWarn('Upload cancelado', {
      recordingId,
      type: 'upload_cancel',
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log de performance
   */
  logPerformance(recordingId, metrics) {
    this.logInfo('Métricas de performance', {
      recordingId,
      type: 'performance',
      metrics: {
        ...metrics,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log de operações da fila
   */
  logQueueOperation(operation, data = {}) {
    this.logInfo(`Operação da fila: ${operation}`, {
      type: 'queue_operation',
      operation,
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log de webhook
   */
  logWebhook(event, data = {}) {
    this.logInfo(`Webhook recebido: ${event}`, {
      type: 'webhook',
      event,
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Métodos de log básicos
   */
  logDebug(message, meta = {}) {
    if (this.logger) {
      this.logger.debug(message, meta);
    }
  }

  logInfo(message, meta = {}) {
    if (this.logger) {
      this.logger.info(message, meta);
    }
  }

  logWarn(message, meta = {}) {
    if (this.logger) {
      this.logger.warn(message, meta);
    }
  }

  logError(message, meta = {}) {
    if (this.logger) {
      this.logger.error(message, meta);
    }
  }

  /**
   * Obter logs recentes
   */
  async getRecentLogs(options = {}) {
    const {
      type = 'all', // 'all', 'errors', 'performance'
      limit = 100,
      recordingId = null,
      startDate = null,
      endDate = null
    } = options;

    try {
      let logFile;
      switch (type) {
        case 'errors':
          logFile = path.join(this.logDir, 'upload-errors.log');
          break;
        case 'performance':
          logFile = path.join(this.logDir, 'upload-performance.log');
          break;
        default:
          logFile = path.join(this.logDir, 'uploads.log');
      }

      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      let logs = lines
        .slice(-limit * 2) // Pegar mais linhas para filtrar
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(log => log !== null);

      // Filtrar por recordingId se especificado
      if (recordingId) {
        logs = logs.filter(log => log.recordingId === recordingId);
      }

      // Filtrar por data se especificado
      if (startDate || endDate) {
        logs = logs.filter(log => {
          const logDate = new Date(log.timestamp);
          if (startDate && logDate < new Date(startDate)) return false;
          if (endDate && logDate > new Date(endDate)) return false;
          return true;
        });
      }

      return logs.slice(-limit).reverse(); // Mais recentes primeiro

    } catch (error) {
      this.logError('Erro ao obter logs recentes', { error: error.message });
      return [];
    }
  }

  /**
   * Limpar logs antigos
   */
  async cleanOldLogs(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          this.logInfo(`Log antigo removido: ${file}`);
        }
      }

    } catch (error) {
      this.logError('Erro ao limpar logs antigos', { error: error.message });
    }
  }

  /**
   * Obter estatísticas de logs
   */
  async getLogStats() {
    try {
      const files = await fs.readdir(this.logDir);
      const stats = {};

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const fileStats = await fs.stat(filePath);
        
        stats[file] = {
          size: fileStats.size,
          modified: fileStats.mtime,
          sizeFormatted: this.formatBytes(fileStats.size)
        };
      }

      return stats;

    } catch (error) {
      this.logError('Erro ao obter estatísticas de logs', { error: error.message });
      return {};
    }
  }

  /**
   * Formatar bytes em formato legível
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Exportar instância singleton
const uploadLogService = new UploadLogService();
export default uploadLogService;