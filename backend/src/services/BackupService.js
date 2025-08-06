/**
 * Serviço de Backup e Recuperação
 * Gerencia backup automático de configurações, gravações críticas e recuperação de desastres
 */

import fs from 'fs/promises';
import fsExtra from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import AWS from 'aws-sdk';
import * as tar from 'tar';
import crypto from 'crypto';
import { glob } from 'glob';
import logger from '../utils/logger.js';
import alertService from './AlertService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BackupService {
  constructor() {
    this.s3 = null;
    this.isInitialized = false;
    this.backupConfig = {
      bucket: process.env.BACKUP_S3_BUCKET || 'newcam-backups',
      region: process.env.BACKUP_S3_REGION || 'us-east-1',
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
      compressionLevel: 6
    };
    this.backupPaths = {
      config: path.join(__dirname, '../../config'),
      recordings: path.join(__dirname, '../../storage/recordings'),
      temp: path.join(__dirname, '../../storage/temp/backups')
    };
  }

  /**
   * Inicializa o serviço de backup
   */
  async initialize() {
    try {
      // Verificar se as credenciais do Wasabi estão configuradas
      const accessKeyId = process.env.WASABI_ACCESS_KEY;
      const secretAccessKey = process.env.WASABI_SECRET_KEY;
      const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com';
      
      if (!accessKeyId || !secretAccessKey || 
          accessKeyId === 'your-access-key-here' || 
          secretAccessKey === 'your-secret-key-here') {
        logger.warn('[BackupService] Credenciais do Wasabi S3 não configuradas, serviço de backup desabilitado');
        return;
      }

      // Configurar AWS S3 para usar Wasabi
      this.s3 = new AWS.S3({
        accessKeyId,
        secretAccessKey,
        endpoint,
        region: this.backupConfig.region,
        s3ForcePathStyle: true,
        signatureVersion: 'v4'
      });

      // Criar diretórios necessários
      await fsExtra.ensureDir(this.backupPaths.temp);

      // Verificar conectividade com S3
      await this.s3.headBucket({ Bucket: this.backupConfig.bucket }).promise();

      this.isInitialized = true;
      logger.info('[BackupService] Serviço de backup inicializado com sucesso');
    } catch (error) {
      logger.error('[BackupService] Erro ao inicializar serviço de backup:', error);
      throw error;
    }
  }

  /**
   * Cria backup das configurações do sistema
   */
  async createConfigBackup() {
    try {
      const backupId = `config-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const tempDir = path.join(this.backupPaths.temp, backupId);
      const archivePath = path.join(this.backupPaths.temp, `${backupId}.tar.gz`);

      // Criar diretório temporário
      await fsExtra.ensureDir(tempDir);

      // Coletar configurações
      const configData = await this.collectSystemConfig();
      
      // Salvar configurações no diretório temporário
      await fsExtra.writeJson(path.join(tempDir, 'config.json'), configData, { spaces: 2 });
      
      // Copiar arquivos de configuração importantes
      const configFiles = [
        '.env',
        'package.json',
        'docker-compose.yml'
      ];

      for (const file of configFiles) {
        const sourcePath = path.join(__dirname, '../../', file);
        const destPath = path.join(tempDir, file);
        
        if (await fsExtra.pathExists(sourcePath)) {
          await fsExtra.copy(sourcePath, destPath);
        }
      }

      // Criar arquivo comprimido
      await tar.create({
        gzip: true,
        file: archivePath,
        cwd: this.backupPaths.temp
      }, [backupId]);

      // Upload para S3
      const fileBuffer = await fs.readFile(archivePath);
      const s3Key = `config-backups/${backupId}.tar.gz`;
      
      const uploadResult = await this.s3.upload({
        Bucket: this.backupConfig.bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          backupType: 'configuration',
          createdAt: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0'
        }
      }).promise();

      // Limpeza
      await fsExtra.remove(tempDir);
      await fsExtra.remove(archivePath);

      logger.info(`[BackupService] Backup de configuração criado: ${backupId}`);
      
      return {
        success: true,
        backupId,
        location: uploadResult.Location,
        size: fileBuffer.length
      };
    } catch (error) {
      logger.error('[BackupService] Erro ao criar backup de configuração:', error);
      throw error;
    }
  }

  /**
   * Restaura configurações de um backup
   */
  async restoreConfigBackup(backupId) {
    try {
      const s3Key = `config-backups/${backupId}.tar.gz`;
      const tempDir = path.join(this.backupPaths.temp, `restore-${backupId}`);
      const archivePath = path.join(this.backupPaths.temp, `${backupId}.tar.gz`);

      // Download do S3
      const downloadResult = await this.s3.getObject({
        Bucket: this.backupConfig.bucket,
        Key: s3Key
      }).promise();

      // Salvar arquivo temporariamente
      await fs.writeFile(archivePath, downloadResult.Body);

      // Extrair arquivo
      await fsExtra.ensureDir(tempDir);
      await tar.extract({
        file: archivePath,
        cwd: tempDir
      });

      // Ler configurações restauradas
      const configPath = path.join(tempDir, backupId, 'config.json');
      const restoredConfig = await fsExtra.readJson(configPath);

      // Aplicar configurações (implementar lógica específica)
      const restoredItems = await this.applyRestoredConfig(restoredConfig);

      // Limpeza
      await fsExtra.remove(tempDir);
      await fsExtra.remove(archivePath);

      logger.info(`[BackupService] Configuração restaurada do backup: ${backupId}`);
      
      return {
        success: true,
        backupId,
        restoredItems
      };
    } catch (error) {
      logger.error('[BackupService] Erro ao restaurar backup de configuração:', error);
      throw error;
    }
  }

  /**
   * Faz backup de gravações críticas
   */
  async backupCriticalRecordings(supabaseClient) {
    try {
      const backupId = `critical-recordings-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const tempDir = path.join(this.backupPaths.temp, backupId);
      const archivePath = path.join(this.backupPaths.temp, `${backupId}.tar.gz`);

      // Buscar gravações críticas
      const { data: criticalRecordings, error } = await supabaseClient
        .from('recordings')
        .select('*')
        .eq('is_critical', true)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      if (!criticalRecordings || criticalRecordings.length === 0) {
        logger.info('[BackupService] Nenhuma gravação crítica encontrada para backup');
        return { success: true, backedUpCount: 0, totalSize: 0 };
      }

      // Criar diretório temporário
      await fsExtra.ensureDir(tempDir);

      let totalSize = 0;
      let backedUpCount = 0;

      // Copiar arquivos críticos
      for (const recording of criticalRecordings) {
        const sourcePath = recording.file_path;
        const fileName = path.basename(sourcePath);
        const destPath = path.join(tempDir, fileName);

        if (await fsExtra.pathExists(sourcePath)) {
          await fsExtra.copy(sourcePath, destPath);
          totalSize += recording.size || 0;
          backedUpCount++;
        }
      }

      // Criar manifesto
      const manifest = {
        backupId,
        createdAt: new Date().toISOString(),
        recordings: criticalRecordings,
        totalSize,
        backedUpCount
      };

      await fsExtra.writeJson(path.join(tempDir, 'manifest.json'), manifest, { spaces: 2 });

      // Criar arquivo comprimido
      await tar.create({
        gzip: true,
        file: archivePath,
        cwd: this.backupPaths.temp
      }, [backupId]);

      // Upload para S3
      const fileBuffer = await fs.readFile(archivePath);
      const s3Key = `critical-recordings/${backupId}.tar.gz`;
      
      await this.s3.upload({
        Bucket: this.backupConfig.bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          backupType: 'critical-recordings',
          recordingCount: backedUpCount.toString(),
          totalSize: totalSize.toString()
        }
      }).promise();

      // Limpeza
      await fsExtra.remove(tempDir);
      await fsExtra.remove(archivePath);

      logger.info(`[BackupService] Backup de gravações críticas criado: ${backupId} (${backedUpCount} arquivos)`);
      
      return {
        success: true,
        backupId,
        backedUpCount,
        totalSize
      };
    } catch (error) {
      logger.error('[BackupService] Erro ao fazer backup de gravações críticas:', error);
      throw error;
    }
  }

  /**
   * Cria backup incremental
   */
  async createIncrementalBackup() {
    try {
      const backupId = `incremental-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const lastBackupFile = path.join(this.backupPaths.temp, 'last-backup.json');
      
      // Ler timestamp do último backup
      let lastBackupTime = new Date(0); // Epoch se não houver backup anterior
      if (await fsExtra.pathExists(lastBackupFile)) {
        const lastBackupData = await fsExtra.readJson(lastBackupFile);
        lastBackupTime = new Date(lastBackupData.lastBackup);
      }

      // Encontrar arquivos modificados desde o último backup
      const recordingsPattern = path.join(this.backupPaths.recordings, '**/*.mp4');
      const allFiles = await glob(recordingsPattern);
      
      const newFiles = [];
      for (const file of allFiles) {
        const stats = await fs.stat(file);
        if (stats.mtime > lastBackupTime) {
          newFiles.push(file);
        }
      }

      if (newFiles.length === 0) {
        logger.info('[BackupService] Nenhum arquivo novo encontrado para backup incremental');
        return { success: true, filesBackedUp: 0, backupType: 'incremental' };
      }

      const tempDir = path.join(this.backupPaths.temp, backupId);
      const archivePath = path.join(this.backupPaths.temp, `${backupId}.tar.gz`);

      // Criar diretório temporário
      await fsExtra.ensureDir(tempDir);

      // Copiar arquivos novos
      for (const file of newFiles) {
        const relativePath = path.relative(this.backupPaths.recordings, file);
        const destPath = path.join(tempDir, relativePath);
        await fsExtra.ensureDir(path.dirname(destPath));
        await fsExtra.copy(file, destPath);
      }

      // Criar manifesto incremental
      const manifest = {
        backupId,
        backupType: 'incremental',
        createdAt: new Date().toISOString(),
        baseBackupTime: lastBackupTime.toISOString(),
        files: newFiles.map(f => path.relative(this.backupPaths.recordings, f))
      };

      await fsExtra.writeJson(path.join(tempDir, 'manifest.json'), manifest, { spaces: 2 });

      // Criar arquivo comprimido
      await tar.create({
        gzip: true,
        file: archivePath,
        cwd: this.backupPaths.temp
      }, [backupId]);

      // Upload para S3
      const fileBuffer = await fs.readFile(archivePath);
      const s3Key = `incremental-backups/${backupId}.tar.gz`;
      
      await this.s3.upload({
        Bucket: this.backupConfig.bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          backupType: 'incremental',
          fileCount: newFiles.length.toString(),
          baseBackupTime: lastBackupTime.toISOString()
        }
      }).promise();

      // Atualizar timestamp do último backup
      await fsExtra.writeJson(lastBackupFile, {
        lastBackup: new Date().toISOString(),
        backupId
      });

      // Limpeza
      await fsExtra.remove(tempDir);
      await fsExtra.remove(archivePath);

      logger.info(`[BackupService] Backup incremental criado: ${backupId} (${newFiles.length} arquivos)`);
      
      return {
        success: true,
        backupId,
        filesBackedUp: newFiles.length,
        backupType: 'incremental'
      };
    } catch (error) {
      logger.error('[BackupService] Erro ao criar backup incremental:', error);
      throw error;
    }
  }

  /**
   * Verifica integridade de um backup
   */
  async verifyBackupIntegrity(backupId) {
    try {
      // Determinar tipo de backup e chave S3
      let s3Key;
      if (backupId.includes('config')) {
        s3Key = `config-backups/${backupId}.tar.gz`;
      } else if (backupId.includes('critical')) {
        s3Key = `critical-recordings/${backupId}.tar.gz`;
      } else if (backupId.includes('incremental')) {
        s3Key = `incremental-backups/${backupId}.tar.gz`;
      } else {
        throw new Error('Tipo de backup não reconhecido');
      }

      // Verificar metadados do objeto no S3
      const headResult = await this.s3.headObject({
        Bucket: this.backupConfig.bucket,
        Key: s3Key
      }).promise();

      // Download do manifesto para verificação
      const downloadResult = await this.s3.getObject({
        Bucket: this.backupConfig.bucket,
        Key: s3Key
      }).promise();

      // Calcular checksum
      const actualChecksum = crypto.createHash('md5').update(downloadResult.Body).digest('hex');
      const expectedChecksum = headResult.ETag.replace(/"/g, '');

      const result = {
        backupId,
        isValid: true,
        checksumMatch: actualChecksum === expectedChecksum,
        sizeMatch: downloadResult.Body.length === headResult.ContentLength,
        lastModified: headResult.LastModified,
        size: headResult.ContentLength,
        errors: []
      };

      if (!result.checksumMatch) {
        result.errors.push('checksum_mismatch');
        result.isValid = false;
      }

      if (!result.sizeMatch) {
        result.errors.push('size_mismatch');
        result.isValid = false;
      }

      // Tentar extrair e verificar manifesto
      try {
        const tempPath = path.join(this.backupPaths.temp, `verify-${backupId}.tar.gz`);
        await fs.writeFile(tempPath, downloadResult.Body);
        
        const extractDir = path.join(this.backupPaths.temp, `verify-${backupId}`);
        await tar.extract({
          file: tempPath,
          cwd: extractDir
        });

        const manifestPath = path.join(extractDir, backupId, 'manifest.json');
        if (await fsExtra.pathExists(manifestPath)) {
          const manifest = await fsExtra.readJson(manifestPath);
          result.fileCount = manifest.files ? manifest.files.length : 0;
        }

        // Limpeza
        await fsExtra.remove(tempPath);
        await fsExtra.remove(extractDir);
      } catch (extractError) {
        result.errors.push('extraction_failed');
        result.isValid = false;
      }

      logger.info(`[BackupService] Verificação de integridade do backup ${backupId}: ${result.isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
      
      return result;
    } catch (error) {
      logger.error('[BackupService] Erro ao verificar integridade do backup:', error);
      return {
        backupId,
        isValid: false,
        errors: ['verification_failed'],
        errorMessage: error.message
      };
    }
  }

  /**
   * Remove backups antigos baseado na política de retenção
   */
  async cleanupOldBackups(retentionDays = this.backupConfig.retentionDays) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      // Listar todos os backups
      const listResult = await this.s3.listObjectsV2({
        Bucket: this.backupConfig.bucket
      }).promise();

      const objectsToDelete = [];
      let keptCount = 0;

      for (const object of listResult.Contents) {
        if (object.LastModified < cutoffDate) {
          objectsToDelete.push({ Key: object.Key });
        } else {
          keptCount++;
        }
      }

      // Deletar objetos antigos
      if (objectsToDelete.length > 0) {
        await this.s3.deleteObjects({
          Bucket: this.backupConfig.bucket,
          Delete: {
            Objects: objectsToDelete
          }
        }).promise();
      }

      logger.info(`[BackupService] Limpeza de backups concluída: ${objectsToDelete.length} removidos, ${keptCount} mantidos`);
      
      return {
        deletedCount: objectsToDelete.length,
        keptCount,
        cutoffDate
      };
    } catch (error) {
      logger.error('[BackupService] Erro na limpeza de backups antigos:', error);
      throw error;
    }
  }

  /**
   * Executa recuperação completa do sistema
   */
  async executeDisasterRecovery(recoveryPlan) {
    try {
      const startTime = Date.now();
      const recoveredComponents = [];

      logger.info('[BackupService] Iniciando recuperação de desastre...');

      // Restaurar configurações
      if (recoveryPlan.configBackupId) {
        await this.restoreConfigBackup(recoveryPlan.configBackupId);
        recoveredComponents.push('configuration');
      }

      // Restaurar gravações críticas
      if (recoveryPlan.criticalRecordingsBackupId) {
        await this.restoreCriticalRecordings(
          recoveryPlan.criticalRecordingsBackupId,
          recoveryPlan.restorePath || this.backupPaths.recordings
        );
        recoveredComponents.push('critical_recordings');
      }

      const recoveryTime = Date.now() - startTime;

      // Enviar alerta de recuperação concluída
      await alertService.triggerSystemAlert({
        type: 'disaster_recovery_completed',
        recoveredComponents,
        recoveryTime,
        timestamp: new Date()
      });

      logger.info(`[BackupService] Recuperação de desastre concluída em ${recoveryTime}ms`);
      
      return {
        success: true,
        recoveredComponents,
        recoveryTime
      };
    } catch (error) {
      logger.error('[BackupService] Erro na recuperação de desastre:', error);
      
      // Enviar alerta de falha na recuperação
      await alertService.triggerSystemAlert({
        type: 'disaster_recovery_failed',
        error: error.message,
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  /**
   * Coleta configurações do sistema
   */
  async collectSystemConfig() {
    // Implementar coleta de configurações específicas do sistema
    return {
      cameras: [], // Buscar do banco de dados
      settings: {}, // Configurações do sistema
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Aplica configurações restauradas
   */
  async applyRestoredConfig(config) {
    const restoredItems = [];
    
    if (config.cameras) {
      // Restaurar configurações de câmeras
      restoredItems.push('cameras');
    }
    
    if (config.settings) {
      // Restaurar configurações do sistema
      restoredItems.push('settings');
    }
    
    return restoredItems;
  }

  /**
   * Restaura gravações críticas
   */
  async restoreCriticalRecordings(backupId, restorePath) {
    const s3Key = `critical-recordings/${backupId}.tar.gz`;
    const tempDir = path.join(this.backupPaths.temp, `restore-critical-${backupId}`);
    const archivePath = path.join(this.backupPaths.temp, `${backupId}.tar.gz`);

    // Download e extração
    const downloadResult = await this.s3.getObject({
      Bucket: this.backupConfig.bucket,
      Key: s3Key
    }).promise();

    await fs.writeFile(archivePath, downloadResult.Body);
    await fsExtra.ensureDir(restorePath);
    
    await tar.extract({
      file: archivePath,
      cwd: restorePath
    });

    // Limpeza
    await fsExtra.remove(archivePath);

    return {
      success: true,
      restorePath
    };
  }

  /**
   * Restaura backup incremental
   */
  async restoreIncrementalBackup(baseBackupId, incrementalBackupId, restorePath) {
    // Primeiro restaurar backup base
    await this.restoreCriticalRecordings(baseBackupId, restorePath);
    
    // Depois aplicar backup incremental
    await this.restoreCriticalRecordings(incrementalBackupId, restorePath);
    
    return {
      success: true,
      restorePath
    };
  }

  /**
   * Valida sistema após recuperação
   */
  async validateRecovery(recoveryPath) {
    const validatedComponents = [];
    const errors = [];
    
    // Verificar se arquivos essenciais existem
    const essentialFiles = [
      'config.json',
      'settings.json'
    ];
    
    for (const file of essentialFiles) {
      const filePath = path.join(recoveryPath, file);
      if (await fsExtra.pathExists(filePath)) {
        validatedComponents.push(path.basename(file, '.json'));
      } else {
        errors.push(`Missing file: ${file}`);
      }
    }
    
    // Verificar diretório de gravações
    if (await fsExtra.pathExists(path.join(recoveryPath, 'recordings'))) {
      validatedComponents.push('recordings');
    }
    
    return {
      isValid: errors.length === 0,
      validatedComponents,
      errors
    };
  }
}

export default new BackupService();