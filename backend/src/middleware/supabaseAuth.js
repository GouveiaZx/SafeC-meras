/**
 * Middleware de autenticação Supabase para o sistema NewCAM
 * Verifica tokens JWT do Supabase e gerencia sessões de usuário
 */

import { supabase, supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('SupabaseAuth');

// Middleware principal de autenticação Supabase
const authenticateSupabaseToken = async (req, res, next) => {
  console.log('🔍 [SupabaseAuth] Middleware executado para:', req.method, req.path);
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    logger.info(`[${requestId}] 🔍 Supabase Auth Request: ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      logger.warn(`[${requestId}] ❌ Missing token: ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(401).json({
        error: 'Token de acesso requerido',
        message: 'Você precisa estar logado para acessar este recurso'
      });
    }
    
    logger.debug(`[${requestId}] 🔑 Token received, verifying with Supabase...`);
    
    // Verificar token com Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      logger.warn(`[${requestId}] ❌ Invalid Supabase token`, {
        error: error?.message,
        userFound: !!user
      });
      
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
    }
    
    logger.debug(`[${requestId}] ✅ Supabase token verified successfully`, {
      userId: user.id,
      email: user.email,
      emailConfirmed: user.email_confirmed_at ? true : false
    });
    
    // Buscar dados adicionais do usuário na tabela users (se existir)
    let userData = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email,
      role: 'user',
      userType: 'CLIENT',
      permissions: [],
      camera_access: [],
      active: true,
      created_at: user.created_at
    };
    
    // Tentar buscar dados adicionais na tabela users
    try {
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (!dbError && dbUser) {
        userData = {
          ...userData,
          name: dbUser.name || userData.name,
          role: dbUser.role || userData.role,
          userType: dbUser.role?.toUpperCase() || userData.userType,
          permissions: dbUser.permissions || userData.permissions,
          camera_access: dbUser.camera_access || userData.camera_access,
          active: dbUser.active !== undefined ? dbUser.active : userData.active
        };
        
        // Verificar se o usuário não foi bloqueado
        if (dbUser.blocked_at) {
          logger.warn(`[${requestId}] 🚫 Blocked user access attempt`, {
            userId: user.id,
            email: user.email,
            blockedAt: dbUser.blocked_at
          });
          
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
      }
    } catch (dbError) {
      logger.debug(`[${requestId}] ℹ️ User not found in users table, using auth data only`);
    }
    
    // Adicionar informações do usuário à requisição
    req.user = userData;
    
    // Adicionar cliente Supabase à requisição
    req.supabase = supabase;
    
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] ✅ Supabase Auth Success: ${userData.email} (${userData.role})`, {
      userId: userData.id,
      email: userData.email,
      role: userData.role,
      duration: `${duration}ms`,
      path: req.path
    });
    
    next();
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] ❌ Supabase Auth Error (${duration}ms):`, {
      error: error.message,
      name: error.name,
      stack: error.stack,
      path: req.path,
      ip: req.ip
    });
    
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

// Middleware para verificar se é administrador
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Não autenticado',
      message: 'Você precisa estar logado'
    });
  }
  
  if (req.user.role !== 'admin') {
    logger.warn(`Acesso de admin negado para ${req.user.email}`);
    return res.status(403).json({
      error: 'Acesso negado',
      message: 'Apenas administradores podem acessar este recurso'
    });
  }
  
  next();
};

// Middleware opcional de autenticação (não falha se não autenticado)
const optionalSupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email,
        role: 'user',
        userType: 'CLIENT',
        permissions: [],
        camera_access: [],
        active: true,
        created_at: user.created_at
      };
      
      req.supabase = supabase;
    }
    
    next();
  } catch (error) {
    logger.debug('Erro na autenticação opcional:', error.message);
    next();
  }
};

export {
  authenticateSupabaseToken,
  requirePermission,
  requireAdmin,
  optionalSupabaseAuth
};

export default authenticateSupabaseToken;