/**
 * Configurações de logging para o sistema NewCAM
 * Utiliza Winston para logging estruturado
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração dos níveis de log
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Cores para cada nível
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Adicionar cores ao winston
winston.addColors(logColors);

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    if (info.stack) {
      return `${info.timestamp} ${info.level}: ${info.message}\n${info.stack}`;
    }
    return `${info.timestamp} ${info.level}: ${info.message}`;
  })
);

// Formato para arquivos (sem cores)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Configuração dos transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: logFormat,
    level: process.env.LOG_LEVEL || 'debug'
  }),
  
  // Arquivo para todos os logs
  new winston.transports.File({
    filename: path.join(process.cwd(), 'storage/logs/combined.log'),
    format: fileFormat,
    level: 'info',
    maxsize: parseInt(process.env.LOG_MAX_SIZE_MB) * 1024 * 1024 || 100 * 1024 * 1024, // 100MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 10,
    tailable: true
  }),
  
  // Arquivo específico para erros
  new winston.transports.File({
    filename: path.join(process.cwd(), 'storage/logs/error.log'),
    format: fileFormat,
    level: 'error',
    maxsize: parseInt(process.env.LOG_MAX_SIZE_MB) * 1024 * 1024 || 100 * 1024 * 1024,
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 10,
    tailable: true
  })
];

// Criar logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  levels: logLevels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// Logger específico para HTTP requests
const httpLogger = winston.createLogger({
  level: 'http',
  levels: logLevels,
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'storage/logs/http.log'),
      format: fileFormat,
      level: 'http',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Logger específico para streaming
const streamLogger = winston.createLogger({
  level: 'info',
  levels: logLevels,
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'storage/logs/streaming.log'),
      format: fileFormat,
      level: 'info',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Configuração para desenvolvimento
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Função para criar logger específico por módulo
const createModuleLogger = (moduleName) => {
  return {
    error: (message, meta = {}) => logger.error(`[${moduleName}] ${message}`, meta),
    warn: (message, meta = {}) => logger.warn(`[${moduleName}] ${message}`, meta),
    info: (message, meta = {}) => logger.info(`[${moduleName}] ${message}`, meta),
    http: (message, meta = {}) => httpLogger.http(`[${moduleName}] ${message}`, meta),
    debug: (message, meta = {}) => logger.debug(`[${moduleName}] ${message}`, meta)
  };
};

const loggerConfig = {
  logger,
  httpLogger,
  streamLogger,
  createModuleLogger
};

export { loggerConfig, logger, httpLogger, streamLogger, createModuleLogger };