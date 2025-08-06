/**
 * Middleware de autenticação JWT para o sistema NewCAM
 * Verifica tokens JWT e gerencia sessões de usuário
 */

import jwt from 'jsonwebtoken';
import { supabaseAdmin, supabase } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import authHealthService from '../services/AuthHealthService.js';

const logger = createModuleLogger('Auth');

// Middleware principal de autenticação
const authenticateToken = async (req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    logger.info(`[${requestId}] 🔍 Auth Request: ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    // Bypass para desenvolvimento
    if (token === 'dev-token-for-testing' && process.env.NODE_ENV === 'development') {
      logger.info(`[${requestId}] 🔧 Development bypass activated`);
      req.user = {
        id: 'dev-user',
        email: 'dev@test.com',
        name: 'Usuário de Desenvolvimento',
        role: 'admin',
        userType: 'ADMIN',
        permissions: ['*'],
        camera_access: ['*'], // Acesso total para desenvolvimento
        active: true,
        created_at: new Date().toISOString()
      };
      req.supabase = supabase;
      return next();
    }
    
    if (!token) {
      logger.warn(`[${requestId}] ❌ Missing token: ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      // Registrar erro no monitoramento de saúde
      authHealthService.recordAuthError('NO_TOKEN', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({
        error: 'Token de acesso requerido',
        message: 'Você precisa estar logado para acessar este recurso'
      });
    }
    
    logger.debug(`[${requestId}] 🔑 Token received, verifying...`);
    
    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    logger.debug(`[${requestId}] ✅ Token decoded successfully`, {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      exp: new Date(decoded.exp * 1000).toISOString()
    });
    
    // Buscar usuário no banco de dados
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (error || !user) {
      logger.warn(`[${requestId}] ❌ Invalid user or token`, {
        userId: decoded.userId,
        error: error?.message,
        userFound: !!user,
        userActive: user?.active
      });
      
      // Registrar erro no monitoramento de saúde
      authHealthService.recordAuthError('INVALID_USER', {
        userId: decoded.userId,
        userFound: !!user,
        userActive: user?.active,
        userBlocked: !!user?.blocked_at
      });
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
    }
    
    // Verificar se o usuário não foi bloqueado
    if (user.blocked_at) {
      logger.warn(`[${requestId}] 🚫 Blocked user access attempt`, {
        userId: user.id,
        email: user.email,
        blockedAt: user.blocked_at
      });
      logger.warn(`Usuário bloqueado tentou acessar: ${user.email}`);
      return res.status(403).json({
        error: 'Usuário bloqueado',
        message: 'Sua conta foi bloqueada. Entre em contato com o administrador.'
      });
    }
    
    // Atualizar último acesso
    await supabaseAdmin
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);
    
    // Adicionar informações do usuário à requisição
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      userType: user.role?.toUpperCase() || 'CLIENT',
      permissions: user.permissions || [],
      camera_access: user.camera_access || [],
      active: user.active,
      created_at: user.created_at
    };
    
    // Adicionar cliente Supabase à requisição
    req.supabase = supabase;
    
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] ✅ Auth Success: ${user.email} (${user.role})`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      duration: `${duration}ms`,
      path: req.path
    });
    
    next();
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] ❌ Auth Error (${duration}ms):`, {
      error: error.message,
      name: error.name,
      stack: error.stack,
      path: req.path,
      ip: req.ip
    });
    
    // Registrar erro no monitoramento de saúde
    authHealthService.recordAuthError('TOKEN_VERIFICATION_ERROR', {
      errorMessage: error.message,
      path: req.path,
      method: req.method
    });
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token malformado',
        message: 'Token de acesso inválido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
    }
    
    return res.status(500).json({
      error: 'Erro interno',
      message: 'Erro ao verificar autenticação'
    });
  }
};

// Middleware para verificar permissões específicas
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado',
        message: 'Você precisa estar logado'
      });
    }
    
    // Serviços internos têm todas as permissões
    if (req.user.id === 'internal-service') {
      return next();
    }
    
    // Administradores têm todas as permissões
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Verificar se o usuário tem a permissão específica
    if (!req.user.permissions.includes(permission)) {
      logger.warn(`Acesso negado para ${req.user.email} - permissão: ${permission}`);
      return res.status(403).json({
        error: 'Permissão insuficiente',
        message: `Você não tem permissão para: ${permission}`
      });
    }
    
    next();
  };
};

// Middleware para verificar role específica
const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado',
        message: 'Você precisa estar logado'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Acesso negado para ${req.user.email} - role: ${req.user.role}`);
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Você não tem permissão para acessar este recurso'
      });
    }
    
    next();
  };
};

// Middleware para verificar acesso a câmera específica
const requireCameraAccess = async (req, res, next) => {
  try {
    // Permitir acesso total para serviços internos
    if (req.user && req.user.id === 'internal-service') {
      return next();
    }
    
    logger.debug(`requireCameraAccess - req.params: ${JSON.stringify(req.params)}`);
    logger.debug(`requireCameraAccess - req.body: ${JSON.stringify(req.body)}`);
    
    const cameraId = req.params.cameraId || req.params.id || req.params.camera_id || req.body.cameraId || req.body.camera_id;
    logger.debug(`requireCameraAccess - cameraId extraído: ${cameraId}`);
    
    if (!cameraId) {
      logger.debug('requireCameraAccess - cameraId não encontrado!');
      logger.debug(`requireCameraAccess - req.params disponíveis: ${JSON.stringify(Object.keys(req.params))}`);
      return res.status(400).json({
        error: 'ID da câmera requerido',
        message: 'ID da câmera deve ser fornecido'
      });
    }
    
    // Administradores têm acesso a todas as câmeras
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Verificar se o usuário tem acesso total ou à câmera específica
    if (!req.user.camera_access.includes('*') && !req.user.camera_access.includes(cameraId)) {
      // Verificar se a câmera existe
      const { data: camera, error } = await supabaseAdmin
        .from('cameras')
        .select('id, name')
        .eq('id', cameraId)
        .single();
      
      if (error || !camera) {
        logger.warn(`Câmera ${cameraId} não encontrada ou acesso negado para usuário ${req.user.email}`);
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar esta câmera'
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('Erro ao verificar acesso à câmera:', error);
    return res.status(500).json({
      error: 'Erro interno',
      message: 'Erro ao verificar permissões de câmera'
    });
  }
};

// Middleware opcional de autenticação (não falha se não autenticado)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (!error && user && !user.blocked_at) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions || [],
        camera_access: user.camera_access || []
      };
      
      req.supabase = supabase;
    }
    
    next();
  } catch (error) {
    // Em caso de erro, continua sem autenticação
    next();
  }
};

// Função para gerar token JWT
const generateToken = (userId, email, role) => {
  const payload = {
    userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Função para gerar refresh token
const generateRefreshToken = (userId) => {
  const payload = {
    userId,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

// Função para verificar refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Refresh token inválido');
  }
};

const authMiddleware = {
  authenticateToken,
  requirePermission,
  requireRole,
  requireCameraAccess,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};

export {
  authMiddleware,
  authenticateToken,
  requirePermission,
  requireRole,
  requireCameraAccess,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};