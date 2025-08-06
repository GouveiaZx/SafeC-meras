/**
 * Serviço de Dashboard de Saúde do Sistema
 * Fornece métricas em tempo real e status de saúde de todos os componentes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import EventEmitter from 'events';
import logger from '../utils/logger.js';
import systemMonitoringService from './SystemMonitoringService.js';
import alertService from './AlertService.js';
import performanceOptimizationService from './PerformanceOptimizationService.js';
import cleanupService from './CleanupService.js';
import backupService from './BackupService.js';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class HealthDashboardService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.metricsInterval = null;
    this.healthCheckInterval = null;
    this.dashboardData = {
      system: {
        status: 'unknown',
        uptime: 0,
        lastUpdate: null
      },
      services: {
        recording: { status: 'unknown', lastCheck: null },
        streaming: { status: 'unknown', lastCheck: null },
        storage: { status: 'unknown', lastCheck: null },
        database: { status: 'unknown', lastCheck: null },
        monitoring: { status: 'unknown', lastCheck: null },
        alerts: { status: 'unknown', lastCheck: null },
        cleanup: { status: 'unknown', lastCheck: null },
        backup: { status: 'unknown', lastCheck: null }
      },
      metrics: {
        performance: {
          cpu: { current: 0, average: 0, peak: 0 },
          memory: { current: 0, average: 0, peak: 0 },
          disk: { current: 0, average: 0, peak: 0 },
          network: { current: 0, average: 0, peak: 0 }
        },
        recording: {
          activeCameras: 0,
          totalRecordings: 0,
          recordingErrors: 0,
          storageUsed: 0
        },
        alerts: {
          total: 0,
          critical: 0,
          warnings: 0,
          resolved: 0
        }
      },
      history: {
        performance: [],
        alerts: [],
        events: []
      }
    };
    
    this.healthThresholds = {
      cpu: { warning: 70, critical: 85 },
      memory: { warning: 75, critical: 90 },
      disk: { warning: 80, critical: 95 },
      network: { warning: 80, critical: 95 },
      responseTime: { warning: 1000, critical: 3000 }
    };
    
    this.startTime = Date.now();
  }

  /**
   * Inicializa o dashboard de saúde
   */
  async initialize() {
    try {
      logger.info('[HealthDashboard] Inicializando dashboard de saúde...');
      
      // Carregar configurações do dashboard
      await this.loadDashboardConfig();
      
      // Configurar coleta de métricas
      await this.setupMetricsCollection();
      
      // Configurar verificações de saúde
      await this.setupHealthChecks();
      
      // Executar verificação inicial
      await this.performInitialHealthCheck();
      
      this.isRunning = true;
      logger.info('[HealthDashboard] Dashboard de saúde inicializado com sucesso');
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao inicializar dashboard:', error);
      throw error;
    }
  }

  /**
   * Para o dashboard de saúde
   */
  async stop() {
    try {
      this.isRunning = false;
      
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      logger.info('[HealthDashboard] Dashboard de saúde parado');
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao parar dashboard:', error);
    }
  }

  /**
   * Configura coleta de métricas
   */
  async setupMetricsCollection() {
    // Coletar métricas a cada 10 segundos
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('[HealthDashboard] Erro ao coletar métricas:', error);
      }
    }, 10000);
    
    logger.info('[HealthDashboard] Coleta de métricas configurada');
  }

  /**
   * Configura verificações de saúde
   */
  async setupHealthChecks() {
    // Verificar saúde dos serviços a cada 30 segundos
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('[HealthDashboard] Erro durante verificações de saúde:', error);
      }
    }, 30000);
    
    logger.info('[HealthDashboard] Verificações de saúde configuradas');
  }

  /**
   * Executa verificação inicial de saúde
   */
  async performInitialHealthCheck() {
    try {
      logger.info('[HealthDashboard] Executando verificação inicial de saúde...');
      
      await this.collectMetrics();
      await this.performHealthChecks();
      
      // Atualizar status geral do sistema
      this.updateSystemStatus();
      
      logger.info('[HealthDashboard] Verificação inicial concluída');
    } catch (error) {
      logger.error('[HealthDashboard] Erro durante verificação inicial:', error);
    }
  }

  /**
   * Coleta métricas do sistema
   */
  async collectMetrics() {
    try {
      const timestamp = new Date();
      
      // Coletar métricas de performance
      const systemMetrics = systemMonitoringService.getMetrics();
      
      // Atualizar métricas de performance
      this.updatePerformanceMetrics(systemMetrics);
      
      // Coletar métricas de gravação
      await this.collectRecordingMetrics();
      
      // Coletar métricas de alertas
      await this.collectAlertMetrics();
      
      // Adicionar ao histórico
      if (systemMetrics.current && systemMetrics.current.cpu && systemMetrics.current.memory && systemMetrics.current.disk) {
        this.addToHistory('performance', {
          timestamp,
          cpu: systemMetrics.current.cpu.usage,
          memory: systemMetrics.current.memory.usage,
          disk: systemMetrics.current.disk.usage
        });
      }
      
      // Manter apenas últimos 100 registros no histórico
      if (this.dashboardData.history.performance.length > 100) {
        this.dashboardData.history.performance = this.dashboardData.history.performance.slice(-100);
      }
      
      // Atualizar timestamp da última atualização
      this.dashboardData.system.lastUpdate = timestamp;
      this.dashboardData.system.uptime = Date.now() - this.startTime;
      
      // Emitir evento de métricas atualizadas
      this.emit('metricsUpdated', this.dashboardData.metrics);
      
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao coletar métricas:', error);
    }
  }

  /**
   * Atualiza métricas de performance
   */
  updatePerformanceMetrics(systemMetrics) {
    const performance = this.dashboardData.metrics.performance;
    const current = systemMetrics.current;
    
    if (current && current.cpu && current.memory && current.disk) {
      // CPU
      performance.cpu.current = current.cpu.usage;
      performance.cpu.peak = Math.max(performance.cpu.peak, current.cpu.usage);
      
      // Memória
      performance.memory.current = current.memory.usage;
      performance.memory.peak = Math.max(performance.memory.peak, current.memory.usage);
      
      // Disco
       performance.disk.current = current.disk.usage;
       performance.disk.peak = Math.max(performance.disk.peak, current.disk.usage);
     }
     
     // Calcular médias (últimos 10 registros)
    const recentHistory = this.dashboardData.history.performance.slice(-10);
    if (recentHistory.length > 0) {
      performance.cpu.average = recentHistory.reduce((sum, record) => sum + record.cpu, 0) / recentHistory.length;
      performance.memory.average = recentHistory.reduce((sum, record) => sum + record.memory, 0) / recentHistory.length;
      performance.disk.average = recentHistory.reduce((sum, record) => sum + record.disk, 0) / recentHistory.length;
    }
  }

  /**
   * Coleta métricas de gravação
   */
  async collectRecordingMetrics() {
    try {
      // Obter número de câmeras ativas
      const { data: activeCameras, error: camerasError } = await supabase
        .from('cameras')
        .select('id')
        .eq('status', 'active');
      
      if (!camerasError) {
        this.dashboardData.metrics.recording.activeCameras = activeCameras?.length || 0;
      }
      
      // Obter total de gravações
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('id', { count: 'exact' });
      
      if (!recordingsError) {
        this.dashboardData.metrics.recording.totalRecordings = recordings?.length || 0;
      }
      
      // Obter erros de gravação (últimas 24 horas)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const { data: errors, error: errorsError } = await supabase
        .from('system_logs')
        .select('id')
        .eq('level', 'error')
        .like('message', '%recording%')
        .gte('created_at', yesterday.toISOString());
      
      if (!errorsError) {
        this.dashboardData.metrics.recording.recordingErrors = errors?.length || 0;
      }
      
      // Calcular uso de armazenamento
      await this.calculateStorageUsage();
      
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao coletar métricas de gravação:', error);
    }
  }

  /**
   * Coleta métricas de alertas
   */
  async collectAlertMetrics() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Obter alertas das últimas 24 horas
      const { data: alerts, error: alertsError } = await supabase
        .from('system_logs')
        .select('level')
        .in('level', ['warning', 'error', 'critical'])
        .gte('created_at', yesterday.toISOString());
      
      if (!alertsError && alerts) {
        this.dashboardData.metrics.alerts.total = alerts.length;
        this.dashboardData.metrics.alerts.critical = alerts.filter(a => a.level === 'critical').length;
        this.dashboardData.metrics.alerts.warnings = alerts.filter(a => a.level === 'warning').length;
      }
      
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao coletar métricas de alertas:', error);
    }
  }

  /**
   * Calcula uso de armazenamento
   */
  async calculateStorageUsage() {
    try {
      // Implementar cálculo de uso de armazenamento
      // Por enquanto, usar valor simulado
      this.dashboardData.metrics.recording.storageUsed = 0;
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao calcular uso de armazenamento:', error);
    }
  }

  /**
   * Executa verificações de saúde dos serviços
   */
  async performHealthChecks() {
    try {
      const timestamp = new Date();
      
      // Verificar serviço de gravação
      await this.checkRecordingService();
      
      // Verificar serviço de streaming
      await this.checkStreamingService();
      
      // Verificar armazenamento
      await this.checkStorageService();
      
      // Verificar banco de dados
      await this.checkDatabaseService();
      
      // Verificar serviços de monitoramento
      await this.checkMonitoringServices();
      
      // Atualizar status geral
      this.updateSystemStatus();
      
      // Emitir evento de verificação concluída
      this.emit('healthCheckCompleted', this.dashboardData.services);
      
    } catch (error) {
      logger.error('[HealthDashboard] Erro durante verificações de saúde:', error);
    }
  }

  /**
   * Verifica serviço de gravação
   */
  async checkRecordingService() {
    try {
      // Verificar se há câmeras ativas gravando
      const { data: activeCameras } = await supabase
        .from('cameras')
        .select('id')
        .eq('status', 'active');
      
      const status = activeCameras && activeCameras.length > 0 ? 'healthy' : 'warning';
      
      this.dashboardData.services.recording = {
        status,
        lastCheck: new Date(),
        details: {
          activeCameras: activeCameras?.length || 0
        }
      };
      
    } catch (error) {
      this.dashboardData.services.recording = {
        status: 'error',
        lastCheck: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Verifica serviço de streaming
   */
  async checkStreamingService() {
    try {
      // Verificar conectividade com ZLMediaKit
      const zlmApiUrl = process.env.ZLM_BASE_URL || 'http://localhost:8000';
        const response = await fetch(`${zlmApiUrl}/index/api/getServerConfig?secret=${process.env.ZLMEDIAKIT_SECRET || process.env.ZLM_SECRET || '035c73f7-bb6b-4889-a715-d9eb2d1925cc'}`);
      
      if (response.ok) {
        this.dashboardData.services.streaming = {
          status: 'healthy',
          lastCheck: new Date(),
          details: {
            responseTime: Date.now() - response.headers.get('date')
          }
        };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
      
    } catch (error) {
      this.dashboardData.services.streaming = {
        status: 'error',
        lastCheck: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Verifica serviço de armazenamento
   */
  async checkStorageService() {
    try {
      // Verificar espaço em disco
      const systemMetrics = await systemMonitoringService.getSystemMetrics();
      
      let status = 'healthy';
      if (systemMetrics.disk.usagePercent > this.healthThresholds.disk.critical) {
        status = 'critical';
      } else if (systemMetrics.disk.usagePercent > this.healthThresholds.disk.warning) {
        status = 'warning';
      }
      
      this.dashboardData.services.storage = {
        status,
        lastCheck: new Date(),
        details: {
          diskUsage: systemMetrics.disk.usagePercent,
          freeSpace: systemMetrics.disk.free
        }
      };
      
    } catch (error) {
      this.dashboardData.services.storage = {
        status: 'error',
        lastCheck: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Verifica serviço de banco de dados
   */
  async checkDatabaseService() {
    try {
      const startTime = Date.now();
      
      // Teste simples de conectividade
      const { data, error } = await supabase
        .from('cameras')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - startTime;
      
      if (error) {
        throw new Error(error.message);
      }
      
      let status = 'healthy';
      if (responseTime > this.healthThresholds.responseTime.critical) {
        status = 'critical';
      } else if (responseTime > this.healthThresholds.responseTime.warning) {
        status = 'warning';
      }
      
      this.dashboardData.services.database = {
        status,
        lastCheck: new Date(),
        details: {
          responseTime
        }
      };
      
    } catch (error) {
      this.dashboardData.services.database = {
        status: 'error',
        lastCheck: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Verifica serviços de monitoramento
   */
  async checkMonitoringServices() {
    try {
      // Verificar serviço de monitoramento
      const monitoringStatus = systemMonitoringService.isMonitoring ? 'healthy' : 'warning';
      this.dashboardData.services.monitoring = {
        status: monitoringStatus,
        lastCheck: new Date()
      };
      
      // Verificar serviço de alertas
      const alertsStatus = alertService.isInitialized ? 'healthy' : 'warning';
      this.dashboardData.services.alerts = {
        status: alertsStatus,
        lastCheck: new Date()
      };
      
      // Verificar serviço de limpeza
      const cleanupStatus = cleanupService.getCleanupStatus();
      this.dashboardData.services.cleanup = {
        status: cleanupStatus.isRunning ? 'healthy' : 'warning',
        lastCheck: new Date()
      };
      
      // Verificar serviço de backup
      this.dashboardData.services.backup = {
        status: 'healthy', // Assumir saudável por enquanto
        lastCheck: new Date()
      };
      
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao verificar serviços de monitoramento:', error);
    }
  }

  /**
   * Atualiza status geral do sistema
   */
  updateSystemStatus() {
    const services = Object.values(this.dashboardData.services);
    
    // Determinar status geral baseado nos serviços
    const hasError = services.some(service => service.status === 'error');
    const hasCritical = services.some(service => service.status === 'critical');
    const hasWarning = services.some(service => service.status === 'warning');
    
    let systemStatus = 'healthy';
    
    if (hasError || hasCritical) {
      systemStatus = 'critical';
    } else if (hasWarning) {
      systemStatus = 'warning';
    }
    
    this.dashboardData.system.status = systemStatus;
    
    // Emitir evento se status mudou
    this.emit('systemStatusChanged', systemStatus);
  }

  /**
   * Adiciona evento ao histórico
   */
  addToHistory(type, data) {
    if (!this.dashboardData.history[type]) {
      this.dashboardData.history[type] = [];
    }
    
    this.dashboardData.history[type].push(data);
    
    // Manter apenas últimos 100 registros
    if (this.dashboardData.history[type].length > 100) {
      this.dashboardData.history[type] = this.dashboardData.history[type].slice(-100);
    }
  }

  /**
   * Obtém dados completos do dashboard
   */
  getDashboardData() {
    return {
      ...this.dashboardData,
      timestamp: new Date()
    };
  }

  /**
   * Obtém resumo de saúde do sistema
   */
  getHealthSummary() {
    return {
      system: this.dashboardData.system,
      services: this.dashboardData.services,
      metrics: {
        performance: this.dashboardData.metrics.performance,
        alerts: this.dashboardData.metrics.alerts
      },
      timestamp: new Date()
    };
  }

  /**
   * Obtém métricas de performance
   */
  getPerformanceMetrics() {
    return {
      current: this.dashboardData.metrics.performance,
      history: this.dashboardData.history.performance.slice(-50), // Últimos 50 registros
      timestamp: new Date()
    };
  }

  /**
   * Carrega configurações do dashboard
   */
  async loadDashboardConfig() {
    try {
      const configPath = path.join(__dirname, '../config/dashboard.json');
      
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Aplicar configurações carregadas
        if (config.thresholds) {
          Object.assign(this.healthThresholds, config.thresholds);
        }
        
        logger.info('[HealthDashboard] Configurações do dashboard carregadas');
      } catch (error) {
        // Usar configurações padrão se arquivo não existir
        logger.info('[HealthDashboard] Usando configurações padrão do dashboard');
      }
    } catch (error) {
      logger.error('[HealthDashboard] Erro ao carregar configurações:', error);
    }
  }

  /**
   * Força atualização de métricas
   */
  async forceUpdate() {
    try {
      await this.collectMetrics();
      await this.performHealthChecks();
      
      return this.getDashboardData();
    } catch (error) {
      logger.error('[HealthDashboard] Erro durante atualização forçada:', error);
      throw error;
    }
  }

  /**
   * Obtém status de um serviço específico
   */
  getServiceStatus(serviceName) {
    return this.dashboardData.services[serviceName] || null;
  }

  /**
   * Registra evento personalizado
   */
  logEvent(type, description, severity = 'info') {
    const event = {
      type,
      description,
      severity,
      timestamp: new Date()
    };
    
    this.addToHistory('events', event);
    this.emit('eventLogged', event);
    
    logger.info(`[HealthDashboard] Evento registrado: ${type} - ${description}`);
  }
}

export default new HealthDashboardService();