import express from 'express';
import healthDashboardService from '../services/HealthDashboardService.js';
import systemMonitoringService from '../services/SystemMonitoringService.js';
import performanceOptimizationService from '../services/PerformanceOptimizationService.js';
import cleanupService from '../services/CleanupService.js';
import backupService from '../services/BackupService.js';
import s3Service from '../services/S3Service.js';
import authHealthService from '../services/AuthHealthService.js';

const router = express.Router();

// Rota raiz para health check básico
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Sistema funcionando normalmente'
  });
});

// Rota para obter status geral de saúde do sistema
router.get('/status', async (req, res) => {
  try {
    const healthStatus = await healthDashboardService.getSystemHealth();
    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    console.error('Erro ao obter status de saúde:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter métricas detalhadas do sistema
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await healthDashboardService.getSystemMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Erro ao obter métricas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter histórico de eventos
router.get('/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const events = await healthDashboardService.getEventHistory(parseInt(limit), parseInt(offset));
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Erro ao obter histórico de eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter métricas de performance em tempo real
router.get('/performance', async (req, res) => {
  try {
    const performanceMetrics = await performanceOptimizationService.getPerformanceMetrics();
    res.json({
      success: true,
      data: performanceMetrics
    });
  } catch (error) {
    console.error('Erro ao obter métricas de performance:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para forçar otimização de performance
router.post('/performance/optimize', async (req, res) => {
  try {
    await performanceOptimizationService.forceOptimization();
    res.json({
      success: true,
      message: 'Otimização de performance iniciada'
    });
  } catch (error) {
    console.error('Erro ao forçar otimização:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para executar limpeza manual
router.post('/cleanup', async (req, res) => {
  try {
    const { type = 'all' } = req.body;
    await cleanupService.runManualCleanup(type);
    res.json({
      success: true,
      message: `Limpeza ${type} executada com sucesso`
    });
  } catch (error) {
    console.error('Erro ao executar limpeza:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter status de backup
router.get('/backup/status', async (req, res) => {
  try {
    const backupStatus = await backupService.getBackupStatus();
    res.json({
      success: true,
      data: backupStatus
    });
  } catch (error) {
    console.error('Erro ao obter status de backup:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para criar backup manual
router.post('/backup/create', async (req, res) => {
  try {
    const { type = 'full' } = req.body;
    const backupResult = await backupService.createManualBackup(type);
    res.json({
      success: true,
      data: backupResult,
      message: 'Backup criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar backup:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para verificar integridade do sistema
router.get('/integrity', async (req, res) => {
  try {
    const integrityCheck = await healthDashboardService.runIntegrityCheck();
    res.json({
      success: true,
      data: integrityCheck
    });
  } catch (error) {
    console.error('Erro ao verificar integridade:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter alertas ativos
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await systemMonitoringService.getActiveAlerts();
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Erro ao obter alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter dados completos do dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await healthDashboardService.getDashboardData();
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Erro ao obter dados do dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para forçar atualização do dashboard
router.post('/refresh', async (req, res) => {
  try {
    await healthDashboardService.forceUpdate();
    res.json({
      success: true,
      message: 'Dashboard atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para testar conectividade S3/Wasabi
router.get('/s3-test', async (req, res) => {
  try {
    s3Service.init();
    
    const isConnected = await s3Service.testConnection();
    
    res.json({
      success: true,
      data: {
        configured: s3Service.isConfigured,
        connected: isConnected,
        bucketName: s3Service.bucketName,
        endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com'
      }
    });
  } catch (error) {
    console.error('Erro ao testar S3:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rotas específicas para Auth Health
// Rota para obter saúde da autenticação
router.get('/auth', async (req, res) => {
  try {
    const healthSummary = authHealthService.getHealthSummary();
    const totalOperations = healthSummary.metrics.loginAttempts + healthSummary.metrics.tokenRefreshAttempts;
    
    // Calcular score de saúde (0-100)
    let score = 100;
    if (totalOperations > 0) {
      const successRate = (healthSummary.metrics.loginSuccesses + healthSummary.metrics.tokenRefreshSuccesses) / totalOperations;
      const errorRate = healthSummary.metrics.authErrors / totalOperations;
      
      score = Math.max(0, Math.min(100, Math.round(
        (successRate * 70) + // 70% peso para taxa de sucesso
        ((1 - errorRate) * 30) // 30% peso para baixa taxa de erro
      ) * 100));
    }
    
    res.json({
      status: {
        overall: healthSummary.status,
        score: score
      },
      metrics: healthSummary.metrics,
      rates: {
        successRate: parseFloat(healthSummary.rates.successRate) / 100,
        errorRate: parseFloat(healthSummary.rates.errorRate) / 100
      },
      activeAlerts: healthSummary.activeAlerts,
      lastReset: healthSummary.lastReset,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter saúde da autenticação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter alertas de autenticação
router.get('/auth/alerts', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const alerts = authHealthService.getAlerts(parseInt(limit));
    
    res.json(alerts);
  } catch (error) {
    console.error('Erro ao obter alertas de autenticação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para resolver alerta de autenticação
router.post('/auth/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    authHealthService.resolveAlert(alertId);
    
    res.json({
      success: true,
      message: 'Alerta resolvido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao resolver alerta:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para obter saúde do sistema
router.get('/system', async (req, res) => {
  try {
    const systemHealth = await systemMonitoringService.getSystemHealth();
    const dashboardData = await healthDashboardService.getDashboardData();
    
    res.json({
      status: systemHealth.status || 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: dashboardData.services || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter saúde do sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

export default router;