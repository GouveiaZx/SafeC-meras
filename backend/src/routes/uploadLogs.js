import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import UploadLogService from '../services/UploadLogService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @route GET /api/upload-logs/recent
 * @desc Obter logs recentes de upload
 * @access Private
 */
router.get('/recent',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const {
        type = 'all', // 'all', 'errors', 'performance'
        limit = 100,
        recordingId,
        startDate,
        endDate
      } = req.query;

      const logs = await UploadLogService.getRecentLogs({
        type,
        limit: parseInt(limit),
        recordingId,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: {
          logs,
          total: logs.length,
          filters: {
            type,
            limit: parseInt(limit),
            recordingId,
            startDate,
            endDate
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao obter logs recentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter logs recentes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/upload-logs/recording/:recordingId
 * @desc Obter logs específicos de uma gravação
 * @access Private
 */
router.get('/recording/:recordingId',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const { recordingId } = req.params;
      const {
        type = 'all',
        limit = 50
      } = req.query;

      const logs = await UploadLogService.getRecentLogs({
        type,
        limit: parseInt(limit),
        recordingId
      });

      // Organizar logs por tipo para melhor visualização
      const organizedLogs = {
        start: logs.filter(log => log.type === 'upload_start'),
        progress: logs.filter(log => log.type === 'upload_progress'),
        complete: logs.filter(log => log.type === 'upload_complete'),
        errors: logs.filter(log => log.type === 'upload_error'),
        retries: logs.filter(log => log.type === 'upload_retry'),
        webhooks: logs.filter(log => log.type === 'webhook'),
        performance: logs.filter(log => log.type === 'performance'),
        all: logs
      };

      res.json({
        success: true,
        data: {
          recordingId,
          logs: organizedLogs,
          summary: {
            totalLogs: logs.length,
            startEvents: organizedLogs.start.length,
            progressEvents: organizedLogs.progress.length,
            completeEvents: organizedLogs.complete.length,
            errorEvents: organizedLogs.errors.length,
            retryEvents: organizedLogs.retries.length,
            webhookEvents: organizedLogs.webhooks.length,
            performanceEvents: organizedLogs.performance.length
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao obter logs da gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter logs da gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/upload-logs/errors
 * @desc Obter apenas logs de erro
 * @access Private
 */
router.get('/errors',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const {
        limit = 50,
        startDate,
        endDate
      } = req.query;

      const logs = await UploadLogService.getRecentLogs({
        type: 'errors',
        limit: parseInt(limit),
        startDate,
        endDate
      });

      // Agrupar erros por tipo para análise
      const errorAnalysis = logs.reduce((acc, log) => {
        const errorType = log.error?.code || log.error?.message?.split(':')[0] || 'Unknown';
        
        if (!acc[errorType]) {
          acc[errorType] = {
            count: 0,
            lastOccurrence: null,
            recordings: new Set()
          };
        }
        
        acc[errorType].count++;
        acc[errorType].lastOccurrence = log.timestamp;
        if (log.recordingId) {
          acc[errorType].recordings.add(log.recordingId);
        }
        
        return acc;
      }, {});

      // Converter Sets para arrays para serialização JSON
      Object.keys(errorAnalysis).forEach(errorType => {
        errorAnalysis[errorType].recordings = Array.from(errorAnalysis[errorType].recordings);
      });

      res.json({
        success: true,
        data: {
          logs,
          analysis: errorAnalysis,
          summary: {
            totalErrors: logs.length,
            uniqueErrorTypes: Object.keys(errorAnalysis).length,
            affectedRecordings: new Set(logs.map(log => log.recordingId).filter(Boolean)).size
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao obter logs de erro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter logs de erro',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/upload-logs/performance
 * @desc Obter logs de performance
 * @access Private
 */
router.get('/performance',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const {
        limit = 100,
        startDate,
        endDate
      } = req.query;

      const logs = await UploadLogService.getRecentLogs({
        type: 'performance',
        limit: parseInt(limit),
        startDate,
        endDate
      });

      // Calcular métricas de performance
      const performanceMetrics = {
        averageUploadTime: 0,
        averageSpeed: 0,
        totalUploads: 0,
        successfulUploads: 0,
        failedUploads: 0,
        totalDataTransferred: 0
      };

      if (logs.length > 0) {
        const completedUploads = logs.filter(log => 
          log.metrics && log.metrics.action === 'upload_complete'
        );

        if (completedUploads.length > 0) {
          performanceMetrics.totalUploads = completedUploads.length;
          performanceMetrics.successfulUploads = completedUploads.length;
          
          const totalTime = completedUploads.reduce((sum, log) => 
            sum + (log.metrics.duration || 0), 0
          );
          
          const totalSize = completedUploads.reduce((sum, log) => 
            sum + (log.metrics.fileSize || 0), 0
          );
          
          performanceMetrics.averageUploadTime = totalTime / completedUploads.length;
          performanceMetrics.totalDataTransferred = totalSize;
          
          if (totalTime > 0) {
            performanceMetrics.averageSpeed = totalSize / (totalTime / 1000); // bytes per second
          }
        }
      }

      res.json({
        success: true,
        data: {
          logs,
          metrics: performanceMetrics,
          summary: {
            totalLogs: logs.length,
            timeRange: {
              start: startDate,
              end: endDate
            }
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao obter logs de performance:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter logs de performance',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/upload-logs/stats
 * @desc Obter estatísticas dos arquivos de log
 * @access Private
 */
router.get('/stats',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const stats = await UploadLogService.getLogStats();

      res.json({
        success: true,
        data: {
          files: stats,
          summary: {
            totalFiles: Object.keys(stats).length,
            totalSize: Object.values(stats).reduce((sum, file) => sum + file.size, 0),
            oldestFile: Object.values(stats).reduce((oldest, file) => 
              !oldest || file.modified < oldest ? file.modified : oldest, null
            ),
            newestFile: Object.values(stats).reduce((newest, file) => 
              !newest || file.modified > newest ? file.modified : newest, null
            )
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao obter estatísticas de logs:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas de logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/upload-logs/cleanup
 * @desc Limpar logs antigos
 * @access Private
 */
router.post('/cleanup',
  authenticateToken,
  requirePermission('logs:write'),
  async (req, res) => {
    try {
      const { daysToKeep = 30 } = req.body;

      if (daysToKeep < 1 || daysToKeep > 365) {
        return res.status(400).json({
          success: false,
          message: 'daysToKeep deve estar entre 1 e 365 dias'
        });
      }

      await UploadLogService.cleanOldLogs(daysToKeep);

      UploadLogService.logInfo('Limpeza de logs executada', {
        daysToKeep,
        executedBy: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: `Logs mais antigos que ${daysToKeep} dias foram removidos`,
        data: {
          daysToKeep,
          executedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Erro ao limpar logs:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao limpar logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;