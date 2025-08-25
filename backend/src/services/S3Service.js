/**
 * Enhanced S3Service for Wasabi/MinIO S3 Compatible Storage
 * Handles uploads, downloads, presigned URLs, and multipart uploads
 * 
 * MIGRATED TO AWS SDK v3 - Fixes region configuration bug from v2
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Configure dotenv to load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (following pattern from server.js)
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

import { 
  S3Client, 
  HeadBucketCommand, 
  CreateBucketCommand, 
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createModuleLogger } from '../config/logger.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('S3Service');

class S3Service {
  constructor() {
    this.isConfigured = false;
    this.s3Client = null;
    this.bucketName = process.env.WASABI_BUCKET || 'newcam-recordings';
    this.region = process.env.WASABI_REGION || 'us-east-2'; // Use actual Wasabi bucket region
    this.multipartThreshold = parseInt(process.env.S3_MULTIPART_THRESHOLD) || 100 * 1024 * 1024; // 100MB
    this.presignTtl = parseInt(process.env.S3_PRESIGN_TTL) || 3600; // 1 hour
    
    this.init();
  }

  /**
   * Inicializa o cliente S3 com AWS SDK v3
   */
  init() {
    try {
      // Verificar se as credenciais estão configuradas
      const accessKeyId = process.env.WASABI_ACCESS_KEY;
      const secretAccessKey = process.env.WASABI_SECRET_KEY;
      // Use region-specific endpoint for better compatibility - FIXED
      const endpoint = process.env.WASABI_ENDPOINT || `https://s3.us-east-2.wasabisys.com`;

      if (!accessKeyId || !secretAccessKey || 
          accessKeyId === 'your-access-key-here' || 
          secretAccessKey === 'your-secret-key-here') {
        logger.warn('Credenciais do Wasabi S3 não configuradas');
        return;
      }

      // AWS SDK v3 S3 Client - properly handles region configuration
      this.s3Client = new S3Client({
        region: this.region, // Use actual Wasabi bucket region (us-east-2)
        endpoint: endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        forcePathStyle: true, // Required for Wasabi
        useAccelerateEndpoint: false,
        useDualstackEndpoint: false
      });

      this.isConfigured = true;
      logger.info('Serviço S3 (Wasabi) configurado com sucesso - AWS SDK v3');
      
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
      const command = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.s3Client.send(command);
      logger.info(`Conexão com bucket ${this.bucketName} estabelecida`);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
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
      const command = new CreateBucketCommand({
        Bucket: this.bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: this.region
        }
      });
      await this.s3Client.send(command);
      
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
      // VALIDAÇÃO APRIMORADA: Verificar se arquivo existe antes de tentar upload
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (fileError) {
        logger.error(`File not found for upload: ${filePath}`, {
          error: fileError.message,
          key
        });
        return {
          success: false,
          error: 'FILE_NOT_FOUND',
          message: `File not found: ${path.basename(filePath)}`
        };
      }

      const fileSize = stats.size;

      // Validar tamanho do arquivo
      if (fileSize === 0) {
        logger.error(`Empty file detected: ${filePath}`);
        return {
          success: false,
          error: 'EMPTY_FILE',
          message: 'File is empty'
        };
      }

      logger.info(`Starting S3 upload: ${key} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // VALIDAÇÃO: Testar conexão S3 antes de upload
      try {
        const headBucketCommand = new HeadBucketCommand({ Bucket: this.bucketName });
        await this.s3Client.send(headBucketCommand);
      } catch (bucketError) {
        logger.error(`S3 bucket not accessible: ${this.bucketName}`, {
          error: bucketError.message,
          name: bucketError.name
        });
        return {
          success: false,
          error: 'BUCKET_INACCESSIBLE',
          message: `Cannot access bucket: ${this.bucketName}`
        };
      }

      // Use multipart upload for large files
      if (fileSize > this.multipartThreshold) {
        return await this.uploadLargeFile(filePath, key, metadata, progressCallback);
      }

      // Standard upload for smaller files
      const fileStream = createReadStream(filePath);
      
      // MELHORADO: Tratar erro de stream
      fileStream.on('error', (streamError) => {
        logger.error(`File stream error for ${filePath}:`, streamError);
      });
      
      const command = new PutObjectCommand({
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
      });

      const result = await this.s3Client.send(command);
      
      // AWS SDK v3 response structure
      const location = `${this.s3Client.config.endpoint}/${this.bucketName}/${key}`;

      logger.info(`Upload completed successfully: ${result.Location}`);

      return {
        success: true,
        url: location,
        key: key,
        etag: result.ETag,
        size: fileSize
      };

    } catch (error) {
      // TRATAMENTO DE ERRO MELHORADO
      const errorInfo = {
        key,
        filePath,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        requestId: error.requestId
      };

      logger.error(`Upload failed for ${key}:`, errorInfo);

      // Classificar tipos de erro para retry (AWS SDK v3)
      let retryable = true;
      let errorType = 'UPLOAD_ERROR';

      if (error.name === 'NetworkingError' || error.name === 'TimeoutError') {
        errorType = 'NETWORK_ERROR';
        retryable = true;
      } else if (error.name === 'NoSuchBucket') {
        errorType = 'BUCKET_NOT_FOUND';
        retryable = false;
      } else if (error.name === 'AccessDenied') {
        errorType = 'ACCESS_DENIED';
        retryable = false;
      } else if (error.$metadata?.httpStatusCode >= 500) {
        errorType = 'SERVER_ERROR';
        retryable = true;
      } else if (error.$metadata?.httpStatusCode >= 400 && error.$metadata?.httpStatusCode < 500) {
        errorType = 'CLIENT_ERROR';
        retryable = false;
      }

      return {
        success: false,
        error: errorType,
        message: error.message,
        retryable,
        details: errorInfo
      };
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
      const createCommand = new CreateMultipartUploadCommand({
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
      });

      const createResult = await this.s3Client.send(createCommand);
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
      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
      });

      const result = await this.s3Client.send(completeCommand);

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
        const abortCommand = new AbortMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: key,
          UploadId: uploadId
        });
        await this.s3Client.send(abortCommand);
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
    
    const uploadCommand = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: key,
      PartNumber: partNumber,
      UploadId: uploadId,
      Body: stream,
      ContentLength: partSize
    });

    const result = await this.s3Client.send(uploadCommand);

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
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const result = await this.s3Client.send(command);
      
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
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.s3Client.send(command);
      
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
      const command = new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false
        }
      });

      const result = await this.s3Client.send(command);
      
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
   * Generate presigned URL for download with enhanced options - AWS SDK v3
   */
  async getSignedUrl(key, options = {}) {
    if (!this.isConfigured) {
      throw new Error('S3 not configured. Please configure Wasabi/S3 credentials.');
    }

    const {
      operation = 'GET',
      expiresIn = this.presignTtl,
      responseHeaders = {},
      versionId = null
    } = options;

    try {
      // Create command based on operation
      let command;
      const commandInput = {
        Bucket: this.bucketName,
        Key: key
      };

      // Add version ID if specified
      if (versionId) {
        commandInput.VersionId = versionId;
      }

      // Add response headers
      if (responseHeaders.contentDisposition) {
        commandInput.ResponseContentDisposition = responseHeaders.contentDisposition;
      }
      if (responseHeaders.contentType) {
        commandInput.ResponseContentType = responseHeaders.contentType;
      }
      if (responseHeaders.cacheControl) {
        commandInput.ResponseCacheControl = responseHeaders.cacheControl;
      }

      // Use GetObjectCommand for download operations (most common)
      command = new GetObjectCommand(commandInput);

      // Generate presigned URL with explicit region
      let url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
        signableHeaders: new Set(['host']),
        unhoistableHeaders: new Set()
      });
      
      // AWS SDK v3 now generates URLs with correct region configuration
      
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
   * Get presigned URL for upload (for direct client uploads if needed) - AWS SDK v3
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
      const commandInput = {
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType
      };

      if (contentLength) {
        commandInput.ContentLength = contentLength;
      }

      // Add metadata (AWS SDK v3 format)
      if (Object.keys(metadata).length > 0) {
        commandInput.Metadata = metadata;
      }

      const command = new PutObjectCommand(commandInput);
      
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
        signableHeaders: new Set(['host']),
        unhoistableHeaders: new Set()
      });
      
      logger.debug(`Generated upload URL for ${key}`);
      
      return url;
    } catch (error) {
      logger.error(`Failed to generate upload URL for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if object exists and get metadata without downloading - AWS SDK v3
   */
  async headObject(key) {
    if (!this.isConfigured) {
      throw new Error('S3 not configured');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      
      const result = await this.s3Client.send(command);

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
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
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

  /**
   * Validate S3 access and object existence
   * @param {string} s3Key - S3 object key to validate
   * @returns {Promise<Object>} - Validation result with access status
   */
  async validateAccess(s3Key) {
    if (!this.isConfigured) {
      return {
        accessible: false,
        error: 'S3_NOT_CONFIGURED',
        message: 'S3 service not configured'
      };
    }

    if (!s3Key) {
      return {
        accessible: false,
        error: 'INVALID_KEY',
        message: 'S3 key is required'
      };
    }

    try {
      // Check if object exists using headObject
      const headResult = await this.headObject(s3Key);
      
      if (!headResult.exists) {
        return {
          accessible: false,
          error: 'OBJECT_NOT_FOUND',
          message: `Object not found: ${s3Key}`,
          s3Key
        };
      }

      // Try to generate a presigned URL to test permissions
      try {
        const presignedUrl = await this.getSignedUrl(s3Key, {
          expiresIn: 300, // 5 minutes for validation
          responseHeaders: {
            contentType: 'video/mp4'
          }
        });

        // Test HTTP HEAD request to presigned URL
        try {
          const response = await fetch(presignedUrl, { 
            method: 'HEAD',
            headers: {
              'User-Agent': 'NewCAM-Validation/1.0'
            }
          });

          const accessible = response.ok;
          
          return {
            accessible,
            error: accessible ? null : 'HTTP_ACCESS_FAILED',
            message: accessible 
              ? 'Object is accessible'
              : `HTTP access failed: ${response.status} ${response.statusText}`,
            s3Key,
            objectSize: headResult.size,
            lastModified: headResult.lastModified,
            etag: headResult.etag,
            contentType: headResult.contentType,
            httpStatus: response.status,
            presignedUrl: accessible ? presignedUrl : null
          };

        } catch (httpError) {
          return {
            accessible: false,
            error: 'HTTP_REQUEST_FAILED',
            message: `HTTP request failed: ${httpError.message}`,
            s3Key,
            objectSize: headResult.size,
            lastModified: headResult.lastModified,
            presignedUrl
          };
        }

      } catch (urlError) {
        return {
          accessible: false,
          error: 'PRESIGNED_URL_FAILED',
          message: `Failed to generate presigned URL: ${urlError.message}`,
          s3Key,
          objectSize: headResult.size,
          lastModified: headResult.lastModified
        };
      }

    } catch (s3Error) {
      return {
        accessible: false,
        error: 'S3_ERROR',
        message: `S3 error: ${s3Error.message}`,
        s3Key,
        code: s3Error.code
      };
    }
  }

  /**
   * Batch validate multiple S3 objects
   * @param {string[]} s3Keys - Array of S3 keys to validate
   * @returns {Promise<Object[]>} - Array of validation results
   */
  async batchValidateAccess(s3Keys) {
    if (!Array.isArray(s3Keys)) {
      throw new Error('s3Keys must be an array');
    }

    const results = [];
    
    // Process in chunks to avoid overwhelming the service
    const chunkSize = 5;
    for (let i = 0; i < s3Keys.length; i += chunkSize) {
      const chunk = s3Keys.slice(i, i + chunkSize);
      
      const chunkPromises = chunk.map(async (key) => {
        try {
          return await this.validateAccess(key);
        } catch (error) {
          return {
            accessible: false,
            error: 'VALIDATION_FAILED',
            message: `Validation failed: ${error.message}`,
            s3Key: key
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      // Small delay between chunks to be nice to the service
      if (i + chunkSize < s3Keys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get object stream for proxy streaming
   * This bypasses presigned URL limitations with Wasabi
   * @param {string} key - S3 object key
   * @param {string} range - Optional range header (e.g., "bytes=0-1023")
   * @returns {Promise<ReadableStream>} Node.js readable stream
   */
  async getObjectStream(key, range) {
    if (!this.isConfigured) {
      throw new Error('S3 não configurado. Configure as credenciais do Wasabi/S3.');
    }

    try {
      const commandInput = {
        Bucket: this.bucketName,
        Key: key
      };

      // Add range if provided (for HTTP range requests)
      if (range) {
        commandInput.Range = range;
      }

      const command = new GetObjectCommand(commandInput);
      
      logger.debug(`Getting object stream for ${key}`, {
        range: range || 'full file',
        bucket: this.bucketName
      });

      const response = await this.s3Client.send(command);
      
      // AWS SDK v3 returns response.Body as a readable stream
      if (!response.Body) {
        throw new Error('No response body received from S3');
      }

      // Ensure the stream is Node.js compatible
      const { Readable } = await import('stream');
      let nodeStream = response.Body;
      
      // Convert AWS SDK v3 stream to Node.js Readable if needed
      if (response.Body && typeof response.Body.pipe === 'function') {
        // Already a Node.js compatible stream
        nodeStream = response.Body;
      } else if (response.Body && response.Body[Symbol.asyncIterator]) {
        // Convert async iterable to Node.js readable stream
        nodeStream = Readable.from(response.Body);
      } else if (response.Body && typeof response.Body.transformToByteArray === 'function') {
        // Handle AWS SDK v3 specific transformations
        const buffer = await response.Body.transformToByteArray();
        nodeStream = Readable.from(Buffer.from(buffer));
      }

      logger.debug(`✅ S3 object stream obtained and converted for ${key}`, {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        range: range || 'full file',
        streamType: typeof nodeStream.pipe === 'function' ? 'Node.js compatible' : 'Custom stream'
      });

      return nodeStream;
      
    } catch (error) {
      logger.error(`Failed to get object stream for ${key}:`, {
        error: error.message,
        range,
        code: error.Code
      });
      
      // Provide more specific error messages
      if (error.Code === 'NoSuchKey') {
        throw new Error(`File not found in S3: ${key}`);
      } else if (error.Code === 'InvalidRange') {
        throw new Error(`Invalid range request: ${range}`);
      } else {
        throw new Error(`Failed to get S3 object stream: ${error.message}`);
      }
    }
  }
}

export default new S3Service();