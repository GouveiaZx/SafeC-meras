/**
 * Rotas de gerenciamento de usuários para o sistema NewCAM
 * CRUD completo de usuários com controle de acesso
 */

import express from 'express';
import { User } from '../models/User.js';
import { supabaseAdmin } from '../config/database.js';
import { 
  authenticateToken, 
  requireRole, 
  requirePermission 
} from '../middleware/auth.js';
import { 
  createValidationSchema, 
  validateParams 
} from '../middleware/validation.js';
import {
  validateUserCreation,
  validateUserUpdate,
  validateUserApproval,
  validateUserStatusChange,
  validateUserQuery,
  validatePasswordReset,
  validateUserId,
  canEditUser,
  canDeleteUser
} from '../middleware/userValidation.js';
import { 
  asyncHandler, 
  NotFoundError, 
  ValidationError,
  AuthorizationError 
} from '../middleware/errorHandler.js';
import { createModuleLogger } from '../config/logger.js';

const router = express.Router();
const logger = createModuleLogger('UserRoutes');

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @route GET /api/users
 * @desc Listar usuários com paginação e filtros
 * @access Private (Admin/Operator)
 */
router.get('/',
  requireRole(['admin', 'operator']),
  validateUserQuery,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = null,
      status = null,
      active = null,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    // Validar parâmetros de paginação
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      throw new ValidationError('Página deve ser um número maior que 0');
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new ValidationError('Limite deve ser um número entre 1 e 100');
    }

    const options = {
      page: pageNum,
      limit: limitNum,
      search: search.trim(),
      role,
      status,
      active: active !== null ? active === 'true' : null,
      sortBy,
      sortOrder
    };

    const result = await User.findAll(options);

    logger.info(`Lista de usuários solicitada por: ${req.user.email}`);

    res.json({
      message: 'Usuários listados com sucesso',
      data: result.users.map(user => user.toJSON()),
      pagination: result.pagination
    });
  })
);

/**
 * @route GET /api/users/stats
 * @desc Obter estatísticas de usuários
 * @access Private (Admin)
 */
router.get('/stats',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [totalUsers, activeUsers, adminUsers, operatorUsers, viewerUsers] = await Promise.all([
      User.count(),
      User.count({ active: true }),
      User.count({ role: 'admin' }),
      User.count({ role: 'operator' }),
      User.count({ role: 'viewer' })
    ]);

    const stats = {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      byRole: {
        admin: adminUsers,
        operator: operatorUsers,
        viewer: viewerUsers
      }
    };

    logger.info(`Estatísticas de usuários solicitadas por: ${req.user.email}`);

    res.json({
      message: 'Estatísticas obtidas com sucesso',
      data: stats
    });
  })
);

/**
 * @route GET /api/users/:id
 * @desc Obter usuário por ID
 * @access Private (Admin/Operator ou próprio usuário)
 */
router.get('/:id',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verificar permissões
    if (req.user.role === 'viewer' && req.user.id !== id) {
      throw new AuthorizationError('Você só pode visualizar seu próprio perfil');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    logger.info(`Usuário ${id} visualizado por: ${req.user.email}`);

    res.json({
      message: 'Usuário encontrado',
      data: user.toJSON()
    });
  })
);

/**
 * @route POST /api/users
 * @desc Criar novo usuário
 * @access Private (Admin)
 */
router.post('/',
  requireRole('admin'),
  validateUserCreation,
  asyncHandler(async (req, res) => {
    const { username, full_name, email, password, role, status, permissions, camera_access, two_factor_enabled } = req.body;

    // Criar usuário
    const user = new User({
      username,
      full_name,
      email,
      password,
      role,
      status: status || 'pending',
      permissions: permissions || [],
      camera_access: camera_access || [],
      two_factor_enabled: two_factor_enabled || false,
      created_by: req.user.id
    });

    await user.save();

    logger.info(`Usuário criado: ${email} por ${req.user.email}`);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/users/:id
 * @desc Atualizar usuário
 * @access Private (Admin ou próprio usuário com limitações)
 */
router.put('/:id',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  validateUserUpdate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, full_name, email, role, status, permissions, camera_access, two_factor_enabled } = req.body;

    // Buscar usuário
    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Verificar permissões
    const isOwnProfile = req.user.id === id;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isOwnProfile) {
      throw new AuthorizationError('Você não tem permissão para editar este usuário');
    }

    // Usuários não-admin só podem editar nome, email e username próprios
    if (!isOwnProfile && !isAdmin) {
      throw new AuthorizationError('Você só pode editar seu próprio perfil');
    }

    if (isOwnProfile && !isAdmin && (role || status || permissions || camera_access)) {
      throw new AuthorizationError('Você só pode editar seu nome completo, username e email');
    }

    // Atualizar campos básicos sempre permitidos
    if (username !== undefined) user.username = username;
    if (full_name !== undefined) user.full_name = full_name;
    if (email !== undefined) user.email = email;
    
    // Apenas admins podem alterar estes campos
    if (isAdmin) {
      if (role !== undefined) user.role = role;
      if (status !== undefined) user.status = status;
      if (permissions !== undefined) user.permissions = permissions;
      if (camera_access !== undefined) user.camera_access = camera_access;
      if (two_factor_enabled !== undefined) user.two_factor_enabled = two_factor_enabled;
    }

    await user.save();

    logger.info(`Usuário ${id} atualizado por: ${req.user.email}`);

    res.json({
      message: 'Usuário atualizado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route DELETE /api/users/:id
 * @desc Deletar usuário
 * @access Private (Admin)
 */
router.delete('/:id',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Não permitir que admin delete a si mesmo
    if (req.user.id === id) {
      throw new ValidationError('Você não pode deletar sua própria conta');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    await user.delete();

    logger.info(`Usuário ${id} deletado por: ${req.user.email}`);

    res.json({
      message: 'Usuário deletado com sucesso'
    });
  })
);

/**
 * @route PUT /api/users/:id/block
 * @desc Bloquear usuário
 * @access Private (Admin)
 */
router.put('/:id/block',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Não permitir que admin bloqueie a si mesmo
    if (req.user.id === id) {
      throw new ValidationError('Você não pode bloquear sua própria conta');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (user.blocked_at) {
      throw new ValidationError('Usuário já está bloqueado');
    }

    await user.block();

    logger.info(`Usuário ${id} bloqueado por: ${req.user.email}`);

    res.json({
      message: 'Usuário bloqueado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/users/:id/unblock
 * @desc Desbloquear usuário
 * @access Private (Admin)
 */
router.put('/:id/unblock',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (!user.blocked_at) {
      throw new ValidationError('Usuário não está bloqueado');
    }

    await user.unblock();

    logger.info(`Usuário ${id} desbloqueado por: ${req.user.email}`);

    res.json({
      message: 'Usuário desbloqueado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/users/:id/permissions
 * @desc Atualizar permissões do usuário
 * @access Private (Admin)
 */
router.put('/:id/permissions',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  createValidationSchema({
    permissions: {
      required: true,
      type: 'array',
      message: 'Permissões devem ser um array'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.validatedData;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Validar permissões
    const validPermissions = [
      'cameras.view',
      'cameras.create',
      'cameras.edit',
      'cameras.delete',
      'recordings.view',
      'recordings.download',
      'recordings.delete',
      'users.view',
      'users.create',
      'users.edit',
      'users.delete',
      'system.settings',
      'system.logs'
    ];

    for (const permission of permissions) {
      if (!validPermissions.includes(permission)) {
        throw new ValidationError(`Permissão inválida: ${permission}`);
      }
    }

    user.permissions = permissions;
    await user.save();

    logger.info(`Permissões do usuário ${id} atualizadas por: ${req.user.email}`);

    res.json({
      message: 'Permissões atualizadas com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route PUT /api/users/:id/camera-access
 * @desc Atualizar acesso às câmeras do usuário
 * @access Private (Admin)
 */
router.put('/:id/camera-access',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  createValidationSchema({
    camera_access: {
      required: true,
      type: 'array',
      message: 'Acesso às câmeras deve ser um array de IDs'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { camera_access } = req.validatedData;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Validar IDs das câmeras
    for (const cameraId of camera_access) {
      if (!isValidUUID(cameraId)) {
        throw new ValidationError(`ID de câmera inválido: ${cameraId}`);
      }
    }

    user.camera_access = camera_access;
    await user.save();

    logger.info(`Acesso às câmeras do usuário ${id} atualizado por: ${req.user.email}`);

    res.json({
      message: 'Acesso às câmeras atualizado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route GET /api/users/:id/activity
 * @desc Obter atividade recente do usuário
 * @access Private (Admin ou próprio usuário)
 */
router.get('/:id/activity',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verificar permissões
    if (req.user.role !== 'admin' && req.user.id !== id) {
      throw new AuthorizationError('Você só pode visualizar sua própria atividade');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Buscar atividades do usuário
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
      // Buscar sessões do usuário
      const { data: sessions, error: sessionsError } = await supabaseAdmin
        .from('user_sessions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      // Buscar logs de sistema relacionados ao usuário
      const { data: systemLogs, error: logsError } = await supabaseAdmin
        .from('system_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      // Buscar acessos a câmeras
      const { data: cameraAccess, error: accessError } = await supabaseAdmin
        .from('camera_access_logs')
        .select(`
          *,
          cameras(name)
        `)
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      const activities = [];

      // Processar sessões
      if (sessions && !sessionsError) {
        sessions.forEach(session => {
          activities.push({
            id: `session_${session.id}`,
            type: 'session',
            action: session.action || 'login',
            timestamp: session.created_at,
            ip_address: session.ip_address,
            user_agent: session.user_agent,
            details: {
              session_duration: session.ended_at ? 
                new Date(session.ended_at) - new Date(session.created_at) : null
            }
          });
        });
      }

      // Processar logs do sistema
      if (systemLogs && !logsError) {
        systemLogs.forEach(log => {
          activities.push({
            id: `log_${log.id}`,
            type: 'system_log',
            action: log.action || 'system_event',
            timestamp: log.created_at,
            message: log.message,
            level: log.level,
            details: log.metadata
          });
        });
      }

      // Processar acessos a câmeras
      if (cameraAccess && !accessError) {
        cameraAccess.forEach(access => {
          activities.push({
            id: `access_${access.id}`,
            type: 'camera_access',
            action: access.action || 'camera_view',
            timestamp: access.created_at,
            camera_name: access.cameras?.name || 'Câmera desconhecida',
            camera_id: access.camera_id,
            details: {
              duration: access.duration,
              stream_type: access.stream_type
            }
          });
        });
      }

      // Ordenar atividades por timestamp
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const activity = {
        user_info: {
          last_login: user.last_login_at,
          created_at: user.created_at,
          updated_at: user.updated_at,
          total_sessions: sessions?.length || 0
        },
        activities: activities.slice(0, parseInt(limit)),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: activities.length
        }
      };

    } catch (error) {
      logger.error('Erro ao buscar atividades do usuário:', error);
      
      // Fallback para dados básicos
      const activity = {
        user_info: {
          last_login: user.last_login_at,
          created_at: user.created_at,
          updated_at: user.updated_at,
          total_sessions: 0
        },
        activities: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0
        }
      };
    }

    res.json({
      message: 'Atividade do usuário obtida com sucesso',
      data: activity
    });
  })
);

/**
 * @route PUT /api/users/:id/status
 * @desc Atualizar status do usuário (pending/active/inactive/suspended)
 * @access Private (Admin)
 */
router.put('/:id/status',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  createValidationSchema({
    status: {
      required: true,
      type: 'string',
      enum: ['pending', 'active', 'inactive', 'suspended'],
      message: 'Status deve ser: pending, active, inactive ou suspended'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // Não permitir que admin suspenda/desative a si mesmo
    if (req.user.id === id && (status === 'suspended' || status === 'inactive')) {
      throw new ValidationError('Você não pode suspender ou desativar sua própria conta');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Validar transições de status
    const currentStatus = user.status;
    
    // pending -> active (aprovação)
    if (currentStatus === 'pending' && status === 'active') {
      await user.approve(req.user.id);
    }
    // qualquer -> suspended
    else if (status === 'suspended') {
      await user.suspend(req.user.id);
    }
    // suspended/inactive -> active
    else if ((currentStatus === 'suspended' || currentStatus === 'inactive') && status === 'active') {
      await user.activate();
    }
    // qualquer -> inactive
    else if (status === 'inactive') {
      await user.deactivate();
    }
    // pending -> pending (permitido para re-pendente)
    else if (status === 'pending') {
      user.status = 'pending';
      user.approved_at = null;
      user.approved_by = null;
      user.suspended_at = null;
      user.suspended_by = null;
      await user.save();
    }
    else {
      // Atualização direta para outros casos
      user.status = status;
      await user.save();
    }

    logger.info(`Status do usuário ${id} alterado de ${currentStatus} para ${status} por: ${req.user.email}`);

    res.json({
      message: 'Status do usuário atualizado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route POST /api/users/:id/reset-password
 * @desc Resetar senha do usuário
 * @access Private (Admin)
 */
router.post('/:id/reset-password',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  createValidationSchema({
    new_password: {
      required: true,
      type: 'string',
      minLength: 6,
      message: 'Nova senha deve ter pelo menos 6 caracteres'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.validatedData;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Atualizar senha
    user.password = new_password; // O modelo deve hash a senha automaticamente
    await user.save();

    logger.info(`Senha resetada para usuário ${id} por: ${req.user.email}`);

    res.json({
      message: 'Senha resetada com sucesso'
    });
  })
);

/**
 * @route POST /api/users/:id/approve
 * @desc Aprovar usuário pendente
 * @access Private (Admin)
 */
router.post('/:id/approve',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (user.status !== 'pending') {
      throw new ValidationError('Apenas usuários pendentes podem ser aprovados');
    }

    await user.approve(req.user.id);

    logger.info(`Usuário ${id} aprovado por: ${req.user.email}`);

    res.json({
      message: 'Usuário aprovado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route POST /api/users/:id/suspend
 * @desc Suspender usuário
 * @access Private (Admin)
 */
router.post('/:id/suspend',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Não permitir que admin suspenda a si mesmo
    if (req.user.id === id) {
      throw new ValidationError('Você não pode suspender sua própria conta');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (user.status === 'suspended') {
      throw new ValidationError('Usuário já está suspenso');
    }

    await user.suspend(req.user.id);

    logger.info(`Usuário ${id} suspenso por: ${req.user.email}`);

    res.json({
      message: 'Usuário suspenso com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route POST /api/users/:id/activate
 * @desc Reativar usuário suspenso/inativo
 * @access Private (Admin)
 */
router.post('/:id/activate',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID do usuário deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (user.status === 'active') {
      throw new ValidationError('Usuário já está ativo');
    }

    await user.activate();

    logger.info(`Usuário ${id} reativado por: ${req.user.email}`);

    res.json({
      message: 'Usuário reativado com sucesso',
      data: user.toJSON()
    });
  })
);

/**
 * @route GET /api/users/export
 * @desc Exportar lista de usuários em CSV
 * @access Private (Admin)
 */
router.get('/export',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await User.findAll({
      limit: 1000 // Limite alto para exportar todos
    });

    const users = result.users;

    // Converter para CSV
    const csvHeader = 'ID,Username,Email,Nome Completo,Função,Status,Data Criação,Último Login\n';
    const csvRows = users.map(user => [
      user.id,
      user.username || '',
      user.email,
      user.full_name || '',
      user.role,
      user.status,
      user.created_at,
      user.last_login_at || 'Nunca'
    ].join(',')).join('\n');

    const csvContent = csvHeader + csvRows;

    logger.info(`Exportação de usuários realizada por: ${req.user.email}`);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="usuarios_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  })
);

export default router;