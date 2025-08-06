/**
 * Serviço de Cache Redis para otimização de consultas frequentes
 * Sistema NewCAM - Gravação Contínua
 */

import { redisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { supabase } from '../config/database.js';

class CacheService {
  constructor() {
    this.defaultTTL = {
      cameras: 300,        // 5 minutos
      recordings: 600,     // 10 minutos
      metrics: 60,         // 1 minuto
      settings: 1800,      // 30 minutos
      users: 900,          // 15 minutos
      alerts: 300,         // 5 minutos
      system_status: 30    // 30 segundos
    };
    
    this.keyPrefixes = {
      camera: 'cache:camera:',
      recording: 'cache:recording:',
      metrics: 'cache:metrics:',
      settings: 'cache:settings:',
      user: 'cache:user:',
      alert: 'cache:alert:',
      system: 'cache:system:',
      query: 'cache:query:'
    };
  }

  /**
   * Gerar chave de cache
   */
  generateKey(prefix, identifier, suffix = '') {
    const key = `${prefix}${identifier}${suffix ? ':' + suffix : ''}`;
    return key.toLowerCase().replace(/[^a-z0-9:_-]/g, '_');
  }

  /**
   * Obter dados do cache com fallback para banco
   */
  async getOrSet(key, fetchFunction, ttl = 300) {
    try {
      // Tentar obter do cache primeiro
      const cached = await redisClient.get(key);
      
      if (cached) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(cached);
      }
      
      // Cache miss - buscar dados
      logger.debug(`Cache miss: ${key}`);
      const data = await fetchFunction();
      
      if (data !== null && data !== undefined) {
        // Armazenar no cache
        await redisClient.setex(key, ttl, JSON.stringify(data));
        logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
      }
      
      return data;
      
    } catch (error) {
      logger.error(`Erro no cache para chave ${key}:`, error);
      // Em caso de erro no cache, executar função diretamente
      return await fetchFunction();
    }
  }

  /**
   * Cache de câmeras ativas
   */
  async getCameras(activeOnly = true) {
    const key = this.generateKey(
      this.keyPrefixes.camera,
      'list',
      activeOnly ? 'active' : 'all'
    );
    
    return await this.getOrSet(key, async () => {
      const query = supabase
        .from('cameras')
        .select('*')
        .order('name');
      
      if (activeOnly) {
        query.eq('active', true);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw error;
      }
      
      return data || [];
    }, this.defaultTTL.cameras);
  }

  /**
   * Cache de dados específicos de uma câmera
   */
  async getCamera(cameraId) {
    const key = this.generateKey(this.keyPrefixes.camera, cameraId);
    
    return await this.getOrSet(key, async () => {
      const { data, error } = await supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();
      
      if (error) {
        throw error;
      }
      
      return data;
    }, this.defaultTTL.cameras);
  }

  /**
   * Cache de configurações de gravação contínua
   */
  async getContinuousRecordingSettings(cameraId) {
    const key = this.generateKey(
      this.keyPrefixes.settings,
      'continuous_recording',
      cameraId
    );
    
    return await this.getOrSet(key, async () => {
      const { data, error } = await supabase
        .from('cameras')
        .select('continuous_recording, retention_days, recording_quality')
        .eq('id', cameraId)
        .single();
      
      if (error) {
        throw error;
      }
      
      return data;
    }, this.defaultTTL.settings);
  }

  /**
   * Cache de gravações recentes
   */
  async getRecentRecordings(cameraId, limit = 50) {
    const key = this.generateKey(
      this.keyPrefixes.recording,
      'recent',
      `${cameraId}_${limit}`
    );
    
    return await this.getOrSet(key, async () => {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        throw error;
      }
      
      return data || [];
    }, this.defaultTTL.recordings);
  }

  /**
   * Cache de métricas do sistema
   */
  async getSystemMetrics() {
    const key = this.generateKey(this.keyPrefixes.metrics, 'system');
    
    return await this.getOrSet(key, async () => {
      // Obter métricas de diferentes fontes
      const [diskMetrics, cameraMetrics, recordingMetrics] = await Promise.all([
        this.getDiskMetrics(),
        this.getCameraMetrics(),
        this.getRecordingMetrics()
      ]);
      
      return {
        disk: diskMetrics,
        cameras: cameraMetrics,
        recordings: recordingMetrics,
        timestamp: new Date().toISOString()
      };
    }, this.defaultTTL.metrics);
  }

  /**
   * Cache de métricas de disco
   */
  async getDiskMetrics() {
    const key = this.generateKey(this.keyPrefixes.metrics, 'disk');
    
    return await this.getOrSet(key, async () => {
      // Obter do Redis se disponível
      const diskData = await redisClient.hgetall('system:metrics:disk');
      
      if (diskData && diskData.total) {
        return {
          total: parseInt(diskData.total),
          used: parseInt(diskData.used),
          free: parseInt(diskData.free),
          free_percentage: parseFloat(diskData.free_percentage),
          last_updated: diskData.last_updated
        };
      }
      
      return null;
    }, this.defaultTTL.metrics);
  }

  /**
   * Cache de métricas de câmeras
   */
  async getCameraMetrics() {
    const key = this.generateKey(this.keyPrefixes.metrics, 'cameras');
    
    return await this.getOrSet(key, async () => {
      const { data: cameras, error } = await supabase
        .from('cameras')
        .select('id, active, continuous_recording, last_seen');
      
      if (error) {
        throw error;
      }
      
      const now = new Date();
      let online = 0;
      let offline = 0;
      let recording = 0;
      
      for (const camera of cameras || []) {
        if (camera.active) {
          const lastSeen = camera.last_seen ? new Date(camera.last_seen) : null;
          const isOnline = lastSeen && (now - lastSeen) < 300000; // 5 minutos
          
          if (isOnline) {
            online++;
            if (camera.continuous_recording) {
              recording++;
            }
          } else {
            offline++;
          }
        }
      }
      
      return {
        total: cameras?.length || 0,
        active: cameras?.filter(c => c.active).length || 0,
        online,
        offline,
        recording
      };
    }, this.defaultTTL.metrics);
  }

  /**
   * Cache de métricas de gravação
   */
  async getRecordingMetrics() {
    const key = this.generateKey(this.keyPrefixes.metrics, 'recordings');
    
    return await this.getOrSet(key, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayRecordings, error: todayError } = await supabase
        .from('recordings')
        .select('id, file_size')
        .gte('created_at', today.toISOString());
      
      if (todayError) {
        throw todayError;
      }
      
      const { data: totalRecordings, error: totalError } = await supabase
        .from('recordings')
        .select('id, file_size');
      
      if (totalError) {
        throw totalError;
      }
      
      const todaySize = todayRecordings?.reduce((sum, r) => sum + (r.file_size || 0), 0) || 0;
      const totalSize = totalRecordings?.reduce((sum, r) => sum + (r.file_size || 0), 0) || 0;
      
      return {
        today_count: todayRecordings?.length || 0,
        today_size: todaySize,
        total_count: totalRecordings?.length || 0,
        total_size: totalSize
      };
    }, this.defaultTTL.metrics);
  }

  /**
   * Cache de status do sistema
   */
  async getSystemStatus() {
    const key = this.generateKey(this.keyPrefixes.system, 'status');
    
    return await this.getOrSet(key, async () => {
      // Verificar saúde dos componentes
      const healthChecks = await Promise.allSettled([
        this.checkRedisHealth(),
        this.checkSupabaseHealth(),
        this.checkDiskHealth()
      ]);
      
      const redis = healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { healthy: false };
      const supabase = healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { healthy: false };
      const disk = healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { healthy: false };
      
      const overallHealth = redis.healthy && supabase.healthy && disk.healthy;
      
      return {
        healthy: overallHealth,
        components: {
          redis,
          supabase,
          disk
        },
        timestamp: new Date().toISOString()
      };
    }, this.defaultTTL.system_status);
  }

  /**
   * Cache de consultas personalizadas
   */
  async cacheQuery(queryName, queryFunction, ttl = 300, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('_');
    
    const key = this.generateKey(
      this.keyPrefixes.query,
      queryName,
      paramString
    );
    
    return await this.getOrSet(key, queryFunction, ttl);
  }

  /**
   * Invalidar cache específico
   */
  async invalidate(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.info(`Cache invalidado: ${keys.length} chaves removidas (padrão: ${pattern})`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error('Erro ao invalidar cache:', error);
      throw error;
    }
  }

  /**
   * Invalidar cache de câmera
   */
  async invalidateCamera(cameraId) {
    const patterns = [
      `${this.keyPrefixes.camera}${cameraId}*`,
      `${this.keyPrefixes.camera}list*`,
      `${this.keyPrefixes.settings}*${cameraId}*`,
      `${this.keyPrefixes.recording}*${cameraId}*`,
      `${this.keyPrefixes.metrics}cameras*`
    ];
    
    let totalInvalidated = 0;
    
    for (const pattern of patterns) {
      totalInvalidated += await this.invalidate(pattern);
    }
    
    return totalInvalidated;
  }

  /**
   * Invalidar cache de métricas
   */
  async invalidateMetrics() {
    return await this.invalidate(`${this.keyPrefixes.metrics}*`);
  }

  /**
   * Invalidar cache de sistema
   */
  async invalidateSystem() {
    return await this.invalidate(`${this.keyPrefixes.system}*`);
  }

  /**
   * Limpar todo o cache
   */
  async clearAll() {
    try {
      const keys = await redisClient.keys('cache:*');
      
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.info(`Cache completamente limpo: ${keys.length} chaves removidas`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error('Erro ao limpar cache:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas do cache
   */
  async getStats() {
    try {
      const keys = await redisClient.keys('cache:*');
      const stats = {
        total_keys: keys.length,
        by_prefix: {},
        memory_usage: 0
      };
      
      // Agrupar por prefixo
      for (const key of keys) {
        const prefix = key.split(':')[1];
        stats.by_prefix[prefix] = (stats.by_prefix[prefix] || 0) + 1;
      }
      
      // Obter uso de memória (se disponível)
      try {
        const info = await redisClient.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        if (memoryMatch) {
          stats.memory_usage = parseInt(memoryMatch[1]);
        }
      } catch (memError) {
        logger.debug('Não foi possível obter informações de memória do Redis');
      }
      
      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas do cache:', error);
      throw error;
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
        healthy: responseTime < 1000,
        response_time: responseTime
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
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
        healthy: !error && responseTime < 5000,
        response_time: responseTime,
        error: error?.message
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Verificar saúde do disco
   */
  async checkDiskHealth() {
    try {
      const diskMetrics = await this.getDiskMetrics();
      
      if (!diskMetrics) {
        return {
          healthy: false,
          error: 'Métricas de disco não disponíveis'
        };
      }
      
      const freePercentage = diskMetrics.free_percentage;
      
      return {
        healthy: freePercentage > 10, // Mais de 10% livre
        free_percentage: freePercentage
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Pré-aquecer cache com dados frequentemente acessados
   */
  async warmup() {
    try {
      logger.info('Iniciando pré-aquecimento do cache...');
      
      const warmupTasks = [
        () => this.getCameras(true),
        () => this.getSystemMetrics(),
        () => this.getSystemStatus()
      ];
      
      await Promise.allSettled(warmupTasks.map(task => task()));
      
      logger.info('Pré-aquecimento do cache concluído');
    } catch (error) {
      logger.error('Erro no pré-aquecimento do cache:', error);
    }
  }
}

export default new CacheService();