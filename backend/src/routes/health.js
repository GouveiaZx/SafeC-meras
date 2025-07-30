/**
 * Rotas para monitoramento de saúde da autenticação
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import authHealthService from '../services/AuthHealthService.js';
import { createModuleLogger } from '../config/logger.js';

const router = express.Router();
const logger = createModuleLogger('HealthRoutes');

/**
 * GET /api/health/auth
 * Obter métricas de saúde da autenticação
 * Requer role: admin
 */
router.get('/auth', authenticateToken, requireRole(['admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  try {
    logger.debug(`[${requestId}] Auth health metrics requested`, {
      userId: req.user.id,
      userEmail: req.user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    const healthSummary = authHealthService.getHealthSummary();
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Auth health metrics retrieved successfully`, {
      status: healthSummary.status,
      activeAlerts: healthSummary.activeAlerts,
      duration: `${duration}ms`
    });
    
    res.json({
      success: true,
      data: healthSummary
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`[${requestId}] Failed to get auth health metrics`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/health/auth/alerts
 * Obter alertas de autenticação
 * Requer role: admin
 */
router.get('/auth/alerts', authenticateToken, requireRole(['admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  try {
    const limit = parseInt(req.query.limit) || 20;
    const resolved = req.query.resolved === 'true';
    
    logger.debug(`[${requestId}] Auth alerts requested`, {
      userId: req.user.id,
      userEmail: req.user.email,
      limit,
      resolved,
      ip: req.ip
    });
    
    let alerts = authHealthService.getAlerts(limit);
    
    // Filtrar por status se especificado
    if (req.query.resolved !== undefined) {
      alerts = alerts.filter(alert => alert.resolved === resolved);
    }
    
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Auth alerts retrieved successfully`, {
      alertCount: alerts.length,
      duration: `${duration}ms`
    });
    
    res.json({
      success: true,
      data: alerts,
      meta: {
        count: alerts.length,
        limit,
        filtered: req.query.resolved !== undefined
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`[${requestId}] Failed to get auth alerts`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/health/auth/alerts/:alertId/resolve
 * Resolver um alerta específico
 * Requer role: admin
 */
router.post('/auth/alerts/:alertId/resolve', authenticateToken, requireRole(['admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  const { alertId } = req.params;
  
  try {
    logger.debug(`[${requestId}] Resolving auth alert`, {
      alertId,
      userId: req.user.id,
      userEmail: req.user.email,
      ip: req.ip
    });
    
    // Verificar se o alerta existe
    const alerts = authHealthService.getAlerts(100);
    const alert = alerts.find(a => a.id === alertId);
    
    if (!alert) {
      logger.warn(`[${requestId}] Alert not found`, { alertId });
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }
    
    if (alert.resolved) {
      logger.warn(`[${requestId}] Alert already resolved`, { alertId });
      return res.status(400).json({
        success: false,
        message: 'Alerta já foi resolvido'
      });
    }
    
    // Resolver o alerta
    authHealthService.resolveAlert(alertId);
    
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Auth alert resolved successfully`, {
      alertId,
      alertType: alert.type,
      resolvedBy: req.user.email,
      duration: `${duration}ms`
    });
    
    res.json({
      success: true,
      message: 'Alerta resolvido com sucesso',
      data: {
        alertId,
        resolvedAt: new Date().toISOString(),
        resolvedBy: req.user.email
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`[${requestId}] Failed to resolve auth alert`, {
      alertId,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/health/system
 * Verificação básica de saúde do sistema
 * Endpoint público para monitoramento externo
 */
router.get('/system', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  try {
    logger.debug(`[${requestId}] System health check requested`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    const authHealth = authHealthService.getHealthSummary();
    const systemHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      auth: {
        status: authHealth.status,
        activeAlerts: authHealth.activeAlerts
      }
    };
    
    // Determinar status geral do sistema
    if (authHealth.status === 'critical') {
      systemHealth.status = 'critical';
    } else if (authHealth.status === 'warning') {
      systemHealth.status = 'degraded';
    }
    
    const duration = Date.now() - startTime;
    
    logger.debug(`[${requestId}] System health check completed`, {
      status: systemHealth.status,
      duration: `${duration}ms`
    });
    
    // Retornar status HTTP apropriado
    const statusCode = systemHealth.status === 'healthy' ? 200 : 
                      systemHealth.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      data: systemHealth
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`[${requestId}] System health check failed`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    });
    
    res.status(503).json({
      success: false,
      data: {
        status: 'critical',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      }
    });
  }
});

export default router;