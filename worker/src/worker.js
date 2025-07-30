import { io } from 'socket.io-client';
import axios from 'axios';
import winston from 'winston';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega variáveis de ambiente do diretório worker
dotenv.config({ path: join(__dirname, '../.env') });

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'worker.log' })
  ]
});

class CameraWorker {
  constructor() {
    this.socket = null;
    this.cameras = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    
    // Configurações do backend
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
    this.workerToken = process.env.WORKER_TOKEN;
    
    if (!this.workerToken) {
      logger.error('WORKER_TOKEN não encontrado nas variáveis de ambiente');
      process.exit(1);
    }
    
    logger.info('Worker iniciado');
    this.connect();
  }
  
  connect() {
    try {
      logger.info(`Conectando ao backend: ${this.backendUrl}`);
      
      this.socket = io(this.backendUrl, {
        auth: {
          token: this.workerToken,
          type: 'worker'
        },
        transports: ['websocket', 'polling']
      });
      
      this.setupEventHandlers();
    } catch (error) {
      logger.error(`Erro ao conectar: ${error.message}`);
      this.scheduleReconnect();
    }
  }
  
  setupEventHandlers() {
    this.socket.on('connect', () => {
      logger.info('Conectado ao backend via WebSocket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Solicita lista de câmeras
      this.requestCameraList();
    });
    
    this.socket.on('disconnect', (reason) => {
      logger.warn(`Desconectado do backend: ${reason}`);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Reconexão manual necessária
        this.scheduleReconnect();
      }
    });
    
    this.socket.on('connect_error', (error) => {
      logger.error(`Erro de conexão: ${error.message}`);
      this.scheduleReconnect();
    });
    
    this.socket.on('camera_list', (cameras) => {
      logger.info(`Recebida lista de ${cameras.length} câmeras`);
      this.updateCameraList(cameras);
    });
    
    this.socket.on('camera_added', (camera) => {
      logger.info(`Nova câmera adicionada: ${camera.name} (${camera.ip})`);
      this.addCamera(camera);
    });
    
    this.socket.on('camera_removed', (cameraId) => {
      logger.info(`Câmera removida: ${cameraId}`);
      this.removeCamera(cameraId);
    });
    
    this.socket.on('camera_updated', (camera) => {
      logger.info(`Câmera atualizada: ${camera.name} (${camera.ip})`);
      this.updateCamera(camera);
    });
  }
  
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Máximo de tentativas de reconexão atingido');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    logger.info(`Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  async requestCameraList() {
    try {
      const response = await axios.get(`${this.backendUrl}/api/worker/cameras`, {
        headers: {
          'x-worker-token': this.workerToken
        }
      });
      
      if (response.data.success) {
        this.updateCameraList(response.data.cameras);
      }
    } catch (error) {
      logger.error(`Erro ao solicitar lista de câmeras: ${error.message}`);
    }
  }
  
  updateCameraList(cameras) {
    // Limpa lista atual
    this.cameras.clear();
    
    // Adiciona todas as câmeras
    cameras.forEach(camera => {
      this.addCamera(camera);
    });
    
    // Inicia monitoramento
    this.startMonitoring();
  }
  
  addCamera(camera) {
    this.cameras.set(camera.id, {
      ...camera,
      lastCheck: null,
      status: 'unknown',
      checkInterval: null
    });
    
    // Inicia monitoramento desta câmera
    this.startCameraMonitoring(camera.id);
  }
  
  removeCamera(cameraId) {
    const camera = this.cameras.get(cameraId);
    if (camera && camera.checkInterval) {
      clearInterval(camera.checkInterval);
    }
    this.cameras.delete(cameraId);
  }
  
  updateCamera(camera) {
    const existingCamera = this.cameras.get(camera.id);
    if (existingCamera) {
      // Mantém informações de monitoramento
      this.cameras.set(camera.id, {
        ...camera,
        lastCheck: existingCamera.lastCheck,
        status: existingCamera.status,
        checkInterval: existingCamera.checkInterval
      });
    } else {
      this.addCamera(camera);
    }
  }
  
  startMonitoring() {
    logger.info(`Iniciando monitoramento de ${this.cameras.size} câmeras`);
    
    // Verifica todas as câmeras imediatamente
    this.cameras.forEach((camera, id) => {
      this.checkCamera(id);
    });
  }
  
  startCameraMonitoring(cameraId) {
    const camera = this.cameras.get(cameraId);
    if (!camera) return;
    
    // Limpa intervalo anterior se existir
    if (camera.checkInterval) {
      clearInterval(camera.checkInterval);
    }
    
    // DESABILITADO: Verificação automática de câmeras
    // Comentado para evitar mudanças automáticas de status
    /*
    // Verifica a câmera a cada 30 segundos
    camera.checkInterval = setInterval(() => {
      this.checkCamera(cameraId);
    }, 30000);
    
    // Primeira verificação imediata
    this.checkCamera(cameraId);
    */
    
    logger.info(`Monitoramento automático desabilitado para câmera: ${camera.name}`);
  }
  
  async checkCamera(cameraId) {
    const camera = this.cameras.get(cameraId);
    if (!camera) return;
    
    try {
      // Extrai IP da URL RTSP se ip_address não estiver disponível
      let targetIp = camera.ip_address;
      if (!targetIp && camera.rtspUrl) {
        try {
          const url = new URL(camera.rtspUrl);
          targetIp = url.hostname;
        } catch (urlError) {
          logger.error(`Erro ao extrair IP da URL RTSP: ${urlError.message}`);
          return;
        }
      }
      
      if (!targetIp) {
        logger.warn(`Câmera ${camera.name} não tem IP definido`);
        return;
      }
      
      logger.debug(`Verificando câmera: ${camera.name} (${targetIp})`);
      
      // Tenta fazer ping na câmera
      const response = await axios.get(`http://${targetIp}`, {
        timeout: 5000,
        validateStatus: () => true // Aceita qualquer status
      });
      
      const isOnline = response.status < 500;
      const newStatus = isOnline ? 'online' : 'offline';
      
      // Atualiza status se mudou
      if (camera.status !== newStatus) {
        logger.info(`Câmera ${camera.name} mudou de ${camera.status} para ${newStatus}`);
        camera.status = newStatus;
        camera.lastCheck = new Date();
        
        // Notifica o backend
        this.notifyStatusChange(cameraId, newStatus);
      }
      
    } catch (error) {
      // Câmera offline
      if (camera.status !== 'offline') {
        logger.info(`Câmera ${camera.name} ficou offline: ${error.message}`);
        camera.status = 'offline';
        camera.lastCheck = new Date();
        
        // Notifica o backend
        this.notifyStatusChange(cameraId, 'offline');
      }
    }
  }
  
  async notifyStatusChange(cameraId, status) {
    if (!this.isConnected) {
      logger.warn('Não conectado ao backend, não é possível notificar mudança de status');
      return;
    }
    
    try {
      // Notifica via WebSocket
      this.socket.emit('camera_status_change', {
        cameraId,
        status,
        timestamp: new Date().toISOString()
      });
      
      // Também notifica via API REST como backup
      await axios.post(`${this.backendUrl}/api/worker/camera/${cameraId}/status`, {
        status,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'x-worker-token': this.workerToken,
          'Content-Type': 'application/json'
        }
      });
      
    } catch (error) {
      logger.error(`Erro ao notificar mudança de status: ${error.message}`);
    }
  }
  
  // Graceful shutdown
  shutdown() {
    logger.info('Encerrando worker...');
    
    // Para todos os intervalos de monitoramento
    this.cameras.forEach(camera => {
      if (camera.checkInterval) {
        clearInterval(camera.checkInterval);
      }
    });
    
    // Desconecta do backend
    if (this.socket) {
      this.socket.disconnect();
    }
    
    logger.info('Worker encerrado');
    process.exit(0);
  }
}

// Inicia o worker
const worker = new CameraWorker();

// Handlers para encerramento graceful
process.on('SIGINT', () => worker.shutdown());
process.on('SIGTERM', () => worker.shutdown());
process.on('uncaughtException', (error) => {
  logger.error(`Erro não capturado: ${error.message}`);
  logger.error(error.stack);
  worker.shutdown();
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Promise rejeitada não tratada: ${reason}`);
  worker.shutdown();
});

logger.info('Worker NewCAM iniciado com sucesso');