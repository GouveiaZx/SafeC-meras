/**
 * Controller de Métricas do Sistema NewCAM
 * Gerencia as APIs de métricas e monitoramento
 */

import MetricsService from '../services/MetricsService.js';
import { logger } from '../config/logger.js';

/**
 * Obtém todas as métricas do sistema
 */
export const getAllMetrics = async (req, res) => {
  try {
    const metrics = MetricsService.getMetrics();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter métricas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtém métricas por categoria
 */
export const getMetricsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    const validCategories = ['system', 'cameras', 'recordings', 'storage', 'network'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Categoria inválida. Categorias válidas: ${validCategories.join(', ')}`
      });
    }

    const metrics = MetricsService.getMetricsByCategory(category);
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Erro ao obter métricas da categoria ${req.params.category}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtém histórico de métricas
 */
export const getMetricsHistory = async (req, res) => {
  try {
    const { category } = req.params;
    const { timeRange = '1h' } = req.query;
    
    const validCategories = ['system', 'cameras', 'recordings', 'storage', 'network'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Categoria inválida. Categorias válidas: ${validCategories.join(', ')}`
      });
    }

    const validTimeRanges = ['15m', '1h', '6h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        message: `Intervalo de tempo inválido. Intervalos válidos: ${validTimeRanges.join(', ')}`
      });
    }

    const history = await MetricsService.getMetricsHistory(category, timeRange);
    
    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Erro ao obter histórico de métricas:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtém alertas do sistema
 */
export const getAlerts = async (req, res) => {
  try {
    const alerts = MetricsService.getAlerts();
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        hasWarnings: alerts.some(alert => alert.type === 'warning'),
        hasErrors: alerts.some(alert => alert.type === 'error')
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Inicia a coleta de métricas
 */
export const startMetricsCollection = async (req, res) => {
  try {
    const { interval = 5000 } = req.body;
    
    if (interval < 1000 || interval > 60000) {
      return res.status(400).json({
        success: false,
        message: 'Intervalo deve estar entre 1000ms e 60000ms'
      });
    }

    await MetricsService.startCollection(interval);
    
    res.json({
      success: true,
      message: 'Coleta de métricas iniciada',
      interval,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao iniciar coleta de métricas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Para a coleta de métricas
 */
export const stopMetricsCollection = async (req, res) => {
  try {
    MetricsService.stopCollection();
    
    res.json({
      success: true,
      message: 'Coleta de métricas parada',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao parar coleta de métricas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Força a coleta imediata de métricas
 */
export const forceMetricsCollection = async (req, res) => {
  try {
    await MetricsService.collectMetrics();
    const metrics = MetricsService.getMetrics();
    
    res.json({
      success: true,
      message: 'Métricas coletadas com sucesso',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao forçar coleta de métricas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtém status da coleta de métricas
 */
export const getMetricsStatus = async (req, res) => {
  try {
    const metrics = MetricsService.getMetrics();
    
    res.json({
      success: true,
      data: {
        isCollecting: metrics.isCollecting,
        lastUpdate: metrics.timestamp,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter status das métricas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};