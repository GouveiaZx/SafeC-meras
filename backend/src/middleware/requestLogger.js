/**
 * Middleware para logging de requisições
 */

import { createModuleLogger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createModuleLogger('RequestLogger');

/**
 * Middleware para adicionar ID único à requisição e fazer log
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @param {Function} next - Função next do Express
 */
export function requestLogger(req, res, next) {
  // Gerar ID único para a requisição
  req.id = uuidv4();
  
  // Adicionar timestamp de início
  req.startTime = Date.now();
  
  // Extrair informações da requisição
  const requestInfo = {
    id: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    referer: req.get('Referer'),
    timestamp: new Date().toISOString()
  };

  // Log da requisição de entrada
  logger.http('Requisição recebida', requestInfo);

  // Interceptar a resposta para fazer log da saída
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    
    const responseInfo = {
      id: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    };

    // Log baseado no status code
    if (res.statusCode >= 500) {
      logger.error('Resposta enviada', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('Resposta enviada', responseInfo);
    } else {
      logger.http('Resposta enviada', responseInfo);
    }

    // Chamar o método original
    originalSend.call(this, data);
  };

  next();
}

/**
 * Middleware para adicionar cabeçalhos de resposta úteis
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @param {Function} next - Função next do Express
 */
export function responseHeaders(req, res, next) {
  // Adicionar ID da requisição ao cabeçalho de resposta
  res.set('X-Request-ID', req.id);
  
  // Adicionar timestamp da resposta
  res.set('X-Response-Time', new Date().toISOString());
  
  // Adicionar informações do servidor
  res.set('X-Powered-By', 'NewCAM Backend');
  
  next();
}

export default {
  requestLogger,
  responseHeaders
};