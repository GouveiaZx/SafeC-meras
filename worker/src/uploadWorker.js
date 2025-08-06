import Bull from 'bull';
import Redis from 'ioredis';
import winston from 'winston';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega variáveis de ambiente
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '../../backend/.env') });

// Configuração do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [UPLOAD-WORKER] [${level.toUpperCase()}] ${message}${stack ? '\n' + stack : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: join(__dirname, '../logs/upload-worker.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: join(__dirname, '../logs/upload-worker-error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

class UploadWorker {
  constructor() {
    this.redis = null;
    this.uploadQueue = null;
    this.supabase = null;
    this.s3 = null;
    this.isInitialized = false;
    this.stats = {
      processed: 0,
      failed: 0,
      totalSize: 0,
      startTime: new Date()
    };
    
    this.init();
  }
  
  async init() {
    try {
      logger.info('Inicializando Upload Worker...');
      
      // Configurar Redis
      await this.setupRedis();
      
      // Configurar Supabase
      await this.setupSupabase();
      
      // Configurar Wasabi S3
      await this.setupS3();
      
      // Configurar fila de upload
      await this.setupQueue();
      
      // Configurar handlers de processo
      this.setupProcessHandlers();
      
      this.isInitialized = true;
      logger.info('Upload Worker inicializado com sucesso');
      
      // Exibir estatísticas a cada 5 minutos
      setInterval(() => this.logStats(), 5 * 60 * 1000);
      
    } catch (error) {
      logger.error('Erro ao inicializar Upload Worker:', error);
      process.exit(1);
    }
  }
  
  async setupRedis() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    };
    
    this.redis = new Redis(redisConfig);
    
    this.redis.on('connect', () => {
      logger.info('Conectado ao Redis');
    });
    
    this.redis.on('error', (error) => {
      logger.error('Erro no Redis:', error);
    });
    
    // Testar conexão
    await this.redis.ping();
    logger.info('Conexão Redis testada com sucesso');
  }
  
  async setupSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Credenciais do Supabase não encontradas');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    logger.info('Cliente Supabase configurado');
  }
  
  async setupS3() {
    const s3Config = {
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
      region: process.env.WASABI_REGION || 'us-east-1',
      s3ForcePathStyle: true
    };
    
    if (!s3Config.accessKeyId || !s3Config.secretAccessKey) {
      throw new Error('Credenciais do Wasabi S3 não encontradas');
    }
    
    this.s3 = new AWS.S3(s3Config);
    
    // Testar conexão listando buckets
    try {
      await this.s3.listBuckets().promise();
      logger.info('Conexão Wasabi S3 testada com sucesso');
    } catch (error) {
      logger.error('Erro ao testar conexão S3:', error);
      throw error;
    }
  }
  
  async setupQueue() {
    this.uploadQueue = new Bull('upload-queue', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    });
    
    // Configurar processamento
    this.uploadQueue.process('upload-recording', 5, this.processUpload.bind(this));
    
    // Event listeners
    this.uploadQueue.on('completed', (job, result) => {
      logger.info(`Upload concluído: ${job.data.recordingId}`, {
        jobId: job.id,
        duration: Date.now() - job.timestamp,
        fileSize: result.fileSize
      });
      this.stats.processed++;
      this.stats.totalSize += result.fileSize || 0;
    });
    
    this.uploadQueue.on('failed', (job, error) => {
      logger.error(`Upload falhou: ${job.data.recordingId}`, {
        jobId: job.id,
        error: error.message,
        attempts: job.attemptsMade
      });
      this.stats.failed++;
    });
    
    this.uploadQueue.on('stalled', (job) => {
      logger.warn(`Upload travado: ${job.data.recordingId}`, {
        jobId: job.id
      });
    });
    
    logger.info('Fila de upload configurada');
  }
  
  async processUpload(job) {
    const { recordingId, filePath, cameraId, metadata } = job.data;
    
    logger.info(`Iniciando upload: ${recordingId}`, {
      filePath,
      cameraId,
      jobId: job.id
    });
    
    try {
      // Atualizar progresso: Iniciando
      await job.progress(10);
      await this.updateRecordingStatus(recordingId, 'uploading', {
        upload_started_at: new Date().toISOString()
      });
      
      // Verificar se arquivo existe
      await job.progress(20);
      const fileStats = await this.validateFile(filePath);
      
      // Gerar chave S3
      await job.progress(30);
      const s3Key = this.generateS3Key(recordingId, cameraId, filePath);
      
      // Fazer upload para S3
      await job.progress(40);
      const s3Result = await this.uploadToS3(filePath, s3Key, (progress) => {
        const uploadProgress = 40 + (progress * 0.5); // 40-90%
        job.progress(uploadProgress);
      });
      
      // Atualizar banco de dados
      await job.progress(90);
      await this.updateRecordingAfterUpload(recordingId, {
        s3_key: s3Key,
        s3_url: s3Result.Location,
        file_size: fileStats.size,
        upload_completed_at: new Date().toISOString(),
        status: 'uploaded'
      });
      
      // Limpar arquivo local (opcional)
      await job.progress(95);
      if (process.env.DELETE_AFTER_UPLOAD === 'true') {
        await this.cleanupLocalFile(filePath);
      }
      
      await job.progress(100);
      
      const result = {
        recordingId,
        s3Key,
        s3Url: s3Result.Location,
        fileSize: fileStats.size,
        uploadDuration: Date.now() - job.timestamp
      };
      
      logger.info(`Upload concluído com sucesso: ${recordingId}`, result);
      return result;
      
    } catch (error) {
      logger.error(`Erro no upload: ${recordingId}`, error);
      
      // Atualizar status de erro
      await this.updateRecordingStatus(recordingId, 'upload_failed', {
        upload_error: error.message,
        upload_failed_at: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error('Caminho não é um arquivo válido');
      }
      
      if (stats.size === 0) {
        throw new Error('Arquivo está vazio');
      }
      
      return stats;
    } catch (error) {
      throw new Error(`Erro ao validar arquivo: ${error.message}`);
    }
  }
  
  generateS3Key(recordingId, cameraId, filePath) {
    const fileName = path.basename(filePath);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `recordings/${year}/${month}/${day}/${cameraId}/${recordingId}/${fileName}`;
  }
  
  async uploadToS3(filePath, s3Key, progressCallback) {
    const bucketName = process.env.WASABI_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('Nome do bucket Wasabi não configurado');
    }
    
    const fileStream = await fs.readFile(filePath);
    
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'video/mp4',
      Metadata: {
        'uploaded-by': 'newcam-worker',
        'upload-timestamp': new Date().toISOString()
      }
    };
    
    return new Promise((resolve, reject) => {
      const upload = this.s3.upload(uploadParams);
      
      upload.on('httpUploadProgress', (progress) => {
        const percentage = (progress.loaded / progress.total) * 100;
        if (progressCallback) {
          progressCallback(percentage / 100);
        }
      });
      
      upload.send((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }
  
  async updateRecordingStatus(recordingId, status, additionalData = {}) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({
          status,
          ...additionalData,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error(`Erro ao atualizar status da gravação ${recordingId}:`, error);
      throw error;
    }
  }
  
  async updateRecordingAfterUpload(recordingId, uploadData) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({
          ...uploadData,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error(`Erro ao atualizar dados de upload da gravação ${recordingId}:`, error);
      throw error;
    }
  }
  
  async cleanupLocalFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.info(`Arquivo local removido: ${filePath}`);
    } catch (error) {
      logger.warn(`Erro ao remover arquivo local: ${error.message}`);
      // Não falha o job por causa disso
    }
  }
  
  setupProcessHandlers() {
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Iniciando shutdown graceful do Upload Worker...');
      
      if (this.uploadQueue) {
        await this.uploadQueue.close();
        logger.info('Fila de upload fechada');
      }
      
      if (this.redis) {
        this.redis.disconnect();
        logger.info('Conexão Redis fechada');
      }
      
      logger.info('Upload Worker encerrado');
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    process.on('uncaughtException', (error) => {
      logger.error('Erro não capturado:', error);
      shutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Promise rejeitada não tratada:', reason);
      shutdown();
    });
  }
  
  logStats() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
    
    logger.info('Estatísticas do Upload Worker:', {
      uptime: `${uptimeHours}h`,
      processed: this.stats.processed,
      failed: this.stats.failed,
      totalSizeGB: (this.stats.totalSize / (1024 * 1024 * 1024)).toFixed(2),
      successRate: this.stats.processed + this.stats.failed > 0 
        ? ((this.stats.processed / (this.stats.processed + this.stats.failed)) * 100).toFixed(2) + '%'
        : '0%'
    });
  }
  
  async getQueueStats() {
    if (!this.uploadQueue) {
      return null;
    }
    
    const waiting = await this.uploadQueue.getWaiting();
    const active = await this.uploadQueue.getActive();
    const completed = await this.uploadQueue.getCompleted();
    const failed = await this.uploadQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }
}

// Inicializar worker
const uploadWorker = new UploadWorker();

logger.info('Upload Worker NewCAM iniciado');

export default uploadWorker;