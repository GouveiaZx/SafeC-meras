/**
 * Serviço de Upload para Wasabi S3
 * Gerencia uploads, downloads e operações de armazenamento
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { createModuleLogger } from '../config/logger.js';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

const logger = createModuleLogger('S3Service');

class S3Service {
  constructor() {
    this.isConfigured = false;
    this.s3 = null;
    this.bucketName = process.env.WASABI_BUCKET || process.env.WASABI_BUCKET_NAME || 'safe-cameras-03';
    this.region = process.env.WASABI_REGION || 'us-east-1';
    
    // Configurações de upload
    this.uploadTimeout = parseInt(process.env.S3_UPLOAD_TIMEOUT) || 300000; // 5 minutos
    this.multipartThreshold = this.parseSize(process.env.S3_MULTIPART_THRESHOLD) || 100 * 1024 * 1024; // 100MB
    this.partSize = this.parseSize(process.env.S3_PART_SIZE) || 10 * 1024 * 1024; // 10MB
    this.maxRetries = parseInt(process.env.S3_MAX_RETRIES) || 5;
    this.retryDelay = parseInt(process.env.S3_RETRY_DELAY) || 2000;
    
    this.init();
  }

  /**
   * Converte string de tamanho para bytes
   */
  parseSize(sizeStr) {
    if (!sizeStr) return null;
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)$/i);
    if (!match) return null;
    return parseInt(match[1]) * units[match[2].toUpperCase()];
  }

  /**
   * Inicializa o cliente S3
   */
  init() {
    try {
      // Verificar se as credenciais estão configuradas
      const accessKeyId = process.env.WASABI_ACCESS_KEY;
      const secretAccessKey = process.env.WASABI_SECRET_KEY;
      const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com';

      if (!accessKeyId || !secretAccessKey || 
          accessKeyId === 'your-access-key-here' || 
          secretAccessKey === 'your-secret-key-here') {
        logger.warn('Credenciais do Wasabi S3 não configuradas');
        return;
      }

      // Configurar cliente S3 para Wasabi
      this.s3 = new AWS.S3({
        accessKeyId,
        secretAccessKey,
        endpoint,
        region: this.region,
        s3ForcePathStyle: true,
        signatureVersion: 'v4',
        httpOptions: {
          timeout: this.uploadTimeout,
          connectTimeout: 30000
        },
        maxRetries: this.maxRetries,
        retryDelayOptions: {
          customBackoff: (retryCount) => {
            return Math.min(this.retryDelay * Math.pow(2, retryCount), 30000);
          }
        },
        params: {
          Bucket: this.bucketName
        }
      });

      this.isConfigured = true;
      logger.info('Serviço S3 (Wasabi) configurado com sucesso');
      
      // Testar conexão
      this.testConnection();
    } catch (error) {
      logger.error('Erro ao configurar serviço S3:', error);
    }
  }

  /**
   * Testa a conexão com o S3
   */
  async testConnection() {
    if (!this.isConfigured) {
      return false;
    }

    try {
      await this.s3.headBucket({ Bucket: this.bucketName }).promise();
      logger.info(`Conexão com bucket ${this.bucketName} estabelecida`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`Bucket ${this.bucketName} não encontrado, tentando criar...`);
        return await this.createBucket();
      } else {
        logger.error('Erro ao testar conexão S3:', error);
        return false;
      }
    }
  }

  /**
   * Cria o bucket se não existir
   */
  async createBucket() {
    if (!this.isConfigured) {
      return false;
    }

    try {
      await this.s3.createBucket({ 
        Bucket: this.bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: this.region
        }
      }).promise();
      
      logger.info(`Bucket ${this.bucketName} criado com sucesso`);
      return true;
    } catch (error) {
      logger.error('Erro ao criar bucket:', error);
      return false;
    }
  }

  /**
   * Faz upload de um arquivo para o S3
   */
  async uploadFile(filePath, key, options = {}) {
    if (!this.isConfigured) {
      logger.warn(`S3 não configurado. Simulando upload: ${key}`);
      return {
        success: true,
        url: `https://simulated-s3.com/${this.bucketName}/${key}`,
        key,
        size: 0,
        simulated: true
      };
    }

    const startTime = Date.now();
    let uploadId = null;

    try {
      // Verificar se o arquivo existe
      const stats = await fs.stat(filePath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      logger.info(`[S3] Iniciando upload: ${key}`, {
        size: `${fileSizeMB} MB`,
        multipart: stats.size > this.multipartThreshold
      });

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        ContentType: this.getContentType(filePath),
        Metadata: {
          'original-name': path.basename(filePath),
          'upload-date': new Date().toISOString(),
          'file-size': stats.size.toString(),
          ...options.metadata
        }
      };

      let result;
      
      // Usar multipart upload para arquivos grandes
      if (stats.size > this.multipartThreshold) {
        result = await this.multipartUpload(filePath, uploadParams, options.onProgress);
      } else {
        const fileStream = createReadStream(filePath);
        uploadParams.Body = fileStream;
        
        const upload = this.s3.upload(uploadParams);
        
        // Callback de progresso
        if (options.onProgress) {
          upload.on('httpUploadProgress', (progress) => {
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            options.onProgress(percentage);
          });
        }
        
        result = await upload.promise();
      }
      
      const duration = Date.now() - startTime;
      const speed = (stats.size / 1024 / 1024) / (duration / 1000); // MB/s
      
      logger.info(`[S3] Upload concluído: ${key}`, {
        duration: `${duration}ms`,
        speed: `${speed.toFixed(2)} MB/s`,
        location: result.Location
      });
      
      return {
        success: true,
        url: result.Location,
        key: result.Key,
        etag: result.ETag,
        size: stats.size,
        duration,
        speed
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[S3] Erro no upload de ${key}:`, {
        error: error.message,
        duration: `${duration}ms`,
        uploadId
      });
      throw error;
    }
  }

  /**
   * Upload multipart para arquivos grandes
   */
  async multipartUpload(filePath, uploadParams, onProgress) {
    const stats = await fs.stat(filePath);
    const partSize = this.partSize;
    const numParts = Math.ceil(stats.size / partSize);
    
    logger.info(`[S3] Iniciando multipart upload: ${uploadParams.Key}`, {
      parts: numParts,
      partSize: `${(partSize / 1024 / 1024).toFixed(2)} MB`
    });

    // Iniciar multipart upload
    const createParams = {
      Bucket: uploadParams.Bucket,
      Key: uploadParams.Key,
      ContentType: uploadParams.ContentType,
      Metadata: uploadParams.Metadata
    };
    
    const multipart = await this.s3.createMultipartUpload(createParams).promise();
    const uploadId = multipart.UploadId;
    
    try {
      const parts = [];
      const fileBuffer = await fs.readFile(filePath);
      
      // Upload das partes
      for (let i = 0; i < numParts; i++) {
        const start = i * partSize;
        const end = Math.min(start + partSize, stats.size);
        const partNumber = i + 1;
        
        const partParams = {
          Bucket: uploadParams.Bucket,
          Key: uploadParams.Key,
          PartNumber: partNumber,
          UploadId: uploadId,
          Body: fileBuffer.slice(start, end)
        };
        
        logger.debug(`[S3] Uploading part ${partNumber}/${numParts}`);
        
        const partResult = await this.s3.uploadPart(partParams).promise();
        
        parts.push({
          ETag: partResult.ETag,
          PartNumber: partNumber
        });
        
        // Callback de progresso
        if (onProgress) {
          const progress = Math.round((partNumber / numParts) * 100);
          onProgress(progress);
        }
      }
      
      // Completar multipart upload
      const completeParams = {
        Bucket: uploadParams.Bucket,
        Key: uploadParams.Key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
      };
      
      const result = await this.s3.completeMultipartUpload(completeParams).promise();
      
      logger.info(`[S3] Multipart upload concluído: ${uploadParams.Key}`);
      
      return result;
    } catch (error) {
      // Abortar multipart upload em caso de erro
      try {
        await this.s3.abortMultipartUpload({
          Bucket: uploadParams.Bucket,
          Key: uploadParams.Key,
          UploadId: uploadId
        }).promise();
        logger.info(`[S3] Multipart upload abortado: ${uploadParams.Key}`);
      } catch (abortError) {
        logger.error(`[S3] Erro ao abortar multipart upload:`, abortError);
      }
      
      throw error;
    }
  }

  /**
   * Upload com retry automático e backoff exponencial
   */
  async uploadWithRetry(filePath, key, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const baseDelay = options.retryDelay || this.retryDelay;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`[S3] Tentativa ${attempt}/${maxRetries} para upload de ${key}`);
        
        const result = await this.uploadFile(filePath, key, {
          ...options,
          onProgress: options.onProgress ? (progress) => {
            options.onProgress(progress, attempt, maxRetries);
          } : undefined
        });
        
        if (attempt > 1) {
          logger.info(`[S3] Upload bem-sucedido na tentativa ${attempt}: ${key}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        const isRetryable = this.isRetryableError(error);
        
        logger.warn(`[S3] Tentativa ${attempt}/${maxRetries} falhou:`, {
          error: error.message,
          code: error.code,
          retryable: isRetryable
        });
        
        if (attempt < maxRetries && isRetryable) {
          const delay = Math.min(
            baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
            30000
          );
          
          logger.info(`[S3] Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (!isRetryable) {
          logger.error(`[S3] Erro não recuperável, abortando retry: ${error.message}`);
          break;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Verifica se um erro é recuperável
   */
  isRetryableError(error) {
    const retryableCodes = [
      'RequestTimeout',
      'RequestTimeoutException',
      'PriorRequestNotComplete',
      'ConnectionError',
      'HTTPSConnectionPool',
      'SSLError',
      'BandwidthLimitExceeded',
      'RequestLimitExceeded',
      'SlowDown',
      'ServiceUnavailable',
      'RequestTimeTooSkewed',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];
    
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    return (
      retryableCodes.includes(error.code) ||
      retryableStatusCodes.includes(error.statusCode) ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('socket hang up')
    );
  }

  /**
   * Lista arquivos no bucket
   */
  async listFiles(prefix = '', maxKeys = 1000) {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const result = await this.s3.listObjectsV2(params).promise();
      
      return {
        files: result.Contents || [],
        truncated: result.IsTruncated,
        nextToken: result.NextContinuationToken
      };
    } catch (error) {
      logger.error('Erro ao listar arquivos:', error);
      throw error;
    }
  }

  /**
   * Deleta um arquivo do S3
   */
  async deleteFile(key) {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();
      
      logger.info(`Arquivo deletado do S3: ${key}`);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao deletar ${key}:`, error);
      throw error;
    }
  }

  /**
   * Deleta múltiplos arquivos
   */
  async deleteFiles(keys) {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false
        }
      };

      const result = await this.s3.deleteObjects(deleteParams).promise();
      
      logger.info(`${result.Deleted.length} arquivos deletados do S3`);
      
      return {
        success: true,
        deleted: result.Deleted.length,
        errors: result.Errors || []
      };
    } catch (error) {
      logger.error('Erro ao deletar múltiplos arquivos:', error);
      throw error;
    }
  }

  /**
   * Gera URL pré-assinada para download
   */
  async getSignedUrl(key, expiresIn = 3600) {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      const url = await this.s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      });
      
      return url;
    } catch (error) {
      logger.error(`Erro ao gerar URL assinada para ${key}:`, error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do bucket
   */
  async getBucketStats() {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      const files = await this.listFiles();
      
      const stats = {
        totalFiles: files.files.length,
        totalSize: files.files.reduce((sum, file) => sum + file.Size, 0),
        lastModified: files.files.length > 0 
          ? Math.max(...files.files.map(f => new Date(f.LastModified).getTime()))
          : null
      };
      
      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas do bucket:', error);
      throw error;
    }
  }

  /**
   * Determina o tipo de conteúdo baseado na extensão do arquivo
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.json': 'application/json',
      '.txt': 'text/plain'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Verificar se um arquivo existe no S3
   */
  async fileExists(key) {
    try {
      await this.s3.headObject({
        Bucket: this.bucketName,
        Key: key
      });
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Obter metadados de um arquivo no S3
   */
  async getFileMetadata(key) {
    try {
      const result = await this.s3.headObject({
        Bucket: this.bucketName,
        Key: key
      });
      
      return {
        ContentLength: result.ContentLength,
        ContentType: result.ContentType,
        ETag: result.ETag,
        LastModified: result.LastModified,
        Metadata: result.Metadata
      };
    } catch (error) {
      logger.error(`Erro ao obter metadados do arquivo ${key}:`, error);
      throw error;
    }
  }

  /**
   * Verificar se o serviço está configurado
   */
  static isConfigured() {
    return !!(process.env.WASABI_ACCESS_KEY && 
             process.env.WASABI_SECRET_KEY && 
             process.env.WASABI_BUCKET &&
             process.env.WASABI_ACCESS_KEY !== 'your-access-key');
  }

  /**
   * Gera chave S3 para gravação
   */
  generateRecordingKey(cameraId, recordingId, date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `recordings/${year}/${month}/${day}/${cameraId}/${recordingId}.mp4`;
  }
}

export default new S3Service();