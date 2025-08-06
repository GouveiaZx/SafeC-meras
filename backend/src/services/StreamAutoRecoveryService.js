import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from '../config/logger.js';
import { EventEmitter } from 'events';
import axios from 'axios';

const logger = createModuleLogger('StreamAutoRecoveryService');

/**
 * Serviço de recuperação automática de streams travadas
 * Monitora streams ativos e implementa estratégias de recuperação
 * quando detecta problemas de conectividade ou travamento
 */
class StreamAutoRecoveryService extends EventEmitter {
  constructor() {
    super();
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Configurações
    this.config = {
      // Intervalo de verificação de saúde (em segundos)
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30,
      // Timeout para verificações de stream (em segundos)
      streamTimeout: parseInt(process.env.STREAM_TIMEOUT) || 10,
      // Número máximo de tentativas de recuperação
      maxRecoveryAttempts: parseInt(process.env.MAX_RECOVERY_ATTEMPTS) || 3,
      // Intervalo entre tentativas de recuperação (em segundos)
      recoveryRetryInterval: parseInt(process.env.RECOVERY_RETRY_INTERVAL) || 60,
      // Tempo para considerar stream como travado (em segundos)
      stuckStreamThreshold: parseInt(process.env.STUCK_STREAM_THRESHOLD) || 120,
      // Intervalo para limpeza de dados antigos (em horas)
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 24,
      // URL base da API do ZLMediaKit
      zlmApiUrl: process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8080',
      // Secret do ZLMediaKit
      zlmSecret: process.env.ZLMEDIAKIT_SECRET || 'your_secret_here',
      // Estratégias de recuperação habilitadas
      enabledStrategies: {
        restart: process.env.ENABLE_RESTART_STRATEGY !== 'false',
        reconnect: process.env.ENABLE_RECONNECT_STRATEGY !== 'false',
        fallback: process.env.ENABLE_FALLBACK_STRATEGY !== 'false',
        reset: process.env.ENABLE_RESET_STRATEGY !== 'false'
      }
    };
    
    // Estado interno
    this.monitoredStreams = new Map();
    this.recoveryAttempts = new Map();
    this.healthCheckTimer = null;
    this.cleanupTimer = null;
    this.isRunning = false;
    
    // Estatísticas
    this.stats = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      streamsMonitored: 0,
      lastHealthCheck: null,
      recoveryStrategiesUsed: {
        restart: 0,
        reconnect: 0,
        fallback: 0,
        reset: 0
      }
    };
    
    logger.info('[StreamAutoRecoveryService] Serviço inicializado com configurações:', this.config);
  }

  /**
   * Iniciar o serviço de recuperação automática
   * @returns {Promise<void>}
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('[StreamAutoRecoveryService] Serviço já está em execução');
        return;
      }
      
      logger.info('[StreamAutoRecoveryService] 🚀 Iniciando serviço de recuperação automática');
      
      this.isRunning = true;
      
      // Carregar streams ativos
      await this.loadActiveStreams();
      
      // Iniciar verificação de saúde
      this.startHealthCheck();
      
      // Iniciar limpeza automática
      this.startCleanup();
      
      this.emit('serviceStarted');
      
      logger.info('[StreamAutoRecoveryService] ✅ Serviço iniciado com sucesso');
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro ao iniciar serviço:', error);
      throw error;
    }
  }

  /**
   * Parar o serviço de recuperação automática
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (!this.isRunning) {
        logger.warn('[StreamAutoRecoveryService] Serviço já está parado');
        return;
      }
      
      logger.info('[StreamAutoRecoveryService] 🛑 Parando serviço de recuperação automática');
      
      this.isRunning = false;
      
      // Parar timers
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
      
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      
      // Limpar estado
      this.monitoredStreams.clear();
      this.recoveryAttempts.clear();
      
      this.emit('serviceStopped');
      
      logger.info('[StreamAutoRecoveryService] ✅ Serviço parado com sucesso');
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro ao parar serviço:', error);
    }
  }

  /**
   * Adicionar stream para monitoramento
   * @param {Object} streamInfo - Informações do stream
   * @returns {Promise<void>}
   */
  async addStreamToMonitoring(streamInfo) {
    try {
      const streamId = streamInfo.id || streamInfo.stream_id;
      
      if (!streamId) {
        throw new Error('ID do stream é obrigatório');
      }
      
      const monitoringData = {
        id: streamId,
        url: streamInfo.url,
        camera_id: streamInfo.camera_id,
        status: 'active',
        lastHealthCheck: new Date(),
        lastSeen: new Date(),
        consecutiveFailures: 0,
        totalFailures: 0,
        recoveryAttempts: 0,
        isStuck: false,
        metadata: {
          resolution: streamInfo.resolution,
          fps: streamInfo.fps,
          bitrate: streamInfo.bitrate,
          codec: streamInfo.codec
        }
      };
      
      this.monitoredStreams.set(streamId, monitoringData);
      this.stats.streamsMonitored = this.monitoredStreams.size;
      
      logger.info(`[StreamAutoRecoveryService] 📹 Stream adicionado ao monitoramento: ${streamId}`);
      
      this.emit('streamAdded', { streamId, streamInfo: monitoringData });
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro ao adicionar stream:', error);
      throw error;
    }
  }

  /**
   * Remover stream do monitoramento
   * @param {string} streamId - ID do stream
   * @returns {Promise<void>}
   */
  async removeStreamFromMonitoring(streamId) {
    try {
      if (this.monitoredStreams.has(streamId)) {
        this.monitoredStreams.delete(streamId);
        this.recoveryAttempts.delete(streamId);
        this.stats.streamsMonitored = this.monitoredStreams.size;
        
        logger.info(`[StreamAutoRecoveryService] 📹 Stream removido do monitoramento: ${streamId}`);
        
        this.emit('streamRemoved', { streamId });
      }
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro ao remover stream:', error);
    }
  }

  /**
   * Carregar streams ativos do banco de dados
   * @returns {Promise<void>}
   */
  async loadActiveStreams() {
    try {
      logger.info('[StreamAutoRecoveryService] 📊 Carregando streams ativos...');
      
      const { data: streams, error } = await this.supabase
        .from('streams')
        .select('*')
        .eq('status', 'active');
      
      if (error) {
        throw error;
      }
      
      for (const stream of streams || []) {
        await this.addStreamToMonitoring(stream);
      }
      
      logger.info(`[StreamAutoRecoveryService] ✅ ${streams?.length || 0} streams carregados`);
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro ao carregar streams:', error);
    }
  }

  /**
   * Iniciar verificação de saúde periódica
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthCheck();
      }
    }, this.config.healthCheckInterval * 1000);
    
    logger.info(`[StreamAutoRecoveryService] 🔍 Verificação de saúde iniciada (intervalo: ${this.config.healthCheckInterval}s)`);
  }

  /**
   * Realizar verificação de saúde de todos os streams
   * @returns {Promise<void>}
   */
  async performHealthCheck() {
    try {
      this.stats.lastHealthCheck = new Date();
      
      logger.debug(`[StreamAutoRecoveryService] 🔍 Verificando saúde de ${this.monitoredStreams.size} streams`);
      
      const healthCheckPromises = [];
      
      for (const [streamId, streamData] of this.monitoredStreams) {
        healthCheckPromises.push(this.checkStreamHealth(streamId, streamData));
      }
      
      await Promise.allSettled(healthCheckPromises);
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro na verificação de saúde:', error);
    }
  }

  /**
   * Verificar saúde de um stream específico
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<void>}
   */
  async checkStreamHealth(streamId, streamData) {
    try {
      logger.debug(`[StreamAutoRecoveryService] 🔍 Verificando stream: ${streamId}`);
      
      // Verificar se stream está ativo no ZLMediaKit
      const isActive = await this.checkStreamInZLM(streamId);
      
      if (isActive) {
        // Stream está ativo
        await this.handleHealthyStream(streamId, streamData);
      } else {
        // Stream não está ativo
        await this.handleUnhealthyStream(streamId, streamData);
      }
      
      // Verificar se stream está travado
      await this.checkIfStreamStuck(streamId, streamData);
      
      // Atualizar última verificação
      streamData.lastHealthCheck = new Date();
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro ao verificar stream ${streamId}:`, error);
      await this.handleStreamError(streamId, streamData, error);
    }
  }

  /**
   * Verificar se stream está ativo no ZLMediaKit
   * @param {string} streamId - ID do stream
   * @returns {Promise<boolean>} - True se ativo
   */
  async checkStreamInZLM(streamId) {
    try {
      const response = await axios.get(`${this.config.zlmApiUrl}/index/api/getMediaList`, {
        params: {
          secret: this.config.zlmSecret
        },
        timeout: this.config.streamTimeout * 1000
      });
      
      if (response.data && response.data.code === 0) {
        const mediaList = response.data.data || [];
        return mediaList.some(media => 
          media.stream === streamId || 
          media.stream_id === streamId ||
          media.app === streamId
        );
      }
      
      return false;
      
    } catch (error) {
      logger.debug(`[StreamAutoRecoveryService] Erro ao verificar stream no ZLM: ${error.message}`);
      return false;
    }
  }

  /**
   * Lidar com stream saudável
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<void>}
   */
  async handleHealthyStream(streamId, streamData) {
    // Reset contadores de falha
    if (streamData.consecutiveFailures > 0) {
      logger.info(`[StreamAutoRecoveryService] ✅ Stream ${streamId} recuperado após ${streamData.consecutiveFailures} falhas`);
      
      streamData.consecutiveFailures = 0;
      streamData.isStuck = false;
      
      // Reset tentativas de recuperação
      this.recoveryAttempts.delete(streamId);
      
      this.emit('streamRecovered', { streamId, streamData });
    }
    
    streamData.status = 'active';
    streamData.lastSeen = new Date();
  }

  /**
   * Lidar com stream não saudável
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<void>}
   */
  async handleUnhealthyStream(streamId, streamData) {
    streamData.consecutiveFailures++;
    streamData.totalFailures++;
    streamData.status = 'unhealthy';
    
    logger.warn(`[StreamAutoRecoveryService] ⚠️ Stream ${streamId} não saudável (falhas consecutivas: ${streamData.consecutiveFailures})`);
    
    // Tentar recuperação se necessário
    if (streamData.consecutiveFailures >= 2) {
      await this.attemptStreamRecovery(streamId, streamData);
    }
    
    this.emit('streamUnhealthy', { streamId, streamData });
  }

  /**
   * Verificar se stream está travado
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<void>}
   */
  async checkIfStreamStuck(streamId, streamData) {
    const now = new Date();
    const timeSinceLastSeen = (now - streamData.lastSeen) / 1000;
    
    if (timeSinceLastSeen > this.config.stuckStreamThreshold) {
      if (!streamData.isStuck) {
        logger.warn(`[StreamAutoRecoveryService] 🔒 Stream ${streamId} detectado como travado (${Math.round(timeSinceLastSeen)}s sem atividade)`);
        
        streamData.isStuck = true;
        streamData.status = 'stuck';
        
        this.emit('streamStuck', { streamId, streamData, timeSinceLastSeen });
        
        // Tentar recuperação imediata para streams travados
        await this.attemptStreamRecovery(streamId, streamData, 'stuck');
      }
    }
  }

  /**
   * Lidar com erro de stream
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @param {Error} error - Erro ocorrido
   * @returns {Promise<void>}
   */
  async handleStreamError(streamId, streamData, error) {
    streamData.consecutiveFailures++;
    streamData.totalFailures++;
    streamData.status = 'error';
    streamData.lastError = {
      message: error.message,
      timestamp: new Date()
    };
    
    logger.error(`[StreamAutoRecoveryService] ❌ Erro no stream ${streamId}:`, error.message);
    
    this.emit('streamError', { streamId, streamData, error });
    
    // Tentar recuperação
    await this.attemptStreamRecovery(streamId, streamData, 'error');
  }

  /**
   * Tentar recuperação de stream
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @param {string} reason - Motivo da recuperação
   * @returns {Promise<void>}
   */
  async attemptStreamRecovery(streamId, streamData, reason = 'unhealthy') {
    try {
      // Verificar se já está em processo de recuperação
      const currentAttempts = this.recoveryAttempts.get(streamId) || { count: 0, lastAttempt: null };
      
      // Verificar se excedeu o máximo de tentativas
      if (currentAttempts.count >= this.config.maxRecoveryAttempts) {
        logger.warn(`[StreamAutoRecoveryService] 🚫 Máximo de tentativas de recuperação atingido para stream ${streamId}`);
        
        streamData.status = 'failed';
        this.emit('streamRecoveryFailed', { streamId, streamData, reason: 'max_attempts_exceeded' });
        return;
      }
      
      // Verificar intervalo entre tentativas
      if (currentAttempts.lastAttempt) {
        const timeSinceLastAttempt = (new Date() - currentAttempts.lastAttempt) / 1000;
        if (timeSinceLastAttempt < this.config.recoveryRetryInterval) {
          logger.debug(`[StreamAutoRecoveryService] ⏳ Aguardando intervalo de recuperação para stream ${streamId}`);
          return;
        }
      }
      
      currentAttempts.count++;
      currentAttempts.lastAttempt = new Date();
      this.recoveryAttempts.set(streamId, currentAttempts);
      
      logger.info(`[StreamAutoRecoveryService] 🔄 Tentativa de recuperação ${currentAttempts.count}/${this.config.maxRecoveryAttempts} para stream ${streamId} (motivo: ${reason})`);
      
      this.stats.totalRecoveries++;
      
      // Executar estratégias de recuperação
      const recoverySuccess = await this.executeRecoveryStrategies(streamId, streamData, reason);
      
      if (recoverySuccess) {
        this.stats.successfulRecoveries++;
        logger.info(`[StreamAutoRecoveryService] ✅ Recuperação bem-sucedida para stream ${streamId}`);
        
        // Reset tentativas
        this.recoveryAttempts.delete(streamId);
        
        this.emit('streamRecoverySuccess', { streamId, streamData, attempts: currentAttempts.count });
      } else {
        this.stats.failedRecoveries++;
        logger.warn(`[StreamAutoRecoveryService] ❌ Falha na recuperação para stream ${streamId}`);
        
        this.emit('streamRecoveryAttempt', { streamId, streamData, attempts: currentAttempts.count, success: false });
      }
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro na tentativa de recuperação para stream ${streamId}:`, error);
      this.stats.failedRecoveries++;
    }
  }

  /**
   * Executar estratégias de recuperação
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @param {string} reason - Motivo da recuperação
   * @returns {Promise<boolean>} - True se recuperação foi bem-sucedida
   */
  async executeRecoveryStrategies(streamId, streamData, reason) {
    const strategies = this.getRecoveryStrategies(reason);
    
    for (const strategy of strategies) {
      try {
        logger.info(`[StreamAutoRecoveryService] 🔧 Executando estratégia '${strategy}' para stream ${streamId}`);
        
        const success = await this.executeStrategy(strategy, streamId, streamData);
        
        if (success) {
          this.stats.recoveryStrategiesUsed[strategy]++;
          return true;
        }
        
      } catch (error) {
        logger.error(`[StreamAutoRecoveryService] Erro na estratégia '${strategy}' para stream ${streamId}:`, error);
      }
    }
    
    return false;
  }

  /**
   * Obter estratégias de recuperação baseadas no motivo
   * @param {string} reason - Motivo da recuperação
   * @returns {Array<string>} - Lista de estratégias
   */
  getRecoveryStrategies(reason) {
    const baseStrategies = [];
    
    switch (reason) {
      case 'stuck':
        if (this.config.enabledStrategies.reset) baseStrategies.push('reset');
        if (this.config.enabledStrategies.restart) baseStrategies.push('restart');
        break;
        
      case 'error':
        if (this.config.enabledStrategies.reconnect) baseStrategies.push('reconnect');
        if (this.config.enabledStrategies.restart) baseStrategies.push('restart');
        break;
        
      default:
        if (this.config.enabledStrategies.reconnect) baseStrategies.push('reconnect');
        if (this.config.enabledStrategies.fallback) baseStrategies.push('fallback');
        if (this.config.enabledStrategies.restart) baseStrategies.push('restart');
        break;
    }
    
    return baseStrategies;
  }

  /**
   * Executar estratégia específica
   * @param {string} strategy - Nome da estratégia
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async executeStrategy(strategy, streamId, streamData) {
    switch (strategy) {
      case 'reconnect':
        return await this.strategyReconnect(streamId, streamData);
        
      case 'restart':
        return await this.strategyRestart(streamId, streamData);
        
      case 'fallback':
        return await this.strategyFallback(streamId, streamData);
        
      case 'reset':
        return await this.strategyReset(streamId, streamData);
        
      default:
        logger.warn(`[StreamAutoRecoveryService] Estratégia desconhecida: ${strategy}`);
        return false;
    }
  }

  /**
   * Estratégia: Reconectar stream
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async strategyReconnect(streamId, streamData) {
    try {
      logger.info(`[StreamAutoRecoveryService] 🔌 Reconectando stream ${streamId}`);
      
      // Parar stream atual
      await this.stopStreamInZLM(streamId);
      
      // Aguardar um pouco
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Iniciar stream novamente
      const success = await this.startStreamInZLM(streamId, streamData);
      
      if (success) {
        logger.info(`[StreamAutoRecoveryService] ✅ Stream ${streamId} reconectado com sucesso`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro na reconexão do stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Estratégia: Reiniciar stream
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async strategyRestart(streamId, streamData) {
    try {
      logger.info(`[StreamAutoRecoveryService] 🔄 Reiniciando stream ${streamId}`);
      
      // Forçar parada do stream
      await this.forceStopStreamInZLM(streamId);
      
      // Aguardar mais tempo
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Reiniciar com configurações limpas
      const success = await this.startStreamInZLM(streamId, streamData, true);
      
      if (success) {
        logger.info(`[StreamAutoRecoveryService] ✅ Stream ${streamId} reiniciado com sucesso`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro no reinício do stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Estratégia: Fallback para URL alternativa
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async strategyFallback(streamId, streamData) {
    try {
      logger.info(`[StreamAutoRecoveryService] 🔀 Tentando fallback para stream ${streamId}`);
      
      // Buscar URLs alternativas
      const alternativeUrls = await this.getAlternativeUrls(streamData.camera_id);
      
      if (alternativeUrls.length === 0) {
        logger.warn(`[StreamAutoRecoveryService] Nenhuma URL alternativa encontrada para stream ${streamId}`);
        return false;
      }
      
      for (const altUrl of alternativeUrls) {
        try {
          logger.info(`[StreamAutoRecoveryService] 🔗 Tentando URL alternativa: ${altUrl}`);
          
          // Parar stream atual
          await this.stopStreamInZLM(streamId);
          
          // Tentar com URL alternativa
          const success = await this.startStreamInZLM(streamId, { ...streamData, url: altUrl });
          
          if (success) {
            logger.info(`[StreamAutoRecoveryService] ✅ Fallback bem-sucedido para stream ${streamId}`);
            
            // Atualizar URL no banco de dados
            await this.updateStreamUrl(streamId, altUrl);
            
            return true;
          }
          
        } catch (error) {
          logger.warn(`[StreamAutoRecoveryService] Falha na URL alternativa ${altUrl}:`, error.message);
        }
      }
      
      return false;
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro no fallback do stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Estratégia: Reset completo
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async strategyReset(streamId, streamData) {
    try {
      logger.info(`[StreamAutoRecoveryService] 🔧 Reset completo do stream ${streamId}`);
      
      // Limpar completamente o stream do ZLM
      await this.cleanStreamFromZLM(streamId);
      
      // Aguardar
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Recriar stream do zero
      const success = await this.recreateStream(streamId, streamData);
      
      if (success) {
        logger.info(`[StreamAutoRecoveryService] ✅ Reset completo bem-sucedido para stream ${streamId}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro no reset do stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Parar stream no ZLMediaKit
   * @param {string} streamId - ID do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async stopStreamInZLM(streamId) {
    try {
      const response = await axios.post(`${this.config.zlmApiUrl}/index/api/close_stream`, {
        secret: this.config.zlmSecret,
        stream: streamId
      }, {
        timeout: this.config.streamTimeout * 1000
      });
      
      return response.data && response.data.code === 0;
      
    } catch (error) {
      logger.debug(`[StreamAutoRecoveryService] Erro ao parar stream no ZLM: ${error.message}`);
      return false;
    }
  }

  /**
   * Iniciar stream no ZLMediaKit
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @param {boolean} forceClean - Forçar limpeza antes de iniciar
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async startStreamInZLM(streamId, streamData, forceClean = false) {
    try {
      if (forceClean) {
        await this.cleanStreamFromZLM(streamId);
      }
      
      const response = await axios.post(`${this.config.zlmApiUrl}/index/api/addStreamProxy`, {
        secret: this.config.zlmSecret,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: streamId,
        url: streamData.url,
        enable_hls: true,
        enable_mp4: false
      }, {
        timeout: this.config.streamTimeout * 1000
      });
      
      return response.data && response.data.code === 0;
      
    } catch (error) {
      logger.debug(`[StreamAutoRecoveryService] Erro ao iniciar stream no ZLM: ${error.message}`);
      return false;
    }
  }

  /**
   * Forçar parada do stream
   * @param {string} streamId - ID do stream
   * @returns {Promise<void>}
   */
  async forceStopStreamInZLM(streamId) {
    try {
      // Tentar múltiplas formas de parar o stream
      await Promise.allSettled([
        this.stopStreamInZLM(streamId),
        axios.post(`${this.config.zlmApiUrl}/index/api/delStreamProxy`, {
          secret: this.config.zlmSecret,
          key: streamId
        }),
        axios.post(`${this.config.zlmApiUrl}/index/api/close_streams`, {
          secret: this.config.zlmSecret,
          stream: streamId
        })
      ]);
      
    } catch (error) {
      logger.debug(`[StreamAutoRecoveryService] Erro ao forçar parada: ${error.message}`);
    }
  }

  /**
   * Limpar stream completamente do ZLM
   * @param {string} streamId - ID do stream
   * @returns {Promise<void>}
   */
  async cleanStreamFromZLM(streamId) {
    try {
      await this.forceStopStreamInZLM(streamId);
      
      // Aguardar limpeza
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      logger.debug(`[StreamAutoRecoveryService] Erro na limpeza: ${error.message}`);
    }
  }

  /**
   * Recriar stream do zero
   * @param {string} streamId - ID do stream
   * @param {Object} streamData - Dados do stream
   * @returns {Promise<boolean>} - True se bem-sucedida
   */
  async recreateStream(streamId, streamData) {
    try {
      // Buscar dados atualizados do banco
      const { data: streamInfo, error } = await this.supabase
        .from('streams')
        .select('*')
        .eq('id', streamId)
        .single();
      
      if (error || !streamInfo) {
        logger.error(`[StreamAutoRecoveryService] Não foi possível buscar dados do stream ${streamId}`);
        return false;
      }
      
      // Recriar com dados atualizados
      return await this.startStreamInZLM(streamId, streamInfo, true);
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro ao recriar stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Obter URLs alternativas para uma câmera
   * @param {string} cameraId - ID da câmera
   * @returns {Promise<Array<string>>} - Lista de URLs alternativas
   */
  async getAlternativeUrls(cameraId) {
    try {
      const { data: camera, error } = await this.supabase
        .from('cameras')
        .select('alternative_urls, backup_url')
        .eq('id', cameraId)
        .single();
      
      if (error || !camera) {
        return [];
      }
      
      const urls = [];
      
      if (camera.alternative_urls && Array.isArray(camera.alternative_urls)) {
        urls.push(...camera.alternative_urls);
      }
      
      if (camera.backup_url) {
        urls.push(camera.backup_url);
      }
      
      return urls.filter(url => url && url.trim());
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro ao buscar URLs alternativas:`, error);
      return [];
    }
  }

  /**
   * Atualizar URL do stream no banco de dados
   * @param {string} streamId - ID do stream
   * @param {string} newUrl - Nova URL
   * @returns {Promise<void>}
   */
  async updateStreamUrl(streamId, newUrl) {
    try {
      const { error } = await this.supabase
        .from('streams')
        .update({ url: newUrl, updated_at: new Date().toISOString() })
        .eq('id', streamId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error(`[StreamAutoRecoveryService] Erro ao atualizar URL do stream:`, error);
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
    }, this.config.cleanupInterval * 60 * 60 * 1000); // horas para ms
    
    logger.info(`[StreamAutoRecoveryService] 🧹 Limpeza automática iniciada (intervalo: ${this.config.cleanupInterval}h)`);
  }

  /**
   * Realizar limpeza de dados antigos
   * @returns {Promise<void>}
   */
  async performCleanup() {
    try {
      logger.info('[StreamAutoRecoveryService] 🧹 Realizando limpeza de dados antigos');
      
      // Limpar tentativas de recuperação antigas
      const now = new Date();
      for (const [streamId, attempts] of this.recoveryAttempts) {
        const timeSinceLastAttempt = (now - attempts.lastAttempt) / 1000 / 60 / 60; // horas
        
        if (timeSinceLastAttempt > 24) { // 24 horas
          this.recoveryAttempts.delete(streamId);
          logger.debug(`[StreamAutoRecoveryService] Limpeza: removidas tentativas antigas para stream ${streamId}`);
        }
      }
      
      // Remover streams inativos do monitoramento
      for (const [streamId, streamData] of this.monitoredStreams) {
        const timeSinceLastCheck = (now - streamData.lastHealthCheck) / 1000 / 60 / 60; // horas
        
        if (timeSinceLastCheck > 48) { // 48 horas
          this.monitoredStreams.delete(streamId);
          logger.debug(`[StreamAutoRecoveryService] Limpeza: removido stream inativo ${streamId}`);
        }
      }
      
      this.stats.streamsMonitored = this.monitoredStreams.size;
      
      logger.info('[StreamAutoRecoveryService] ✅ Limpeza concluída');
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro na limpeza:', error);
    }
  }

  /**
   * Obter estatísticas do serviço
   * @returns {Object} - Estatísticas
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      monitoredStreamsCount: this.monitoredStreams.size,
      activeRecoveryAttempts: this.recoveryAttempts.size,
      config: this.config
    };
  }

  /**
   * Obter status detalhado dos streams monitorados
   * @returns {Array} - Lista de streams com status
   */
  getMonitoredStreamsStatus() {
    const streams = [];
    
    for (const [streamId, streamData] of this.monitoredStreams) {
      const recoveryAttempts = this.recoveryAttempts.get(streamId);
      
      streams.push({
        id: streamId,
        status: streamData.status,
        consecutiveFailures: streamData.consecutiveFailures,
        totalFailures: streamData.totalFailures,
        isStuck: streamData.isStuck,
        lastHealthCheck: streamData.lastHealthCheck,
        lastSeen: streamData.lastSeen,
        recoveryAttempts: recoveryAttempts ? recoveryAttempts.count : 0,
        lastRecoveryAttempt: recoveryAttempts ? recoveryAttempts.lastAttempt : null,
        lastError: streamData.lastError
      });
    }
    
    return streams;
  }

  /**
   * Limpar recursos
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      logger.info('[StreamAutoRecoveryService] Limpando recursos...');
      
      await this.stop();
      
      logger.info('[StreamAutoRecoveryService] Recursos limpos com sucesso');
      
    } catch (error) {
      logger.error('[StreamAutoRecoveryService] Erro na limpeza:', error);
    }
  }
}

export default new StreamAutoRecoveryService();