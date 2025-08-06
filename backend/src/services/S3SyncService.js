/**
 * Serviço de Sincronização Automática para Wasabi S3
 * Monitora gravações locais e faz upload automático para o S3
 */

import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import s3Service from './S3Service.js';
import { supabase } from '../config/database.js';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

const logger = createModuleLogger('S3SyncService');

class S3SyncService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.watcher = null;
    this.uploadQueue = new Map();
    this.processingQueue = false;
    
    // Configurações
    this.recordingsPath = process.env.RECORDINGS_PATH || './storage/recordings';
    this.autoUpload = process.env.AUTO_UPLOAD_WASABI === 'true';
    this.uploadDelay = 30000; // 30 segundos após criação do arquivo
    this.maxConcurrentUploads = 3;
    this.activeUploads = new Set();
    
    // Estatísticas
    this.stats = {
      totalUploads: 0,
      successfulUploads: 0,
      failedUploads: 0,
      totalBytes: 0,
      startTime: null
    };
  }

  /**
   * Inicia o serviço de sincronização
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[S3Sync] Serviço já está em execução');
      return;
    }

    try {
      logger.info('[S3Sync] Iniciando serviço de sincronização...');
      
      // Verificar se o diretório de gravações existe
      await this.ensureRecordingsDirectory();
      
      // Sincronizar arquivos existentes
      await this.syncExistingFiles();
      
      // Iniciar monitoramento de novos arquivos
      if (this.autoUpload) {
        this.startFileWatcher();
      }
      
      // Iniciar processamento da fila
      this.startQueueProcessor();
      
      this.isRunning = true;
      this.stats.startTime = new Date();
      
      logger.info('[S3Sync] Serviço iniciado com sucesso', {
        autoUpload: this.autoUpload,
        recordingsPath: this.recordingsPath
      });
      
      this.emit('started');
    } catch (error) {
      logger.error('[S3Sync] Erro ao iniciar serviço:', error);
      throw error;
    }
  }

  /**
   * Para o serviço de sincronização
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('[S3Sync] Parando serviço de sincronização...');
    
    this.isRunning = false;
    
    // Parar watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    // Aguardar uploads ativos terminarem
    await this.waitForActiveUploads();
    
    logger.info('[S3Sync] Serviço parado');
    this.emit('stopped');
  }

  /**
   * Garante que o diretório de gravações existe
   */
  async ensureRecordingsDirectory() {
    try {
      await fs.access(this.recordingsPath);
    } catch (error) {
      logger.info(`[S3Sync] Criando diretório de gravações: ${this.recordingsPath}`);
      await fs.mkdir(this.recordingsPath, { recursive: true });
    }
  }

  /**
   * Sincroniza arquivos existentes que ainda não foram enviados
   */
  async syncExistingFiles() {
    try {
      logger.info('[S3Sync] Verificando arquivos existentes para sincronização...');
      
      const files = await this.findLocalRecordings();
      const pendingFiles = await this.filterPendingUploads(files);
      
      logger.info(`[S3Sync] Encontrados ${pendingFiles.length} arquivos para upload`);
      
      for (const file of pendingFiles) {
        this.queueUpload(file.path, {
          recordingId: file.recordingId,
          cameraId: file.cameraId,
          priority: 'low'
        });
      }
    } catch (error) {
      logger.error('[S3Sync] Erro ao sincronizar arquivos existentes:', error);
    }
  }

  /**
   * Encontra todas as gravações locais
   */
  async findLocalRecordings() {
    const recordings = [];
    
    try {
      const entries = await fs.readdir(this.recordingsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.mp4')) {
          const filePath = path.join(this.recordingsPath, entry.name);
          const stats = await fs.stat(filePath);
          
          // Extrair informações do nome do arquivo
          const match = entry.name.match(/^(\d+)_(\d+)_(.+)\.mp4$/);
          if (match) {
            recordings.push({
              path: filePath,
              name: entry.name,
              size: stats.size,
              mtime: stats.mtime,
              recordingId: match[1],
              cameraId: match[2],
              timestamp: match[3]
            });
          }
        }
      }
    } catch (error) {
      logger.error('[S3Sync] Erro ao listar gravações locais:', error);
    }
    
    return recordings;
  }

  /**
   * Filtra arquivos que ainda não foram enviados para o S3
   */
  async filterPendingUploads(files) {
    const pending = [];
    
    for (const file of files) {
      try {
        // Verificar no banco se já foi enviado
        const { data: recording } = await supabase
          .from('recordings')
          .select('s3_url, upload_status')
          .eq('id', file.recordingId)
          .single();
        
        if (!recording || !recording.s3_url || recording.upload_status !== 'completed') {
          pending.push(file);
        }
      } catch (error) {
        // Se não encontrar no banco, adicionar à fila
        pending.push(file);
      }
    }
    
    return pending;
  }

  /**
   * Inicia o monitoramento de novos arquivos
   */
  startFileWatcher() {
    this.watcher = chokidar.watch(path.join(this.recordingsPath, '*.mp4'), {
      ignored: /^\./, // Ignorar arquivos ocultos
      persistent: true,
      ignoreInitial: true // Não processar arquivos existentes
    });

    this.watcher.on('add', (filePath) => {
      logger.info(`[S3Sync] Novo arquivo detectado: ${filePath}`);
      
      // Aguardar um tempo antes de fazer upload (arquivo pode ainda estar sendo escrito)
      setTimeout(() => {
        this.handleNewFile(filePath);
      }, this.uploadDelay);
    });

    this.watcher.on('error', (error) => {
      logger.error('[S3Sync] Erro no file watcher:', error);
    });

    logger.info(`[S3Sync] Monitoramento de arquivos iniciado: ${this.recordingsPath}`);
  }

  /**
   * Processa novo arquivo detectado
   */
  async handleNewFile(filePath) {
    try {
      const fileName = path.basename(filePath);
      const match = fileName.match(/^(\d+)_(\d+)_(.+)\.mp4$/);
      
      if (!match) {
        logger.warn(`[S3Sync] Nome de arquivo inválido: ${fileName}`);
        return;
      }
      
      const [, recordingId, cameraId] = match;
      
      // Verificar se o arquivo ainda existe e não está sendo escrito
      const stats = await fs.stat(filePath);
      const now = Date.now();
      const fileAge = now - stats.mtime.getTime();
      
      if (fileAge < 5000) { // Arquivo muito recente, aguardar mais
        setTimeout(() => this.handleNewFile(filePath), 5000);
        return;
      }
      
      this.queueUpload(filePath, {
        recordingId,
        cameraId,
        priority: 'high'
      });
    } catch (error) {
      logger.error(`[S3Sync] Erro ao processar novo arquivo ${filePath}:`, error);
    }
  }

  /**
   * Adiciona arquivo à fila de upload
   */
  queueUpload(filePath, metadata) {
    const uploadId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.uploadQueue.set(uploadId, {
      id: uploadId,
      filePath,
      metadata,
      queuedAt: new Date(),
      attempts: 0,
      maxAttempts: 3
    });
    
    logger.debug(`[S3Sync] Arquivo adicionado à fila: ${path.basename(filePath)}`);
    
    this.emit('queued', { uploadId, filePath, metadata });
  }

  /**
   * Inicia o processador da fila de uploads
   */
  startQueueProcessor() {
    const processQueue = async () => {
      if (!this.isRunning || this.processingQueue) {
        return;
      }
      
      this.processingQueue = true;
      
      try {
        while (this.uploadQueue.size > 0 && this.activeUploads.size < this.maxConcurrentUploads) {
          const [uploadId, uploadData] = this.uploadQueue.entries().next().value;
          this.uploadQueue.delete(uploadId);
          
          // Processar upload em paralelo
          this.processUpload(uploadData).catch(error => {
            logger.error(`[S3Sync] Erro no upload ${uploadId}:`, error);
          });
        }
      } finally {
        this.processingQueue = false;
      }
    };
    
    // Processar fila a cada 5 segundos
    setInterval(processQueue, 5000);
    
    // Processar imediatamente
    processQueue();
  }

  /**
   * Processa um upload individual
   */
  async processUpload(uploadData) {
    const { id, filePath, metadata } = uploadData;
    
    this.activeUploads.add(id);
    
    try {
      logger.info(`[S3Sync] Iniciando upload: ${path.basename(filePath)}`);
      
      // Verificar se o arquivo ainda existe
      const stats = await fs.stat(filePath);
      
      // Gerar chave S3
      const s3Key = s3Service.generateRecordingKey(
        metadata.cameraId,
        metadata.recordingId
      );
      
      // Fazer upload com retry
      const result = await s3Service.uploadWithRetry(filePath, s3Key, {
        metadata: {
          'camera-id': metadata.cameraId,
          'recording-id': metadata.recordingId,
          'original-path': filePath
        },
        onProgress: (progress, attempt, maxAttempts) => {
          this.emit('progress', {
            uploadId: id,
            progress,
            attempt,
            maxAttempts
          });
        }
      });
      
      // Atualizar banco de dados
      await this.updateRecordingInDatabase(metadata.recordingId, result);
      
      // Atualizar estatísticas
      this.stats.totalUploads++;
      this.stats.successfulUploads++;
      this.stats.totalBytes += stats.size;
      
      logger.info(`[S3Sync] Upload concluído: ${result.url}`);
      
      this.emit('completed', {
        uploadId: id,
        filePath,
        result
      });
      
      // Remover arquivo local se configurado
      if (process.env.DELETE_AFTER_UPLOAD === 'true') {
        await fs.unlink(filePath);
        logger.info(`[S3Sync] Arquivo local removido: ${filePath}`);
      }
    } catch (error) {
      this.stats.totalUploads++;
      this.stats.failedUploads++;
      
      logger.error(`[S3Sync] Falha no upload de ${path.basename(filePath)}:`, error);
      
      this.emit('failed', {
        uploadId: id,
        filePath,
        error: error.message
      });
      
      // Recolocar na fila se não excedeu tentativas
      uploadData.attempts++;
      if (uploadData.attempts < uploadData.maxAttempts) {
        setTimeout(() => {
          this.queueUpload(filePath, metadata);
        }, 60000); // Tentar novamente em 1 minuto
      }
    } finally {
      this.activeUploads.delete(id);
    }
  }

  /**
   * Atualiza informações da gravação no banco
   */
  async updateRecordingInDatabase(recordingId, uploadResult) {
    try {
      const { error } = await supabase
        .from('recordings')
        .update({
          s3_url: uploadResult.url,
          s3_key: uploadResult.key,
          upload_status: 'completed',
          uploaded_at: new Date().toISOString(),
          file_size: uploadResult.size
        })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
      logger.debug(`[S3Sync] Banco atualizado para gravação ${recordingId}`);
    } catch (error) {
      logger.error(`[S3Sync] Erro ao atualizar banco para gravação ${recordingId}:`, error);
    }
  }

  /**
   * Aguarda todos os uploads ativos terminarem
   */
  async waitForActiveUploads() {
    while (this.activeUploads.size > 0) {
      logger.info(`[S3Sync] Aguardando ${this.activeUploads.size} uploads ativos...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats() {
    const uptime = this.stats.startTime 
      ? Date.now() - this.stats.startTime.getTime()
      : 0;
    
    return {
      ...this.stats,
      uptime,
      queueSize: this.uploadQueue.size,
      activeUploads: this.activeUploads.size,
      successRate: this.stats.totalUploads > 0 
        ? (this.stats.successfulUploads / this.stats.totalUploads * 100).toFixed(2)
        : 0
    };
  }

  /**
   * Força sincronização de um arquivo específico
   */
  async syncFile(filePath, metadata) {
    if (!await fs.access(filePath).then(() => true).catch(() => false)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    
    this.queueUpload(filePath, {
      ...metadata,
      priority: 'immediate'
    });
    
    logger.info(`[S3Sync] Sincronização forçada: ${path.basename(filePath)}`);
  }
}

export default new S3SyncService();