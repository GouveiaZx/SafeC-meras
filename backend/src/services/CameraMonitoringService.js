import { createModuleLogger } from '../config/logger.js';
import { Camera } from '../models/Camera.js';
import { StreamingService } from './StreamingService.js';
import { EventEmitter } from 'events';

const logger = createModuleLogger('CameraMonitoringService');

class CameraMonitoringService extends EventEmitter {
  constructor() {
    super();
    this.monitoringInterval = null;
    this.reconnectionAttempts = new Map();
    this.maxReconnectionAttempts = 5;
    this.monitoringIntervalMs = 30000; // 30 segundos
    this.reconnectionDelayMs = 5000; // 5 segundos
    this.isRunning = false;
    this.streamingService = null;
  }

  /**
   * Inicializar o serviço de monitoramento
   */
  async initialize(streamingService) {
    this.streamingService = streamingService;
    logger.info('Serviço de monitoramento de câmeras inicializado');
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
      
      // Verificar se há stream ativo
      const activeStream = this.streamingService.getStream(cameraId);
      
      if (!activeStream) {
        // Câmera deveria estar online mas não tem stream ativo
        if (camera.status === 'online') {
          logger.warn(`Câmera ${camera.name} está marcada como online mas não tem stream ativo`);
          await this.attemptReconnection(camera);
        }
        return;
      }

      // Verificar se o stream está realmente funcionando
      const isStreamHealthy = await this.checkStreamHealth(activeStream);
      
      if (!isStreamHealthy) {
        logger.warn(`Stream da câmera ${camera.name} não está saudável`);
        await this.attemptReconnection(camera);
      } else {
        // Stream está saudável, resetar tentativas de reconexão
        this.reconnectionAttempts.delete(cameraId);
        
        // Atualizar status se necessário
        if (camera.status !== 'online') {
          await camera.updateStatus('online');
          logger.info(`Câmera ${camera.name} reconectada com sucesso`);
          this.emit('camera_reconnected', { camera, stream: activeStream });
        }
      }
    } catch (error) {
      logger.error(`Erro ao verificar câmera ${camera.name}:`, error);
    }
  }

  /**
   * Verificar se o stream está saudável
   */
  async checkStreamHealth(stream) {
    try {
      // Verificar se o stream foi atualizado recentemente
      const lastUpdate = new Date(stream.last_activity || stream.started_at);
      const now = new Date();
      const timeDiff = now - lastUpdate;
      
      // Se não houve atividade nos últimos 2 minutos, considerar não saudável
      if (timeDiff > 120000) {
        logger.debug(`Stream ${stream.id} sem atividade há ${Math.round(timeDiff/1000)}s`);
        return false;
      }

      // Verificar se o status do stream é válido
      if (stream.status !== 'active') {
        logger.debug(`Stream ${stream.id} com status inválido: ${stream.status}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Erro ao verificar saúde do stream:', error);
      return false;
    }
  }

  /**
   * Tentar reconectar uma câmera
   */
  async attemptReconnection(camera) {
    const cameraId = camera.id;
    const attempts = this.reconnectionAttempts.get(cameraId) || 0;

    if (attempts >= this.maxReconnectionAttempts) {
      logger.error(`Máximo de tentativas de reconexão atingido para câmera ${camera.name}`);
      await camera.updateStatus('error');
      this.emit('camera_failed', { camera, attempts });
      return;
    }

    this.reconnectionAttempts.set(cameraId, attempts + 1);
    
    logger.info(`Tentativa ${attempts + 1}/${this.maxReconnectionAttempts} de reconexão para câmera ${camera.name}`);
    
    try {
      // Atualizar status para connecting
      await camera.updateStatus('connecting');
      
      // Parar stream existente se houver
      const existingStream = this.streamingService.getStream(cameraId);
      if (existingStream) {
        await this.streamingService.stopStream(cameraId, 'system');
      }

      // Aguardar um pouco antes de tentar reconectar
      await new Promise(resolve => setTimeout(resolve, this.reconnectionDelayMs));

      // Tentar iniciar novo stream
      const streamResult = await this.streamingService.startStream(cameraId, 'system');
      
      if (streamResult && streamResult.success) {
        logger.info(`Câmera ${camera.name} reconectada com sucesso`);
        await camera.updateStatus('online');
        this.reconnectionAttempts.delete(cameraId);
        this.emit('camera_reconnected', { camera, stream: streamResult });
      } else {
        throw new Error('Falha ao iniciar stream');
      }
    } catch (error) {
      logger.error(`Falha na reconexão da câmera ${camera.name}:`, error);
      await camera.updateStatus('offline');
      this.emit('camera_reconnection_failed', { camera, attempts: attempts + 1, error });
      
      // Agendar próxima tentativa
      setTimeout(() => {
        this.attemptReconnection(camera);
      }, this.reconnectionDelayMs * (attempts + 1)); // Delay progressivo
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
      maxReconnectionAttempts: this.maxReconnectionAttempts
    };
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

    logger.info('Configuração do monitoramento atualizada:', {
      monitoringInterval: this.monitoringIntervalMs,
      maxReconnectionAttempts: this.maxReconnectionAttempts,
      reconnectionDelay: this.reconnectionDelayMs
    });
  }
}

const cameraMonitoringService = new CameraMonitoringService();

export { CameraMonitoringService };
export default cameraMonitoringService;