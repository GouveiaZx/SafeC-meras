/**
 * Middleware de tratamento de erros para o sistema NewCAM
 * Captura e formata erros da aplicação
 */

import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('ErrorHandler');

// Classe para erros customizados
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Classe para erros de validação
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

// Classe para erros de autenticação
class AuthenticationError extends AppError {
  constructor(message = 'Não autenticado') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

// Classe para erros de autorização
class AuthorizationError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

// Classe para erros de recurso não encontrado
class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

// Classe para erros de conflito
class ConflictError extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

// Classe para erros de rate limiting
class RateLimitError extends AppError {
  constructor(message = 'Muitas requisições') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Função para tratar erros do Supabase
const handleSupabaseError = (error) => {
  logger.error('Erro do Supabase:', error);
  
  // Mapear códigos de erro do Supabase
  switch (error.code) {
    case 'PGRST116':
      return new NotFoundError('Recurso não encontrado');
    
    case 'PGRST301':
      return new ValidationError('Dados inválidos', error.details);
    
    case '23505': // unique_violation
      return new ConflictError('Dados já existem');
    
    case '23503': // foreign_key_violation
      return new ValidationError('Referência inválida');
    
    case '23502': // not_null_violation
      return new ValidationError('Campo obrigatório não fornecido');
    
    case '23514': // check_violation
      return new ValidationError('Dados não atendem aos critérios');
    
    case '42501': // insufficient_privilege
      return new AuthorizationError('Permissões insuficientes');
    
    case '28P01': // invalid_password
      return new AuthenticationError('Credenciais inválidas');
    
    default:
      return new AppError('Erro interno do banco de dados', 500, 'DATABASE_ERROR');
  }
};

// Função para tratar erros de JWT
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Token inválido');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expirado');
  }
  
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token ainda não é válido');
  }
  
  return new AuthenticationError('Erro de autenticação');
};

// Função para tratar erros de validação
const handleValidationError = (error) => {
  const details = error.details || [];
  return new ValidationError('Dados de entrada inválidos', details);
};

// Função para tratar erros de multer (upload)
const handleMulterError = (error) => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ValidationError('Arquivo muito grande');
    
    case 'LIMIT_FILE_COUNT':
      return new ValidationError('Muitos arquivos');
    
    case 'LIMIT_UNEXPECTED_FILE':
      return new ValidationError('Arquivo não esperado');
    
    case 'LIMIT_FIELD_KEY':
      return new ValidationError('Nome do campo muito longo');
    
    case 'LIMIT_FIELD_VALUE':
      return new ValidationError('Valor do campo muito longo');
    
    case 'LIMIT_FIELD_COUNT':
      return new ValidationError('Muitos campos');
    
    case 'LIMIT_PART_COUNT':
      return new ValidationError('Muitas partes');
    
    default:
      return new ValidationError('Erro no upload do arquivo');
  }
};

// Middleware principal de tratamento de erros
const errorHandler = (error, req, res, next) => {
  let err = error;
  
  // Log do erro original
  logger.error('Erro capturado:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  // Tratar diferentes tipos de erro
  if (error.code && error.code.startsWith('PGRST')) {
    err = handleSupabaseError(error);
  } else if (error.name && error.name.includes('JsonWebToken')) {
    err = handleJWTError(error);
  } else if (error.code && error.code.startsWith('LIMIT_')) {
    err = handleMulterError(error);
  } else if (error.name === 'ValidationError') {
    err = handleValidationError(error);
  } else if (error.code === 'ECONNREFUSED') {
    err = new AppError('Serviço indisponível', 503, 'SERVICE_UNAVAILABLE');
  } else if (error.code === 'ENOTFOUND') {
    err = new AppError('Serviço não encontrado', 503, 'SERVICE_NOT_FOUND');
  } else if (error.code === 'ETIMEDOUT') {
    err = new AppError('Timeout na requisição', 408, 'REQUEST_TIMEOUT');
  }
  
  // Se não é um erro operacional conhecido, criar um erro genérico
  if (!err.isOperational) {
    err = new AppError(
      process.env.NODE_ENV === 'production' 
        ? 'Erro interno do servidor' 
        : error.message,
      500,
      'INTERNAL_ERROR'
    );
  }
  
  // Preparar resposta de erro
  const errorResponse = {
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  };
  
  // Adicionar detalhes em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = err.details;
  }
  
  // Adicionar detalhes se disponíveis
  if (err.details) {
    errorResponse.details = err.details;
  }
  
  // Adicionar ID de rastreamento
  if (req.id) {
    errorResponse.requestId = req.id;
  }
  
  res.status(err.statusCode || 500).json(errorResponse);
};

// Middleware para capturar erros assíncronos
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Middleware para tratar rotas não encontradas
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Rota ${req.method} ${req.url} não encontrada`);
  next(error);
};

// Middleware para adicionar ID de rastreamento à requisição
const requestIdHandler = (req, res, next) => {
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Função para gerar ID único de requisição
const generateRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Middleware para log de requisições
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log da requisição
  logger.http('Requisição recebida', {
    id: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  // Interceptar resposta para log
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    logger.http('Resposta enviada', {
      id: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Handler para erros não capturados
const handleUncaughtException = (error) => {
  logger.error('Exceção não capturada:', error);
  
  // Graceful shutdown
  process.exit(1);
};

// Handler para promises rejeitadas não tratadas
const handleUnhandledRejection = (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', { reason, promise });
  
  // Graceful shutdown
  process.exit(1);
};

// Configurar handlers globais
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

const errorMiddleware = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  requestIdHandler,
  requestLogger
};

export {
  errorMiddleware,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  requestIdHandler,
  requestLogger
};