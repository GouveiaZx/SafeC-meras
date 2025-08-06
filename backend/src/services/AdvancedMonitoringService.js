import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from '../config/logger.js';
import { EventEmitter } from 'events';
import os from 'os';
import fs from 'fs/promises';
import axios from 'axios';

const logger = createModuleLogger('AdvancedMonitoringService');

/**
 * Serviço de monitoramento avançado com métricas de saúde
 * Coleta e analisa métricas do sistema, streams, gravações e performance
 * Fornece alertas proativos e dashboards de monitoramento
 */
class AdvancedMonitoringService extends EventEmitter {
  constructor() {
    super();
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Configurações
    this.config = {
      // Intervalo de coleta de métricas (em segundos)
      metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60,
      // Intervalo de análise de saúde (em segundos)
      healthAnalysisInterval: parseInt(process.env.HEALTH_ANALYSIS_INTERVAL) || 300,
      // Retenção de métricas (em dias)
      metricsRetention: parseInt(process.env.METRICS_RETENTION) || 30,
      // Limites de alerta
      alertThresholds: {
        cpuUsage: parseFloat(process.env.CPU_ALERT_THRESHOLD) || 80,
        memoryUsage: parseFloat(process.env.MEMORY_ALERT_THRESHOLD) || 85,
        diskUsage: parseFloat(process.env.DISK_ALERT_THRESHOLD) || 90,
        streamFailureRate: parseFloat(process.env.STREAM_FAILURE_RATE_THRESHOLD) || 10,
        recordingFailureRate: parseFloat(process.env.RECORDING_FAILURE_RATE_THRESHOLD) || 5,
        responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD) || 5000,
        errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 5
      },
      // URLs de serviços externos
      zlmApiUrl: process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080',
      zlmSecret: process.env.ZLMEDIAKIT_SECRET || 'your_secret_here',
      // Configurações de notificação
      enableAlerts: process.env.ENABLE_ALERTS !== 'false',
      alertCooldown: parseInt(process.env.ALERT_COOLDOWN) || 300, // 5 minutos
      // Configurações de performance
      enablePerformanceTracking: process.env.ENABLE_PERFORMANCE_TRACKING !== 'false',
      enableDetailedMetrics: process.env.ENABLE_DETAILED_METRICS !== 'false'
    };
    
    // Estado interno
    this.isRunning = false;
    this.metricsTimer = null;
    this.healthTimer = null;
    this.cleanupTimer = null;
    this.lastAlerts = new Map();
    
    // Cache de métricas
    this.metricsCache = {
      system: null,
      streams: null,
      recordings: null,
      performance: null,
      lastUpdate: null
    };
    
    // Contadores de performance
    this.performanceCounters = {
      requests: 0,
      errors: 0,
      totalResponseTime: 0,
      slowRequests: 0,
      startTime: new Date()
    };
    
    logger.info('[AdvancedMonitoringService] Serviço inicializado com configurações:', this.config);
  }

  /**
   * Iniciar o serviço de monitoramento
   * @returns {Promise<void>}
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('[AdvancedMonitoringService] Serviço já está em execução');
        return;
      }
      
      logger.info('[AdvancedMonitoringService] 📊 Iniciando serviço de monitoramento avançado');
      
      this.isRunning = true;
      this.performanceCounters.startTime = new Date();
      
      // Iniciar coleta de métricas
      this.startMetricsCollection();
      
      // Iniciar análise de saúde
      this.startHealthAnalysis();
      
      // Iniciar limpeza automática
      this.startCleanup();
      
      // Coleta inicial
      await this.collectAllMetrics();
      
      this.emit('serviceStarted');
      
      logger.info('[AdvancedMonitoringService] ✅ Serviço iniciado com sucesso');
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao iniciar serviço:', error);
      throw error;
    }
  }

  /**
   * Parar o serviço de monitoramento
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (!this.isRunning) {
        logger.warn('[AdvancedMonitoringService] Serviço já está parado');
        return;
      }
      
      logger.info('[AdvancedMonitoringService] 🛑 Parando serviço de monitoramento');
      
      this.isRunning = false;
      
      // Parar timers
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }
      
      if (this.healthTimer) {
        clearInterval(this.healthTimer);
        this.healthTimer = null;
      }
      
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      
      // Salvar métricas finais
      await this.collectAllMetrics();
      
      this.emit('serviceStopped');
      
      logger.info('[AdvancedMonitoringService] ✅ Serviço parado com sucesso');
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao parar serviço:', error);
    }
  }

  /**
   * Iniciar coleta de métricas periódica
   */
  startMetricsCollection() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    this.metricsTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.collectAllMetrics();
      }
    }, this.config.metricsInterval * 1000);
    
    logger.info(`[AdvancedMonitoringService] 📈 Coleta de métricas iniciada (intervalo: ${this.config.metricsInterval}s)`);
  }

  /**
   * Iniciar análise de saúde periódica
   */
  startHealthAnalysis() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
    
    this.healthTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthAnalysis();
      }
    }, this.config.healthAnalysisInterval * 1000);
    
    logger.info(`[AdvancedMonitoringService] 🔍 Análise de saúde iniciada (intervalo: ${this.config.healthAnalysisInterval}s)`);
  }

  /**
   * Coletar todas as métricas
   * @returns {Promise<void>}
   */
  async collectAllMetrics() {
    try {
      logger.debug('[AdvancedMonitoringService] 📊 Coletando métricas...');
      
      const timestamp = new Date();
      
      // Coletar métricas em paralelo
      const [systemMetrics, streamMetrics, recordingMetrics, performanceMetrics] = await Promise.allSettled([
        this.collectSystemMetrics(),
        this.collectStreamMetrics(),
        this.collectRecordingMetrics(),
        this.collectPerformanceMetrics()
      ]);
      
      // Processar resultados
      const metrics = {
        timestamp,
        system: systemMetrics.status === 'fulfilled' ? systemMetrics.value : null,
        streams: streamMetrics.status === 'fulfilled' ? streamMetrics.value : null,
        recordings: recordingMetrics.status === 'fulfilled' ? recordingMetrics.value : null,
        performance: performanceMetrics.status === 'fulfilled' ? performanceMetrics.value : null
      };
      
      // Atualizar cache
      this.metricsCache = {
        ...metrics,
        lastUpdate: timestamp
      };
      
      // Salvar no banco de dados
      await this.saveMetrics(metrics);
      
      // Emitir evento
      this.emit('metricsCollected', metrics);
      
      logger.debug('[AdvancedMonitoringService] ✅ Métricas coletadas com sucesso');
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro na coleta de métricas:', error);
    }
  }

  /**
   * Coletar métricas do sistema
   * @returns {Promise<Object>} - Métricas do sistema
   */
  async collectSystemMetrics() {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // Calcular uso de CPU
      const cpuUsage = await this.getCpuUsage();
      
      // Obter informações de disco
      const diskInfo = await this.getDiskUsage();
      
      // Informações de rede
      const networkInterfaces = os.networkInterfaces();
      
      return {
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown',
          speed: cpus[0]?.speed || 0
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: (usedMem / totalMem) * 100
        },
        disk: diskInfo,
        network: {
          interfaces: Object.keys(networkInterfaces).length,
          details: networkInterfaces
        },
        os: {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          uptime: os.uptime(),
          loadavg: os.loadavg()
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      };
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao coletar métricas do sistema:', error);
      return null;
    }
  }

  /**
   * Coletar métricas de streams
   * @returns {Promise<Object>} - Métricas de streams
   */
  async collectStreamMetrics() {
    try {
      // Buscar streams do banco de dados
      const { data: streams, error: dbError } = await this.supabase
        .from('streams')
        .select('id, status, camera_id, url, created_at, updated_at');
      
      if (dbError) {
        throw dbError;
      }
      
      // Buscar streams ativos no ZLMediaKit
      const zlmStreams = await this.getZLMStreams();
      
      // Calcular estatísticas
      const totalStreams = streams?.length || 0;
      const activeStreams = streams?.filter(s => s.status === 'active').length || 0;
      const inactiveStreams = totalStreams - activeStreams;
      const zlmActiveStreams = zlmStreams?.length || 0;
      
      // Calcular taxa de falha
      const failureRate = totalStreams > 0 ? ((totalStreams - activeStreams) / totalStreams) * 100 : 0;
      
      // Métricas detalhadas por câmera
      const cameraMetrics = await this.getCameraMetrics(streams || []);
      
      return {
        total: totalStreams,
        active: activeStreams,
        inactive: inactiveStreams,
        zlmActive: zlmActiveStreams,
        failureRate,
        discrepancy: Math.abs(activeStreams - zlmActiveStreams),
        cameras: cameraMetrics,
        statusDistribution: this.calculateStatusDistribution(streams || []),
        avgUptime: await this.calculateAverageUptime(streams || [])
      };
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao coletar métricas de streams:', error);
      return null;
    }
  }

  /**
   * Coletar métricas de gravações
   * @returns {Promise<Object>} - Métricas de gravações
   */
  async collectRecordingMetrics() {
    try {
      // Buscar gravações recentes (últimas 24 horas)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, status, duration, file_size, created_at, updated_at, camera_id')
        .gte('created_at', yesterday.toISOString());
      
      if (error) {
        throw error;
      }
      
      const totalRecordings = recordings?.length || 0;
      const completedRecordings = recordings?.filter(r => r.status === 'completed').length || 0;
      const failedRecordings = recordings?.filter(r => r.status === 'failed').length || 0;
      const inProgressRecordings = recordings?.filter(r => r.status === 'recording').length || 0;
      
      // Calcular estatísticas
      const successRate = totalRecordings > 0 ? (completedRecordings / totalRecordings) * 100 : 100;
      const failureRate = totalRecordings > 0 ? (failedRecordings / totalRecordings) * 100 : 0;
      
      // Calcular tamanho total e duração
      const totalSize = recordings?.reduce((sum, r) => sum + (r.file_size || 0), 0) || 0;
      const totalDuration = recordings?.reduce((sum, r) => sum + (r.duration || 0), 0) || 0;
      const avgDuration = totalRecordings > 0 ? totalDuration / totalRecordings : 0;
      
      // Métricas por câmera
      const cameraRecordingMetrics = await this.getCameraRecordingMetrics(recordings || []);
      
      return {
        total: totalRecordings,
        completed: completedRecordings,
        failed: failedRecordings,
        inProgress: inProgressRecordings,
        successRate,
        failureRate,
        totalSize,
        totalDuration,
        avgDuration,
        cameras: cameraRecordingMetrics,
        statusDistribution: this.calculateStatusDistribution(recordings || [], 'status'),
        sizeDistribution: this.calculateSizeDistribution(recordings || [])
      };
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao coletar métricas de gravações:', error);
      return null;
    }
  }

  /**
   * Coletar métricas de performance
   * @returns {Promise<Object>} - Métricas de performance
   */
  async collectPerformanceMetrics() {
    try {
      if (!this.config.enablePerformanceTracking) {
        return null;
      }
      
      const uptime = process.uptime();
      const totalRequests = this.performanceCounters.requests;
      const totalErrors = this.performanceCounters.errors;
      const avgResponseTime = totalRequests > 0 ? this.performanceCounters.totalResponseTime / totalRequests : 0;
      const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
      const requestsPerSecond = uptime > 0 ? totalRequests / uptime : 0;
      
      // Métricas de API externa (ZLMediaKit)
      const zlmHealth = await this.checkZLMHealth();
      
      return {
        uptime,
        requests: {
          total: totalRequests,
          errors: totalErrors,
          slow: this.performanceCounters.slowRequests,
          perSecond: requestsPerSecond
        },
        response: {
          average: avgResponseTime,
          threshold: this.config.alertThresholds.responseTime
        },
        errorRate,
        external: {
          zlmediakit: zlmHealth
        },
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      };
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao coletar métricas de performance:', error);
      return null;
    }
  }

  /**
   * Obter uso de CPU
   * @returns {Promise<number>} - Percentual de uso de CPU
   */
  async getCpuUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime(startTime);
        
        const totalTime = endTime[0] * 1000000 + endTime[1] / 1000; // microseconds
        const cpuTime = (endUsage.user + endUsage.system); // microseconds
        
        const cpuPercent = (cpuTime / totalTime) * 100;
        resolve(Math.min(100, Math.max(0, cpuPercent)));
      }, 100);
    });
  }

  /**
   * Obter uso de disco
   * @returns {Promise<Object>} - Informações de uso de disco
   */
  async getDiskUsage() {
    try {
      const stats = await fs.stat('.');
      
      // Para Windows, usar informações básicas
      if (os.platform() === 'win32') {
        return {
          total: 0,
          used: 0,
          free: 0,
          usage: 0,
          available: true
        };
      }
      
      // Para sistemas Unix-like, tentar obter informações mais detalhadas
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
        available: true
      };
      
    } catch (error) {
      logger.debug('[AdvancedMonitoringService] Erro ao obter uso de disco:', error.message);
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Obter streams do ZLMediaKit
   * @returns {Promise<Array>} - Lista de streams ativos
   */
  async getZLMStreams() {
    try {
      const response = await axios.get(`${this.config.zlmApiUrl}/index/api/getMediaList`, {
        params: {
          secret: this.config.zlmSecret
        },
        timeout: 5000
      });
      
      if (response.data && response.data.code === 0) {
        return response.data.data || [];
      }
      
      return [];
      
    } catch (error) {
      logger.debug('[AdvancedMonitoringService] Erro ao buscar streams do ZLM:', error.message);
      return [];
    }
  }

  /**
   * Verificar saúde do ZLMediaKit
   * @returns {Promise<Object>} - Status de saúde
   */
  async checkZLMHealth() {
    try {
      const startTime = Date.now();
      
      const response = await axios.get(`${this.config.zlmApiUrl}/index/api/getServerConfig`, {
        params: {
          secret: this.config.zlmSecret
        },
        timeout: 5000
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        available: true,
        responseTime,
        status: response.status,
        version: response.data?.data?.version || 'unknown'
      };
      
    } catch (error) {
      return {
        available: false,
        error: error.message,
        responseTime: null
      };
    }
  }

  /**
   * Calcular métricas por câmera
   * @param {Array} streams - Lista de streams
   * @returns {Promise<Object>} - Métricas por câmera
   */
  async getCameraMetrics(streams) {
    const cameraGroups = streams.reduce((groups, stream) => {
      const cameraId = stream.camera_id;
      if (!groups[cameraId]) {
        groups[cameraId] = [];
      }
      groups[cameraId].push(stream);
      return groups;
    }, {});
    
    const metrics = {};
    
    for (const [cameraId, cameraStreams] of Object.entries(cameraGroups)) {
      const total = cameraStreams.length;
      const active = cameraStreams.filter(s => s.status === 'active').length;
      
      metrics[cameraId] = {
        total,
        active,
        inactive: total - active,
        successRate: total > 0 ? (active / total) * 100 : 0
      };
    }
    
    return metrics;
  }

  /**
   * Calcular métricas de gravação por câmera
   * @param {Array} recordings - Lista de gravações
   * @returns {Promise<Object>} - Métricas por câmera
   */
  async getCameraRecordingMetrics(recordings) {
    const cameraGroups = recordings.reduce((groups, recording) => {
      const cameraId = recording.camera_id;
      if (!groups[cameraId]) {
        groups[cameraId] = [];
      }
      groups[cameraId].push(recording);
      return groups;
    }, {});
    
    const metrics = {};
    
    for (const [cameraId, cameraRecordings] of Object.entries(cameraGroups)) {
      const total = cameraRecordings.length;
      const completed = cameraRecordings.filter(r => r.status === 'completed').length;
      const totalSize = cameraRecordings.reduce((sum, r) => sum + (r.file_size || 0), 0);
      const totalDuration = cameraRecordings.reduce((sum, r) => sum + (r.duration || 0), 0);
      
      metrics[cameraId] = {
        total,
        completed,
        failed: cameraRecordings.filter(r => r.status === 'failed').length,
        successRate: total > 0 ? (completed / total) * 100 : 0,
        totalSize,
        totalDuration,
        avgDuration: total > 0 ? totalDuration / total : 0
      };
    }
    
    return metrics;
  }

  /**
   * Calcular distribuição de status
   * @param {Array} items - Lista de itens
   * @param {string} field - Campo de status
   * @returns {Object} - Distribuição de status
   */
  calculateStatusDistribution(items, field = 'status') {
    const distribution = {};
    
    items.forEach(item => {
      const status = item[field] || 'unknown';
      distribution[status] = (distribution[status] || 0) + 1;
    });
    
    return distribution;
  }

  /**
   * Calcular distribuição de tamanhos
   * @param {Array} recordings - Lista de gravações
   * @returns {Object} - Distribuição de tamanhos
   */
  calculateSizeDistribution(recordings) {
    const ranges = {
      'small': 0,    // < 100MB
      'medium': 0,   // 100MB - 1GB
      'large': 0,    // 1GB - 5GB
      'xlarge': 0    // > 5GB
    };
    
    recordings.forEach(recording => {
      const size = recording.file_size || 0;
      const sizeMB = size / (1024 * 1024);
      
      if (sizeMB < 100) {
        ranges.small++;
      } else if (sizeMB < 1024) {
        ranges.medium++;
      } else if (sizeMB < 5120) {
        ranges.large++;
      } else {
        ranges.xlarge++;
      }
    });
    
    return ranges;
  }

  /**
   * Calcular tempo médio de atividade
   * @param {Array} streams - Lista de streams
   * @returns {Promise<number>} - Tempo médio em segundos
   */
  async calculateAverageUptime(streams) {
    const now = new Date();
    let totalUptime = 0;
    let activeStreams = 0;
    
    streams.forEach(stream => {
      if (stream.status === 'active' && stream.created_at) {
        const createdAt = new Date(stream.created_at);
        const uptime = (now - createdAt) / 1000; // segundos
        totalUptime += uptime;
        activeStreams++;
      }
    });
    
    return activeStreams > 0 ? totalUptime / activeStreams : 0;
  }

  /**
   * Salvar métricas no banco de dados
   * @param {Object} metrics - Métricas coletadas
   * @returns {Promise<void>}
   */
  async saveMetrics(metrics) {
    try {
      const metricsData = {
        timestamp: metrics.timestamp.toISOString(),
        system_metrics: metrics.system,
        stream_metrics: metrics.streams,
        recording_metrics: metrics.recordings,
        performance_metrics: metrics.performance,
        created_at: new Date().toISOString()
      };
      
      const { error } = await this.supabase
        .from('system_metrics')
        .insert(metricsData);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao salvar métricas:', error);
    }
  }

  /**
   * Realizar análise de saúde
   * @returns {Promise<void>}
   */
  async performHealthAnalysis() {
    try {
      logger.debug('[AdvancedMonitoringService] 🔍 Realizando análise de saúde...');
      
      if (!this.metricsCache.lastUpdate) {
        logger.debug('[AdvancedMonitoringService] Nenhuma métrica disponível para análise');
        return;
      }
      
      const alerts = [];
      
      // Analisar métricas do sistema
      if (this.metricsCache.system) {
        alerts.push(...this.analyzeSystemHealth(this.metricsCache.system));
      }
      
      // Analisar métricas de streams
      if (this.metricsCache.streams) {
        alerts.push(...this.analyzeStreamHealth(this.metricsCache.streams));
      }
      
      // Analisar métricas de gravações
      if (this.metricsCache.recordings) {
        alerts.push(...this.analyzeRecordingHealth(this.metricsCache.recordings));
      }
      
      // Analisar métricas de performance
      if (this.metricsCache.performance) {
        alerts.push(...this.analyzePerformanceHealth(this.metricsCache.performance));
      }
      
      // Processar alertas
      for (const alert of alerts) {
        await this.processAlert(alert);
      }
      
      this.emit('healthAnalysisCompleted', { alerts, timestamp: new Date() });
      
      logger.debug(`[AdvancedMonitoringService] ✅ Análise de saúde concluída (${alerts.length} alertas)`);
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro na análise de saúde:', error);
    }
  }

  /**
   * Analisar saúde do sistema
   * @param {Object} systemMetrics - Métricas do sistema
   * @returns {Array} - Lista de alertas
   */
  analyzeSystemHealth(systemMetrics) {
    const alerts = [];
    
    // Verificar uso de CPU
    if (systemMetrics.cpu.usage > this.config.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'system',
        severity: 'warning',
        metric: 'cpu_usage',
        value: systemMetrics.cpu.usage,
        threshold: this.config.alertThresholds.cpuUsage,
        message: `Alto uso de CPU: ${systemMetrics.cpu.usage.toFixed(1)}%`
      });
    }
    
    // Verificar uso de memória
    if (systemMetrics.memory.usage > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'system',
        severity: 'warning',
        metric: 'memory_usage',
        value: systemMetrics.memory.usage,
        threshold: this.config.alertThresholds.memoryUsage,
        message: `Alto uso de memória: ${systemMetrics.memory.usage.toFixed(1)}%`
      });
    }
    
    // Verificar uso de disco
    if (systemMetrics.disk.usage > this.config.alertThresholds.diskUsage) {
      alerts.push({
        type: 'system',
        severity: 'critical',
        metric: 'disk_usage',
        value: systemMetrics.disk.usage,
        threshold: this.config.alertThresholds.diskUsage,
        message: `Alto uso de disco: ${systemMetrics.disk.usage.toFixed(1)}%`
      });
    }
    
    return alerts;
  }

  /**
   * Analisar saúde dos streams
   * @param {Object} streamMetrics - Métricas de streams
   * @returns {Array} - Lista de alertas
   */
  analyzeStreamHealth(streamMetrics) {
    const alerts = [];
    
    // Verificar taxa de falha de streams
    if (streamMetrics.failureRate > this.config.alertThresholds.streamFailureRate) {
      alerts.push({
        type: 'streams',
        severity: 'warning',
        metric: 'failure_rate',
        value: streamMetrics.failureRate,
        threshold: this.config.alertThresholds.streamFailureRate,
        message: `Alta taxa de falha de streams: ${streamMetrics.failureRate.toFixed(1)}%`
      });
    }
    
    // Verificar discrepância entre banco e ZLM
    if (streamMetrics.discrepancy > 5) {
      alerts.push({
        type: 'streams',
        severity: 'warning',
        metric: 'discrepancy',
        value: streamMetrics.discrepancy,
        threshold: 5,
        message: `Discrepância entre banco de dados e ZLMediaKit: ${streamMetrics.discrepancy} streams`
      });
    }
    
    return alerts;
  }

  /**
   * Analisar saúde das gravações
   * @param {Object} recordingMetrics - Métricas de gravações
   * @returns {Array} - Lista de alertas
   */
  analyzeRecordingHealth(recordingMetrics) {
    const alerts = [];
    
    // Verificar taxa de falha de gravações
    if (recordingMetrics.failureRate > this.config.alertThresholds.recordingFailureRate) {
      alerts.push({
        type: 'recordings',
        severity: 'warning',
        metric: 'failure_rate',
        value: recordingMetrics.failureRate,
        threshold: this.config.alertThresholds.recordingFailureRate,
        message: `Alta taxa de falha de gravações: ${recordingMetrics.failureRate.toFixed(1)}%`
      });
    }
    
    return alerts;
  }

  /**
   * Analisar saúde da performance
   * @param {Object} performanceMetrics - Métricas de performance
   * @returns {Array} - Lista de alertas
   */
  analyzePerformanceHealth(performanceMetrics) {
    const alerts = [];
    
    // Verificar tempo de resposta
    if (performanceMetrics.response.average > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'performance',
        severity: 'warning',
        metric: 'response_time',
        value: performanceMetrics.response.average,
        threshold: this.config.alertThresholds.responseTime,
        message: `Alto tempo de resposta: ${performanceMetrics.response.average.toFixed(0)}ms`
      });
    }
    
    // Verificar taxa de erro
    if (performanceMetrics.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'performance',
        severity: 'warning',
        metric: 'error_rate',
        value: performanceMetrics.errorRate,
        threshold: this.config.alertThresholds.errorRate,
        message: `Alta taxa de erro: ${performanceMetrics.errorRate.toFixed(1)}%`
      });
    }
    
    // Verificar disponibilidade do ZLMediaKit
    if (performanceMetrics.external.zlmediakit && !performanceMetrics.external.zlmediakit.available) {
      alerts.push({
        type: 'external',
        severity: 'critical',
        metric: 'zlm_availability',
        value: false,
        threshold: true,
        message: 'ZLMediaKit não está disponível'
      });
    }
    
    return alerts;
  }

  /**
   * Processar alerta
   * @param {Object} alert - Dados do alerta
   * @returns {Promise<void>}
   */
  async processAlert(alert) {
    try {
      if (!this.config.enableAlerts) {
        return;
      }
      
      const alertKey = `${alert.type}_${alert.metric}`;
      const lastAlert = this.lastAlerts.get(alertKey);
      const now = new Date();
      
      // Verificar cooldown
      if (lastAlert && (now - lastAlert) < this.config.alertCooldown * 1000) {
        return;
      }
      
      // Salvar alerta
      await this.saveAlert(alert);
      
      // Atualizar último alerta
      this.lastAlerts.set(alertKey, now);
      
      // Emitir evento
      this.emit('alertTriggered', alert);
      
      logger.warn(`[AdvancedMonitoringService] 🚨 Alerta: ${alert.message}`);
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao processar alerta:', error);
    }
  }

  /**
   * Salvar alerta no banco de dados
   * @param {Object} alert - Dados do alerta
   * @returns {Promise<void>}
   */
  async saveAlert(alert) {
    try {
      const alertData = {
        type: alert.type,
        severity: alert.severity,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
        message: alert.message,
        timestamp: new Date().toISOString(),
        resolved: false,
        created_at: new Date().toISOString()
      };
      
      const { error } = await this.supabase
        .from('system_alerts')
        .insert(alertData);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro ao salvar alerta:', error);
    }
  }

  /**
   * Registrar requisição para métricas de performance
   * @param {number} responseTime - Tempo de resposta em ms
   * @param {boolean} isError - Se foi um erro
   */
  recordRequest(responseTime, isError = false) {
    if (!this.config.enablePerformanceTracking) {
      return;
    }
    
    this.performanceCounters.requests++;
    this.performanceCounters.totalResponseTime += responseTime;
    
    if (isError) {
      this.performanceCounters.errors++;
    }
    
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.performanceCounters.slowRequests++;
    }
  }

  /**
   * Iniciar limpeza automática
   */
  startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.performCleanup();
      }
    }, 24 * 60 * 60 * 1000); // 24 horas
    
    logger.info('[AdvancedMonitoringService] 🧹 Limpeza automática iniciada (intervalo: 24h)');
  }

  /**
   * Realizar limpeza de dados antigos
   * @returns {Promise<void>}
   */
  async performCleanup() {
    try {
      logger.info('[AdvancedMonitoringService] 🧹 Realizando limpeza de dados antigos');
      
      const cutoffDate = new Date(Date.now() - this.config.metricsRetention * 24 * 60 * 60 * 1000);
      
      // Limpar métricas antigas
      const { error: metricsError } = await this.supabase
        .from('system_metrics')
        .delete()
        .lt('created_at', cutoffDate.toISOString());
      
      if (metricsError) {
        logger.error('[AdvancedMonitoringService] Erro ao limpar métricas:', metricsError);
      }
      
      // Limpar alertas resolvidos antigos
      const { error: alertsError } = await this.supabase
        .from('system_alerts')
        .delete()
        .eq('resolved', true)
        .lt('created_at', cutoffDate.toISOString());
      
      if (alertsError) {
        logger.error('[AdvancedMonitoringService] Erro ao limpar alertas:', alertsError);
      }
      
      logger.info('[AdvancedMonitoringService] ✅ Limpeza concluída');
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro na limpeza:', error);
    }
  }

  /**
   * Obter métricas atuais
   * @returns {Object} - Métricas em cache
   */
  getCurrentMetrics() {
    return this.metricsCache;
  }

  /**
   * Obter estatísticas do serviço
   * @returns {Object} - Estatísticas
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastMetricsUpdate: this.metricsCache.lastUpdate,
      performanceCounters: { ...this.performanceCounters },
      activeAlerts: this.lastAlerts.size,
      config: this.config
    };
  }

  /**
   * Limpar recursos
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      logger.info('[AdvancedMonitoringService] Limpando recursos...');
      
      await this.stop();
      
      logger.info('[AdvancedMonitoringService] Recursos limpos com sucesso');
      
    } catch (error) {
      logger.error('[AdvancedMonitoringService] Erro na limpeza:', error);
    }
  }
}

export default new AdvancedMonitoringService();