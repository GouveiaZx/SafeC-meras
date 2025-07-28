/**
 * Rotas de gerenciamento de câmeras para o sistema NewCAM
 * CRUD completo de câmeras com controle de acesso
 */

import express from 'express';
import { Camera } from '../models/Camera.js';
import { supabaseAdmin } from '../config/database.js';
import { 
  authenticateToken, 
  requireRole, 
  requirePermission,
  requireCameraAccess 
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
import { StreamingService } from '../services/StreamingService.js';
import RecordingService from '../services/RecordingService.js';

// Função utilitária local
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

const streamingService = new StreamingService();

const router = express.Router();
const logger = createModuleLogger('CameraRoutes');

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @route GET /api/cameras
 * @desc Listar câmeras com paginação e filtros
 * @access Private
 */
router.get('/',
  requirePermission('cameras.view'),
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = null,
      active = null,
      type = null,
      zone = null,
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
      status,
      active: active !== null ? active === 'true' : null,
      type,
      zone,
      sortBy,
      sortOrder,
      userId: req.user.role !== 'admin' ? req.user.id : null
    };

    const result = await Camera.findAll(options);

    logger.info(`Lista de câmeras solicitada por: ${req.user.email}`);

    res.json({
      message: 'Câmeras listadas com sucesso',
      data: result.cameras.map(camera => camera.toJSON()),
      pagination: result.pagination
    });
  })
);

/**
 * @route GET /api/cameras/stats
 * @desc Obter estatísticas de câmeras
 * @access Private (Admin/Operator)
 */
router.get('/stats',
  requireRole(['admin', 'operator']),
  asyncHandler(async (req, res) => {
    const [totalCameras, onlineCameras, activeCameras, ipCameras, analogCameras] = await Promise.all([
      Camera.count(),
      Camera.count({ status: 'online' }),
      Camera.count({ active: true }),
      Camera.count({ type: 'ip' }),
      Camera.count({ type: 'analog' })
    ]);

    const stats = {
      total: totalCameras,
      online: onlineCameras,
      offline: totalCameras - onlineCameras,
      active: activeCameras,
      inactive: totalCameras - activeCameras,
      byType: {
        ip: ipCameras,
        analog: analogCameras,
        usb: await Camera.count({ type: 'usb' }),
        virtual: await Camera.count({ type: 'virtual' })
      },
      byStatus: {
        online: onlineCameras,
        offline: await Camera.count({ status: 'offline' }),
        error: await Camera.count({ status: 'error' }),
        maintenance: await Camera.count({ status: 'maintenance' })
      }
    };

    logger.info(`Estatísticas de câmeras solicitadas por: ${req.user.email}`);

    res.json({
      message: 'Estatísticas obtidas com sucesso',
      data: stats
    });
  })
);

/**
 * @route GET /api/cameras/online
 * @desc Listar apenas câmeras online
 * @access Private
 */
router.get('/online',
  requirePermission('cameras.view'),
  asyncHandler(async (req, res) => {
    const cameras = await Camera.findOnline();
    
    // Filtrar por acesso do usuário se não for admin
    let filteredCameras = cameras;
    if (req.user.role !== 'admin') {
      filteredCameras = cameras.filter(camera => 
        req.user.camera_access.includes(camera.id)
      );
    }

    res.json({
      message: 'Câmeras online listadas com sucesso',
      data: filteredCameras.map(camera => camera.toJSON())
    });
  })
);

/**
 * @route GET /api/cameras/:id
 * @desc Obter câmera por ID
 * @access Private
 */
router.get('/:id',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requireCameraAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    logger.info(`Câmera ${id} visualizada por: ${req.user.email}`);

    res.json({
      message: 'Câmera encontrada',
      data: camera.toJSON()
    });
  })
);

/**
 * @route POST /api/cameras
 * @desc Criar nova câmera
 * @access Private (Admin/Operator)
 */
router.post('/',
  requirePermission('cameras.create'),
  createValidationSchema(validationSchemas.camera),
  asyncHandler(async (req, res) => {
    const {
      name,
      description,
      ip_address,
      port,
      username,
      password,
      type,
      stream_type,
      rtsp_url,
      rtmp_url,
      brand,
      model,
      resolution,
      fps,
      location,
      zone,
      recording_enabled,
      motion_detection,
      audio_enabled,
      ptz_enabled,
      night_vision,
      quality_profile,
      retention_days
    } = req.validatedData;

    // Verificar se URL RTSP já existe (mais específico que IP)
    if (rtsp_url) {
      const { data: existingCamera } = await supabaseAdmin
        .from('cameras')
        .select('id')
        .eq('rtsp_url', rtsp_url)
        .single();
      
      if (existingCamera) {
        throw new ValidationError('Já existe uma câmera com esta URL RTSP');
      }
    }

    // Definir porta padrão baseada no tipo de stream
    const defaultPort = stream_type === 'rtmp' ? 1935 : 554;
    const cameraPort = port || defaultPort;

    // Criar câmera
    const camera = new Camera({
      name,
      description,
      ip_address,
      port: cameraPort,
      username,
      password,
      type,
      stream_type: stream_type || 'rtsp',
      rtsp_url,
      rtmp_url,
      brand,
      model,
      resolution,
      fps,
      location,
      zone,
      recording_enabled,
      motion_detection,
      audio_enabled,
      ptz_enabled,
      night_vision,
      quality_profile,
      retention_days,
      created_by: req.user.id
    });

    await camera.save();

    logger.info(`Câmera criada: ${name} por ${req.user.email}`);

    res.status(201).json({
      message: 'Câmera criada com sucesso',
      data: camera.toJSON()
    });
  })
);

/**
 * @route PUT /api/cameras/:id
 * @desc Atualizar câmera
 * @access Private (Admin/Operator)
 */
router.put('/:id',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requirePermission('cameras.edit'),
  requireCameraAccess,
  createValidationSchema({
    name: {
      required: false,
      type: 'nonEmptyString',
      minLength: 2,
      maxLength: 100
    },
    description: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500
    },
    ip_address: {
      required: false,
      type: 'ip'
    },
    port: {
      required: false,
      type: 'port'
    },
    username: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50
    },
    password: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 100
    },
    type: {
      required: false,
      type: 'cameraType'
    },
    brand: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50
    },
    model: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50
    },
    resolution: {
      required: false,
      type: 'resolution'
    },
    fps: {
      required: false,
      type: 'fps'
    },
    location: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 100
    },
    zone: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50
    },
    recording_enabled: {
      required: false,
      type: 'boolean'
    },
    motion_detection: {
      required: false,
      type: 'boolean'
    },
    audio_enabled: {
      required: false,
      type: 'boolean'
    },
    ptz_enabled: {
      required: false,
      type: 'boolean'
    },
    night_vision: {
      required: false,
      type: 'boolean'
    },
    quality_profile: {
      required: false,
      enum: ['low', 'medium', 'high', 'ultra']
    },
    retention_days: {
      required: false,
      type: 'positiveNumber',
      min: 1,
      max: 365
    },
    active: {
      required: false,
      type: 'boolean'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    // Verificar se IP já existe (excluindo a própria câmera)
    if (req.validatedData.ip_address && req.validatedData.ip_address !== camera.ip_address) {
      const ipExists = await Camera.ipExists(req.validatedData.ip_address, id);
      if (ipExists) {
        throw new ValidationError('Já existe uma câmera com este endereço IP');
      }
    }

    // Atualizar campos
    Object.assign(camera, req.validatedData);
    await camera.save();

    logger.info(`Câmera ${id} atualizada por: ${req.user.email}`);

    res.json({
      message: 'Câmera atualizada com sucesso',
      data: camera.toJSON()
    });
  })
);

/**
 * @route DELETE /api/cameras/:id
 * @desc Deletar câmera
 * @access Private (Admin)
 */
router.delete('/:id',
  requireRole('admin'),
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    await camera.delete();

    logger.info(`Câmera ${id} deletada por: ${req.user.email}`);

    res.json({
      message: 'Câmera deletada com sucesso'
    });
  })
);

/**
 * @route PUT /api/cameras/:id/status
 * @desc Atualizar status da câmera
 * @access Private (Admin/Operator)
 */
router.put('/:id/status',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requirePermission('cameras.edit'),
  requireCameraAccess,
  createValidationSchema({
    status: {
      required: true,
      type: 'cameraStatus',
      message: 'Status deve ser online, offline, error ou maintenance'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.validatedData;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    await camera.updateStatus(status);

    logger.info(`Status da câmera ${id} atualizado para ${status} por: ${req.user.email}`);

    res.json({
      message: 'Status da câmera atualizado com sucesso',
      data: camera.toJSON()
    });
  })
);

/**
 * @route POST /api/cameras/:id/test-connection
 * @desc Testar conexão com a câmera
 * @access Private (Admin/Operator)
 */
router.post('/:id/test-connection',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requirePermission('cameras.edit'),
  requireCameraAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    // Testar conexão real com a câmera
    const testResult = await streamingService.testCameraConnection(camera);

    // Atualizar status baseado no teste
    const newStatus = testResult.success ? 'online' : 'offline';
    await camera.updateStatus(newStatus);

    logger.info(`Teste de conexão da câmera ${id} realizado por: ${req.user.email}`);

    res.json({
      message: 'Teste de conexão realizado',
      data: testResult
    });
  })
);

/**
 * @route GET /api/cameras/:id/stream
 * @desc Obter URLs de streaming da câmera
 * @access Private
 */
router.get('/:id/stream',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requireCameraAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    if (camera.status !== 'online') {
      throw new ValidationError('Câmera não está online');
    }

    const streamUrls = {
      rtsp: camera.rtsp_url,
      rtmp: camera.rtmp_url,
      hls: camera.hls_url,
      thumbnail: camera.thumbnail_url
    };

    logger.info(`URLs de streaming da câmera ${id} solicitadas por: ${req.user.email}`);

    res.json({
      message: 'URLs de streaming obtidas com sucesso',
      data: streamUrls
    });
  })
);

/**
 * @route PUT /api/cameras/:id/thumbnail
 * @desc Atualizar thumbnail da câmera
 * @access Private (Admin/Operator)
 */
router.put('/:id/thumbnail',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requirePermission('cameras.edit'),
  requireCameraAccess,
  createValidationSchema({
    thumbnail_url: {
      required: true,
      type: 'url',
      message: 'URL do thumbnail deve ser válida'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { thumbnail_url } = req.validatedData;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    await camera.updateThumbnail(thumbnail_url);

    logger.info(`Thumbnail da câmera ${id} atualizado por: ${req.user.email}`);

    res.json({
      message: 'Thumbnail atualizado com sucesso',
      data: camera.toJSON()
    });
  })
);

/**
 * @route GET /api/cameras/:id/recordings
 * @desc Listar gravações da câmera
 * @access Private
 */
router.get('/:id/recordings',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requireCameraAccess,
  requirePermission('recordings.view'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate = null,
      endDate = null
    } = req.query;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    // Buscar gravações da câmera usando RecordingService
    const searchParams = {
      camera_id: id,
      start_date: startDate,
      end_date: endDate,
      page: parseInt(page),
      limit: parseInt(limit),
      user_id: req.user.id
    };

    const recordings = await RecordingService.searchRecordings(searchParams);

    res.json({
      message: 'Gravações listadas com sucesso',
      data: recordings
    });
  })
);

export default router;