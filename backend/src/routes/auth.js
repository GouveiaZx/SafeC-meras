/**
 * Rotas de autenticação para o sistema NewCAM
 * Gerencia login, registro, logout e refresh de tokens
 */

import express from 'express';
import { User } from '../models/User.js';
import { 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  authenticateToken 
} from '../middleware/auth.js';
import { 
  createValidationSchema, 
  validationSchemas 
} from '../middleware/validation.js';
import { 
  asyncHandler, 
  AuthenticationError, 
  ValidationError,
  ConflictError,
  AppError 
} from '../middleware/errorHandler.js';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import EmailService from '../services/EmailService.js';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import authHealthService from '../services/AuthHealthService.js';

const router = express.Router();
const logger = createModuleLogger('AuthRoutes');

// Rate limiting específico para autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // máximo 50 tentativas por IP (aumentado para desenvolvimento)
  message: {
    error: 'Muitas tentativas de login',
    message: 'Você excedeu o limite de tentativas. Tente novamente em 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// Slow down para tentativas repetidas
const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 2, // Após 2 tentativas, começar a adicionar delay
  delayMs: () => 500, // 500ms de delay
  maxDelayMs: 20000 // Máximo 20 segundos
});

/**
 * @route POST /api/auth/login
 * @desc Fazer login no sistema
 * @access Public
 */
router.post('/login', 
  authLimiter,
  authSlowDown,
  createValidationSchema(validationSchemas.login),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validatedData;

    logger.info(`Tentativa de login para: ${email}`);

    // Buscar usuário por email
    const user = await User.findByEmail(email);
    if (!user) {
      logger.warn(`Tentativa de login com email inexistente: ${email}`);
      // Registrar falha no monitoramento de saúde
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Credenciais inválidas');
    }

    // Verificar status do usuário
    if (user.status === 'pending') {
      logger.warn(`Tentativa de login com usuário pendente: ${email}`);
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Conta pendente de aprovação. Entre em contato com o administrador.');
    }

    if (user.status === 'suspended') {
      logger.warn(`Tentativa de login com usuário suspenso: ${email}`);
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Conta suspensa. Entre em contato com o administrador.');
    }

    if (user.status === 'inactive' || !user.active) {
      logger.warn(`Tentativa de login com usuário inativo: ${email}`);
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Conta desativada');
    }

    // Verificar se usuário está bloqueado
    if (user.blocked_at) {
      logger.warn(`Tentativa de login com usuário bloqueado: ${email}`);
      // Registrar falha no monitoramento de saúde
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Conta bloqueada. Entre em contato com o administrador.');
    }

    // Verificar senha
    const isPasswordValid = await user.verifyPassword(password);
    if (!isPasswordValid) {
      logger.warn(`Tentativa de login com senha incorreta: ${email}`);
      // Registrar falha no monitoramento de saúde
      authHealthService.recordLoginAttempt(false);
      throw new AuthenticationError('Credenciais inválidas');
    }

    // Atualizar último login
    await user.updateLastLogin();

    // Gerar tokens (incluindo userType)
    const accessToken = generateToken(user.id, user.email, user.role, user.userType);
    const refreshToken = generateRefreshToken(user.id);

    // Salvar refresh token no banco (opcional - para invalidação)
    // Aqui você pode implementar uma tabela de refresh tokens se necessário

    logger.info(`Login realizado com sucesso: ${email}`);

    // Registrar sucesso no monitoramento de saúde
    authHealthService.recordLoginAttempt(true);

    res.json({
      message: 'Login realizado com sucesso',
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  })
);

/**
 * @route POST /api/auth/register
 * @desc Registrar novo usuário (apenas admins)
 * @access Private (Admin)
 */
router.post('/register',
  authenticateToken,
  createValidationSchema(validationSchemas.userRegistration),
  asyncHandler(async (req, res) => {
    // Verificar se usuário é admin
    if (req.user.role !== 'admin') {
      throw new AuthenticationError('Apenas administradores podem criar usuários');
    }

    const { name, email, password, role } = req.validatedData;

    logger.info(`Tentativa de registro de usuário: ${email} por ${req.user.email}`);

    // Verificar se email já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email já está em uso');
    }

    // Criar novo usuário (admin criando, fica ativo)
    const user = new User({
      username: name.toLowerCase().replace(/\s+/g, ''),
      full_name: name,
      email,
      password,
      role,
      status: 'active', // Admin criando usuário = aprovado automaticamente
      created_by: req.user.id
    });

    await user.save();

    logger.info(`Usuário criado com sucesso: ${email}`);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: user.toJSON()
    });
  })
);

/**
 * @route POST /api/auth/register-public
 * @desc Registrar novo usuário (público - apenas se não houver admins)
 * @access Public
 */
router.post('/register-public',
  createValidationSchema({
    name: {
      required: true,
      type: 'name',
      minLength: 2,
      maxLength: 100
    },
    email: {
      required: true,
      type: 'email'
    },
    password: {
      required: true,
      type: 'password',
      minLength: 8
    },
    userType: {
      required: false,
      type: 'nonEmptyString'
    }
  }),
  asyncHandler(async (req, res) => {
    const { name, email, password, userType = 'CLIENT' } = req.validatedData;

    logger.info(`Tentativa de registro público: ${email}`);

    // Verificar se já existe algum admin no sistema
    const { data: adminExists, error: adminCheckError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (adminCheckError) {
      logger.error('Erro ao verificar admins existentes:', adminCheckError);
      throw new AppError('Erro interno do servidor');
    }

    // Se já existe admin, não permitir registro público
    if (adminExists && adminExists.length > 0) {
      throw new AuthenticationError('Registro público não permitido. Entre em contato com o administrador.');
    }

    // Verificar se email já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email já está em uso');
    }

    // Mapear userType para role válido
    let role;
    if (adminExists && adminExists.length === 0) {
      // Primeiro usuário sempre é admin
      role = 'admin';
    } else {
      // Mapear userType do frontend para role do backend
      switch (userType?.toUpperCase()) {
        case 'ADMIN':
          role = 'admin';
          break;
        case 'INTEGRATOR':
        case 'OPERATOR':
          role = 'operator';
          break;
        case 'CLIENT':
        default:
          role = 'viewer';
          break;
      }
    }

    // Criar novo usuário (registro público = pendente)
    const user = new User({
      username: email.split('@')[0], // Usar parte do email como username inicial
      full_name: name,
      email,
      password,
      role,
      status: 'pending' // Registro público requer aprovação
    });

    await user.save();

    logger.info(`Usuário criado com sucesso (público): ${email} - Role: ${role}`);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: user.toJSON()
    });
  })
);

/**
 * @route POST /api/auth/refresh
 * @desc Renovar token de acesso
 * @access Public
 */
router.post('/refresh',
  createValidationSchema({
    refreshToken: {
      required: true,
      type: 'nonEmptyString',
      message: 'Refresh token é obrigatório'
    }
  }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.validatedData;
    const requestId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress;

    logger.info(`[${requestId}] 🔄 Token refresh request`, {
      ip: clientIP,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    try {
      // Verificar refresh token
      const decoded = verifyRefreshToken(refreshToken);
      
      logger.debug(`[${requestId}] ✅ Refresh token decoded`, {
        userId: decoded.userId,
        type: decoded.type,
        exp: new Date(decoded.exp * 1000).toISOString()
      });
      
      if (decoded.type !== 'refresh') {
        logger.warn(`[${requestId}] ❌ Invalid token type`, {
          expectedType: 'refresh',
          actualType: decoded.type,
          userId: decoded.userId
        });
        // Registrar falha no monitoramento de saúde
        authHealthService.recordTokenRefresh(false);
        throw new AuthenticationError('Token inválido');
      }

      // Buscar usuário
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        logger.warn(`[${requestId}] ❌ User not found`, {
          userId: decoded.userId,
          ip: clientIP
        });
        // Registrar falha no monitoramento de saúde
        authHealthService.recordTokenRefresh(false);
        throw new AuthenticationError('Usuário inválido');
      }
      
      if (!user.active) {
        logger.warn(`[${requestId}] ❌ Inactive user refresh attempt`, {
          userId: user.id,
          email: user.email,
          ip: clientIP
        });
        // Registrar falha no monitoramento de saúde
        authHealthService.recordTokenRefresh(false);
        throw new AuthenticationError('Usuário inválido');
      }
      
      if (user.blocked_at) {
        logger.warn(`[${requestId}] ❌ Blocked user refresh attempt`, {
          userId: user.id,
          email: user.email,
          blockedAt: user.blocked_at,
          ip: clientIP
        });
        // Registrar falha no monitoramento de saúde
        authHealthService.recordTokenRefresh(false);
        throw new AuthenticationError('Usuário inválido');
      }

      // Gerar novo access token
      const accessToken = generateToken(user.id, user.email, user.role, user.userType);
      const duration = Date.now() - startTime;

      logger.info(`[${requestId}] ✅ Token refresh successful (${duration}ms)`, {
        userId: user.id,
        email: user.email,
        role: user.role,
        ip: clientIP,
        duration: `${duration}ms`
      });

      // Registrar sucesso no monitoramento de saúde
      authHealthService.recordTokenRefresh(true);

      res.json({
        message: 'Token renovado com sucesso',
        tokens: {
          accessToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '24h'
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`[${requestId}] ❌ Token refresh failed (${duration}ms)`, {
        error: error.message,
        name: error.name,
        ip: clientIP,
        duration: `${duration}ms`,
        stack: error.stack
      });
      
      // Registrar erro no monitoramento de saúde
      authHealthService.recordTokenRefresh(false, error);
      
      throw new AuthenticationError('Refresh token inválido');
    }
  })
);

/**
 * @route POST /api/auth/logout
 * @desc Fazer logout (invalidar tokens)
 * @access Private
 */
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Aqui você pode implementar blacklist de tokens se necessário
    // Por enquanto, apenas log do logout
    
    logger.info(`Logout realizado: ${req.user.email}`);

    res.json({
      message: 'Logout realizado com sucesso'
    });
  })
);

/**
 * @route GET /api/auth/me
 * @desc Obter informações do usuário logado
 * @access Private
 */
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Buscar dados atualizados do usuário
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AuthenticationError('Usuário não encontrado');
    }

    res.json({
      user: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/auth/profile
 * @desc Atualizar perfil do usuário logado
 * @access Private
 */
router.put('/profile',
  authenticateToken,
  createValidationSchema({
    name: {
      required: false,
      type: 'name',
      minLength: 2,
      maxLength: 100
    },
    preferences: {
      required: false,
      custom: (value) => {
        return typeof value === 'object' || 'Preferences deve ser um objeto';
      }
    }
  }),
  asyncHandler(async (req, res) => {
    const { name, preferences } = req.validatedData;

    // Buscar usuário atual
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AuthenticationError('Usuário não encontrado');
    }

    // Atualizar dados
    if (name) user.name = name;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    logger.info(`Perfil atualizado: ${user.email}`);

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/auth/change-password
 * @desc Alterar senha do usuário logado
 * @access Private
 */
router.put('/change-password',
  authenticateToken,
  createValidationSchema(validationSchemas.changePassword),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.validatedData;

    // Buscar usuário atual
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AuthenticationError('Usuário não encontrado');
    }

    // Verificar senha atual
    const isCurrentPasswordValid = await user.verifyPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError('Senha atual incorreta');
    }

    // Verificar se nova senha é diferente da atual
    const isSamePassword = await user.verifyPassword(newPassword);
    if (isSamePassword) {
      throw new ValidationError('A nova senha deve ser diferente da atual');
    }

    // Atualizar senha
    user.password = newPassword;
    await user.save();

    logger.info(`Senha alterada: ${user.email}`);

    res.json({
      message: 'Senha alterada com sucesso'
    });
  })
);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset de senha com token
 * @access Public
 */
router.post('/reset-password',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 tentativas por IP
    message: { error: 'Muitas tentativas de reset. Tente novamente em 15 minutos.' }
  }),
  createValidationSchema(validationSchemas.resetPassword),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.validatedData;

    // Verificar token
    const tokenResult = await EmailService.verifyResetToken(token);
    if (!tokenResult.valid) {
      throw new ValidationError(tokenResult.error || 'Token inválido ou expirado');
    }

    // Buscar usuário pelo email do token
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', tokenResult.email)
      .single();

    if (userError || !user) {
      throw new ValidationError('Usuário não encontrado');
    }

    // Atualizar senha do usuário
    const userModel = new User();
    const hashedPassword = await userModel.hashPassword(newPassword);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Erro ao atualizar senha:', updateError);
      throw new AppError('Erro interno do servidor', 500);
    }

    // Marcar token como usado
    await EmailService.markTokenAsUsed(token);

    logger.info(`Senha resetada com sucesso para usuário: ${user.email}`);

    res.json({
      message: 'Senha alterada com sucesso. Você pode fazer login com a nova senha.'
    });
  })
);

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar reset de senha
 * @access Public
 */
router.post('/forgot-password',
  authLimiter,
  createValidationSchema({
    email: {
      required: true,
      type: 'email',
      message: 'Email deve ter um formato válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { email } = req.validatedData;

    logger.info(`Solicitação de reset de senha para: ${email}`);

    // Buscar usuário
    const user = await User.findByEmail(email);
    
    // Sempre retornar sucesso por segurança (não revelar se email existe)
    res.json({
      message: 'Se o email existir, você receberá instruções para reset da senha'
    });

    // Se usuário existe, enviar email
    if (user && user.active && !user.blocked_at) {
      try {
        const emailResult = await EmailService.sendPasswordResetEmail(user.email, user.name);
        
        if (emailResult.success) {
          logger.info(`E-mail de reset de senha enviado para: ${email}`);
        } else {
          logger.error(`Erro ao enviar e-mail de reset para ${email}:`, emailResult.error);
        }
      } catch (error) {
        logger.error('Erro no serviço de e-mail:', error);
      }
    }
  })
);

/**
 * @route GET /api/auth/verify-token
 * @desc Verificar se token é válido
 * @access Private
 */
router.get('/verify-token',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      valid: true,
      user: req.user
    });
  })
);

export default router;