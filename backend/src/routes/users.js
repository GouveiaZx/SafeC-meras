/**
 * Rotas de gerenciamento de usuários para o sistema NewCAM
 * CRUD completo de usuários com controle de acesso
 */

import express from 'express';
import { User } from '../models/User.js';
import { 
  authenticateToken, 
  requireRole, 
  requirePermission 
} from '../middleware/auth.js';
import { 
  createValidationSchema, 
  validateParams,
  validationSchemas 
} from '../middleware/validation.js';
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
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = null,
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
  createValidationSchema(validationSchemas.userRegistration),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, permissions, camera_access } = req.validatedData;

    // Verificar se email já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ValidationError('Email já está em uso');
    }

    // Criar usuário
    const user = new User({
      name,
      email,
      password,
      role,
      permissions: permissions || [],
      camera_access: camera_access || [],
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
  createValidationSchema(validationSchemas.userUpdate),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, role, active, permissions, camera_access } = req.validatedData;

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

    // Usuários não-admin só podem editar nome e email próprios
    if (!isAdmin && (role || active !== undefined || permissions || camera_access)) {
      throw new AuthorizationError('Você só pode editar seu nome e email');
    }

    // Verificar se email já existe (excluindo o próprio usuário)
    if (email && email !== user.email) {
      const emailExists = await User.emailExists(email, id);
      if (emailExists) {
        throw new ValidationError('Email já está em uso');
      }
    }

    // Atualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    
    // Apenas admins podem alterar estes campos
    if (isAdmin) {
      if (role) user.role = role;
      if (active !== undefined) user.active = active;
      if (permissions) user.permissions = permissions;
      if (camera_access) user.camera_access = camera_access;
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
      const { data: sessions, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      // Buscar logs de sistema relacionados ao usuário
      const { data: systemLogs, error: logsError } = await supabase
        .from('system_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      // Buscar acessos a câmeras
      const { data: cameraAccess, error: accessError } = await supabase
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

export default router;