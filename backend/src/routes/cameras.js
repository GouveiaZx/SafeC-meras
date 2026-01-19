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

// Middleware para verificar token de serviço interno
const authenticateService = (req, res, next) => {
  console.log('🔍 [SERVICE AUTH DEBUG] Requisição chegou ao authenticateService:', req.method, req.path);
  console.log('🔍 [SERVICE AUTH DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
  
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN || 'newcam-internal-service-2025';
  
  if (serviceToken === expectedToken) {
    // Criar usuário fictício para serviços internos
    req.user = {
      id: 'internal-service',
      email: 'internal@service.local',
      role: 'admin',
      camera_access: [], // Acesso a todas as câmeras
      permissions: ['cameras.view', 'cameras.create', 'cameras.edit', 'cameras.delete']
    };
    return next();
  }
  
  // Se não é serviço interno, aplicar autenticação normal
  return authenticateToken(req, res, next);
};

// Aplicar autenticação (normal ou de serviço) a todas as rotas
router.use(authenticateService);

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
  (req, res, next) => {
    console.log('🔍 [BASIC DEBUG] POST /api/cameras - Requisição recebida');
    console.log('🔍 [BASIC DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔍 [BASIC DEBUG] Body:', JSON.stringify(req.body, null, 2));
    next();
  },
  requirePermission('cameras.create'),
  (req, res, next) => {
    console.log('🔍 [TEMP DEBUG CAMERA CREATE] Dados recebidos:', {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    next();
  },
  createValidationSchema(validationSchemas.camera),
  (req, res, next) => {
    console.log('🔍 [TEMP DEBUG CAMERA CREATE] Após validação:', {
      validatedData: req.validatedData,
      validationErrors: req.validationErrors
    });
    next();
  },
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
      retention_days,
      use_dynamic_rtmp,
      rtmp_server_type
    } = req.validatedData;

    // Validação customizada: deve ter pelo menos IP ou URL de stream
    console.log('🔍 [TEMP DEBUG CAMERA CREATE] Validação customizada:', {
      ip_address,
      rtsp_url,
      rtmp_url,
      hasIp: !!ip_address,
      hasRtsp: !!rtsp_url,
      hasRtmp: !!rtmp_url
    });

    // 🔧 Auto-habilitar pool dinâmico SRS se for RTMP sem URL/IP fornecido
    if ((stream_type === 'rtmp' || req.body.stream_type === 'rtmp') && !ip_address && !rtsp_url && !rtmp_url) {
      console.log('🔄 [CAMERA CREATE] Auto-habilitando pool dinâmico SRS para RTMP sem URL/IP');
      req.validatedData.use_dynamic_rtmp = true;
      req.validatedData.rtmp_server_type = req.validatedData.rtmp_server_type || 'srs';
    }

    const allowDynamicRTMP = req.validatedData.use_dynamic_rtmp && (stream_type === 'rtmp' || req.body.stream_type === 'rtmp');
    if (!ip_address && !rtsp_url && !rtmp_url && !allowDynamicRTMP) {
      console.log('🔍 [TEMP DEBUG CAMERA CREATE] ERRO: Nenhum campo obrigatório fornecido (sem IP/RTSP/RTMP e sem pool dinâmico)');
      throw new ValidationError('Deve ser fornecido pelo menos um: IP da câmera, URL RTSP, URL RTMP ou ativar pool dinâmico SRS');
    }

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
      use_dynamic_rtmp,
      rtmp_server_type,
      created_by: req.user.id
    });

    await camera.save();

    logger.info(`Câmera criada: ${name} por ${req.user.email}`);

    // Se câmera usa SRS dinâmico, alocar stream do pool
    let srsStreamConfig = null;
    if (req.validatedData.use_dynamic_rtmp && req.validatedData.rtmp_server_type === 'srs') {
      try {
        const srsIntegrationService = (await import('../services/SRSIntegrationService.js')).default;
        srsStreamConfig = await srsIntegrationService.requestNewStreamUrl(camera.id);

        // Atualizar câmera com dados do stream
        await camera.update({
          rtmp_stream_id: srsStreamConfig.id,
          rtmp_sequential_number: srsStreamConfig.sequentialNumber,
          rtmp_url: srsStreamConfig.fullUrl
        });

        logger.info(`✅ Stream SRS alocado para câmera ${camera.id}: ${srsStreamConfig.streamKey} (${srsStreamConfig.fullUrl})`);
      } catch (error) {
        logger.error(`❌ Erro ao alocar stream SRS para câmera ${camera.id}:`, error);
        // Não falhar o cadastro, apenas avisar
      }
    }

    // Se gravação está habilitada, iniciar gravação automaticamente
    if (recording_enabled) {
      try {
        const RecordingService = (await import('../services/RecordingService.js')).default;
        const recordingService = new RecordingService();

        logger.info(`🎬 Iniciando gravação automática para câmera recém-criada ${camera.id} (${name})`);
        await recordingService.startRecording(camera.id, {
          auto_start: true,
          reason: 'recording_enabled_on_creation'
        });
      } catch (recordingError) {
        logger.error(`❌ Erro ao iniciar gravação para câmera ${camera.id}:`, recordingError);
        // Não falhar o cadastro da câmera, apenas logar o erro
      }
    }

    const responseData = camera.toJSON();
    if (srsStreamConfig) {
      responseData.srsStreamConfig = srsStreamConfig;
    }

    res.status(201).json({
      message: 'Câmera criada com sucesso',
      data: responseData
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

    active: {
      required: false,
      type: 'boolean'
    },
    retention_days: {
      required: false,
      type: 'positiveNumber',
      message: 'Dias de retenção deve ser um número positivo'
    },
    quality_profile: {
      required: false,
      type: 'nonEmptyString',
      message: 'Perfil de qualidade inválido'
    },
    rtsp_url: {
      required: false,
      type: 'nonEmptyString',
      message: 'URL RTSP inválida'
    },
    rtmp_url: {
      required: false,
      type: 'nonEmptyString',
      message: 'URL RTMP inválida'
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

    // Verificar se recording_enabled mudou
    const recordingEnabledChanged =
      req.validatedData.hasOwnProperty('recording_enabled') &&
      req.validatedData.recording_enabled !== camera.recording_enabled;

    const previousRecordingEnabled = camera.recording_enabled;

    // Atualizar campos
    Object.assign(camera, req.validatedData);
    await camera.save();

    logger.info(`Câmera ${id} atualizada por: ${req.user.email}`);

    // Se recording_enabled mudou, controlar gravação via ZLMediaKit
    if (recordingEnabledChanged) {
      try {
        const RecordingService = (await import('../services/RecordingService.js')).default;
        const recordingService = new RecordingService();

        if (req.validatedData.recording_enabled && !previousRecordingEnabled) {
          // Gravação foi habilitada - iniciar gravação
          logger.info(`🎬 Iniciando gravação automática para câmera ${id} (${camera.name})`);
          await recordingService.startRecording(id, {
            auto_start: true,
            reason: 'recording_enabled_via_settings'
          });
        } else if (!req.validatedData.recording_enabled && previousRecordingEnabled) {
          // Gravação foi desabilitada - parar gravação
          logger.info(`🛑 Parando gravação automática para câmera ${id} (${camera.name})`);
          await recordingService.stopRecording(id);
        }
      } catch (recordingError) {
        logger.error(`❌ Erro ao controlar gravação para câmera ${id}:`, recordingError);
        // Não falhar a atualização da câmera, apenas logar o erro
      }
    }

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

    // Se câmera tem stream SRS alocado, liberar antes de deletar
    if (camera.rtmp_stream_id) {
      try {
        const srsIntegrationService = (await import('../services/SRSIntegrationService.js')).default;
        await srsIntegrationService.releaseStreamUrl(camera.rtmp_stream_id);
        logger.info(`✅ Stream SRS ${camera.rtmp_stream_id} liberado para câmera ${id} antes da exclusão`);
      } catch (error) {
        logger.error(`❌ Erro ao liberar stream SRS ${camera.rtmp_stream_id} para câmera ${id}:`, error);
        // Não falhar a deleção, apenas avisar
      }
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

/**
 * @route POST /api/cameras/:id/recording/start
 * @desc Iniciar gravação de uma câmera
 * @access Private
 */
router.post('/:id/recording/start',
  requireCameraAccess,
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    logger.info(`[API] Iniciando gravação para câmera ${id}`);
    
    try {
      const result = await RecordingService.startRecording(id);
      
      res.json({
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: result
      });
    } catch (error) {
      logger.error(`[API] Erro ao iniciar gravação:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao iniciar gravação',
        error: error.message
      });
    }
  })
);

/**
 * @route POST /api/cameras/:id/recording/stop
 * @desc Parar gravação de uma câmera
 * @access Private
 */
router.post('/:id/recording/stop',
  requireCameraAccess,
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { recordingId } = req.body;
    
    logger.info(`[API] Parando gravação para câmera ${id}`);
    
    try {
      const result = await RecordingService.stopRecording(id, recordingId);
      
      res.json({
        success: true,
        message: 'Gravação parada com sucesso',
        data: result
      });
    } catch (error) {
      logger.error(`[API] Erro ao parar gravação:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao parar gravação',
        error: error.message
      });
    }
  })
);

/**
 * @route GET /api/cameras/:id/recording/status
 * @desc Verificar status de gravação de uma câmera
 * @access Private
 */
router.get('/:id/recording/status',
  requireCameraAccess,
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const activeRecordings = await RecordingService.getActiveRecordings(id);
      
      res.json({
        success: true,
        isRecording: activeRecordings.length > 0,
        activeRecordings
      });
    } catch (error) {
      logger.error(`[API] Erro ao verificar status:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar status de gravação',
        error: error.message
      });
    }
  })
);

/**
 * POST /api/cameras/:id/start-stream
 * Iniciar streaming de uma câmera
 */
router.post('/:id/start-stream',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      logger.info(`Iniciando stream da câmera: ${id}`);

      const camera = await Camera.findById(id);
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: 'Câmera não encontrada'
        });
      }

      // Verificar com ZLMediaKit se há stream real ativo
      let isReallyStreaming = false;
      try {
        const zlmResponse = await streamingService.getMediaList();
        if (zlmResponse && Array.isArray(zlmResponse)) {
          isReallyStreaming = zlmResponse.some(stream =>
            stream.stream === id || stream.stream === camera.stream_key
          );
        }
      } catch (zlmError) {
        logger.warn(`Não foi possível verificar ZLM: ${zlmError.message}`);
      }

      // Se não há transmissão real, retornar URLs para configuração
      if (!isReallyStreaming) {
        // Gerar URLs de configuração para o usuário
        const rtmpUrl = camera.rtmp_url || `rtmp://localhost:1935/live/${id}`;
        const streamKey = camera.stream_key || id;

        // NÃO marcar como online - aguardar transmissão real
        logger.info(`Câmera ${id} configurada, aguardando transmissão real`);

        return res.json({
          success: true,
          message: 'URLs de stream configuradas. Inicie a transmissão no seu encoder.',
          data: {
            camera_id: id,
            camera_name: camera.name,
            status: 'pending',
            is_streaming: false,
            rtmp_url: rtmpUrl,
            stream_key: streamKey,
            instructions: 'Configure seu encoder/câmera para transmitir para a URL RTMP acima. O status será atualizado automaticamente quando a transmissão iniciar.'
          }
        });
      }

      // Se há transmissão real, confirmar e atualizar status
      const streamResult = await streamingService.startStream(camera, {
        quality: camera.quality_profile || 'medium',
        format: 'hls',
        audio: camera.audio_enabled !== false
      });

      // Atualizar status da câmera no banco de dados
      await Camera.update(id, {
        status: 'online',
        is_streaming: true,
        hls_url: streamResult.urls?.hls,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      logger.info(`Stream confirmado ativo para câmera ${id}`);

      res.json({
        success: true,
        message: 'Stream ativo confirmado',
        data: {
          camera_id: id,
          status: 'online',
          is_streaming: true,
          stream_url: streamResult.urls?.hls,
          urls: streamResult.urls,
          server: streamResult.server
        }
      });

    } catch (error) {
      logger.error(`Erro ao iniciar stream:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao iniciar stream',
        error: error.message
      });
    }
  })
);

/**
 * POST /api/cameras/:id/snapshot
 * Capturar snapshot (imagem) de uma câmera
 */
router.post('/:id/snapshot',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      logger.info(`Capturando snapshot da câmera: ${id}`);

      const camera = await Camera.findById(id);
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: 'Câmera não encontrada'
        });
      }

      // Aqui você implementaria a lógica para capturar snapshot
      // Por exemplo, usar FFmpeg para extrair um frame do stream

      res.json({
        success: true,
        message: 'Snapshot endpoint implementado',
        data: {
          camera_id: id,
          snapshot_url: null, // Implementar geração real
          captured_at: new Date().toISOString(),
          status: 'not_implemented'
        }
      });

    } catch (error) {
      logger.error(`Erro ao capturar snapshot:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao capturar snapshot',
        error: error.message
      });
    }
  })
);

/**
 * POST /api/cameras/:id/force-stop
 * Forçar parada de streaming e gravação de uma câmera
 * Útil quando o status está "preso" como ativo
 */
router.post('/:id/force-stop',
  validateParams({
    id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requirePermission('cameras.edit'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const results = { actions: [], errors: [] };

    try {
      logger.info(`[FORCE-STOP] Iniciando force-stop para câmera ${id}`);

      const camera = await Camera.findById(id);
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: 'Câmera não encontrada'
        });
      }

      // 1. Tentar fechar stream no ZLMediaKit (RTSP cameras)
      try {
        const axios = (await import('axios')).default;
        const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
        const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

        const zlmResponse = await axios.get(`${ZLM_API_URL}/close_streams`, {
          params: {
            secret: ZLM_SECRET,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: id,
            force: 1
          },
          timeout: 5000
        });

        if (zlmResponse.data && zlmResponse.data.code === 0) {
          results.actions.push(`ZLM: ${zlmResponse.data.count_closed || 0} streams fechados`);
          logger.info(`[FORCE-STOP] ZLM: ${zlmResponse.data.count_closed || 0} streams fechados para ${id}`);
        }
      } catch (zlmError) {
        const errorMsg = `ZLM: ${zlmError.message}`;
        results.errors.push(errorMsg);
        logger.warn(`[FORCE-STOP] ${errorMsg}`);
      }

      // 2. Tentar fechar stream no SRS (RTMP cameras)
      try {
        const axios = (await import('axios')).default;
        const SRS_API_URL = process.env.SRS_API_URL || 'http://localhost:1985/api/v1';

        // Buscar clientes conectados ao stream
        const clientsResponse = await axios.get(`${SRS_API_URL}/clients/`, { timeout: 5000 });
        const clients = clientsResponse.data?.clients || [];

        // Filtrar clientes relacionados ao stream_key da câmera
        const streamKey = camera.stream_key || id;
        const relatedClients = clients.filter(c =>
          c.url?.includes(streamKey) || c.name === streamKey
        );

        let disconnectedCount = 0;
        for (const client of relatedClients) {
          try {
            await axios.delete(`${SRS_API_URL}/clients/${client.id}`, { timeout: 5000 });
            disconnectedCount++;
          } catch (e) {
            // Ignorar erros individuais
          }
        }

        if (disconnectedCount > 0) {
          results.actions.push(`SRS: ${disconnectedCount} clientes desconectados`);
          logger.info(`[FORCE-STOP] SRS: ${disconnectedCount} clientes desconectados para ${id}`);
        }
      } catch (srsError) {
        const errorMsg = `SRS: ${srsError.message}`;
        results.errors.push(errorMsg);
        logger.warn(`[FORCE-STOP] ${errorMsg}`);
      }

      // 3. Parar gravações ativas
      try {
        const RecordingService = (await import('../services/RecordingService.js')).default;
        await RecordingService.stopRecording(id);
        results.actions.push('Gravação parada');
        logger.info(`[FORCE-STOP] Gravação parada para ${id}`);
      } catch (recError) {
        const errorMsg = `Gravação: ${recError.message}`;
        results.errors.push(errorMsg);
        logger.warn(`[FORCE-STOP] ${errorMsg}`);
      }

      // 4. Atualizar banco de dados
      try {
        await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: false,
            is_recording: false,
            status: 'offline',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        results.actions.push('Banco de dados atualizado para offline');
        logger.info(`[FORCE-STOP] Banco atualizado para ${id}: is_streaming=false, status=offline`);
      } catch (dbError) {
        const errorMsg = `DB: ${dbError.message}`;
        results.errors.push(errorMsg);
        logger.error(`[FORCE-STOP] ${errorMsg}`);
      }

      const success = results.actions.length > 0;
      res.json({
        success,
        message: success ? 'Câmera forçada a parar' : 'Nenhuma ação executada',
        data: {
          camera_id: id,
          camera_name: camera.name,
          actions: results.actions,
          errors: results.errors
        }
      });

    } catch (error) {
      logger.error(`[FORCE-STOP] Erro geral:`, error);
      res.status(500).json({
        success: false,
        message: 'Erro ao forçar parada',
        error: error.message
      });
    }
  })
);

export default router;