/**
 * Script para iniciar o Worker NewCAM na porta 3003
 * Responsável por monitoramento de câmeras e processamento de streams
 */

import express from 'express';
import { createServer } from 'http';
import { io } from 'socket.io-client';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../config/logger.js';
import { supabase } from '../config/database.js';
import UploadWorker from '../workers/UploadWorker.js';
import FeatureFlagService from '../services/FeatureFlagService.js';
import UploadReaper from '../services/UploadReaper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env do diretório raiz
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = createModuleLogger('Worker');
const WORKER_PORT = process.env.WORKER_PORT || 3003;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

class NewCAMWorker {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.backendSocket = null;
    this.cameras = new Map();
    this.isConnected = false;
    this.monitoringInterval = null;
    this.uploadWorker = null;
    
    this.setupExpress();
    this.connectToBackend();
    this.startCameraMonitoring();
    this.startUploadWorker();
  }

  setupExpress() {
    logger.info('Configurando servidor Express do Worker...');
    
    // Middleware básico
    this.app.use(cors());
    this.app.use(express.json());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'online',
        uptime: process.uptime(),
        connected_to_backend: this.isConnected,
        cameras_monitored: this.cameras.size,
        timestamp: new Date().toISOString()
      });
    });
    
    // Status das câmeras
    this.app.get('/cameras/status', (req, res) => {
      const camerasStatus = Array.from(this.cameras.entries()).map(([id, camera]) => ({
        id,
        name: camera.name,
        status: camera.status,
        last_check: camera.last_check,
        is_streaming: camera.is_streaming
      }));
      
      res.json({
        total: camerasStatus.length,
        cameras: camerasStatus
      });
    });
    
    // Endpoint para reiniciar monitoramento
    this.app.post('/monitoring/restart', (req, res) => {
      logger.info('Reiniciando monitoramento por requisição API');
      this.restartMonitoring();
      res.json({ message: 'Monitoramento reiniciado' });
    });

    // Upload worker endpoints
    this.app.get('/upload/status', (req, res) => {
      if (!this.uploadWorker) {
        return res.json({ status: 'not_initialized' });
      }
      res.json(this.uploadWorker.getStatus());
    });

    this.app.get('/upload/queue', async (req, res) => {
      try {
        const stats = await this.uploadWorker.getQueueStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/upload/process', async (req, res) => {
      try {
        await this.uploadWorker.forceProcess();
        res.json({ message: 'Upload processing triggered' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/upload/retry-failed', async (req, res) => {
      try {
        const result = await this.uploadWorker.retryFailed(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/upload/pause', (req, res) => {
      if (this.uploadWorker) {
        this.uploadWorker.pause();
        res.json({ message: 'Upload worker paused' });
      } else {
        res.status(400).json({ error: 'Upload worker not initialized' });
      }
    });

    this.app.post('/upload/resume', (req, res) => {
      if (this.uploadWorker) {
        this.uploadWorker.resume();
        res.json({ message: 'Upload worker resumed' });
      } else {
        res.status(400).json({ error: 'Upload worker not initialized' });
      }
    });

    // Upload Reaper endpoints
    this.app.get('/reaper/status', (req, res) => {
      res.json(UploadReaper.getStats());
    });

    this.app.post('/reaper/force-cleanup', async (req, res) => {
      try {
        const stats = await UploadReaper.forceCleanup();
        res.json({ message: 'Cleanup completed', stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Iniciar servidor
    this.server.listen(WORKER_PORT, () => {
      logger.info(`🚀 Worker NewCAM iniciado na porta ${WORKER_PORT}`);
    });
  }

  connectToBackend() {
    logger.info(`Conectando ao backend em ${BACKEND_URL}...`);
    
    this.backendSocket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 5000,
      timeout: 20000,
      transports: ['websocket']
    });
    
    this.backendSocket.on('connect', () => {
      logger.info('✅ Conectado ao backend');
      this.isConnected = true;
      
      // Registrar como worker
      this.backendSocket.emit('worker:register', {
        type: 'camera_monitor',
        version: '1.0.0',
        capabilities: ['camera_monitoring', 'stream_processing']
      });
    });
    
    this.backendSocket.on('disconnect', () => {
      logger.warn('❌ Desconectado do backend');
      this.isConnected = false;
    });
    
    this.backendSocket.on('camera:monitor', (camera) => {
      logger.debug(`📹 Adicionando câmera para monitoramento: ${camera.name}`);
      this.cameras.set(camera.id, {
        ...camera,
        last_check: null,
        status: 'unknown'
      });
    });
    
    this.backendSocket.on('camera:stop_monitor', (cameraId) => {
      logger.debug(`🛑 Removendo câmera do monitoramento: ${cameraId}`);
      this.cameras.delete(cameraId);
    });
    
    this.backendSocket.on('reconnect', (attemptNumber) => {
      logger.info(`🔄 Reconectado ao backend (tentativa ${attemptNumber})`);
    });
    
    this.backendSocket.on('connect_error', (error) => {
      logger.error('❌ Erro de conexão com backend:', error.message);
    });
  }

  async startCameraMonitoring() {
    logger.info('Iniciando monitoramento de câmeras...');
    
    // Carregar câmeras ativas do banco
    await this.loadActiveCameras();
    
    // Iniciar monitoramento periódico
    this.monitoringInterval = setInterval(() => {
      this.checkAllCameras();
    }, 30000); // A cada 30 segundos
    
    // Primeira verificação imediata
    setTimeout(() => this.checkAllCameras(), 5000);
  }

  async loadActiveCameras() {
    try {
      logger.info('Carregando câmeras ativas do banco...');
      
      const { data: cameras, error } = await supabase
        .from('cameras')
        .select('id, name, rtsp_url, status, is_streaming, active')
        .eq('active', true);
      
      if (error) {
        logger.error('Erro ao carregar câmeras:', error);
        return;
      }
      
      cameras.forEach(camera => {
        this.cameras.set(camera.id, {
          ...camera,
          last_check: null,
          check_count: 0
        });
      });
      
      logger.info(`📹 ${cameras.length} câmeras carregadas para monitoramento`);
      
    } catch (error) {
      logger.error('Erro ao carregar câmeras:', error);
    }
  }

  async checkAllCameras() {
    if (this.cameras.size === 0) {
      logger.debug('Nenhuma câmera para monitorar');
      return;
    }
    
    logger.debug(`🔍 Verificando ${this.cameras.size} câmeras...`);
    
    const promises = Array.from(this.cameras.entries()).map(([id, camera]) => 
      this.checkCameraHealth(id, camera)
    );
    
    await Promise.allSettled(promises);
  }

  async checkCameraHealth(cameraId, camera) {
    try {
      const now = new Date().toISOString();
      camera.last_check = now;
      camera.check_count = (camera.check_count || 0) + 1;
      
      // Simular verificação de saúde da câmera
      // TODO: Implementar verificação real RTSP/HTTP
      const isHealthy = await this.pingCamera(camera.rtsp_url);
      
      const newStatus = isHealthy ? 'online' : 'offline';
      const statusChanged = camera.status !== newStatus;
      
      camera.status = newStatus;
      this.cameras.set(cameraId, camera);
      
      if (statusChanged) {
        logger.info(`📊 Câmera ${camera.name}: ${camera.status}`);
        
        // Notificar backend sobre mudança de status
        if (this.isConnected) {
          this.backendSocket.emit('camera:status_change', {
            cameraId,
            status: newStatus,
            timestamp: now
          });
        }
        
        // Atualizar banco de dados
        await this.updateCameraStatus(cameraId, newStatus);
      }
      
    } catch (error) {
      logger.error(`Erro ao verificar câmera ${camera.name}:`, error.message);
      camera.status = 'error';
      camera.last_error = error.message;
    }
  }

  async pingCamera(rtspUrl) {
    // Simulação simples - em produção, implementar verificação RTSP real
    try {
      // Verificar se URL é válida
      new URL(rtspUrl);
      
      // Simulação: 90% de sucesso para câmeras
      return Math.random() > 0.1;
      
    } catch (error) {
      return false;
    }
  }

  async updateCameraStatus(cameraId, status) {
    try {
      const { error } = await supabase
        .from('cameras')
        .update({
          status,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      if (error) {
        logger.error(`Erro ao atualizar status da câmera ${cameraId}:`, error);
      }
      
    } catch (error) {
      logger.error(`Erro ao atualizar banco para câmera ${cameraId}:`, error);
    }
  }

  restartMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.cameras.clear();
    this.loadActiveCameras();
    this.startCameraMonitoring();
  }

  /**
   * Start upload worker if S3 upload is enabled
   */
  async startUploadWorker() {
    const uploadEnabled = FeatureFlagService.isEnabled('s3_upload_enabled');
    
    if (!uploadEnabled) {
      logger.info('📤 S3 upload disabled - upload worker not started');
      return;
    }

    try {
      logger.info('🚀 Starting upload worker...');
      
      this.uploadWorker = new UploadWorker({
        concurrency: parseInt(process.env.S3_UPLOAD_CONCURRENCY) || 2,
        onUploadComplete: (recording, result) => {
          logger.info(`📤 Upload completed: ${recording.filename}`, {
            s3_key: result.s3_key,
            duration_ms: result.duration_ms
          });
          
          // Notify backend via socket if connected
          if (this.isConnected && this.backendSocket) {
            this.backendSocket.emit('upload:completed', {
              recording_id: recording.id,
              s3_key: result.s3_key,
              s3_url: result.s3_url
            });
          }
        },
        onUploadError: (recording, error) => {
          logger.error(`📤 Upload failed: ${recording.filename}`, error.message);
          
          // Notify backend via socket if connected
          if (this.isConnected && this.backendSocket) {
            this.backendSocket.emit('upload:failed', {
              recording_id: recording.id,
              error: error.message
            });
          }
        }
      });

      await this.uploadWorker.start();
      logger.info('✅ Upload worker started successfully');
      
      // Start the Upload Reaper to clean stuck uploads
      UploadReaper.start();
      logger.info('🧹 Upload Reaper started successfully');
      
    } catch (error) {
      logger.error('❌ Failed to start upload worker:', error);
    }
  }

  /**
   * Stop upload worker
   */
  async stopUploadWorker() {
    if (this.uploadWorker) {
      logger.info('🛑 Stopping upload worker...');
      await this.uploadWorker.stop();
      this.uploadWorker = null;
      logger.info('✅ Upload worker stopped');
    }
    
    // Stop the Upload Reaper
    UploadReaper.stop();
    logger.info('🧹 Upload Reaper stopped');
  }
}

// Tratamento de erros
process.on('uncaughtException', (error) => {
  logger.error('Exceção não capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Recebido SIGINT, encerrando worker...');
  if (worker && worker.uploadWorker) {
    await worker.stopUploadWorker();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recebido SIGTERM, encerrando worker...');
  if (worker && worker.uploadWorker) {
    await worker.stopUploadWorker();
  }
  process.exit(0);
});

// Iniciar o worker
const worker = new NewCAMWorker();

logger.info('✅ Worker NewCAM iniciado com sucesso');