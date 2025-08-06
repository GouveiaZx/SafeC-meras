/**
 * Middleware de autorização baseado em roles para o sistema NewCAM
 * Verifica se o usuário tem as roles necessárias para acessar recursos
 */

import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('Authorize');

/**
 * Middleware para verificar se o usuário tem uma das roles permitidas
 * @param {string|string[]} allowedRoles - Role(s) permitida(s)
 * @returns {Function} Middleware function
 */
const authorize = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    // Verificar se o usuário está autenticado
    if (!req.user) {
      logger.warn('Tentativa de acesso sem autenticação');
      return res.status(401).json({
        error: 'Não autenticado',
        message: 'Você precisa estar logado para acessar este recurso'
      });
    }
    
    // Serviços internos têm acesso total
    if (req.user.id === 'internal-service') {
      return next();
    }
    
    // Verificar se o usuário tem uma das roles permitidas
    if (!roles.includes(req.user.role)) {
      logger.warn(`Acesso negado para ${req.user.email} - role: ${req.user.role}, roles permitidas: ${roles.join(', ')}`);
      return res.status(403).json({
        error: 'Acesso negado',
        message: `Você não tem permissão para acessar este recurso. Roles necessárias: ${roles.join(', ')}`
      });
    }
    
    logger.debug(`Acesso autorizado para ${req.user.email} com role: ${req.user.role}`);
    next();
  };
};

export { authorize };
export default authorize;