import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';
import RecordingService from '../services/RecordingService.js';

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
  authenticateToken,
  requirePermission('recordings:read'),
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
        data: result.recordings,
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

/**
 * @route GET /api/recordings/:id
 * @desc Obter detalhes de uma gravação específica
 * @access Private
 */
router.get('/:id',
  authenticateToken,
  requirePermission('recordings:read'),
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
 * @route GET /api/recordings/:id/download
 * @desc Download de uma gravação
 * @access Private
 */
router.get('/:id/download',
  authenticateToken,
  requirePermission('recordings:download'),
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
      
      if (!downloadInfo.exists) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo de gravação não encontrado no armazenamento'
        });
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
 * @route POST /api/recordings/export
 * @desc Exportar múltiplas gravações
 * @access Private
 */
router.post('/export',
  authenticateToken,
  requirePermission('recordings:export'),
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
  authenticateToken,
  requirePermission('recordings:export'),
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
  authenticateToken,
  requirePermission('recordings:delete'),
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
 * @route GET /api/recordings/stats
 * @desc Obter estatísticas de gravações
 * @access Private
 */
router.get('/stats',
  authenticateToken,
  requirePermission('recordings:read'),
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
  authenticateToken,
  requirePermission('recordings:read'),
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

export default router;