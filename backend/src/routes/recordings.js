import express from 'express';
// Middleware de autenticação aplicado globalmente no server.js
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';
import RecordingService from '../services/RecordingService.js';
import ImprovedRecordingService from '../services/RecordingService_improved.js';

const router = express.Router();

// Schemas de validação
const searchRecordingsSchema = Joi.object({
  camera_id: Joi.string().uuid().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  duration_min: Joi.number().min(0).optional(),
  duration_max: Joi.number().min(0).optional(),
  file_size_min: Joi.number().min(0).optional(),
  file_size_max: Joi.number().min(0).optional(),
  quality: Joi.string().valid('low', 'medium', 'high', 'ultra').optional(),
  event_type: Joi.string().valid('motion', 'scheduled', 'manual', 'alert').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sort_by: Joi.string().valid('created_at', 'duration', 'file_size', 'camera_name').default('created_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
});

const exportRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  format: Joi.string().valid('zip', 'tar').default('zip'),
  include_metadata: Joi.boolean().default(true)
});

const deleteRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  confirm: Joi.boolean().valid(true).required()
});

/**
 * @route GET /api/recordings
 * @desc Listar gravações com filtros
 * @access Private
 */
router.get('/', 
  validateRequest('searchRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const filters = req.query;
      
      logger.info(`Usuário ${userId} buscando gravações com filtros:`, filters);
      
      // Verificar se o usuário tem acesso às câmeras especificadas
      if (filters.camera_id) {
        const camera = await Camera.findById(filters.camera_id);
        if (!camera) {
          return res.status(404).json({
            success: false,
            message: 'Câmera não encontrada'
          });
        }
        
        // Verificar permissão de acesso à câmera
        const userCameras = await Camera.findByUserId(userId);
        const hasAccess = userCameras.some(cam => cam.id === filters.camera_id);
        
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado à câmera especificada'
          });
        }
      }
      
      const result = await RecordingService.searchRecordings(userId, filters);
      
      res.json({
        success: true,
        data: result.data || result.recordings || [],
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: result.pages
        },
        filters: result.appliedFilters
      });
      
    } catch (error) {
      logger.error('Erro ao buscar gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Rotas específicas devem vir antes das rotas com parâmetros

/**
 * @route GET /api/recordings/stats
 * @desc Obter estatísticas de gravações
 * @access Private
 */
router.get('/stats',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = '7d' } = req.query;
      
      const stats = await RecordingService.getRecordingStats(userId, period);
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/trends
 * @desc Obter tendências de upload de gravações
 * @access Private
 */
router.get('/trends',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = '24h' } = req.query;
      
      const trends = await RecordingService.getTrends(userId, period);
      
      res.json({
        success: true,
        data: trends
      });
      
    } catch (error) {
      logger.error('Erro ao obter tendências de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/active
 * @desc Listar gravações ativas
 * @access Private
 */
router.get('/active',
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} buscando gravações ativas`);

      const { data: activeRecordings } = await RecordingService.getActiveRecordings(userId);

      res.json({
        success: true,
        data: activeRecordings,
        count: activeRecordings.length
      });

    } catch (error) {
      logger.error('Erro ao buscar gravações ativas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar gravações ativas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/start
 * @desc Iniciar gravação de uma câmera
 * @access Private
 */
router.post('/start',
  async (req, res) => {
    try {
      const { cameraId } = req.body;

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      logger.info(`[API] Requisição para iniciar gravação da câmera ${cameraId}`);

      const result = await RecordingService.startRecording(cameraId);

      res.json({
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('[API] Erro ao iniciar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao iniciar gravação'
      });
    }
  }
);

/**
 * @route POST /api/recordings/pause
 * @desc Pausar gravação de uma câmera
 * @access Private
 */
router.post('/pause',
  async (req, res) => {
    try {
      const { cameraId, recordingId } = req.body;

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      logger.info(`[API] Requisição para pausar gravação da câmera ${cameraId}`);

      const result = await RecordingService.pauseRecording(cameraId, recordingId);

      res.json({
        success: true,
        message: 'Gravação pausada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('[API] Erro ao pausar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao pausar gravação'
      });
    }
  }
);

/**
 * @route POST /api/recordings/resume
 * @desc Retomar gravação de uma câmera
 * @access Private
 */
router.post('/resume',
  async (req, res) => {
    try {
      const { cameraId } = req.body;

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      logger.info(`[API] Requisição para retomar gravação da câmera ${cameraId}`);

      const result = await RecordingService.resumeRecording(cameraId);

      res.json({
        success: true,
        message: 'Gravação retomada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('[API] Erro ao retomar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao retomar gravação'
      });
    }
  }
);

/**
 * @route POST /api/recordings/stop
 * @desc Parar gravação de uma câmera
 * @access Private
 */
router.post('/stop',
  async (req, res) => {
    try {
      const { cameraId, recordingId } = req.body;

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      logger.info(`[API] Requisição para parar gravação da câmera ${cameraId}`);

      const result = await RecordingService.stopRecording(cameraId, recordingId);

      res.json({
        success: true,
        message: 'Gravação parada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('[API] Erro ao parar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao parar gravação'
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/stop
 * @desc Parar gravação específica por ID
 * @access Private
 */
router.post('/:id/stop',
  async (req, res) => {
    try {
      const recordingId = req.params.id;
      const userId = req.user.id;

      // Buscar gravação para obter o camera_id
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }

      logger.info(`Usuário ${userId} parando gravação ${recordingId} da câmera ${recording.camera_id}`);

      // Parar gravação usando o RecordingService
      const result = await RecordingService.stopRecording(recording.camera_id, recordingId);

      res.json({
        success: true,
        message: 'Gravação parada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('Erro ao parar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao parar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Rota /:id movida para o final do arquivo

// Middleware específico para autenticação de streaming (aceita token via query parameter)
const authenticateStreamToken = async (req, res, next) => {
  try {
    // Configurar headers CORS primeiro - permitir origem específica do frontend
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range, Cache-Control, Pragma, If-Range, If-Modified-Since, If-None-Match');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag, Last-Modified, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Responder a requisições OPTIONS
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    let token = null;
    
    // Verificar token no header Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Se não encontrou no header, verificar no query parameter
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acesso requerido'
      });
    }
    
    // Verificar token JWT (mesmo sistema que o middleware principal)
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    
    // Buscar dados do usuário na tabela users
    const { supabaseAdmin } = await import('../config/database.js');
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (userError || !userData) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado ou inativo'
      });
    }
    
    // Verificar se o usuário não foi bloqueado
    if (userData.blocked_at) {
      return res.status(403).json({
        success: false,
        message: 'Usuário bloqueado'
      });
    }
    
    // Adicionar informações do usuário à requisição
    req.user = {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      permissions: userData.permissions || [],
      camera_access: userData.camera_access || []
    };
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação de streaming:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token malformado'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

/**
 * @route GET /api/recordings/:id/download
 * @desc Download de uma gravação
 * @access Private
 */
router.get('/:id/download',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const downloadInfo = await RecordingService.prepareDownload(recordingId, userId);
      
      // Debug: log das informações de download
      logger.info(`[Stream Debug] Download info:`, {
        exists: downloadInfo.exists,
        isS3: downloadInfo.isS3,
        filePath: downloadInfo.filePath,
        filename: downloadInfo.filename,
        fileSize: downloadInfo.fileSize
      });
      
      if (!downloadInfo.exists) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo de gravação não encontrado no armazenamento'
        });
      }
      
      // Se é S3, redirecionar
      if (downloadInfo.isS3) {
        return res.redirect(downloadInfo.s3Url);
      }
      
      // Configurar headers para download
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
      res.setHeader('Content-Length', downloadInfo.fileSize);
      
      // Stream do arquivo
      const fileStream = await RecordingService.getFileStream(downloadInfo.filePath);
      fileStream.pipe(res);
      
      // Log do download
      logger.info(`Download iniciado - Usuário: ${userId}, Gravação: ${recordingId}`);
      
    } catch (error) {
      logger.error('Erro no download da gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/:id/stream
 * @desc Stream de uma gravação para reprodução
 * @access Private
 */
router.get('/:id/stream',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      // 🔍 [DEBUG] Log da requisição de streaming
      logger.info(`🎥 [STREAMING DEBUG] Requisição de streaming recebida:`, {
        recordingId,
        userId,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
        referer: req.headers.referer,
        range: req.headers.range,
        timestamp: new Date().toISOString()
      });
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      // 🔍 [DEBUG] Log do resultado da busca da gravação
      logger.info(`🎥 [STREAMING DEBUG] Resultado da busca da gravação:`, {
        recordingId,
        found: !!recording,
        recordingData: recording ? {
          id: recording.id,
          filename: recording.filename,
          file_path: recording.file_path,
          file_size: recording.file_size,
          duration: recording.duration,
          camera_id: recording.camera_id
        } : null
      });
      
      if (!recording) {
        logger.warn(`🎥 [STREAMING DEBUG] Gravação não encontrada: ${recordingId}`);
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const downloadInfo = await RecordingService.prepareDownload(recordingId, userId);
      
      // 🔍 [DEBUG] Log do resultado do prepareDownload
      logger.info(`🎥 [STREAMING DEBUG] Resultado do prepareDownload:`, {
        recordingId,
        downloadInfo: {
          exists: downloadInfo.exists,
          isS3: downloadInfo.isS3,
          filePath: downloadInfo.filePath,
          fileSize: downloadInfo.fileSize,
          filename: downloadInfo.filename,
          s3Url: downloadInfo.s3Url ? '[S3_URL_PRESENTE]' : null,
          message: downloadInfo.message
        }
      });
      
      if (!downloadInfo.exists) {
        logger.error(`🎥 [STREAMING DEBUG] Arquivo não encontrado no armazenamento: ${recordingId}`);
        return res.status(404).json({
          success: false,
          message: 'Arquivo de gravação não encontrado no armazenamento'
        });
      }
      
      // Se é S3, redirecionar
      if (downloadInfo.isS3) {
        logger.info(`🎥 [STREAMING DEBUG] Redirecionando para S3: ${recordingId}`);
        return res.redirect(downloadInfo.s3Url);
      }
      
      const filePath = downloadInfo.filePath;
      const fileSize = downloadInfo.fileSize;
      
      // 🔍 [DEBUG] Log dos dados finais de streaming
      logger.info(`🎥 [STREAMING DEBUG] Iniciando streaming local:`, {
        recordingId,
        filePath,
        fileSize,
        hasRangeHeader: !!req.headers.range
      });
      
      // Suporte a Range Requests para streaming de vídeo
      const range = req.headers.range;
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunksize);
        res.setHeader('Content-Type', 'video/mp4');
        
        const { createReadStream } = await import('fs');
        const stream = createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        
        const fileStream = await RecordingService.getFileStream(filePath);
        fileStream.pipe(res);
      }
      
      // 🔍 [DEBUG] Log de sucesso do streaming
      logger.info(`🎥 [STREAMING DEBUG] Streaming iniciado com sucesso:`, {
        userId,
        recordingId,
        filePath,
        fileSize,
        rangeRequest: !!req.headers.range,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      // 🔍 [DEBUG] Log detalhado de erro
      logger.error(`🎥 [STREAMING DEBUG] Erro no streaming da gravação:`, {
        recordingId,
        userId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/export
 * @desc Exportar múltiplas gravações
 * @access Private
 */
router.post('/export',
  validateRequest('exportRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recording_ids, format, include_metadata } = req.body;
      
      logger.info(`Usuário ${userId} exportando ${recording_ids.length} gravações`);
      
      // Verificar acesso a todas as gravações
      const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
      
      if (!accessCheck.allAccessible) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado a algumas gravações',
          inaccessible_recordings: accessCheck.inaccessibleIds
        });
      }
      
      // Iniciar processo de exportação
      const exportJob = await RecordingService.createExportJob({
        userId,
        recordingIds: recording_ids,
        format,
        includeMetadata: include_metadata
      });
      
      res.json({
        success: true,
        message: 'Exportação iniciada',
        export_id: exportJob.id,
        estimated_time: exportJob.estimatedTime,
        status_url: `/api/recordings/export/${exportJob.id}/status`
      });
      
    } catch (error) {
      logger.error('Erro na exportação de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/export/:exportId/status
 * @desc Verificar status de exportação
 * @access Private
 */
router.get('/export/:exportId/status',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const exportId = req.params.exportId;
      
      const exportStatus = await RecordingService.getExportStatus(exportId, userId);
      
      if (!exportStatus) {
        return res.status(404).json({
          success: false,
          message: 'Exportação não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: exportStatus
      });
      
    } catch (error) {
      logger.error('Erro ao verificar status de exportação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route DELETE /api/recordings
 * @desc Deletar múltiplas gravações
 * @access Private
 */
router.delete('/',
  validateRequest('deleteRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recording_ids, confirm } = req.body;
      
      logger.info(`Usuário ${userId} deletando ${recording_ids.length} gravações`);
      
      // Verificar acesso a todas as gravações
      const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
      
      if (!accessCheck.allAccessible) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado a algumas gravações',
          inaccessible_recordings: accessCheck.inaccessibleIds
        });
      }
      
      // Executar deleção
      const deleteResult = await RecordingService.deleteRecordings(recording_ids, userId);
      
      res.json({
        success: true,
        message: `${deleteResult.deletedCount} gravações deletadas com sucesso`,
        deleted_count: deleteResult.deletedCount,
        failed_count: deleteResult.failedCount,
        freed_space: deleteResult.freedSpace
      });
      
    } catch (error) {
      logger.error('Erro ao deletar gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings
 * @desc Iniciar gravação para uma câmera
 * @access Private
 */
router.post('/',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      // Verificar se a câmera existe e o usuário tem acesso
      const camera = await Camera.findById(cameraId);
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: 'Câmera não encontrada'
        });
      }

      // Verificar permissão de acesso à câmera
      const userCameras = await Camera.findByUserId(userId);
      const hasAccess = userCameras.some(cam => cam.id === cameraId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado à câmera especificada'
        });
      }

      logger.info(`Usuário ${userId} iniciando gravação para câmera ${cameraId}`);

      // Iniciar gravação usando o RecordingService
      const recording = await RecordingService.startRecording(cameraId);

      res.status(201).json({
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: recording
      });

    } catch (error) {
      logger.error('Erro ao iniciar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao iniciar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/retry-upload
 * @desc Tentar novamente o upload de uma gravação
 * @access Private
 */
router.post('/:id/retry-upload',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const result = await RecordingService.retryUpload(recordingId);
      
      res.json({
        success: true,
        message: 'Retry de upload iniciado com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao tentar novamente o upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/segments/:segmentId/retry-upload
 * @desc Tentar novamente o upload de um segmento específico
 * @access Private
 */
router.post('/:id/segments/:segmentId/retry-upload',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { id: recordingId, segmentId } = req.params;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const result = await RecordingService.retrySegmentUpload(recordingId, segmentId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Segmento não encontrado'
        });
      }
      
      res.json({
        success: true,
        message: 'Retry de upload do segmento iniciado com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao tentar novamente o upload do segmento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/upload-queue
 * @desc Obter informações da fila de upload
 * @access Private
 */
router.get('/upload-queue',
  async (req, res) => {
    try {
      const queue = await RecordingService.getUploadQueue();
      
      res.json({
        success: true,
        data: queue
      });
      
    } catch (error) {
      logger.error('Erro ao buscar fila de upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/upload-queue/toggle
 * @desc Pausar/Retomar processamento da fila de upload
 * @access Private
 */
router.post('/upload-queue/toggle',
  async (req, res) => {
    try {
      const { action } = req.body; // 'pause' ou 'resume'
      
      if (!['pause', 'resume'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Ação deve ser "pause" ou "resume"'
        });
      }
      
      const result = await RecordingService.toggleUploadQueue(action);
      
      res.json({
        success: true,
        message: `Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'} com sucesso`,
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao alterar status da fila de upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Rota genérica /:id deve vir por último para não interferir com rotas específicas
/**
 * @route DELETE /api/recordings/:id
 * @desc Deletar uma gravação específica
 * @access Private
 */
router.delete('/:id',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      logger.info(`Usuário ${userId} deletando gravação ${recordingId}`);
      
      const result = await RecordingService.deleteRecording(recordingId, userId);
      
      res.json({
        success: true,
        message: 'Gravação deletada com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao deletar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/:id
 * @desc Obter detalhes de uma gravação específica
 * @access Private
 */
router.get('/:id',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: recording
      });
      
    } catch (error) {
      logger.error('Erro ao obter gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/camera/:cameraId/active
 * @desc Verificar se há gravação ativa para uma câmera
 * @access Private
 */
router.get('/camera/:cameraId/active',
  async (req, res) => {
    try {
      const { cameraId } = req.params;
      const userId = req.user.id;

      const activeRecording = await RecordingService.getActiveRecording(cameraId, userId);

      res.json({
        success: true,
        data: {
          hasActiveRecording: !!activeRecording,
          recording: activeRecording
        }
      });

    } catch (error) {
      logger.error('[API] Erro ao verificar gravação ativa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar gravação ativa'
      });
    }
  }
);

/**
 * @route POST /api/recordings/update-statistics
 * @desc Atualizar estatísticas das gravações (duração, tamanho, resolução)
 * @access Private
 */
router.post('/update-statistics',
  async (req, res) => {
    try {
      const { recordingId } = req.body;
      
      if (recordingId) {
        // Atualizar uma gravação específica
        const result = await RecordingService.updateSingleRecordingStatistics(recordingId);
        
        if (!result) {
          return res.status(404).json({
            success: false,
            message: 'Gravação não encontrada'
          });
        }
        
        res.json({
          success: true,
          message: 'Estatísticas da gravação atualizadas com sucesso',
          data: result
        });
      } else {
        // Atualizar todas as gravações com estatísticas zeradas
        const result = await RecordingService.updateRecordingStatistics();
        
        res.json({
          success: true,
          message: `Estatísticas atualizadas para ${result.updated} gravações`,
          data: result
        });
      }
      
    } catch (error) {
      logger.error('Erro ao atualizar estatísticas das gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;