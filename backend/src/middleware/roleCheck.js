/**
 * Middleware de verificação de roles/permissões
 * Controla o acesso baseado no tipo de usuário
 */

/**
 * Middleware para verificar se o usuário tem uma das roles permitidas
 * @param {string[]} allowedRoles - Array de roles permitidas
 * @returns {Function} Middleware function
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Verificar se o usuário está autenticado
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      // Verificar se o usuário tem uma das roles permitidas
      const userRole = req.user.userType;
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Permissões insuficientes.',
          required: allowedRoles,
          current: userRole
        });
      }

      next();
    } catch (error) {
      console.error('Erro na verificação de role:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

/**
 * Middleware para verificar se o usuário tem uma role específica
 * @param {string} requiredRole - Role necessária
 * @returns {Function} Middleware function
 */
export const requireSpecificRole = (requiredRole) => {
  return requireRole([requiredRole]);
};

/**
 * Middleware para verificar se o usuário é ADMIN
 * @returns {Function} Middleware function
 */
export const requireAdmin = () => {
  return requireRole(['ADMIN']);
};

/**
 * Middleware para verificar se o usuário é ADMIN ou INTEGRATOR
 * @returns {Function} Middleware function
 */
export const requireAdminOrIntegrator = () => {
  return requireRole(['ADMIN', 'INTEGRATOR']);
};

/**
 * Middleware para verificar se o usuário pode acessar recursos de outro usuário
 * @param {string} userIdParam - Nome do parâmetro que contém o ID do usuário
 * @returns {Function} Middleware function
 */
export const requireOwnershipOrAdmin = (userIdParam = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      const targetUserId = req.params[userIdParam] || req.body[userIdParam];
      const currentUserId = req.user.id;
      const userRole = req.user.userType;

      // ADMIN pode acessar qualquer recurso
      if (userRole === 'ADMIN') {
        return next();
      }

      // Usuário pode acessar apenas seus próprios recursos
      if (currentUserId.toString() === targetUserId.toString()) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Você só pode acessar seus próprios recursos.'
      });
    } catch (error) {
      console.error('Erro na verificação de ownership:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

/**
 * Função auxiliar para verificar se um usuário tem uma role específica
 * @param {Object} user - Objeto do usuário
 * @param {string|string[]} roles - Role(s) para verificar
 * @returns {boolean} True se o usuário tem a role
 */
export const hasRole = (user, roles) => {
  if (!user || !user.userType) {
    return false;
  }

  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.userType);
};

/**
 * Função auxiliar para verificar se um usuário é admin
 * @param {Object} user - Objeto do usuário
 * @returns {boolean} True se o usuário é admin
 */
export const isAdmin = (user) => {
  return hasRole(user, 'ADMIN');
};

/**
 * Função auxiliar para verificar se um usuário é integrator ou admin
 * @param {Object} user - Objeto do usuário
 * @returns {boolean} True se o usuário é integrator ou admin
 */
export const isAdminOrIntegrator = (user) => {
  return hasRole(user, ['ADMIN', 'INTEGRATOR']);
};

export default {
  requireRole,
  requireSpecificRole,
  requireAdmin,
  requireAdminOrIntegrator,
  requireOwnershipOrAdmin,
  hasRole,
  isAdmin,
  isAdminOrIntegrator
};