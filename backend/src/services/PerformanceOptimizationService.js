/**
 * Serviço de Otimização de Performance
 * Monitora e otimiza automaticamente a performance do sistema de gravações
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import alertService from './AlertService.js';
import systemMonitoringService from './SystemMonitoringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PerformanceOptimizationService {
  constructor() {
    this.isOptimizing = false;
    this.optimizationInterval = null;
    this.performanceMetrics = {
      cpu: { threshold: 80, current: 0 },
      memory: { threshold: 85, current: 0 },
      disk: { threshold: 90, current: 0 },
      network: { threshold: 95, current: 0 }
    };
    this.optimizationStrategies = {
      recording: {
        qualityReduction: false,
        frameRateReduction: false,
        resolutionReduction: false
      },
      storage: {
        compressionEnabled: false,
        cleanupEnabled: false,
        archivingEnabled: false
      },
      network: {
        bandwidthLimiting: false,
        connectionPooling: false,
        requestThrottling: false
      }
    };
  }

  /**
   * Inicializa o serviço de otimização
   */
  async initialize() {
    try {
      logger.info('[PerformanceOptimization] Inicializando serviço de otimização de performance...');
      
      // Carregar configurações de otimização
      await this.loadOptimizationConfig();
      
      // Configurar monitoramento de performance
      await this.setupPerformanceMonitoring();
      
      logger.info('[PerformanceOptimization] Serviço de otimização inicializado com sucesso');
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro ao inicializar serviço:', error);
      throw error;
    }
  }

  /**
   * Inicia otimização automática
   */
  startOptimization() {
    if (this.isOptimizing) {
      logger.warn('[PerformanceOptimization] Otimização já está em execução');
      return;
    }

    this.isOptimizing = true;
    
    // Executar otimização a cada 30 segundos
    this.optimizationInterval = setInterval(async () => {
      try {
        await this.performOptimization();
      } catch (error) {
        logger.error('[PerformanceOptimization] Erro durante otimização automática:', error);
      }
    }, 30000);

    logger.info('[PerformanceOptimization] Otimização automática iniciada');
  }

  /**
   * Para otimização automática
   */
  stopOptimization() {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
    }
    
    this.isOptimizing = false;
    logger.info('[PerformanceOptimization] Otimização automática parada');
  }

  /**
   * Executa ciclo de otimização
   */
  async performOptimization() {
    try {
      // Coletar métricas atuais
      const metrics = await this.collectPerformanceMetrics();
      
      // Analisar necessidade de otimização
      const optimizationNeeded = await this.analyzeOptimizationNeeds(metrics);
      
      if (optimizationNeeded.length > 0) {
        logger.info(`[PerformanceOptimization] Aplicando ${optimizationNeeded.length} otimizações`);
        
        // Aplicar otimizações necessárias
        for (const optimization of optimizationNeeded) {
          await this.applyOptimization(optimization);
        }
        
        // Enviar alerta sobre otimizações aplicadas
        await alertService.triggerSystemAlert({
          type: 'performance_optimization_applied',
          optimizations: optimizationNeeded,
          metrics,
          timestamp: new Date()
        });
      }
      
      // Verificar se otimizações anteriores podem ser revertidas
      await this.checkOptimizationReversal(metrics);
      
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro durante otimização:', error);
    }
  }

  /**
   * Coleta métricas de performance
   */
  async collectPerformanceMetrics() {
    try {
      const systemMetrics = await systemMonitoringService.getSystemMetrics();
      
      // Métricas específicas de gravação
      const recordingMetrics = await this.getRecordingMetrics();
      
      // Métricas de rede
      const networkMetrics = await this.getNetworkMetrics();
      
      // Métricas de I/O de disco
      const diskIOMetrics = await this.getDiskIOMetrics();
      
      return {
        system: systemMetrics,
        recording: recordingMetrics,
        network: networkMetrics,
        diskIO: diskIOMetrics,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro ao coletar métricas:', error);
      throw error;
    }
  }

  /**
   * Analisa necessidade de otimizações
   */
  async analyzeOptimizationNeeds(metrics) {
    const optimizations = [];
    
    // Verificar CPU
    if (metrics.system.cpu.usage > this.performanceMetrics.cpu.threshold) {
      optimizations.push({
        type: 'cpu_optimization',
        severity: 'high',
        strategies: ['reduce_recording_quality', 'limit_concurrent_streams']
      });
    }
    
    // Verificar memória
    if (metrics.system.memory.usagePercent > this.performanceMetrics.memory.threshold) {
      optimizations.push({
        type: 'memory_optimization',
        severity: 'high',
        strategies: ['clear_cache', 'reduce_buffer_sizes', 'garbage_collection']
      });
    }
    
    // Verificar disco
    if (metrics.system.disk.usagePercent > this.performanceMetrics.disk.threshold) {
      optimizations.push({
        type: 'disk_optimization',
        severity: 'critical',
        strategies: ['cleanup_old_recordings', 'compress_recordings', 'archive_to_s3']
      });
    }
    
    // Verificar I/O de disco
    if (metrics.diskIO && metrics.diskIO.utilization > 90) {
      optimizations.push({
        type: 'disk_io_optimization',
        severity: 'medium',
        strategies: ['reduce_write_frequency', 'batch_operations']
      });
    }
    
    // Verificar rede
    if (metrics.network && metrics.network.utilization > this.performanceMetrics.network.threshold) {
      optimizations.push({
        type: 'network_optimization',
        severity: 'medium',
        strategies: ['reduce_bitrate', 'enable_compression', 'limit_bandwidth']
      });
    }
    
    return optimizations;
  }

  /**
   * Aplica otimização específica
   */
  async applyOptimization(optimization) {
    try {
      logger.info(`[PerformanceOptimization] Aplicando otimização: ${optimization.type}`);
      
      switch (optimization.type) {
        case 'cpu_optimization':
          await this.applyCPUOptimization(optimization.strategies);
          break;
          
        case 'memory_optimization':
          await this.applyMemoryOptimization(optimization.strategies);
          break;
          
        case 'disk_optimization':
          await this.applyDiskOptimization(optimization.strategies);
          break;
          
        case 'disk_io_optimization':
          await this.applyDiskIOOptimization(optimization.strategies);
          break;
          
        case 'network_optimization':
          await this.applyNetworkOptimization(optimization.strategies);
          break;
          
        default:
          logger.warn(`[PerformanceOptimization] Tipo de otimização desconhecido: ${optimization.type}`);
      }
      
    } catch (error) {
      logger.error(`[PerformanceOptimization] Erro ao aplicar otimização ${optimization.type}:`, error);
    }
  }

  /**
   * Aplica otimizações de CPU
   */
  async applyCPUOptimization(strategies) {
    for (const strategy of strategies) {
      switch (strategy) {
        case 'reduce_recording_quality':
          await this.reduceRecordingQuality();
          this.optimizationStrategies.recording.qualityReduction = true;
          break;
          
        case 'limit_concurrent_streams':
          await this.limitConcurrentStreams();
          break;
          
        case 'reduce_frame_rate':
          await this.reduceFrameRate();
          this.optimizationStrategies.recording.frameRateReduction = true;
          break;
      }
    }
  }

  /**
   * Aplica otimizações de memória
   */
  async applyMemoryOptimization(strategies) {
    for (const strategy of strategies) {
      switch (strategy) {
        case 'clear_cache':
          await this.clearSystemCache();
          break;
          
        case 'reduce_buffer_sizes':
          await this.reduceBufferSizes();
          break;
          
        case 'garbage_collection':
          await this.forceGarbageCollection();
          break;
      }
    }
  }

  /**
   * Aplica otimizações de disco
   */
  async applyDiskOptimization(strategies) {
    for (const strategy of strategies) {
      switch (strategy) {
        case 'cleanup_old_recordings':
          await this.cleanupOldRecordings();
          this.optimizationStrategies.storage.cleanupEnabled = true;
          break;
          
        case 'compress_recordings':
          await this.compressRecordings();
          this.optimizationStrategies.storage.compressionEnabled = true;
          break;
          
        case 'archive_to_s3':
          await this.archiveToS3();
          this.optimizationStrategies.storage.archivingEnabled = true;
          break;
      }
    }
  }

  /**
   * Aplica otimizações de I/O de disco
   */
  async applyDiskIOOptimization(strategies) {
    for (const strategy of strategies) {
      switch (strategy) {
        case 'reduce_write_frequency':
          await this.reduceWriteFrequency();
          break;
          
        case 'batch_operations':
          await this.enableBatchOperations();
          break;
      }
    }
  }

  /**
   * Aplica otimizações de rede
   */
  async applyNetworkOptimization(strategies) {
    for (const strategy of strategies) {
      switch (strategy) {
        case 'reduce_bitrate':
          await this.reduceBitrate();
          break;
          
        case 'enable_compression':
          await this.enableNetworkCompression();
          this.optimizationStrategies.network.compressionEnabled = true;
          break;
          
        case 'limit_bandwidth':
          await this.limitBandwidth();
          this.optimizationStrategies.network.bandwidthLimiting = true;
          break;
      }
    }
  }

  /**
   * Verifica se otimizações podem ser revertidas
   */
  async checkOptimizationReversal(metrics) {
    try {
      // Se o sistema está com boa performance, reverter otimizações
      const systemHealthy = (
        metrics.system.cpu.usage < 50 &&
        metrics.system.memory.usagePercent < 70 &&
        metrics.system.disk.usagePercent < 80
      );
      
      if (systemHealthy) {
        await this.revertOptimizations();
      }
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro ao verificar reversão de otimizações:', error);
    }
  }

  /**
   * Reverte otimizações quando possível
   */
  async revertOptimizations() {
    try {
      let revertedCount = 0;
      
      // Reverter qualidade de gravação
      if (this.optimizationStrategies.recording.qualityReduction) {
        await this.restoreRecordingQuality();
        this.optimizationStrategies.recording.qualityReduction = false;
        revertedCount++;
      }
      
      // Reverter frame rate
      if (this.optimizationStrategies.recording.frameRateReduction) {
        await this.restoreFrameRate();
        this.optimizationStrategies.recording.frameRateReduction = false;
        revertedCount++;
      }
      
      // Reverter compressão de rede
      if (this.optimizationStrategies.network.compressionEnabled) {
        await this.disableNetworkCompression();
        this.optimizationStrategies.network.compressionEnabled = false;
        revertedCount++;
      }
      
      if (revertedCount > 0) {
        logger.info(`[PerformanceOptimization] ${revertedCount} otimizações revertidas devido à melhoria na performance`);
      }
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro ao reverter otimizações:', error);
    }
  }

  /**
   * Métodos de otimização específicos
   */
  async reduceRecordingQuality() {
    // Implementar redução de qualidade de gravação
    logger.info('[PerformanceOptimization] Reduzindo qualidade de gravação para economizar CPU');
  }

  async limitConcurrentStreams() {
    // Implementar limitação de streams simultâneos
    logger.info('[PerformanceOptimization] Limitando número de streams simultâneos');
  }

  async reduceFrameRate() {
    // Implementar redução de frame rate
    logger.info('[PerformanceOptimization] Reduzindo frame rate das gravações');
  }

  async clearSystemCache() {
    // Implementar limpeza de cache
    logger.info('[PerformanceOptimization] Limpando cache do sistema');
    if (global.gc) {
      global.gc();
    }
  }

  async reduceBufferSizes() {
    // Implementar redução de tamanhos de buffer
    logger.info('[PerformanceOptimization] Reduzindo tamanhos de buffer');
  }

  async forceGarbageCollection() {
    // Forçar garbage collection
    if (global.gc) {
      global.gc();
      logger.info('[PerformanceOptimization] Garbage collection executado');
    }
  }

  async cleanupOldRecordings() {
    // Implementar limpeza de gravações antigas
    logger.info('[PerformanceOptimization] Limpando gravações antigas para liberar espaço');
  }

  async compressRecordings() {
    // Implementar compressão de gravações
    logger.info('[PerformanceOptimization] Comprimindo gravações para economizar espaço');
  }

  async archiveToS3() {
    // Implementar arquivamento para S3
    logger.info('[PerformanceOptimization] Arquivando gravações antigas para S3');
  }

  async reduceWriteFrequency() {
    // Implementar redução de frequência de escrita
    logger.info('[PerformanceOptimization] Reduzindo frequência de escrita no disco');
  }

  async enableBatchOperations() {
    // Implementar operações em lote
    logger.info('[PerformanceOptimization] Habilitando operações em lote para I/O');
  }

  async reduceBitrate() {
    // Implementar redução de bitrate
    logger.info('[PerformanceOptimization] Reduzindo bitrate para economizar banda');
  }

  async enableNetworkCompression() {
    // Implementar compressão de rede
    logger.info('[PerformanceOptimization] Habilitando compressão de rede');
  }

  async limitBandwidth() {
    // Implementar limitação de banda
    logger.info('[PerformanceOptimization] Limitando uso de banda');
  }

  async restoreRecordingQuality() {
    // Restaurar qualidade original
    logger.info('[PerformanceOptimization] Restaurando qualidade original de gravação');
  }

  async restoreFrameRate() {
    // Restaurar frame rate original
    logger.info('[PerformanceOptimization] Restaurando frame rate original');
  }

  async disableNetworkCompression() {
    // Desabilitar compressão de rede
    logger.info('[PerformanceOptimization] Desabilitando compressão de rede');
  }

  /**
   * Métodos auxiliares para coleta de métricas
   */
  async getRecordingMetrics() {
    return {
      activeStreams: 0, // Implementar contagem de streams ativos
      recordingQuality: 'high', // Implementar detecção de qualidade atual
      frameRate: 30, // Implementar detecção de frame rate atual
      bitrate: 2000 // Implementar detecção de bitrate atual
    };
  }

  async getNetworkMetrics() {
    return {
      utilization: 0, // Implementar medição de utilização de rede
      bandwidth: 1000, // Implementar medição de banda disponível
      latency: 10 // Implementar medição de latência
    };
  }

  async getDiskIOMetrics() {
    return {
      utilization: 0, // Implementar medição de utilização de I/O
      readSpeed: 100, // Implementar medição de velocidade de leitura
      writeSpeed: 80 // Implementar medição de velocidade de escrita
    };
  }

  /**
   * Carrega configurações de otimização
   */
  async loadOptimizationConfig() {
    try {
      const configPath = path.join(__dirname, '../config/optimization.json');
      
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Aplicar configurações carregadas
        if (config.thresholds) {
          Object.assign(this.performanceMetrics, config.thresholds);
        }
        
        logger.info('[PerformanceOptimization] Configurações de otimização carregadas');
      } catch (error) {
        // Usar configurações padrão se arquivo não existir
        logger.info('[PerformanceOptimization] Usando configurações padrão de otimização');
      }
    } catch (error) {
      logger.error('[PerformanceOptimization] Erro ao carregar configurações:', error);
    }
  }

  /**
   * Configura monitoramento de performance
   */
  async setupPerformanceMonitoring() {
    // Configurar alertas de performance crítica
    // Implementar hooks com sistema de monitoramento
    logger.info('[PerformanceOptimization] Monitoramento de performance configurado');
  }

  /**
   * Obtém status atual das otimizações
   */
  getOptimizationStatus() {
    return {
      isOptimizing: this.isOptimizing,
      activeStrategies: this.optimizationStrategies,
      thresholds: this.performanceMetrics,
      lastOptimization: this.lastOptimization || null
    };
  }
}

export default new PerformanceOptimizationService();