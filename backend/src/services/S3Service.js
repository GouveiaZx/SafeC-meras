/**
 * Enhanced S3Service for Wasabi/MinIO S3 Compatible Storage
 * Handles uploads, downloads, presigned URLs, and multipart uploads
 */

import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('S3Service');

class S3Service {
  constructor() {
    this.isConfigured = false;
    this.s3 = null;
    this.bucketName = process.env.WASABI_BUCKET || 'newcam-recordings';
    this.region = process.env.WASABI_REGION || 'us-east-1';
    this.multipartThreshold = parseInt(process.env.S3_MULTIPART_THRESHOLD) || 100 * 1024 * 1024; // 100MB
    this.presignTtl = parseInt(process.env.S3_PRESIGN_TTL) || 3600; // 1 hour
    
    this.init();
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
        signatureVersion: 'v4'
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
   * Upload a file to S3 with progress tracking and multipart support
   */
  async uploadFile(filePath, key, metadata = {}, progressCallback = null) {
    if (!this.isConfigured) {
      logger.warn(`S3 not configured, simulating upload: ${key}`);
      return {
        success: true,
        url: `https://simulated-s3.com/${this.bucketName}/${key}`,
        key,
        size: 0,
        simulated: true
      };
    }

    try {
      // Verify file exists and get stats
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      logger.info(`Starting S3 upload: ${key} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // Use multipart upload for large files
      if (fileSize > this.multipartThreshold) {
        return await this.uploadLargeFile(filePath, key, metadata, progressCallback);
      }

      // Standard upload for smaller files
      const fileStream = createReadStream(filePath);
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileStream,
        ContentType: this.getContentType(filePath),
        ContentLength: fileSize,
        Metadata: {
          'original-name': path.basename(filePath),
          'upload-date': new Date().toISOString(),
          'file-size': fileSize.toString(),
          ...metadata
        },
        ServerSideEncryption: 'AES256' // Enable server-side encryption
      };

      const upload = this.s3.upload(uploadParams);

      // Track progress if callback provided
      if (progressCallback) {
        upload.on('httpUploadProgress', (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          progressCallback({
            loaded: progress.loaded,
            total: progress.total,
            percentage: percent,
            key
          });
        });
      }

      const result = await upload.promise();

      logger.info(`Upload completed successfully: ${result.Location}`);

      return {
        success: true,
        url: result.Location,
        key: result.Key,
        etag: result.ETag,
        size: fileSize,
        uploadId: result.UploadId
      };

    } catch (error) {
      logger.error(`Upload failed for ${key}:`, {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
      
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload large files using multipart upload
   */
  async uploadLargeFile(filePath, key, metadata = {}, progressCallback = null) {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const partSize = 50 * 1024 * 1024; // 50MB parts
    const totalParts = Math.ceil(fileSize / partSize);

    logger.info(`Starting multipart upload: ${key} (${totalParts} parts, ${partSize / 1024 / 1024}MB each)`);

    try {
      // Initialize multipart upload
      const createParams = {
        Bucket: this.bucketName,
        Key: key,
        ContentType: this.getContentType(filePath),
        Metadata: {
          'original-name': path.basename(filePath),
          'upload-date': new Date().toISOString(),
          'file-size': fileSize.toString(),
          'upload-type': 'multipart',
          ...metadata
        },
        ServerSideEncryption: 'AES256'
      };

      const createResult = await this.s3.createMultipartUpload(createParams).promise();
      const uploadId = createResult.UploadId;

      logger.info(`Multipart upload initialized: ${uploadId}`);

      // Upload parts
      const uploadPromises = [];
      const parts = [];

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, fileSize);
        
        const uploadPromise = this.uploadPart(
          filePath, key, uploadId, partNumber, start, end, progressCallback
        );
        
        uploadPromises.push(uploadPromise);
      }

      // Wait for all parts to complete
      const partResults = await Promise.all(uploadPromises);
      
      // Prepare parts list for completion
      partResults.forEach((result, index) => {
        parts.push({
          ETag: result.ETag,
          PartNumber: index + 1
        });
      });

      // Complete multipart upload
      const completeParams = {
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
      };

      const result = await this.s3.completeMultipartUpload(completeParams).promise();

      logger.info(`Multipart upload completed: ${result.Location}`);

      return {
        success: true,
        url: result.Location,
        key: result.Key,
        etag: result.ETag,
        size: fileSize,
        uploadId: uploadId,
        multipart: true
      };

    } catch (error) {
      logger.error(`Multipart upload failed for ${key}:`, error);
      
      // Attempt to abort the multipart upload
      try {
        await this.s3.abortMultipartUpload({
          Bucket: this.bucketName,
          Key: key,
          UploadId: uploadId
        }).promise();
        logger.info(`Aborted failed multipart upload: ${uploadId}`);
      } catch (abortError) {
        logger.error(`Failed to abort multipart upload:`, abortError);
      }

      throw error;
    }
  }

  /**
   * Upload a single part for multipart upload
   */
  async uploadPart(filePath, key, uploadId, partNumber, start, end, progressCallback) {
    const partSize = end - start;
    
    const stream = createReadStream(filePath, { start, end: end - 1 });
    
    const uploadParams = {
      Bucket: this.bucketName,
      Key: key,
      PartNumber: partNumber,
      UploadId: uploadId,
      Body: stream,
      ContentLength: partSize
    };

    const result = await this.s3.uploadPart(uploadParams).promise();

    if (progressCallback) {
      progressCallback({
        loaded: end,
        total: await fs.stat(filePath).then(s => s.size),
        percentage: Math.round((end / (await fs.stat(filePath).then(s => s.size))) * 100),
        key,
        partNumber,
        partSize
      });
    }

    logger.debug(`Part ${partNumber} uploaded successfully (${partSize} bytes)`);
    
    return result;
  }

  /**
   * Upload com retry automático
   */
  async uploadWithRetry(filePath, key, metadata = {}, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Tentativa ${attempt}/${maxRetries} para upload de ${key}`);
        return await this.uploadFile(filePath, key, metadata);
      } catch (error) {
        lastError = error;
        logger.warn(`Tentativa ${attempt} falhou:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Backoff exponencial
          logger.info(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
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
   * Generate presigned URL for download with enhanced options
   */
  async getSignedUrl(key, options = {}) {
    if (!this.isConfigured) {
      throw new Error('S3 not configured. Please configure Wasabi/S3 credentials.');
    }

    const {
      operation = 'getObject',
      expiresIn = this.presignTtl,
      responseHeaders = {},
      versionId = null
    } = options;

    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      };

      // Add version ID if specified
      if (versionId) {
        params.VersionId = versionId;
      }

      // Add response headers for content disposition, etc.
      if (responseHeaders.contentDisposition) {
        params.ResponseContentDisposition = responseHeaders.contentDisposition;
      }
      if (responseHeaders.contentType) {
        params.ResponseContentType = responseHeaders.contentType;
      }
      if (responseHeaders.cacheControl) {
        params.ResponseCacheControl = responseHeaders.cacheControl;
      }

      const url = await this.s3.getSignedUrlPromise(operation, params);
      
      logger.debug(`Generated presigned URL for ${key}`, {
        operation,
        expiresIn,
        responseHeaders
      });
      
      return url;
    } catch (error) {
      logger.error(`Failed to generate presigned URL for ${key}:`, {
        error: error.message,
        operation,
        expiresIn
      });
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Get presigned URL for upload (for direct client uploads if needed)
   */
  async getUploadUrl(key, options = {}) {
    const {
      contentType = 'video/mp4',
      contentLength = null,
      expiresIn = 3600,
      metadata = {}
    } = options;

    if (!this.isConfigured) {
      throw new Error('S3 not configured');
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn,
        ContentType: contentType
      };

      if (contentLength) {
        params.ContentLength = contentLength;
      }

      // Add metadata
      Object.keys(metadata).forEach(key => {
        params[`x-amz-meta-${key}`] = metadata[key];
      });

      const url = await this.s3.getSignedUrlPromise('putObject', params);
      
      logger.debug(`Generated upload URL for ${key}`);
      
      return url;
    } catch (error) {
      logger.error(`Failed to generate upload URL for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if object exists and get metadata without downloading
   */
  async headObject(key) {
    if (!this.isConfigured) {
      throw new Error('S3 not configured');
    }

    try {
      const result = await this.s3.headObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();

      return {
        exists: true,
        size: result.ContentLength,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata,
        serverSideEncryption: result.ServerSideEncryption,
        versionId: result.VersionId
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return { exists: false };
      }
      
      logger.error(`Failed to get object metadata for ${key}:`, error);
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
   * Generate S3 key for recording using PathResolver
   */
  generateRecordingKey(cameraId, filename, date = new Date()) {
    return PathResolver.generateS3Key(cameraId, filename, date);
  }

  /**
   * Upload recording with standardized key generation
   */
  async uploadRecording(recording, progressCallback = null) {
    if (!recording || !recording.camera_id || !recording.filename) {
      throw new Error('Invalid recording object: missing camera_id or filename');
    }

    // Find the local file
    const fileInfo = await PathResolver.findRecordingFile(recording);
    if (!fileInfo || !fileInfo.exists) {
      throw new Error(`Recording file not found: ${recording.filename}`);
    }

    // Generate S3 key
    const createdAt = recording.created_at ? new Date(recording.created_at) : new Date();
    const s3Key = this.generateRecordingKey(recording.camera_id, recording.filename, createdAt);

    // Prepare metadata
    const metadata = {
      'recording-id': recording.id,
      'camera-id': recording.camera_id,
      'original-filename': recording.filename,
      'duration': recording.duration?.toString() || '0',
      'file-size': fileInfo.size.toString(),
      'upload-source': 'newcam-backend'
    };

    logger.info(`Uploading recording ${recording.id} to S3`, {
      localPath: fileInfo.absolutePath,
      s3Key,
      fileSize: fileInfo.size
    });

    try {
      const result = await this.uploadFile(
        fileInfo.absolutePath,
        s3Key,
        metadata,
        progressCallback
      );

      return {
        ...result,
        s3Key,
        localPath: fileInfo.relativePath,
        originalRecordingId: recording.id
      };

    } catch (error) {
      logger.error(`Failed to upload recording ${recording.id}:`, error);
      throw error;
    }
  }
}

export default new S3Service();