import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Serviço de monitoramento de progresso de upload
 * Gerencia eventos de upload e notifica clientes via WebSocket
 */
class UploadMonitoringService extends EventEmitter {
  constructor() {
    super();
    this.activeUploads = new Map(); // recordingId -> uploadInfo
    this.io = null;
    this.isInitialized = false;
    
    // Configurar listeners de eventos
    this.setupEventListeners();
  }
  
  /**
   * Inicializar serviço com instância do Socket.IO
   * @param {Object} io - Instância do Socket.IO
   */
  initialize(io) {
    this.io = io;
    this.isInitialized = true;
    
    logger.info('[UploadMonitoringService] Serviço inicializado com Socket.IO');
    
    // Configurar listeners do Socket.IO
    this.setupSocketListeners();
  }
  
  /**
   * Configurar listeners de eventos internos
   */
  setupEventListeners() {
    // Listener para início de upload
    this.on('upload:started', (data) => {
      this.handleUploadStarted(data);
    });
    
    // Listener para progresso de upload
    this.on('upload:progress', (data) => {
      this.handleUploadProgress(data);
    });
    
    // Listener para conclusão de upload
    this.on('upload:completed', (data) => {
      this.handleUploadCompleted(data);
    });
    
    // Listener para falha de upload
    this.on('upload:failed', (data) => {
      this.handleUploadFailed(data);
    });
    
    // Listener para retry de upload
    this.on('upload:retry', (data) => {
      this.handleUploadRetry(data);
    });
  }
  
  /**
   * Configurar listeners do Socket.IO
   */
  setupSocketListeners() {
    if (!this.io) return;
    
    this.io.on('connection', (socket) => {
      logger.info(`[UploadMonitoringService] Cliente conectado: ${socket.id}`);
      
      // Enviar status atual dos uploads ativos
      socket.emit('upload:status', {
        activeUploads: Array.from(this.activeUploads.values())
      });
      
      // Listener para solicitar status de upload específico
      socket.on('upload:get-status', (recordingId) => {
        const uploadInfo = this.activeUploads.get(recordingId);
        if (uploadInfo) {
          socket.emit('upload:status-update', uploadInfo);
        } else {
          socket.emit('upload:not-found', { recordingId });
        }
      });
      
      // Listener para solicitar lista de uploads ativos
      socket.on('upload:get-active', () => {
        socket.emit('upload:active-list', {
          uploads: Array.from(this.activeUploads.values()),
          count: this.activeUploads.size
        });
      });
      
      socket.on('disconnect', () => {
        logger.info(`[UploadMonitoringService] Cliente desconectado: ${socket.id}`);
      });
    });
  }
  
  /**
   * Registrar início de upload
   * @param {Object} uploadData - Dados do upload
   */
  startUpload(uploadData) {
    const {
      recordingId,
      cameraId,
      filePath,
      fileSize,
      jobId,
      priority = 'normal'
    } = uploadData;
    
    const uploadInfo = {
      recordingId,
      cameraId,
      filePath,
      fileSize,
      jobId,
      priority,
      status: 'started',
      progress: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 1,
      error: null,
      estimatedTimeRemaining: null,
      uploadSpeed: null
    };
    
    this.activeUploads.set(recordingId, uploadInfo);
    
    // Emitir evento interno
    this.emit('upload:started', uploadInfo);
    
    logger.info(`[UploadMonitoringService] Upload iniciado: ${recordingId}`, {
      fileSize,
      priority
    });
  }
  
  /**
   * Atualizar progresso de upload
   * @param {string} recordingId - ID da gravação
   * @param {number} progress - Progresso (0-100)
   * @param {Object} additionalData - Dados adicionais
   */
  updateProgress(recordingId, progress, additionalData = {}) {
    const uploadInfo = this.activeUploads.get(recordingId);
    
    if (!uploadInfo) {
      logger.warn(`[UploadMonitoringService] Upload não encontrado: ${recordingId}`);
      return;
    }
    
    const now = new Date();
    const previousProgress = uploadInfo.progress;
    const timeDiff = now - new Date(uploadInfo.updatedAt);
    
    // Calcular velocidade de upload
    if (timeDiff > 0 && progress > previousProgress) {
      const progressDiff = progress - previousProgress;
      const bytesUploaded = (progressDiff / 100) * uploadInfo.fileSize;
      uploadInfo.uploadSpeed = Math.round(bytesUploaded / (timeDiff / 1000)); // bytes/segundo
      
      // Estimar tempo restante
      if (progress > 0 && progress < 100) {
        const remainingProgress = 100 - progress;
        const avgSpeed = uploadInfo.uploadSpeed;
        const remainingBytes = (remainingProgress / 100) * uploadInfo.fileSize;
        uploadInfo.estimatedTimeRemaining = Math.round(remainingBytes / avgSpeed); // segundos
      }
    }
    
    // Atualizar dados
    uploadInfo.progress = Math.min(100, Math.max(0, progress));
    uploadInfo.status = progress >= 100 ? 'completing' : 'uploading';
    uploadInfo.updatedAt = now.toISOString();
    
    // Adicionar dados extras
    Object.assign(uploadInfo, additionalData);
    
    // Emitir evento interno
    this.emit('upload:progress', uploadInfo);
  }
  
  /**
   * Marcar upload como concluído
   * @param {string} recordingId - ID da gravação
   * @param {Object} completionData - Dados de conclusão
   */
  completeUpload(recordingId, completionData = {}) {
    const uploadInfo = this.activeUploads.get(recordingId);
    
    if (!uploadInfo) {
      logger.warn(`[UploadMonitoringService] Upload não encontrado: ${recordingId}`);
      return;
    }
    
    // Atualizar dados
    uploadInfo.status = 'completed';
    uploadInfo.progress = 100;
    uploadInfo.completedAt = new Date().toISOString();
    uploadInfo.updatedAt = uploadInfo.completedAt;
    
    // Adicionar dados de conclusão
    Object.assign(uploadInfo, completionData);
    
    // Emitir evento interno
    this.emit('upload:completed', uploadInfo);
    
    // Remover dos uploads ativos após um tempo
    setTimeout(() => {
      this.activeUploads.delete(recordingId);
      logger.info(`[UploadMonitoringService] Upload removido da lista ativa: ${recordingId}`);
    }, 30000); // 30 segundos
    
    logger.info(`[UploadMonitoringService] Upload concluído: ${recordingId}`);
  }
  
  /**
   * Marcar upload como falhado
   * @param {string} recordingId - ID da gravação
   * @param {Error} error - Erro ocorrido
   * @param {Object} failureData - Dados de falha
   */
  failUpload(recordingId, error, failureData = {}) {
    const uploadInfo = this.activeUploads.get(recordingId);
    
    if (!uploadInfo) {
      logger.warn(`[UploadMonitoringService] Upload não encontrado: ${recordingId}`);
      return;
    }
    
    // Atualizar dados
    uploadInfo.status = 'failed';
    uploadInfo.error = error.message;
    uploadInfo.failedAt = new Date().toISOString();
    uploadInfo.updatedAt = uploadInfo.failedAt;
    
    // Adicionar dados de falha
    Object.assign(uploadInfo, failureData);
    
    // Emitir evento interno
    this.emit('upload:failed', uploadInfo);
    
    logger.error(`[UploadMonitoringService] Upload falhou: ${recordingId}`, {
      error: error.message,
      attempts: uploadInfo.attempts
    });
  }
  
  /**
   * Registrar tentativa de retry
   * @param {string} recordingId - ID da gravação
   * @param {number} attemptNumber - Número da tentativa
   */
  retryUpload(recordingId, attemptNumber) {
    const uploadInfo = this.activeUploads.get(recordingId);
    
    if (!uploadInfo) {
      logger.warn(`[UploadMonitoringService] Upload não encontrado: ${recordingId}`);
      return;
    }
    
    // Atualizar dados
    uploadInfo.status = 'retrying';
    uploadInfo.attempts = attemptNumber;
    uploadInfo.progress = 0;
    uploadInfo.error = null;
    uploadInfo.retryAt = new Date().toISOString();
    uploadInfo.updatedAt = uploadInfo.retryAt;
    
    // Emitir evento interno
    this.emit('upload:retry', uploadInfo);
    
    logger.info(`[UploadMonitoringService] Upload retry: ${recordingId}`, {
      attempt: attemptNumber
    });
  }
  
  /**
   * Handlers para eventos internos
   */
  handleUploadStarted(uploadInfo) {
    if (this.io) {
      this.io.emit('upload:started', uploadInfo);
    }
  }
  
  handleUploadProgress(uploadInfo) {
    if (this.io) {
      this.io.emit('upload:progress', uploadInfo);
    }
  }
  
  handleUploadCompleted(uploadInfo) {
    if (this.io) {
      this.io.emit('upload:completed', uploadInfo);
    }
  }
  
  handleUploadFailed(uploadInfo) {
    if (this.io) {
      this.io.emit('upload:failed', uploadInfo);
    }
  }
  
  handleUploadRetry(uploadInfo) {
    if (this.io) {
      this.io.emit('upload:retry', uploadInfo);
    }
  }
  
  /**
   * Obter status de upload específico
   * @param {string} recordingId - ID da gravação
   * @returns {Object|null} - Informações do upload ou null
   */
  getUploadStatus(recordingId) {
    return this.activeUploads.get(recordingId) || null;
  }
  
  /**
   * Obter todos os uploads ativos
   * @returns {Array} - Lista de uploads ativos
   */
  getActiveUploads() {
    return Array.from(this.activeUploads.values());
  }
  
  /**
   * Obter estatísticas dos uploads
   * @returns {Object} - Estatísticas
   */
  getUploadStats() {
    const uploads = this.getActiveUploads();
    
    const stats = {
      total: uploads.length,
      uploading: uploads.filter(u => u.status === 'uploading').length,
      completed: uploads.filter(u => u.status === 'completed').length,
      failed: uploads.filter(u => u.status === 'failed').length,
      retrying: uploads.filter(u => u.status === 'retrying').length,
      totalBytes: uploads.reduce((sum, u) => sum + (u.fileSize || 0), 0),
      avgProgress: uploads.length > 0 
        ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length 
        : 0
    };
    
    return stats;
  }
  
  /**
   * Limpar uploads antigos
   * @param {number} maxAge - Idade máxima em milissegundos
   */
  cleanupOldUploads(maxAge = 24 * 60 * 60 * 1000) { // 24 horas
    const now = Date.now();
    const toRemove = [];
    
    for (const [recordingId, uploadInfo] of this.activeUploads) {
      const uploadTime = new Date(uploadInfo.startedAt).getTime();
      if (now - uploadTime > maxAge) {
        toRemove.push(recordingId);
      }
    }
    
    toRemove.forEach(recordingId => {
      this.activeUploads.delete(recordingId);
      logger.info(`[UploadMonitoringService] Upload antigo removido: ${recordingId}`);
    });
    
    return toRemove.length;
  }
}

export default new UploadMonitoringService();