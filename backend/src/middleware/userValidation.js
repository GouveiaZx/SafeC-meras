/**
 * Middleware de validação para usuários
 * Implementa validações de segurança e integridade de dados
 */

import { body, param, query, validationResult } from 'express-validator';
import { ValidationError } from '../middleware/errorHandler.js';
import { User } from '../models/User.js';

/**
 * Middleware para verificar erros de validação
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    throw new ValidationError('Dados inválidos', { errors: errorMessages });
  }
  next();
};

/**
 * Validações para criação de usuário
 */
export const validateUserCreation = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Nome de usuário deve ter entre 3 e 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Nome de usuário pode conter apenas letras, números, hífen e underscore')
    .custom(async (value, { req }) => {
      // Verificar se username já existe
      const existingUser = await User.findByUsername(value);
      if (existingUser) {
        throw new Error('Nome de usuário já está em uso');
      }
      return true;
    }),
    
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail()
    .custom(async (value, { req }) => {
      // Verificar se email já existe
      const existingUser = await User.findByEmail(value);
      if (existingUser) {
        throw new Error('Email já está em uso');
      }
      return true;
    }),
    
  body('full_name')
    .isLength({ min: 2, max: 255 })
    .withMessage('Nome completo deve ter entre 2 e 255 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome completo pode conter apenas letras e espaços'),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter pelo menos 6 caracteres'),
    
  body('role')
    .isIn(['admin', 'integrator', 'operator', 'client', 'viewer'])
    .withMessage('Função inválida'),
    
  body('status')
    .optional()
    .isIn(['pending', 'active', 'inactive', 'suspended'])
    .withMessage('Status inválido'),
    
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissões devem ser um array'),
    
  body('camera_access')
    .optional()
    .isArray()
    .withMessage('Acesso às câmeras deve ser um array'),
    
  body('two_factor_enabled')
    .optional()
    .isBoolean()
    .withMessage('Campo de 2FA deve ser booleano'),
    
  handleValidationErrors
];

/**
 * Validações para atualização de usuário
 */
export const validateUserUpdate = [
  param('id')
    .isUUID()
    .withMessage('ID do usuário inválido'),
    
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Nome de usuário deve ter entre 3 e 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Nome de usuário pode conter apenas letras, números, hífen e underscore')
    .custom(async (value, { req }) => {
      if (!value) return true; // Campo opcional
      
      const existingUser = await User.findByUsername(value);
      if (existingUser && existingUser.id !== req.params.id) {
        throw new Error('Nome de usuário já está em uso');
      }
      return true;
    }),
    
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail()
    .custom(async (value, { req }) => {
      if (!value) return true; // Campo opcional
      
      const existingUser = await User.findByEmail(value);
      if (existingUser && existingUser.id !== req.params.id) {
        throw new Error('Email já está em uso');
      }
      return true;
    }),
    
  body('full_name')
    .optional()
    .isLength({ min: 2, max: 255 })
    .withMessage('Nome completo deve ter entre 2 e 255 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome completo pode conter apenas letras e espaços'),
    
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Senha deve ter pelo menos 6 caracteres'),
    
  body('role')
    .optional()
    .isIn(['admin', 'integrator', 'operator', 'client', 'viewer'])
    .withMessage('Função inválida'),
    
  body('status')
    .optional()
    .isIn(['pending', 'active', 'inactive', 'suspended'])
    .withMessage('Status inválido'),
    
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissões devem ser um array'),
    
  body('camera_access')
    .optional()
    .isArray()
    .withMessage('Acesso às câmeras deve ser um array'),
    
  body('two_factor_enabled')
    .optional()
    .isBoolean()
    .withMessage('Campo de 2FA deve ser booleano'),
    
  handleValidationErrors
];

/**
 * Validação para aprovação de usuário
 */
export const validateUserApproval = [
  param('id')
    .isUUID()
    .withMessage('ID do usuário inválido'),
    
  // Verificar se usuário existe e está pendente
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        throw new ValidationError('Usuário não encontrado');
      }
      
      if (user.status !== 'pending') {
        throw new ValidationError('Apenas usuários pendentes podem ser aprovados');
      }
      
      req.targetUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Validação para suspensão/reativação de usuário
 */
export const validateUserStatusChange = [
  param('id')
    .isUUID()
    .withMessage('ID do usuário inválido'),
    
  // Verificar se usuário existe e pode ter status alterado
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        throw new ValidationError('Usuário não encontrado');
      }
      
      // Verificar se não está tentando suspender a si mesmo
      if (user.id === req.user.id) {
        throw new ValidationError('Você não pode alterar seu próprio status');
      }
      
      // Verificar se não está tentando suspender outro admin (apenas admin pode suspender admin)
      if (user.role === 'admin' && req.user.role !== 'admin') {
        throw new ValidationError('Apenas administradores podem alterar status de outros administradores');
      }
      
      req.targetUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }
];

/**
 * Validação para listagem de usuários
 */
export const validateUserQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro positivo'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite deve ser um número entre 1 e 100'),
    
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Termo de busca deve ter entre 1 e 100 caracteres'),
    
  query('role')
    .optional()
    .isIn(['admin', 'integrator', 'operator', 'client', 'viewer'])
    .withMessage('Função inválida'),
    
  query('status')
    .optional()
    .isIn(['pending', 'active', 'inactive', 'suspended'])
    .withMessage('Status inválido'),
    
  handleValidationErrors
];

/**
 * Validação para reset de senha
 */
export const validatePasswordReset = [
  param('id')
    .isUUID()
    .withMessage('ID do usuário inválido'),
    
  body('new_password')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter pelo menos 6 caracteres'),
    
  handleValidationErrors
];

/**
 * Validação de ID de usuário
 */
export const validateUserId = [
  param('id')
    .isUUID()
    .withMessage('ID do usuário inválido'),
    
  handleValidationErrors
];

/**
 * Middleware para verificar se pode editar usuário
 */
export const canEditUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUser = req.user;
    
    // Admin pode editar qualquer usuário
    if (currentUser.role === 'admin') {
      return next();
    }
    
    // Usuário só pode editar a si mesmo
    if (targetUserId === currentUser.id) {
      return next();
    }
    
    throw new ValidationError('Você não tem permissão para editar este usuário');
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar se pode deletar usuário
 */
export const canDeleteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUser = req.user;
    
    // Verificar se não está tentando deletar a si mesmo
    if (targetUserId === currentUser.id) {
      throw new ValidationError('Você não pode deletar sua própria conta');
    }
    
    // Apenas admin pode deletar usuários
    if (currentUser.role !== 'admin') {
      throw new ValidationError('Apenas administradores podem deletar usuários');
    }
    
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      throw new ValidationError('Usuário não encontrado');
    }
    
    // Verificar se não está tentando deletar outro admin
    if (targetUser.role === 'admin') {
      throw new ValidationError('Não é possível deletar outros administradores');
    }
    
    req.targetUser = targetUser;
    next();
  } catch (error) {
    next(error);
  }
};