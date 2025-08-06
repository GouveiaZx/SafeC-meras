import { createModuleLogger } from '../config/logger.js';
import { Camera } from '../models/Camera.js';
import unifiedStreamingService from './UnifiedStreamingService.js';
import { EventEmitter } from 'events';
import alertService from './AlertService.js';

const logger = createModuleLogger('CameraMonitoringService');

class CameraMonitoringService extends EventEmitter {
  constructor() {
    super();
    this.monitoringInterval = null;
    this.reconnectionAttempts = new Map();
    this.consecutiveFailures = new Map(); // Rastrear falhas consecutivas
    this.lastSuccessfulCheck = new Map(); // Última verificação bem-sucedida
    this.cameraBackoffTime = new Map(); // Tempo de backoff exponencial por câmera
    this.maxReconnectionAttempts = 5; // Aumentado para dar mais chances
    this.maxConsecutiveFailures = 5; // Aumentado para reduzir falsos positivos
    this.monitoringIntervalMs = 60000; // 60 segundos - mais conservador
    this.reconnectionDelayMs = 15000; // 15 segundos - inicial
    this.maxReconnectionDelayMs = 120000; // 120 segundos - máximo
    this.healthCheckTimeoutMs = 30000; // 30 segundos - tempo suficiente para verificação
    this.isRunning = false;
    this.streamingService = null;
    this.recordingService = null;
    this.streamAutoRecoveryService = null; // Serviço de recuperação automática
    this.cameraLastError = new Map(); // Último erro por câmera
    this.cameraStabilityScore = new Map(); // Score de estabilidade por câmera
  }

  /**
   * Inicializar o serviço de monitoramento
   */
  async initialize() {
    this.streamingService = unifiedStreamingService;
    logger.info('Serviço de monitoramento de câmeras inicializado');
  }

  /**
   * Definir referência do RecordingService
   */
  setRecordingService(recordingService) {
    this.recordingService = recordingService;
    logger.info('[CameraMonitoringService] 🔗 RecordingService conectado');
  }

  /**
   * Definir referência do StreamAutoRecoveryService
   */
  setStreamAutoRecoveryService(streamAutoRecoveryService) {
    this.streamAutoRecoveryService = streamAutoRecoveryService;
    logger.info('[CameraMonitoringService] 🔗 StreamAutoRecoveryService conectado');
  }

  /**
   * Iniciar monitoramento contínuo
   */
  startMonitoring() {
    if (this.isRunning) {
      logger.warn('Monitoramento já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info('Iniciando monitoramento contínuo de câmeras');

    // Executar verificação inicial
    this.checkAllCameras();

    // Configurar intervalo de monitoramento
    this.monitoringInterval = setInterval(() => {
      this.checkAllCameras();
    }, this.monitoringIntervalMs);

    this.emit('monitoring_started');
  }

  /**
   * Parar monitoramento
   */
  stopMonitoring() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Monitoramento de câmeras parado');
    this.emit('monitoring_stopped');
  }

  /**
   * Verificar todas as câmeras ativas
   */
  async checkAllCameras() {
    try {
      const result = await Camera.findAll({ 
        active: true,
        limit: 100
      });
      const cameras = result.cameras || [];

      logger.debug(`Verificando ${cameras.length} câmeras ativas`);

      for (const camera of cameras) {
        await this.checkCameraStatus(camera);
      }
    } catch (error) {
      logger.error('Erro ao verificar câmeras:', error);
    }
  }

  /**
   * Verificar status de uma câmera específica
   */
  async checkCameraStatus(camera) {
    try {
      const cameraId = camera.id;
      logger.debug(`Iniciando verificação de status da câmera ${camera.name} (ID: ${cameraId})`);
      
      // Verificar se a câmera tem configuração válida
      if (!camera.rtsp_url || !camera.rtsp_url.trim()) {
        logger.warn(`Câmera ${camera.name} não tem RTSP URL configurada`);
        await this.handleCameraConfigurationError(camera);
        return;
      }
      
      // Verificar se há stream ativo
      const activeStream = this.streamingService.getStream(cameraId);
      
      if (!activeStream) {
        // Câmera deveria estar online mas não tem stream ativo
        if (camera.status === 'online' || camera.status === 'recording') {
          logger.debug(`Câmera ${camera.name} está marcada como ${camera.status} mas não tem stream ativo`);
          await this.handleMissingStream(camera);
        } else {
          logger.debug(`Câmera ${camera.name} está ${camera.status} e não tem stream ativo - OK`);
        }
        return;
      }

      // Verificar se o stream está realmente funcionando
      logger.debug(`Verificando saúde do stream ${activeStream.id} da câmera ${camera.name}`);
      const isStreamHealthy = await this.checkStreamHealthWithTimeout(activeStream);
      
      if (!isStreamHealthy) {
        logger.warn(`Stream da câmera ${camera.name} não está saudável`);
        await this.handleUnhealthyStream(camera);
      } else {
        logger.debug(`Stream da câmera ${camera.name} está saudável`);
        // Verificar se a gravação contínua está ativa (se habilitada)
        if (camera.continuous_recording) {
          await this.checkContinuousRecording(camera);
        }
        
        // Stream está saudável, resetar contadores de falha
        await this.handleHealthyStream(camera);
      }
    } catch (error) {
      logger.error(`Erro ao verificar câmera ${camera.name}:`, error);
      await this.handleCameraCheckError(camera, error);
    }
  }

  /**
   * Verificar se o stream está saudável com timeout
   */
  async checkStreamHealthWithTimeout(stream) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`Timeout na verificação de saúde do stream ${stream.id}`);
        resolve(false);
      }, this.healthCheckTimeoutMs);
      
      this.checkStreamHealth(stream)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          logger.error('Erro na verificação de saúde do stream:', error);
          resolve(false);
        });
    });
  }

  /**
   * Verificar saúde do stream com verificação mais robusta
   */
  async checkStreamHealth(stream) {
    try {
      // Verificar se o stream foi atualizado recentemente
      const lastUpdate = new Date(stream.last_activity || stream.started_at);
      const now = new Date();
      const timeDiff = now - lastUpdate;
      
      // Aumentar tolerância para 5 minutos para evitar falsos positivos
      const maxInactiveTime = 5 * 60 * 1000; // 5 minutos
      
      if (timeDiff > maxInactiveTime) {
        logger.warn(`Stream ${stream.id} sem atividade há ${Math.round(timeDiff/1000)}s (limite: ${maxInactiveTime/1000}s)`);
        return false;
      }

      // Verificar se o status do stream é válido
      if (stream.status !== 'active') {
        logger.debug(`Stream ${stream.id} com status inválido: ${stream.status}`);
        return false;
      }

      // Verificar se há dados de stream válidos
      const hasValidHlsUrl = stream.hls_url && stream.hls_url.trim() !== '';
      const hasValidRtmpUrl = stream.rtmp_url && stream.rtmp_url.trim() !== '';
      
      if (!hasValidHlsUrl && !hasValidRtmpUrl) {
        logger.warn(`Stream ${stream.id} sem URLs válidas - HLS: ${stream.hls_url}, RTMP: ${stream.rtmp_url}`);
        return false;
      }
      
      // Verificar se as URLs são acessíveis (verificação básica de formato)
      if (hasValidHlsUrl) {
        try {
          const hlsUrl = new URL(stream.hls_url);
          if (!hlsUrl.pathname.endsWith('.m3u8')) {
            logger.warn(`Stream ${stream.id} - URL HLS não termina com .m3u8: ${stream.hls_url}`);
          }
        } catch (error) {
          logger.warn(`Stream ${stream.id} - URL HLS inválida: ${stream.hls_url}`);
          if (!hasValidRtmpUrl) {
            return false;
          }
        }
      }
      
      if (hasValidRtmpUrl) {
        try {
          const rtmpUrl = new URL(stream.rtmp_url);
          if (!rtmpUrl.protocol.startsWith('rtmp')) {
            logger.warn(`Stream ${stream.id} - URL RTMP não usa protocolo RTMP: ${stream.rtmp_url}`);
          }
        } catch (error) {
          logger.warn(`Stream ${stream.id} - URL RTMP inválida: ${stream.rtmp_url}`);
          if (!hasValidHlsUrl) {
            return false;
          }
        }
      }

      // Verificação adicional: verificar se o stream existe no ZLMediaKit
      const existsInZLM = await this.checkStreamInZLM(stream.id);
      if (!existsInZLM) {
        logger.warn(`Stream ${stream.id} não encontrado no ZLMediaKit`);
        return false;
      }

      logger.debug(`Stream ${stream.id} está saudável (última atividade: ${Math.round(timeDiff/1000)}s atrás)`);
      return true;
    } catch (error) {
      logger.error('Erro ao verificar saúde do stream:', error);
      return false;
    }
  }

  /**
   * Lidar com câmera sem configuração válida
   */
  async handleCameraConfigurationError(camera) {
    const cameraId = camera.id;
    
    if (camera.status !== 'error') {
      logger.warn(`Marcando câmera ${camera.name} como erro devido à configuração inválida`);
      await camera.updateStatus('error');
      
      // Enviar alerta
      alertService.triggerCameraOffline({
        id: camera.id,
        name: camera.name,
        ip: camera.ip,
        reason: 'Configuração inválida - RTSP URL não definida'
      });
      
      this.emit('camera_configuration_error', { camera });
    }
  }

  /**
   * Lidar com stream ausente
   */
  async handleMissingStream(camera) {
    const cameraId = camera.id;
    const failures = this.consecutiveFailures.get(cameraId) || 0;
    
    // Incrementar falhas consecutivas
    this.consecutiveFailures.set(cameraId, failures + 1);
    
    if (failures < 2) {
      // Primeiras falhas - tentar reconectar sem marcar como offline
      logger.debug(`Tentando reconectar câmera ${camera.name} (falha ${failures + 1})`);
      await this.attemptReconnection(camera);
    } else {
      // Múltiplas falhas - marcar como offline
      logger.warn(`Câmera ${camera.name} offline após ${failures + 1} falhas consecutivas`);
      await camera.updateStatus('offline');
      
      // Enviar alerta de câmera offline
      alertService.triggerCameraOffline({
        id: camera.id,
        name: camera.name,
        ip: camera.ip,
        reason: `Stream ausente após ${failures + 1} falhas consecutivas`
      });
    }
  }

  /**
   * Lidar com stream não saudável
   */
  async handleUnhealthyStream(camera) {
    const cameraId = camera.id;
    const failures = this.consecutiveFailures.get(cameraId) || 0;
    
    this.consecutiveFailures.set(cameraId, failures + 1);
    
    // Adicionar stream ao monitoramento de recuperação automática se disponível
    if (this.streamAutoRecoveryService && failures === 1) {
      const activeStream = this.streamingService.getStream(cameraId);
      if (activeStream) {
        logger.info(`[CameraMonitoringService] 🔄 Adicionando stream ${activeStream.id} ao monitoramento de recuperação automática`);
        await this.streamAutoRecoveryService.addStreamToMonitoring(activeStream.id, {
          camera_id: cameraId,
          camera_name: camera.name,
          rtsp_url: camera.rtsp_url,
          hls_url: activeStream.hls_url,
          rtmp_url: activeStream.rtmp_url
        });
      }
    }
    
    if (failures >= this.maxConsecutiveFailures) {
      logger.error(`Câmera ${camera.name} marcada como erro após ${failures + 1} falhas consecutivas`);
      await camera.updateStatus('error');
      this.emit('camera_failed', { camera, consecutiveFailures: failures + 1 });
    } else if (failures >= 2) {
      logger.warn(`Stream da câmera ${camera.name} não saudável (falha ${failures + 1})`);
      await this.attemptReconnection(camera);
    } else {
      logger.debug(`Stream da câmera ${camera.name} temporariamente não saudável`);
    }
  }

  /**
   * Lidar com stream saudável
   */
  async handleHealthyStream(camera) {
    const cameraId = camera.id;
    
    // Remover stream do monitoramento de recuperação automática se estava sendo monitorado
    if (this.streamAutoRecoveryService) {
      const activeStream = this.streamingService.getStream(cameraId);
      if (activeStream) {
        logger.debug(`[CameraMonitoringService] ✅ Removendo stream ${activeStream.id} do monitoramento de recuperação (stream saudável)`);
        await this.streamAutoRecoveryService.removeStreamFromMonitoring(activeStream.id);
      }
    }
    
    // Resetar contadores de falha
    this.reconnectionAttempts.delete(cameraId);
    this.consecutiveFailures.delete(cameraId);
    this.lastSuccessfulCheck.set(cameraId, new Date());
    
    // Atualizar status se necessário
    if (camera.status !== 'online') {
      await camera.updateStatus('online');
      logger.info(`Câmera ${camera.name} reconectada com sucesso`);
      
      // Enviar alerta de câmera online
      alertService.triggerCameraOnline({
        id: camera.id,
        name: camera.name,
        ip: camera.ip
      });
      
      this.emit('camera_reconnected', { camera });
    }
  }

  /**
   * Lidar com erro na verificação da câmera
   */
  async handleCameraCheckError(camera, error) {
    const cameraId = camera.id;
    const failures = this.consecutiveFailures.get(cameraId) || 0;
    
    this.consecutiveFailures.set(cameraId, failures + 1);
    
    // Só marcar como erro após muitas falhas consecutivas
    if (failures >= this.maxConsecutiveFailures) {
      logger.error(`Câmera ${camera.name} marcada como erro após erro persistente:`, error.message);
      await camera.updateStatus('error');
      this.emit('camera_failed', { camera, error, consecutiveFailures: failures + 1 });
    }
  }

  /**
   * Tentar reconectar uma câmera com backoff exponencial
   */
  async attemptReconnection(camera) {
    const cameraId = camera.id;
    const attempts = this.reconnectionAttempts.get(cameraId) || 0;

    if (attempts >= this.maxReconnectionAttempts) {
      logger.warn(`Máximo de tentativas de reconexão atingido para câmera ${camera.name}`);
      await camera.updateStatus('error');
      this.cameraStabilityScore.set(cameraId, 0); // Reset score
      return;
    }

    this.reconnectionAttempts.set(cameraId, attempts + 1);
    
    // Calcular delay com backoff exponencial
    const baseDelay = this.reconnectionDelayMs;
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, attempts),
      this.maxReconnectionDelayMs
    );
    
    logger.info(`Tentativa ${attempts + 1}/${this.maxReconnectionAttempts} de reconexão para câmera ${camera.name} (delay: ${exponentialDelay}ms)`);
    
    try {
      // Parar stream existente se houver
      const existingStream = this.streamingService.getStream(cameraId);
      if (existingStream) {
        logger.debug(`Parando stream existente para câmera ${camera.name}`);
        await this.streamingService.stopStream(cameraId, 'system');
        // Aguardar um pouco para garantir que o stream foi parado
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Aguardar com backoff exponencial
      await new Promise(resolve => setTimeout(resolve, exponentialDelay));

      // Verificar conectividade básica antes de tentar stream
      logger.debug(`Verificando conectividade básica da câmera ${camera.name}`);
      const isReachable = await this.checkCameraReachability(camera);
      
      if (!isReachable) {
        throw new Error('Câmera não está acessível na rede');
      }

      // Tentar iniciar novo stream com configurações otimizadas
      const streamResult = await this.streamingService.startStream(cameraId, {
        quality: 'low', // Usar qualidade baixa para reconexão
        format: 'hls',
        audio: false, // Desabilitar áudio para reduzir carga
        timeout: 15000, // Timeout específico para reconexão
        retries: 1 // Apenas uma tentativa por vez
      });
      
      if (streamResult && streamResult.success) {
        logger.info(`✅ Câmera ${camera.name} reconectada com sucesso`);
        await camera.updateStatus('online');
        
        // Reset contadores e melhorar score de estabilidade
        this.reconnectionAttempts.delete(cameraId);
        this.consecutiveFailures.delete(cameraId);
        this.cameraLastError.delete(cameraId);
        
        const currentScore = this.cameraStabilityScore.get(cameraId) || 50;
        this.cameraStabilityScore.set(cameraId, Math.min(100, currentScore + 10));
        
        this.emit('camera_reconnected', { camera, stream: streamResult.data, attempts: attempts + 1 });
        
        // Se a câmera tem gravação contínua habilitada, verificar se precisa reiniciar
        if (camera.continuous_recording) {
          setTimeout(() => this.checkContinuousRecording(camera), 10000);
        }
      } else {
        const errorMsg = streamResult?.error || streamResult?.message || 'Falha ao iniciar stream';
        throw new Error(errorMsg);
      }
    } catch (error) {
      logger.warn(`❌ Falha na reconexão da câmera ${camera.name} (tentativa ${attempts + 1}):`, error.message);
      
      // Armazenar último erro
      this.cameraLastError.set(cameraId, {
        message: error.message,
        timestamp: new Date(),
        attempt: attempts + 1
      });
      
      // Reduzir score de estabilidade
      const currentScore = this.cameraStabilityScore.get(cameraId) || 50;
      this.cameraStabilityScore.set(cameraId, Math.max(0, currentScore - 5));
      
      this.emit('camera_reconnection_failed', { camera, attempts: attempts + 1, error });
      
      // Se atingiu o máximo de tentativas, marcar como erro
      if (attempts + 1 >= this.maxReconnectionAttempts) {
        logger.error(`🚨 Câmera ${camera.name} marcada como erro após ${attempts + 1} tentativas de reconexão`);
        await camera.updateStatus('error');
        
        alertService.triggerCameraOffline({
          id: camera.id,
          name: camera.name,
          ip: camera.ip,
          reason: `Falha persistente após ${attempts + 1} tentativas: ${error.message}`
        });
      }
    }
  }

  /**
   * Forçar reconexão de uma câmera específica
   */
  async forceReconnection(cameraId) {
    try {
      const camera = await Camera.findById(cameraId);
      if (!camera) {
        throw new Error('Câmera não encontrada');
      }

      // Resetar tentativas de reconexão
      this.reconnectionAttempts.delete(cameraId);
      
      await this.attemptReconnection(camera);
    } catch (error) {
      logger.error(`Erro ao forçar reconexão da câmera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Obter estatísticas do monitoramento
   */
  getMonitoringStats() {
    return {
      isRunning: this.isRunning,
      monitoringInterval: this.monitoringIntervalMs,
      reconnectionAttempts: Object.fromEntries(this.reconnectionAttempts),
      consecutiveFailures: Object.fromEntries(this.consecutiveFailures),
      lastSuccessfulCheck: Object.fromEntries(this.lastSuccessfulCheck),
      maxReconnectionAttempts: this.maxReconnectionAttempts,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      healthCheckTimeout: this.healthCheckTimeoutMs
    };
  }

  /**
   * Verificar se a gravação contínua está funcionando
   */
  async checkContinuousRecording(camera) {
    try {
      // Se temos referência do RecordingService, usar ele
      if (this.recordingService) {
        const recordingStatus = await this.recordingService.getCameraRecordingStatus(camera.id);
        
        if (!recordingStatus || recordingStatus.status !== 'recording') {
          logger.warn(`[CameraMonitoringService] ⚠️ Câmera ${camera.name} deveria estar gravando mas não há gravação ativa`);
          this.emit('recording_missing', { camera });
          
          // Solicitar ao RecordingService para iniciar gravação
          try {
            await this.recordingService.startCameraRecording(camera);
            logger.info(`[CameraMonitoringService] ✅ Gravação contínua solicitada para câmera ${camera.name}`);
          } catch (recordingError) {
            logger.error(`[CameraMonitoringService] ❌ Falha ao solicitar gravação para câmera ${camera.name}:`, recordingError);
          }
        } else {
          // Verificar se a gravação está saudável
          const recordingAge = Date.now() - new Date(recordingStatus.startTime).getTime();
          const thirtyMinutes = 30 * 60 * 1000;
          
          // Se a gravação está há mais de 30 minutos, pode precisar de segmentação
          if (recordingAge > thirtyMinutes) {
            logger.info(`[CameraMonitoringService] 📹 Gravação da câmera ${camera.name} ativa há ${Math.round(recordingAge/(1000*60))} minutos - segmentação será feita automaticamente`);
          }
        }
      } else {
        // Fallback: apenas emitir evento de gravação ausente
        logger.warn(`[CameraMonitoringService] ⚠️ Câmera ${camera.name} deveria estar gravando mas RecordingService não está disponível`);
        this.emit('recording_missing', { camera });
      }
    } catch (error) {
      logger.error(`[CameraMonitoringService] ❌ Erro ao verificar gravação contínua da câmera ${camera.name}:`, error);
    }
  }

  /**
   * Verificar se o stream existe no ZLMediaKit
   */
  async checkStreamInZLM(streamId) {
    try {
      const zlmBaseUrl = process.env.ZLM_BASE_URL || 'http://localhost:8000';
      const zlmSecret = process.env.ZLMEDIAKIT_SECRET || process.env.ZLM_SECRET || '035c73f7-bb6b-4889-a715-d9eb2d1925cc';
      
      const response = await fetch(`${zlmBaseUrl}/index/api/getMediaList?secret=${zlmSecret}`, {
        method: 'GET',
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.code === 0 && data.data) {
          return data.data.some(media => 
            media.stream === streamId || 
            media.stream_id === streamId ||
            (media.app === 'live' && media.stream === streamId)
          );
        }
      }
      
      return false;
    } catch (error) {
      logger.warn(`Erro ao verificar stream ${streamId} no ZLMediaKit:`, error.message);
      return false;
    }
  }

  /**
   * Verificar se a câmera está acessível na rede
   */
  async checkCameraReachability(camera) {
    try {
      // Extrair IP da URL RTSP
      const rtspUrl = camera.rtsp_url;
      if (!rtspUrl) {
        logger.warn(`Câmera ${camera.name} não tem URL RTSP configurada`);
        return false;
      }
      
      const urlMatch = rtspUrl.match(/rtsp:\/\/([^:\/]+)/);
      if (!urlMatch) {
        logger.warn(`URL RTSP inválida para câmera ${camera.name}: ${rtspUrl}`);
        return false;
      }
      
      const ip = urlMatch[1];
      
      // Verificação mais robusta de conectividade
      logger.debug(`Verificando conectividade da câmera ${camera.name} (${ip})...`);
      
      // Adicionar delay para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.debug(`Conectividade da câmera ${camera.name} verificada com sucesso`);
      return true;
      
    } catch (error) {
      logger.warn(`Falha na verificação de conectividade da câmera ${camera.name}:`, error.message);
      return false;
    }
  }

  /**
   * Obter score de estabilidade de uma câmera
   */
  getCameraStabilityScore(cameraId) {
    return this.cameraStabilityScore.get(cameraId) || 50;
  }

  /**
   * Obter último erro de uma câmera
   */
  getCameraLastError(cameraId) {
    return this.cameraLastError.get(cameraId) || null;
  }

  /**
   * Resetar estatísticas de uma câmera
   */
  resetCameraStats(cameraId) {
    this.reconnectionAttempts.delete(cameraId);
    this.consecutiveFailures.delete(cameraId);
    this.cameraLastError.delete(cameraId);
    this.cameraStabilityScore.set(cameraId, 75); // Score inicial bom
    logger.info(`Estatísticas resetadas para câmera ${cameraId}`);
  }

  /**
   * Configurar parâmetros do monitoramento
   */
  configure(options = {}) {
    if (options.monitoringInterval) {
      this.monitoringIntervalMs = options.monitoringInterval;
    }
    if (options.maxReconnectionAttempts) {
      this.maxReconnectionAttempts = options.maxReconnectionAttempts;
    }
    if (options.reconnectionDelay) {
      this.reconnectionDelayMs = options.reconnectionDelay;
    }
    if (options.maxReconnectionDelay) {
      this.maxReconnectionDelayMs = options.maxReconnectionDelay;
    }

    logger.info('Configuração do monitoramento atualizada:', {
      monitoringInterval: this.monitoringIntervalMs,
      maxReconnectionAttempts: this.maxReconnectionAttempts,
      reconnectionDelay: this.reconnectionDelayMs,
      maxReconnectionDelay: this.maxReconnectionDelayMs
    });
  }
}

const cameraMonitoringService = new CameraMonitoringService();

export { CameraMonitoringService };
export default cameraMonitoringService;