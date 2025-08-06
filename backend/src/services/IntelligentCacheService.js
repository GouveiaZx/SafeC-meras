import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from '../config/logger.js';
import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import crypto from 'crypto';

const logger = createModuleLogger('IntelligentCacheService');

/**
 * Serviço de cache inteligente para otimização de performance
 * Implementa múltiplas estratégias de cache com invalidação automática
 * e análise de padrões de acesso para otimização proativa
 */
class IntelligentCacheService extends EventEmitter {
  constructor() {
    super();
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Configurações
    this.config = {
      // TTL padrão para cache (em segundos)
      defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300, // 5 minutos
      // TTL para diferentes tipos de dados
      ttlByType: {
        streams: parseInt(process.env.CACHE_STREAMS_TTL) || 60,
        cameras: parseInt(process.env.CACHE_CAMERAS_TTL) || 600,
        recordings: parseInt(process.env.CACHE_RECORDINGS_TTL) || 180,
        users: parseInt(process.env.CACHE_USERS_TTL) || 900,
        system: parseInt(process.env.CACHE_SYSTEM_TTL) || 30,
        metrics: parseInt(process.env.CACHE_METRICS_TTL) || 120
      },
      // Tamanho máximo do cache (número de chaves)
      maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 10000,
      // Intervalo de limpeza automática (em segundos)
      cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300,
      // Intervalo de análise de padrões (em segundos)
      analysisInterval: parseInt(process.env.CACHE_ANALYSIS_INTERVAL) || 600,
      // Limiar para cache quente (número de acessos)
      hotCacheThreshold: parseInt(process.env.HOT_CACHE_THRESHOLD) || 10,
      // Habilitar cache preditivo
      enablePredictiveCache: process.env.ENABLE_PREDICTIVE_CACHE !== 'false',
      // Habilitar compressão
      enableCompression: process.env.ENABLE_CACHE_COMPRESSION !== 'false',
      // Habilitar persistência
      enablePersistence: process.env.ENABLE_CACHE_PERSISTENCE !== 'false'
    };
    
    // Instâncias de cache por tipo
    this.caches = {
      streams: new NodeCache({ 
        stdTTL: this.config.ttlByType.streams,
        maxKeys: Math.floor(this.config.maxKeys * 0.3),
        useClones: false
      }),
      cameras: new NodeCache({ 
        stdTTL: this.config.ttlByType.cameras,
        maxKeys: Math.floor(this.config.maxKeys * 0.2),
        useClones: false
      }),
      recordings: new NodeCache({ 
        stdTTL: this.config.ttlByType.recordings,
        maxKeys: Math.floor(this.config.maxKeys * 0.3),
        useClones: false
      }),
      users: new NodeCache({ 
        stdTTL: this.config.ttlByType.users,
        maxKeys: Math.floor(this.config.maxKeys * 0.1),
        useClones: false
      }),
      system: new NodeCache({ 
        stdTTL: this.config.ttlByType.system,
        maxKeys: Math.floor(this.config.maxKeys * 0.05),
        useClones: false
      }),
      metrics: new NodeCache({ 
        stdTTL: this.config.ttlByType.metrics,
        maxKeys: Math.floor(this.config.maxKeys * 0.05),
        useClones: false
      })
    };
    
    // Estado interno
    this.isRunning = false;
    this.cleanupTimer = null;
    this.analysisTimer = null;
    
    // Estatísticas de acesso
    this.accessStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      totalRequests: 0,
      byType: {}
    };
    
    // Padrões de acesso
    this.accessPatterns = new Map();
    this.hotKeys = new Set();
    this.predictiveCache = new Map();
    
    // Configurar eventos de cache
    this.setupCacheEvents();
    
    logger.info('[IntelligentCacheService] Serviço inicializado com configurações:', this.config);
  }

  /**
   * Iniciar o serviço de cache
   * @returns {Promise<void>}
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('[IntelligentCacheService] Serviço já está em execução');
        return;
      }
      
      logger.info('[IntelligentCacheService] 🚀 Iniciando serviço de cache inteligente');
      
      this.isRunning = true;
      
      // Carregar cache persistente se habilitado
      if (this.config.enablePersistence) {
        await this.loadPersistedCache();
      }
      
      // Iniciar limpeza automática
      this.startCleanup();
      
      // Iniciar análise de padrões
      this.startPatternAnalysis();
      
      this.emit('serviceStarted');
      
      logger.info('[IntelligentCacheService] ✅ Serviço iniciado com sucesso');
      
    } catch (error) {
      logger.error('[IntelligentCacheService] Erro ao iniciar serviço:', error);
      throw error;
    }
  }

  /**
   * Parar o serviço de cache
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (!this.isRunning) {
        logger.warn('[IntelligentCacheService] Serviço já está parado');
        return;
      }
      
      logger.info('[IntelligentCacheService] 🛑 Parando serviço de cache');
      
      this.isRunning = false;
      
      // Parar timers
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      
      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = null;
      }
      
      // Persistir cache se habilitado
      if (this.config.enablePersistence) {
        await this.persistCache();
      }
      
      this.emit('serviceStopped');
      
      logger.info('[IntelligentCacheService] ✅ Serviço parado com sucesso');
      
    } catch (error) {
      logger.error('[IntelligentCacheService] Erro ao parar serviço:', error);
    }
  }

  /**
   * Obter valor do cache
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave
   * @returns {*} - Valor ou undefined
   */
  get(type, key) {
    try {
      if (!this.caches[type]) {
        logger.warn(`[IntelligentCacheService] Tipo de cache inválido: ${type}`);
        return undefined;
      }
      
      const cacheKey = this.generateCacheKey(type, key);
      const value = this.caches[type].get(cacheKey);
      
      // Atualizar estatísticas
      this.accessStats.totalRequests++;
      if (value !== undefined) {
        this.accessStats.hits++;
        this.recordAccess(type, cacheKey, 'hit');
      } else {
        this.accessStats.misses++;
        this.recordAccess(type, cacheKey, 'miss');
      }
      
      // Descomprimir se necessário
      if (value && this.config.enableCompression && value._compressed) {
        return this.decompress(value.data);
      }
      
      return value;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro ao obter cache ${type}:${key}:`, error);
      return undefined;
    }
  }

  /**
   * Definir valor no cache
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave
   * @param {*} value - Valor
   * @param {number} ttl - TTL customizado (opcional)
   * @returns {boolean} - True se definido com sucesso
   */
  set(type, key, value, ttl = null) {
    try {
      if (!this.caches[type]) {
        logger.warn(`[IntelligentCacheService] Tipo de cache inválido: ${type}`);
        return false;
      }
      
      const cacheKey = this.generateCacheKey(type, key);
      let cacheValue = value;
      
      // Comprimir se habilitado e valor for grande
      if (this.config.enableCompression && this.shouldCompress(value)) {
        cacheValue = {
          _compressed: true,
          data: this.compress(value)
        };
      }
      
      // Usar TTL customizado ou padrão
      const cacheTTL = ttl || this.config.ttlByType[type] || this.config.defaultTTL;
      
      const success = this.caches[type].set(cacheKey, cacheValue, cacheTTL);
      
      if (success) {
        this.accessStats.sets++;
        this.recordAccess(type, cacheKey, 'set');
        
        // Verificar se deve ser cache quente
        this.checkHotCache(type, cacheKey);
      }
      
      return success;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro ao definir cache ${type}:${key}:`, error);
      return false;
    }
  }

  /**
   * Deletar valor do cache
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave
   * @returns {number} - Número de chaves deletadas
   */
  del(type, key) {
    try {
      if (!this.caches[type]) {
        logger.warn(`[IntelligentCacheService] Tipo de cache inválido: ${type}`);
        return 0;
      }
      
      const cacheKey = this.generateCacheKey(type, key);
      const deleted = this.caches[type].del(cacheKey);
      
      if (deleted > 0) {
        this.accessStats.deletes += deleted;
        this.recordAccess(type, cacheKey, 'delete');
        this.hotKeys.delete(cacheKey);
      }
      
      return deleted;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro ao deletar cache ${type}:${key}:`, error);
      return 0;
    }
  }

  /**
   * Limpar cache por tipo
   * @param {string} type - Tipo de cache
   * @returns {void}
   */
  flush(type) {
    try {
      if (!this.caches[type]) {
        logger.warn(`[IntelligentCacheService] Tipo de cache inválido: ${type}`);
        return;
      }
      
      this.caches[type].flushAll();
      
      // Limpar estatísticas relacionadas
      this.clearTypeStats(type);
      
      logger.info(`[IntelligentCacheService] Cache ${type} limpo`);
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro ao limpar cache ${type}:`, error);
    }
  }

  /**
   * Limpar todos os caches
   * @returns {void}
   */
  flushAll() {
    try {
      for (const type of Object.keys(this.caches)) {
        this.caches[type].flushAll();
      }
      
      // Reset estatísticas
      this.resetStats();
      
      logger.info('[IntelligentCacheService] Todos os caches limpos');
      
    } catch (error) {
      logger.error('[IntelligentCacheService] Erro ao limpar todos os caches:', error);
    }
  }

  /**
   * Invalidar cache por padrão
   * @param {string} type - Tipo de cache
   * @param {string} pattern - Padrão de chave (regex)
   * @returns {number} - Número de chaves invalidadas
   */
  invalidateByPattern(type, pattern) {
    try {
      if (!this.caches[type]) {
        logger.warn(`[IntelligentCacheService] Tipo de cache inválido: ${type}`);
        return 0;
      }
      
      const regex = new RegExp(pattern);
      const keys = this.caches[type].keys();
      let invalidated = 0;
      
      for (const key of keys) {
        if (regex.test(key)) {
          this.caches[type].del(key);
          this.hotKeys.delete(key);
          invalidated++;
        }
      }
      
      logger.info(`[IntelligentCacheService] ${invalidated} chaves invalidadas por padrão: ${pattern}`);
      
      return invalidated;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro ao invalidar por padrão ${type}:${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Cache com função de fallback
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave
   * @param {Function} fallbackFn - Função para obter valor se não estiver em cache
   * @param {number} ttl - TTL customizado (opcional)
   * @returns {Promise<*>} - Valor
   */
  async getOrSet(type, key, fallbackFn, ttl = null) {
    try {
      // Tentar obter do cache primeiro
      let value = this.get(type, key);
      
      if (value !== undefined) {
        return value;
      }
      
      // Executar função de fallback
      value = await fallbackFn();
      
      // Armazenar no cache se valor válido
      if (value !== undefined && value !== null) {
        this.set(type, key, value, ttl);
      }
      
      return value;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro em getOrSet ${type}:${key}:`, error);
      
      // Tentar executar fallback mesmo com erro
      try {
        return await fallbackFn();
      } catch (fallbackError) {
        logger.error(`[IntelligentCacheService] Erro no fallback ${type}:${key}:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Cache em lote
   * @param {string} type - Tipo de cache
   * @param {Object} keyValuePairs - Pares chave-valor
   * @param {number} ttl - TTL customizado (opcional)
   * @returns {Object} - Resultado das operações
   */
  mset(type, keyValuePairs, ttl = null) {
    try {
      const results = {};
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        results[key] = this.set(type, key, value, ttl);
      }
      
      return results;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro em mset ${type}:`, error);
      return {};
    }
  }

  /**
   * Obter múltiplas chaves
   * @param {string} type - Tipo de cache
   * @param {Array<string>} keys - Lista de chaves
   * @returns {Object} - Objeto com chaves e valores
   */
  mget(type, keys) {
    try {
      const results = {};
      
      for (const key of keys) {
        results[key] = this.get(type, key);
      }
      
      return results;
      
    } catch (error) {
      logger.error(`[IntelligentCacheService] Erro em mget ${type}:`, error);
      return {};
    }
  }

  /**
   * Gerar chave de cache
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave original
   * @returns {string} - Chave de cache
   */
  generateCacheKey(type, key) {
    if (typeof key === 'object') {
      key = JSON.stringify(key);
    }
    
    return `${type}:${key}`;
  }

  /**
   * Verificar se deve comprimir valor
   * @param {*} value - Valor a verificar
   * @returns {boolean} - True se deve comprimir
   */
  shouldCompress(value) {
    if (!this.config.enableCompression) {
      return false;
    }
    
    const serialized = JSON.stringify(value);
    return serialized.length > 1024; // Comprimir se > 1KB
  }

  /**
   * Comprimir valor
   * @param {*} value - Valor a comprimir
   * @returns {string} - Valor comprimido
   */
  compress(value) {
    try {
      const serialized = JSON.stringify(value);
      return Buffer.from(serialized).toString('base64');
    } catch (error) {
      logger.error('[IntelligentCacheService] Erro na compressão:', error);
      return value;
    }
  }

  /**
   * Descomprimir valor
   * @param {string} compressedValue - Valor comprimido
   * @returns {*} - Valor descomprimido
   */
  decompress(compressedValue) {
    try {
      const serialized = Buffer.from(compressedValue, 'base64').toString();
      return JSON.parse(serialized);
    } catch (error) {
      logger.error('[IntelligentCacheService] Erro na descompressão:', error);
      return compressedValue;
    }
  }

  /**
   * Registrar acesso para análise de padrões
   * @param {string} type - Tipo de cache
   * @param {string} key - Chave
   * @param {string} operation - Operação (hit, miss, set, delete)
   */
  recordAccess(type, key, operation) {
    try {
      const accessKey