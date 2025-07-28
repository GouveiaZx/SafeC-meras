/**
 * Middleware para tratar rotas não encontradas
 */

import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('NotFoundHandler');

/**
 * Middleware para tratar requisições para rotas não encontradas
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @param {Function} next - Função next do Express
 */
export function notFoundHandler(req, res, next) {
  const error = {
    status: 404,
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  logger.warn(`Rota não encontrada: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer')
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Rota não encontrada',
      details: `O endpoint ${req.method} ${req.originalUrl} não existe`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: error.timestamp
    }
  });
}

export default notFoundHandler;