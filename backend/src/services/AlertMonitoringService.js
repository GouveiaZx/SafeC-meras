/**
 * Serviço de Monitoramento de Alertas para o sistema NewCAM
 * Detecta automaticamente problemas críticos e dispara notificações
 */

import NotificationService from './NotificationService.js';
import { logger } from '../config/logger.js';
import { supabase } from '../config/database.js';
import { redisClient } from '../config/redis.js';
import fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class AlertMonitoringService {
  constructor() {
    this.monitoringIntervals = new Map();
    this.thresholds = {
      diskSpace: {
        warning: 20, // 20% livre
        critical: 5  // 5% livre
      },
      cameraOffline: {
        warning: 5,  // 5 minutos sem resposta
        critical: 15 // 15 minutos sem resposta
      },
      recordingFailure: {
        maxConsecutiveFailures: 3,
        timeWindow: 300000 // 5 minutos
      },
      streamInterruption: {
        maxInterruptionTime: 300000 // 5 minutos
      }
    };
    
    this.isMonitoring = false;
  }

  /**
   * Iniciar monitoramento automático
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Monitoramento já está ativo');
      return;
    }
    
    this.isMonitoring = true;
    logger.info('Iniciando monitoramento de alertas críticos');
    
    // Monitoramento de espaço em disco (a cada 2 minutos)
    this.monitoringIntervals.set('diskSpace', setInterval(() => {
      this.checkDiskSpace().catch(error => {
        logger.error('Erro no monitoramento de espaço em disco:', error);
      });
    }, 120000));
    
    // Monitoramento de câmeras offline (a cada 1 minuto)
    this.monitoringIntervals.set('cameraStatus', setInterval(() => {
      this.checkCameraStatus().catch(error => {
        logger.error('Erro no monitoramento de câmeras:', error);
      });
    }, 60000));
    
    // Monitoramento de falhas de gravação (a cada 30 segundos)
    this.monitoringIntervals.set('recordingFailures', setInterval(() => {
      this.checkRecordingFailures().catch(error => {
        logger.error('Erro no monitoramento de gravações:', error);
      });
    }, 30000));
    
    // Monitoramento de interrupções de stream (a cada 1 minuto)
    this.monitoringIntervals.set('streamInterruptions', setInterval(() => {
      this.checkStreamInterruptions().catch(error => {
        logger.error('Erro no monitoramento de streams:', error);
      });
    }, 60000));
    
    // Monitoramento de saúde do sistema (a cada 5 minutos)
    this.monitoringIntervals.set('systemHealth', setInterval(() => {
      this.checkSystemHealth().catch(error => {
        logger.error('Erro no monitoramento de saúde do sistema:', error);
      });
    }, 300000));
    
    logger.info('Monitoramento de alertas iniciado com sucesso');
  }

  /**
   * Parar monitoramento automático
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    // Limpar todos os intervalos
    for (const [name, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      logger.debug(`Monitoramento ${name} parado`);
    }
    
    this.monitoringIntervals.clear();
    logger.info('Monitoramento de alertas parado');
  }

  /**
   * Verificar espaço em disco
   */
  async checkDiskSpace() {
    try {
      const recordingsPath = process.env.RECORDINGS_PATH || '/recordings';
      const diskInfo = await this.getDiskUsage(recordingsPath);
      
      if (!diskInfo) {
        logger.warn('Não foi possível obter informações de espaço em disco');
        return;
      }
      
      const freePercentage = (diskInfo.free / diskInfo.total) * 100;
      
      // Verificar se já foi alertado recentemente
      const alertKey = `disk_space_${recordingsPath}`;
      const lastAlert = await this.getLastAlert(alertKey);
      
      if (freePercentage <= this.thresholds.diskSpace.critical) {
        // Espaço crítico
        if (!lastAlert || this.shouldSendAlert(lastAlert, 'critical', 300000)) { // 5 minutos
          await NotificationService.sendDiskSpaceAlert(diskInfo, 'critical');
          await this.recordAlert(alertKey, 'critical');
          
          // Tentar limpeza de emergência
          await this.triggerEmergencyCleanup();
        }
      } else if (freePercentage <= this.thresholds.diskSpace.warning) {
        // Espaço baixo
        if (!lastAlert || this.shouldSendAlert(lastAlert, 'warning', 1800000)) { // 30 minutos
          await NotificationService.sendDiskSpaceAlert(diskInfo, 'warning');
          await this.recordAlert(alertKey, 'warning');
        }
      }
      
      // Atualizar métricas no Redis
      await this.updateDiskMetrics(diskInfo);
      
    } catch (error) {
      logger.error('Erro ao verificar espaço em disco:', error);
      await NotificationService.sendSystemErrorAlert('DiskSpaceMonitor', error.message);
    }
  }

  /**
   * Verificar status das câmeras
   */
  async checkCameraStatus() {
    try {
      // Obter câmeras ativas
      const { data: cameras, error } = await supabase
        .from('cameras')
        .select('id, name, last_seen, continuous_recording')
        .eq('active', true);
      
      if (error) {
        throw error;
      }
      
      const now = new Date();
      
      for (const camera of cameras || []) {
        if (!camera.last_seen) continue;
        
        const lastSeen = new Date(camera.last_seen);
        const offlineMinutes = Math.floor((now - lastSeen) / (1000 * 60));
        
        const alertKey = `camera_offline_${camera.id}`;
        const lastAlert = await this.getLastAlert(alertKey);
        
        if (offlineMinutes >= this.thresholds.cameraOffline.critical) {
          // Câmera offline crítico
          if (!lastAlert || this.shouldSendAlert(lastAlert, 'critical', 900000)) { // 15 minutos
            await NotificationService.sendCameraOfflineAlert(
              camera.id,
              camera.name,
              camera.last_seen
            );
            await this.recordAlert(alertKey, 'critical');
          }
        } else if (offlineMinutes >= this.thresholds.cameraOffline.warning) {
          // Câmera offline warning
          if (!lastAlert || this.shouldSendAlert(lastAlert, 'warning', 600000)) { // 10 minutos
            await NotificationService.sendCameraOfflineAlert(
              camera.id,
              camera.name,
              camera.last_seen
            );
            await this.recordAlert(alertKey, 'warning');
          }
        }
        
        // Atualizar status no Redis
        await this.updateCameraStatus(camera.id, {
          status: offlineMinutes < this.thresholds.cameraOffline.warning ? 'online' : 'offline',
          last_seen: camera.last_seen,
          offline_minutes: offlineMinutes
        });
      }
      
    } catch (error) {
      logger.error('Erro ao verificar status das câmeras:', error);
      await NotificationService.sendSystemErrorAlert('CameraStatusMonitor', error.message);
    }
  }

  /**
   * Verificar falhas de gravação
   */
  async checkRecordingFailures() {
    try {
      // Verificar falhas recentes no Redis
      const failureKeys = await redisClient.keys('recording:failure:*');
      
      for (const key of failureKeys) {
        const failureData = await redisClient.hgetall(key);
        const cameraId = key.split(':')[2];
        
        if (!failureData.count || !failureData.first_failure) continue;
        
        const failureCount = parseInt(failureData.count);
        const firstFailure = new Date(failureData.first_failure);
        const now = new Date();
        
        // Verificar se excedeu o limite de falhas consecutivas
        if (failureCount >= this.thresholds.recordingFailure.maxConsecutiveFailures) {
          const alertKey = `recording_failure_${cameraId}`;
          const lastAlert = await this.getLastAlert(alertKey);
          
          if (!lastAlert || this.shouldSendAlert(lastAlert, 'critical', 600000)) { // 10 minutos
            const { data: camera } = await supabase
              .from('cameras')
              .select('name')
              .eq('id', cameraId)
              .single();
            
            await NotificationService.sendRecordingFailureAlert(
              cameraId,
              camera?.name,
              `${failureCount} falhas consecutivas desde ${firstFailure.toLocaleString('pt-BR')}`
            );
            
            await this.recordAlert(alertKey, 'critical');
          }
        }
        
        // Limpar falhas antigas (mais de 1 hora)
        if (now - firstFailure > 3600000) {
          await redisClient.del(key);
        }
      }
      
    } catch (error) {
      logger.error('Erro ao verificar falhas de gravação:', error);
      await NotificationService.sendSystemErrorAlert('RecordingFailureMonitor', error.message);
    }
  }

  /**
   * Verificar interrupções de stream
   */
  async checkStreamInterruptions() {
    try {
      // Verificar streams ativos no Redis
      const streamKeys = await redisClient.keys('stream:status:*');
      
      for (const key of streamKeys) {
        const streamData = await redisClient.hgetall(key);
        const cameraId = key.split(':')[2];
        
        if (!streamData.last_activity) continue;
        
        const lastActivity = new Date(streamData.last_activity);
        const now = new Date();
        const inactiveTime = now - lastActivity;
        
        // Verificar se o stream está interrompido há muito tempo
        if (inactiveTime > this.thresholds.streamInterruption.maxInterruptionTime) {
          const alertKey = `stream_interrupted_${cameraId}`;
          const lastAlert = await this.getLastAlert(alertKey);
          
          if (!lastAlert || this.shouldSendAlert(lastAlert, 'warning', 900000)) { // 15 minutos
            const { data: camera } = await supabase
              .from('cameras')
              .select('name')
              .eq('id', cameraId)
              .single();
            
            const interruptionMinutes = Math.floor(inactiveTime / (1000 * 60));
            
            await NotificationService.sendStreamInterruptedAlert(
              cameraId,
              camera?.name,
              interruptionMinutes
            );
            
            await this.recordAlert(alertKey, 'warning');
          }
        }
      }
      
    } catch (error) {
      logger.error('Erro ao verificar interrupções de stream:', error);
      await NotificationService.sendSystemErrorAlert('StreamInterruptionMonitor', error.message);
    }
  }

  /**
   * Verificar saúde geral do sistema
   */
  async checkSystemHealth() {
    try {
      const healthChecks = {
        redis: await this.checkRedisHealth(),
        supabase: await this.checkSupabaseHealth(),
        diskIO: await this.checkDiskIOHealth(),
        memory: await this.checkMemoryHealth()
      };
      
      // Verificar se algum componente está com problemas
      for (const [component, health] of Object.entries(healthChecks)) {
        if (!health.healthy) {
          const alertKey = `system_health_${component}`;
          const lastAlert = await this.getLastAlert(alertKey);
          
          if (!lastAlert || this.shouldSendAlert(lastAlert, 'error', 1800000)) { // 30 minutos
            await NotificationService.sendSystemErrorAlert(
              component,
              health.error || 'Componente não está saudável',
              health.details
            );
            
            await this.recordAlert(alertKey, 'error');
          }
        }
      }
      
      // Atualizar métricas de saúde no Redis
      await this.updateSystemHealthMetrics(healthChecks);
      
    } catch (error) {
      logger.error('Erro ao verificar saúde do sistema:', error);
      await NotificationService.sendSystemErrorAlert('SystemHealthMonitor', error.message);
    }
  }

  /**
   * Obter uso do disco
   */
  async getDiskUsage(path) {
    try {
      // Tentar usar comando df (Unix/Linux)
      try {
        const { stdout } = await execAsync(`df -B1 "${path}"`);
        const lines = stdout.trim().split('\n');
        const data = lines[1].split(/\s+/);
        
        return {
          path,
          total: parseInt(data[1]),
          used: parseInt(data[2]),
          free: parseInt(data[3])
        };
      } catch (dfError) {
        // Fallback para sistemas sem df (usar estatísticas básicas)
        logger.warn('Comando df não disponível, usando valores padrão');
        return {
          path,
          total: 100 * 1024 * 1024 * 1024, // 100GB padrão
          used: 50 * 1024 * 1024 * 1024,   // 50GB usado padrão
          free: 50 * 1024 * 1024 * 1024    // 50GB livre padrão
        };
      }
    } catch (error) {
      logger.error('Erro ao obter uso do disco:', error);
      return null;
    }
  }

  /**
   * Verificar saúde do Redis
   */
  async checkRedisHealth() {
    try {
      const start = Date.now();
      await redisClient.ping();
      const responseTime = Date.now() - start;
      
      return {
        healthy: responseTime < 1000, // Menos de 1 segundo
        responseTime,
        details: { responseTime }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Verificar saúde do Supabase
   */
  async checkSupabaseHealth() {
    try {
      const start = Date.now();
      const { error } = await supabase
        .from('cameras')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - start;
      
      return {
        healthy: !error && responseTime < 5000, // Menos de 5 segundos
        responseTime,
        details: { responseTime, error: error?.message }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Verificar saúde do I/O de disco
   */
  async checkDiskIOHealth() {
    try {
      const testFile = '/tmp/newcam_io_test.txt';
      const testData = 'test data for I/O check';
      
      const start = Date.now();
      await fs.writeFile(testFile, testData);
      await fs.readFile(testFile, 'utf8');
      await fs.unlink(testFile);
      const ioTime = Date.now() - start;
      
      return {
        healthy: ioTime < 1000, // Menos de 1 segundo
        ioTime,
        details: { ioTime }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Verificar saúde da memória
   */
  async checkMemoryHealth() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = memUsage.heapTotal;
      const usedMem = memUsage.heapUsed;
      const memoryUsagePercent = (usedMem / totalMem) * 100;
      
      return {
        healthy: memoryUsagePercent < 90, // Menos de 90% de uso
        memoryUsagePercent,
        details: {
          heapUsed: usedMem,
          heapTotal: totalMem,
          memoryUsagePercent
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Disparar limpeza de emergência
   */
  async triggerEmergencyCleanup() {
    try {
      logger.warn('Disparando limpeza de emergência devido a espaço crítico em disco');
      
      // Importar e executar serviço de limpeza
      const { default: CleanupService } = await import('./CleanupService.js');
      await CleanupService.executeEmergencyCleanup();
      
      logger.info('Limpeza de emergência executada com sucesso');
    } catch (error) {
      logger.error('Erro na limpeza de emergência:', error);
      await NotificationService.sendSystemErrorAlert('EmergencyCleanup', error.message);
    }
  }

  /**
   * Obter último alerta
   */
  async getLastAlert(alertKey) {
    try {
      const cacheKey = `last_alert:${alertKey}`;
      const data = await redisClient.hgetall(cacheKey);
      
      if (!data.timestamp) return null;
      
      return {
        timestamp: new Date(data.timestamp),
        level: data.level
      };
    } catch (error) {
      logger.error('Erro ao obter último alerta:', error);
      return null;
    }
  }

  /**
   * Registrar alerta
   */
  async recordAlert(alertKey, level) {
    try {
      const cacheKey = `last_alert:${alertKey}`;
      await redisClient.hset(cacheKey, {
        timestamp: new Date().toISOString(),
        level
      });
      await redisClient.expire(cacheKey, 86400); // 24 horas
    } catch (error) {
      logger.error('Erro ao registrar alerta:', error);
    }
  }

  /**
   * Verificar se deve enviar alerta
   */
  shouldSendAlert(lastAlert, currentLevel, minInterval) {
    if (!lastAlert) return true;
    
    const timeSinceLastAlert = Date.now() - lastAlert.timestamp.getTime();
    
    // Se é crítico, sempre enviar
    if (currentLevel === 'critical') return true;
    
    // Se mudou de nível, enviar
    if (lastAlert.level !== currentLevel) return true;
    
    // Verificar intervalo mínimo
    return timeSinceLastAlert >= minInterval;
  }

  /**
   * Atualizar métricas de disco no Redis
   */
  async updateDiskMetrics(diskInfo) {
    try {
      await redisClient.hset('system:metrics:disk', {
        total: diskInfo.total,
        used: diskInfo.used,
        free: diskInfo.free,
        free_percentage: ((diskInfo.free / diskInfo.total) * 100).toFixed(2),
        last_updated: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao atualizar métricas de disco:', error);
    }
  }

  /**
   * Atualizar status da câmera no Redis
   */
  async updateCameraStatus(cameraId, status) {
    try {
      await redisClient.hset(`camera:status:${cameraId}`, {
        ...status,
        last_updated: new Date().toISOString()
      });
      await redisClient.expire(`camera:status:${cameraId}`, 3600); // 1 hora
    } catch (error) {
      logger.error('Erro ao atualizar status da câmera:', error);
    }
  }

  /**
   * Atualizar métricas de saúde do sistema
   */
  async updateSystemHealthMetrics(healthChecks) {
    try {
      const healthData = {};
      
      for (const [component, health] of Object.entries(healthChecks)) {
        healthData[`${component}_healthy`] = health.healthy ? '1' : '0';
        healthData[`${component}_details`] = JSON.stringify(health.details || {});
      }
      
      healthData.last_updated = new Date().toISOString();
      
      await redisClient.hset('system:health', healthData);
    } catch (error) {
      logger.error('Erro ao atualizar métricas de saúde:', error);
    }
  }

  /**
   * Obter status do monitoramento
   */
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      activeMonitors: Array.from(this.monitoringIntervals.keys()),
      thresholds: this.thresholds
    };
  }

  /**
   * Atualizar thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Thresholds de monitoramento atualizados:', this.thresholds);
  }
}

export default new AlertMonitoringService();