import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// O serviço será injetado pelo servidor principal
let segmentationService = null;

/**
 * Injeta o serviço de segmentação
 */
function injectSegmentationService(service) {
  segmentationService = service;
}

/**
 * Middleware para verificar se o serviço está disponível
 */
function requireSegmentationService(req, res, next) {
  if (!segmentationService) {
    return res.status(503).json({
      success: false,
      message: 'Serviço de segmentação não está disponível'
    });
  }
  next();
}

/**
 * GET /api/segmentation/status
 * Obtém o status do serviço de segmentação
 */
router.get('/status', requireSegmentationService, (req, res) => {
  try {
    const stats = segmentationService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        lastCheck: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao obter status da segmentação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

/**
 * POST /api/segmentation/start
 * Inicia o serviço de segmentação
 */
router.post('/start', requireSegmentationService, (req, res) => {
  try {
    segmentationService.start();
    
    logger.info('Serviço de segmentação iniciado via API');
    
    res.json({
      success: true,
      message: 'Serviço de segmentação iniciado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao iniciar serviço de segmentação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao iniciar serviço de segmentação',
      error: error.message
    });
  }
});

/**
 * POST /api/segmentation/stop
 * Para o serviço de segmentação
 */
router.post('/stop', requireSegmentationService, (req, res) => {
  try {
    segmentationService.stop();
    
    logger.info('Serviço de segmentação parado via API');
    
    res.json({
      success: true,
      message: 'Serviço de segmentação parado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao parar serviço de segmentação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao parar serviço de segmentação',
      error: error.message
    });
  }
});

/**
 * POST /api/segmentation/force
 * Força uma segmentação manual imediata
 */
router.post('/force', requireSegmentationService, async (req, res) => {
  try {
    await segmentationService.forceSegmentation();
    
    logger.info('Segmentação manual forçada via API');
    
    res.json({
      success: true,
      message: 'Segmentação manual executada com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao forçar segmentação manual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao executar segmentação manual',
      error: error.message
    });
  }
});

/**
 * GET /api/segmentation/streams
 * Lista todas as streams ativas
 */
router.get('/streams', requireSegmentationService, (req, res) => {
  try {
    const stats = segmentationService.getStats();
    
    res.json({
      success: true,
      data: {
        count: stats.activeStreams,
        streams: stats.streams || []
      }
    });
  } catch (error) {
    logger.error('Erro ao listar streams ativas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar streams ativas',
      error: error.message
    });
  }
});

/**
 * PUT /api/segmentation/config
 * Atualiza configurações do serviço de segmentação
 */
router.put('/config', requireSegmentationService, (req, res) => {
  try {
    const { segmentationInterval } = req.body;
    
    if (segmentationInterval && segmentationInterval > 0) {
      // Reinicia o serviço com novo intervalo
      const wasRunning = segmentationService.isRunning;
      
      if (wasRunning) {
        segmentationService.stop();
      }
      
      segmentationService.segmentationInterval = segmentationInterval;
      
      if (wasRunning) {
        segmentationService.start();
      }
      
      logger.info(`Intervalo de segmentação atualizado para ${segmentationInterval} minutos`);
      
      res.json({
        success: true,
        message: 'Configuração atualizada com sucesso',
        data: {
          segmentationInterval: segmentationInterval
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Intervalo de segmentação deve ser um número positivo'
      });
    }
  } catch (error) {
    logger.error('Erro ao atualizar configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar configuração',
      error: error.message
    });
  }
});

/**
 * GET /api/segmentation/health
 * Verifica a saúde do serviço de segmentação
 */
router.get('/health', requireSegmentationService, async (req, res) => {
  try {
    const stats = segmentationService.getStats();
    
    // Verifica conectividade com ZLMediaKit
    let zlmStatus = 'unknown';
    try {
      const { default: axios } = await import('axios');
      const zlmResponse = await axios.get(`${segmentationService.zlmApiUrl}/index/api/getServerConfig`, {
        params: { secret: segmentationService.zlmSecret },
        timeout: 5000
      });
      zlmStatus = zlmResponse.data.code === 0 ? 'connected' : 'error';
    } catch (error) {
      zlmStatus = 'disconnected';
    }
    
    const health = {
      service: stats.isRunning ? 'running' : 'stopped',
      zlmediakit: zlmStatus,
      activeStreams: stats.activeStreams,
      segmentationInterval: stats.segmentationInterval,
      timestamp: new Date().toISOString()
    };
    
    const isHealthy = health.service === 'running' && health.zlmediakit === 'connected';
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: health
    });
  } catch (error) {
    logger.error('Erro ao verificar saúde do serviço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar saúde do serviço',
      error: error.message
    });
  }
});

export { injectSegmentationService };
export default router;