import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import Joi from 'joi';
import RecordingService from '../services/RecordingService.js';

const router = express.Router();

// Schemas de validação
const searchRecordingsSchema = Joi.object({
  camera_id: Joi.string().uuid().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  status: Joi.string().valid('recording', 'completed', 'failed', 'deleted').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sort_by: Joi.string().valid('created_at', 'duration', 'file_size').default('created_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
});

const exportRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  format: Joi.string().valid('zip', 'tar').default('zip')
});

const deleteRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  confirm: Joi.boolean().valid(true).required()
});

const recordingOptionsSchema = Joi.object({
  type: Joi.string().valid('continuous', 'segmented', 'motion').default('continuous'),
  quality: Joi.string().valid('low', 'medium', 'high').default('high'),
  max_duration: Joi.number().min(60).max(7200).optional(),
  metadata: Joi.object().optional()
});

// Middleware para autenticação de serviço interno
const authenticateService = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN || 'newcam-internal-service-2025';
  
  if (serviceToken === expectedToken) {
    req.user = {
      id: 'internal-service',
      role: 'admin',
      permissions: ['recordings:*']
    };
    return next();
  }
  
  return res.status(401).json({
    error: 'Token de serviço inválido',
    message: 'Token de serviço interno requerido'
  });
};

/**
 * @route GET /api/recordings
 * @desc Listar todas as gravações com filtros
 * @access Private
 */
router.get('/', 
  authenticateToken,
  requirePermission('recordings:read'),
  validateRequest('searchRecordings'),
  asyncHandler(async (req, res) => {
    const filters = req.query;
    const result = await RecordingService.searchRecordings(filters, {
      page: filters.page,
      limit: filters.limit
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  })
);

/**
 * @route GET /api/recordings/:id
 * @desc Obter detalhes de uma gravação específica
 * @access Private
 */
router.get('/:id',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const recording = await RecordingService.getRecordingById(id);
    
    res.json({
      success: true,
      data: recording
    });
  })
);

/**
 * @route POST /api/recordings/start
 * @desc Iniciar uma nova gravação
 * @access Private
 */
router.post('/start',
  authenticateToken,
  requirePermission('recordings:create'),
  validateRequest('recordingOptions'),
  asyncHandler(async (req, res) => {
    const { camera_id } = req.body;
    const options = req.body;
    
    const result = await RecordingService.startRecording(camera_id, options);
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route POST /api/recordings/stop
 * @desc Parar uma gravação ativa
 * @access Private
 */
router.post('/stop',
  authenticateToken,
  requirePermission('recordings:update'),
  asyncHandler(async (req, res) => {
    const { camera_id, recording_id } = req.body;
    
    const result = await RecordingService.stopRecording(camera_id, recording_id);
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route GET /api/recordings/active
 * @desc Listar gravações ativas
 * @access Private
 */
router.get('/active',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { camera_id } = req.query;
    const recordings = await RecordingService.getActiveRecordings(camera_id);
    
    res.json({
      success: true,
      data: recordings
    });
  })
);

/**
 * @route GET /api/recordings/stats
 * @desc Obter estatísticas de gravações
 * @access Private
 */
router.get('/stats',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { start_date, end_date, camera_id } = req.query;
    const filters = { start_date, end_date, camera_id };
    
    const stats = await RecordingService.getRecordingStats(filters);
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route GET /api/recordings/trends
 * @desc Obter tendências de gravações
 * @access Private
 */
router.get('/trends',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { start_date, end_date, camera_id } = req.query;
    const filters = { start_date, end_date, camera_id };
    
    const trends = await RecordingService.getTrends(filters);
    
    res.json({
      success: true,
      data: trends
    });
  })
);

/**
 * @route GET /api/recordings/:id/video
 * @desc Reproduzir vídeo de gravação
 * @access Private
 */
router.get('/:id/video',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const fileInfo = await RecordingService.prepareDownload(id);
      
      // Configurar headers para streaming de vídeo
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', fileInfo.fileSize);
      res.setHeader('Cache-Control', 'no-cache');
      
      // Suporte para range requests (seeking no vídeo)
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.fileSize - 1;
        const chunksize = (end - start) + 1;
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.fileSize}`);
        res.setHeader('Content-Length', chunksize);
        
        const stream = require('fs').createReadStream(fileInfo.filePath, { start, end });
        stream.pipe(res);
      } else {
        const stream = await RecordingService.getFileStream(id);
        stream.pipe(res);
      }
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message || 'Gravação não encontrada'
      });
    }
  })
);

/**
 * @route GET /api/recordings/:id/stream
 * @desc Obter informações de streaming da gravação
 * @access Private
 */
router.get('/:id/stream',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const fileInfo = await RecordingService.prepareDownload(id);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      res.json({
        success: true,
        data: {
          recording_id: id,
          video_url: `${baseUrl}/api/recordings/${id}/video`,
          download_url: `${baseUrl}/api/recordings/${id}/download`,
          file_name: fileInfo.fileName,
          file_size: fileInfo.fileSize,
          mime_type: fileInfo.mimeType,
          streaming_info: {
            supports_range: true,
            format: 'mp4',
            container: 'mp4'
          }
        }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message || 'Gravação não encontrada'
      });
    }
  })
);

/**
 * @route POST /api/recordings/export
 * @desc Exportar gravações selecionadas
 * @access Private
 */
router.post('/export',
  authenticateToken,
  requirePermission('recordings:export'),
  validateRequest('exportRecordings'),
  asyncHandler(async (req, res) => {
    const { recording_ids, format } = req.body;
    
    const result = await RecordingService.exportRecordings(recording_ids, { format });
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route GET /api/recordings/export/:exportId/status
 * @desc Verificar status de exportação
 * @access Private
 */
router.get('/export/:exportId/status',
  authenticateToken,
  requirePermission('recordings:export'),
  asyncHandler(async (req, res) => {
    const { exportId } = req.params;
    
    const status = await RecordingService.getExportStatus(exportId);
    
    res.json({
      success: true,
      data: status
    });
  })
);

/**
 * @route POST /api/recordings/export/:exportId/cancel
 * @desc Cancelar exportação
 * @access Private
 */
router.post('/export/:exportId/cancel',
  authenticateToken,
  requirePermission('recordings:export'),
  asyncHandler(async (req, res) => {
    const { exportId } = req.params;
    
    const result = await RecordingService.cancelExport(exportId);
    
    res.json(result);
  })
);

/**
 * @route GET /api/recordings/:id/download
 * @desc Baixar arquivo de gravação
 * @access Private
 */
router.get('/:id/download',
  authenticateToken,
  requirePermission('recordings:download'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const fileInfo = await RecordingService.prepareDownload(id);
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
    res.setHeader('Content-Type', fileInfo.mimeType);
    
    const stream = await RecordingService.getFileStream(id);
    stream.pipe(res);
  })
);

/**
 * @route DELETE /api/recordings
 * @desc Deletar múltiplas gravações
 * @access Private
 */
router.delete('/',
  authenticateToken,
  requirePermission('recordings:delete'),
  validateRequest('deleteRecordings'),
  asyncHandler(async (req, res) => {
    const { recording_ids } = req.body;
    
    const results = [];
    
    for (const recording_id of recording_ids) {
      try {
        await RecordingService.updateRecordingStatus(recording_id, 'deleted');
        results.push({ recording_id, success: true });
      } catch (error) {
        results.push({ recording_id, success: false, error: error.message });
      }
    }
    
    res.json({
      success: true,
      data: results
    });
  })
);

/**
 * @route DELETE /api/recordings/:id
 * @desc Deletar uma gravação específica
 * @access Private
 */
router.delete('/:id',
  authenticateToken,
  requirePermission('recordings:delete'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    await RecordingService.updateRecordingStatus(id, 'deleted');
    
    res.json({
      success: true,
      message: 'Gravação deletada com sucesso'
    });
  })
);

/**
 * @route POST /api/recordings/cleanup
 * @desc Limpar arquivos antigos
 * @access Private (Admin)
 */
router.post('/cleanup',
  authenticateToken,
  requirePermission('recordings:manage'),
  asyncHandler(async (req, res) => {
    const { days = 30, max_size } = req.body;
    
    const result = await RecordingService.cleanupOldFiles({ days, max_size });
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route GET /api/recordings/health
 * @desc Verificar saúde do serviço de gravações
 * @access Private
 */
router.get('/health',
  authenticateToken,
  requirePermission('recordings:read'),
  asyncHandler(async (req, res) => {
    const health = await RecordingService.healthCheck();
    
    res.json({
      success: true,
      data: health
    });
  })
);

// Rotas de serviço interno (comunicação entre serviços)

/**
 * @route POST /api/recordings/internal/start
 * @desc Iniciar gravação via serviço interno
 * @access Internal Service Only
 */
router.post('/internal/start',
  authenticateService,
  asyncHandler(async (req, res) => {
    const { camera_id, options } = req.body;
    
    const result = await RecordingService.startRecording(camera_id, options);
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route POST /api/recordings/internal/stop
 * @desc Parar gravação via serviço interno
 * @access Internal Service Only
 */
router.post('/internal/stop',
  authenticateService,
  asyncHandler(async (req, res) => {
    const { camera_id, recording_id } = req.body;
    
    const result = await RecordingService.stopRecording(camera_id, recording_id);
    
    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * @route GET /api/recordings/internal/active
 * @desc Listar gravações ativas via serviço interno
 * @access Internal Service Only
 */
router.get('/internal/active',
  authenticateService,
  asyncHandler(async (req, res) => {
    const { camera_id } = req.query;
    const recordings = await RecordingService.getActiveRecordings(camera_id);
    
    res.json({
      success: true,
      data: recordings
    });
  })
);

export default router;