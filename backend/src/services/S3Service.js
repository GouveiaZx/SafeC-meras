/**
 * Serviço de Upload para Wasabi S3
 * Gerencia uploads, downloads e operações de armazenamento
 */

import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('S3Service');

class S3Service {
  constructor() {
    this.isConfigured = false;
    this.s3 = null;
    this.bucketName = process.env.WASABI_BUCKET || 'newcam-recordings';
    this.region = process.env.WASABI_REGION || 'us-east-1';
    
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
   * Faz upload de um arquivo para o S3
   */
  async uploadFile(filePath, key, metadata = {}) {
    if (!this.isConfigured) {
      logger.info(`Simulando upload: ${key}`);
      return {
        success: true,
        url: `https://simulated-s3.com/${this.bucketName}/${key}`,
        key,
        size: 0,
        simulated: true
      };
    }

    try {
      // Verificar se o arquivo existe
      const stats = await fs.stat(filePath);
      const fileStream = createReadStream(filePath);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileStream,
        ContentType: this.getContentType(filePath),
        Metadata: {
          'original-name': path.basename(filePath),
          'upload-date': new Date().toISOString(),
          ...metadata
        }
      };

      logger.info(`Iniciando upload: ${key} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      const result = await this.s3.upload(uploadParams).promise();
      
      logger.info(`Upload concluído: ${result.Location}`);
      
      return {
        success: true,
        url: result.Location,
        key: result.Key,
        etag: result.ETag,
        size: stats.size
      };
    } catch (error) {
      logger.error(`Erro no upload de ${key}:`, error);
      throw error;
    }
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