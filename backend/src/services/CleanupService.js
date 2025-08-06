/**
 * Serviço de Limpeza Automática
 * Gerencia limpeza automática de arquivos antigos locais e no S3
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cron from 'node-cron';
import AWS from 'aws-sdk';
import logger from '../utils/logger.js';
import alertService from './AlertService.js';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupJobs = new Map();
    this.config = {
      local: {
        retentionDays: 7, // Manter arquivos locais por 7 dias
        maxDiskUsage: 85, // Limpar quando uso do disco > 85%
        recordingsPath: process.env.RECORDINGS_PATH || './recordings',
        logsPath: process.env.LOGS_PATH || './logs',
        tempPath: process.env.TEMP_PATH || './temp'
      },
      s3: {
        retentionDays: 365, // Manter no S3 por 1 ano
        archiveAfterDays: 30, // Arquivar para Glacier após 30 dias
        deleteAfterDays: 2555, // Deletar após 7 anos (compliance)
        bucket: process.env.WASABI_BUCKET_NAME
      },
      database: {
        retentionDays: 90, // Manter logs de sistema por 90 dias
        archiveAfterDays: 30 // Arquivar logs antigos após 30 dias
      }
    };
    
    // Configurar AWS S3 (Wasabi)
    this.s3 = new AWS.S3({
      endpoint: process.env.WASABI_ENDPOINT,
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      region: process.env.WASABI_REGION || 'us-east-1'
    });
  }

  /**
   * Inicializa o serviço de limpeza
   */
  async initialize() {
    try {
      logger.info('[CleanupService] Inicializando serviço de limpeza automática...');
      
      // Carregar configurações personalizadas
      await this.loadCleanupConfig();
      
      // Configurar jobs de limpeza automática
      await this.setupCleanupJobs();
      
      // Executar limpeza inicial
      await this.performInitialCleanup();
      
      this.isRunning = true;
      logger.info('[CleanupService] Serviço de limpeza inicializado com sucesso');
    } catch (error) {
      logger.error('[CleanupService] Erro ao inicializar serviço:', error);
      throw error;
    }
  }

  /**
   * Para o serviço de limpeza
   */
  async stop() {
    try {
      this.isRunning = false;
      
      // Parar todos os jobs de limpeza
      for (const [jobName, job] of this.cleanupJobs) {
        if (job && job.destroy) {
          job.destroy();
        }
      }
      
      this.cleanupJobs.clear();
      logger.info('[CleanupService] Serviço de limpeza parado');
    } catch (error) {
      logger.error('[CleanupService] Erro ao parar serviço:', error);
    }
  }

  /**
   * Configura jobs de limpeza automática
   */
  async setupCleanupJobs() {
    try {
      // Job diário de limpeza local (executa às 2:00 AM)
      const dailyLocalCleanup = cron.schedule('0 2 * * *', async () => {
        await this.performLocalCleanup();
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo'
      });
      
      // Job semanal de limpeza S3 (executa aos domingos às 3:00 AM)
      const weeklyS3Cleanup = cron.schedule('0 3 * * 0', async () => {
        await this.performS3Cleanup();
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo'
      });
      
      // Job mensal de limpeza de banco de dados (executa no dia 1 às 4:00 AM)
      const monthlyDatabaseCleanup = cron.schedule('0 4 1 * *', async () => {
        await this.performDatabaseCleanup();
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo'
      });
      
      // Job de verificação de espaço em disco (executa a cada 6 horas)
      const diskSpaceCheck = cron.schedule('0 */6 * * *', async () => {
        await this.checkDiskSpaceAndCleanup();
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo'
      });
      
      // Armazenar jobs
      this.cleanupJobs.set('dailyLocal', dailyLocalCleanup);
      this.cleanupJobs.set('weeklyS3', weeklyS3Cleanup);
      this.cleanupJobs.set('monthlyDatabase', monthlyDatabaseCleanup);
      this.cleanupJobs.set('diskSpaceCheck', diskSpaceCheck);
      
      // Iniciar todos os jobs
      for (const [jobName, job] of this.cleanupJobs) {
        job.start();
        logger.info(`[CleanupService] Job ${jobName} agendado`);
      }
      
    } catch (error) {
      logger.error('[CleanupService] Erro ao configurar jobs de limpeza:', error);
    }
  }

  /**
   * Executa limpeza inicial
   */
  async performInitialCleanup() {
    try {
      logger.info('[CleanupService] Executando limpeza inicial...');
      
      // Verificar espaço em disco
      const diskUsage = await this.getDiskUsage();
      
      if (diskUsage.usagePercent > this.config.local.maxDiskUsage) {
        logger.warn(`[CleanupService] Uso do disco alto (${diskUsage.usagePercent}%), executando limpeza emergencial`);
        await this.performEmergencyCleanup();
      }
      
      // Limpeza básica de arquivos temporários
      await this.cleanupTempFiles();
      
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza inicial:', error);
    }
  }

  /**
   * Executa limpeza local de arquivos
   */
  async performLocalCleanup() {
    try {
      logger.info('[CleanupService] Iniciando limpeza local de arquivos...');
      
      const cleanupResults = {
        recordings: { deleted: 0, size: 0 },
        logs: { deleted: 0, size: 0 },
        temp: { deleted: 0, size: 0 }
      };
      
      // Limpar gravações antigas
      const recordingsResult = await this.cleanupOldRecordings();
      cleanupResults.recordings = recordingsResult;
      
      // Limpar logs antigos
      const logsResult = await this.cleanupOldLogs();
      cleanupResults.logs = logsResult;
      
      // Limpar arquivos temporários
      const tempResult = await this.cleanupTempFiles();
      cleanupResults.temp = tempResult;
      
      // Calcular totais
      const totalDeleted = cleanupResults.recordings.deleted + cleanupResults.logs.deleted + cleanupResults.temp.deleted;
      const totalSize = cleanupResults.recordings.size + cleanupResults.logs.size + cleanupResults.temp.size;
      
      logger.info(`[CleanupService] Limpeza local concluída: ${totalDeleted} arquivos removidos, ${this.formatBytes(totalSize)} liberados`);
      
      // Enviar relatório de limpeza
      await this.sendCleanupReport('local', cleanupResults);
      
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza local:', error);
      await alertService.triggerSystemAlert({
        type: 'cleanup_error',
        context: 'local_cleanup',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Executa limpeza no S3
   */
  async performS3Cleanup() {
    try {
      logger.info('[CleanupService] Iniciando limpeza S3...');
      
      const cleanupResults = {
        deleted: 0,
        archived: 0,
        size: 0
      };
      
      // Listar objetos no bucket
      const objects = await this.listS3Objects();
      
      const now = new Date();
      const deleteThreshold = new Date(now.getTime() - (this.config.s3.deleteAfterDays * 24 * 60 * 60 * 1000));
      const archiveThreshold = new Date(now.getTime() - (this.config.s3.archiveAfterDays * 24 * 60 * 60 * 1000));
      
      for (const object of objects) {
        const objectDate = new Date(object.LastModified);
        
        // Deletar objetos muito antigos
        if (objectDate < deleteThreshold) {
          await this.deleteS3Object(object.Key);
          cleanupResults.deleted++;
          cleanupResults.size += object.Size;
          
        // Arquivar objetos antigos para Glacier
        } else if (objectDate < archiveThreshold && object.StorageClass !== 'GLACIER') {
          await this.archiveS3Object(object.Key);
          cleanupResults.archived++;
        }
      }
      
      logger.info(`[CleanupService] Limpeza S3 concluída: ${cleanupResults.deleted} objetos deletados, ${cleanupResults.archived} arquivados, ${this.formatBytes(cleanupResults.size)} liberados`);
      
      // Enviar relatório de limpeza
      await this.sendCleanupReport('s3', cleanupResults);
      
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza S3:', error);
      await alertService.triggerSystemAlert({
        type: 'cleanup_error',
        context: 's3_cleanup',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Executa limpeza do banco de dados
   */
  async performDatabaseCleanup() {
    try {
      logger.info('[CleanupService] Iniciando limpeza do banco de dados...');
      
      const cleanupResults = {
        systemLogs: 0,
        oldRecords: 0,
        archivedRecords: 0
      };
      
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - this.config.database.retentionDays);
      
      const archiveDate = new Date();
      archiveDate.setDate(archiveDate.getDate() - this.config.database.archiveAfterDays);
      
      // Limpar logs de sistema antigos
      const { data: systemLogs, error: systemLogsError } = await supabase
        .from('system_logs')
        .delete()
        .lt('created_at', retentionDate.toISOString());
      
      if (systemLogsError) {
        logger.error('[CleanupService] Erro ao limpar logs de sistema:', systemLogsError);
      } else {
        cleanupResults.systemLogs = systemLogs?.length || 0;
      }
      
      // Arquivar registros antigos de gravações
      const { data: oldRecordings, error: archiveError } = await supabase
        .from('recordings')
        .update({ archived: true })
        .lt('created_at', archiveDate.toISOString())
        .eq('archived', false);
      
      if (archiveError) {
        logger.error('[CleanupService] Erro ao arquivar gravações antigas:', archiveError);
      } else {
        cleanupResults.archivedRecords = oldRecordings?.length || 0;
      }
      
      // Deletar registros muito antigos já arquivados
      const { data: deletedRecords, error: deleteError } = await supabase
        .from('recordings')
        .delete()
        .lt('created_at', retentionDate.toISOString())
        .eq('archived', true);
      
      if (deleteError) {
        logger.error('[CleanupService] Erro ao deletar registros arquivados:', deleteError);
      } else {
        cleanupResults.oldRecords = deletedRecords?.length || 0;
      }
      
      logger.info(`[CleanupService] Limpeza do banco concluída: ${cleanupResults.systemLogs} logs removidos, ${cleanupResults.archivedRecords} registros arquivados, ${cleanupResults.oldRecords} registros deletados`);
      
      // Enviar relatório de limpeza
      await this.sendCleanupReport('database', cleanupResults);
      
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza do banco:', error);
      await alertService.triggerSystemAlert({
        type: 'cleanup_error',
        context: 'database_cleanup',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Verifica espaço em disco e executa limpeza se necessário
   */
  async checkDiskSpaceAndCleanup() {
    try {
      const diskUsage = await this.getDiskUsage();
      
      if (diskUsage.usagePercent > this.config.local.maxDiskUsage) {
        logger.warn(`[CleanupService] Uso do disco alto (${diskUsage.usagePercent}%), executando limpeza automática`);
        
        await this.performEmergencyCleanup();
        
        // Verificar novamente após limpeza
        const newDiskUsage = await this.getDiskUsage();
        
        if (newDiskUsage.usagePercent > this.config.local.maxDiskUsage) {
          await alertService.triggerSystemAlert({
            type: 'disk_space_critical',
            usage: newDiskUsage,
            threshold: this.config.local.maxDiskUsage,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error('[CleanupService] Erro ao verificar espaço em disco:', error);
    }
  }

  /**
   * Executa limpeza emergencial
   */
  async performEmergencyCleanup() {
    try {
      logger.warn('[CleanupService] Executando limpeza emergencial...');
      
      // Limpar arquivos temporários primeiro
      await this.cleanupTempFiles();
      
      // Limpar gravações mais antigas que o normal
      const emergencyRetentionDays = Math.max(1, this.config.local.retentionDays - 3);
      await this.cleanupOldRecordings(emergencyRetentionDays);
      
      // Limpar logs mais antigos
      const emergencyLogRetentionDays = Math.max(1, 7);
      await this.cleanupOldLogs(emergencyLogRetentionDays);
      
      logger.info('[CleanupService] Limpeza emergencial concluída');
      
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza emergencial:', error);
    }
  }

  /**
   * Limpa gravações antigas
   */
  async cleanupOldRecordings(retentionDays = null) {
    try {
      const retention = retentionDays || this.config.local.retentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retention);
      
      const recordingsPath = this.config.local.recordingsPath;
      let deletedCount = 0;
      let deletedSize = 0;
      
      // Verificar se diretório existe
      try {
        await fs.access(recordingsPath);
      } catch {
        return { deleted: 0, size: 0 };
      }
      
      const files = await fs.readdir(recordingsPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(recordingsPath, file.name);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            deletedSize += stats.size;
            await fs.unlink(filePath);
            deletedCount++;
            
            logger.debug(`[CleanupService] Removido: ${file.name}`);
          }
        }
      }
      
      return { deleted: deletedCount, size: deletedSize };
    } catch (error) {
      logger.error('[CleanupService] Erro ao limpar gravações antigas:', error);
      return { deleted: 0, size: 0 };
    }
  }

  /**
   * Limpa logs antigos
   */
  async cleanupOldLogs(retentionDays = null) {
    try {
      const retention = retentionDays || 30; // Logs mantidos por 30 dias por padrão
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retention);
      
      const logsPath = this.config.local.logsPath;
      let deletedCount = 0;
      let deletedSize = 0;
      
      // Verificar se diretório existe
      try {
        await fs.access(logsPath);
      } catch {
        return { deleted: 0, size: 0 };
      }
      
      const files = await fs.readdir(logsPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.log')) {
          const filePath = path.join(logsPath, file.name);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            deletedSize += stats.size;
            await fs.unlink(filePath);
            deletedCount++;
            
            logger.debug(`[CleanupService] Log removido: ${file.name}`);
          }
        }
      }
      
      return { deleted: deletedCount, size: deletedSize };
    } catch (error) {
      logger.error('[CleanupService] Erro ao limpar logs antigos:', error);
      return { deleted: 0, size: 0 };
    }
  }

  /**
   * Limpa arquivos temporários
   */
  async cleanupTempFiles() {
    try {
      const tempPath = this.config.local.tempPath;
      let deletedCount = 0;
      let deletedSize = 0;
      
      // Verificar se diretório existe
      try {
        await fs.access(tempPath);
      } catch {
        return { deleted: 0, size: 0 };
      }
      
      const files = await fs.readdir(tempPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(tempPath, file.name);
          const stats = await fs.stat(filePath);
          
          // Remover arquivos temporários com mais de 1 hora
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          if (stats.mtime < oneHourAgo) {
            deletedSize += stats.size;
            await fs.unlink(filePath);
            deletedCount++;
            
            logger.debug(`[CleanupService] Arquivo temporário removido: ${file.name}`);
          }
        }
      }
      
      return { deleted: deletedCount, size: deletedSize };
    } catch (error) {
      logger.error('[CleanupService] Erro ao limpar arquivos temporários:', error);
      return { deleted: 0, size: 0 };
    }
  }

  /**
   * Lista objetos no S3
   */
  async listS3Objects() {
    try {
      const params = {
        Bucket: this.config.s3.bucket,
        MaxKeys: 1000
      };
      
      const objects = [];
      let continuationToken = null;
      
      do {
        if (continuationToken) {
          params.ContinuationToken = continuationToken;
        }
        
        const response = await this.s3.listObjectsV2(params).promise();
        
        if (response.Contents) {
          objects.push(...response.Contents);
        }
        
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
      
      return objects;
    } catch (error) {
      logger.error('[CleanupService] Erro ao listar objetos S3:', error);
      return [];
    }
  }

  /**
   * Deleta objeto no S3
   */
  async deleteS3Object(key) {
    try {
      await this.s3.deleteObject({
        Bucket: this.config.s3.bucket,
        Key: key
      }).promise();
      
      logger.debug(`[CleanupService] Objeto S3 deletado: ${key}`);
    } catch (error) {
      logger.error(`[CleanupService] Erro ao deletar objeto S3 ${key}:`, error);
    }
  }

  /**
   * Arquiva objeto no S3 para Glacier
   */
  async archiveS3Object(key) {
    try {
      await this.s3.copyObject({
        Bucket: this.config.s3.bucket,
        CopySource: `${this.config.s3.bucket}/${key}`,
        Key: key,
        StorageClass: 'GLACIER'
      }).promise();
      
      logger.debug(`[CleanupService] Objeto S3 arquivado: ${key}`);
    } catch (error) {
      logger.error(`[CleanupService] Erro ao arquivar objeto S3 ${key}:`, error);
    }
  }

  /**
   * Obtém uso do disco
   */
  async getDiskUsage() {
    try {
      const { execAsync } = await import('../utils/execAsync.js');
      
      try {
        // Tentar usar df (comando Linux/Unix)
        const { stdout } = await execAsync('df -h /');
        const lines = stdout.split('\n');
        const dataLine = lines[1]; // Segunda linha contém os dados
        const parts = dataLine.trim().split(/\s+/);
        
        if (parts.length >= 4) {
          const totalStr = parts[1];
          const usedStr = parts[2];
          const freeStr = parts[3];
          
          // Converter de formato legível para bytes
          const total = this.parseSize(totalStr);
          const used = this.parseSize(usedStr);
          const free = this.parseSize(freeStr);
          const usagePercent = Math.round((used / total) * 100);
          
          return {
            total,
            used,
            free,
            usagePercent
          };
        }
      } catch (dfError) {
        // Fallback para valores padrão
        logger.warn('[CleanupService] Comando df não disponível, usando valores padrão');
        return {
          total: 100 * 1024 * 1024 * 1024, // 100GB
          used: 50 * 1024 * 1024 * 1024,   // 50GB
          free: 50 * 1024 * 1024 * 1024,   // 50GB
          usagePercent: 50
        };
      }
    } catch (error) {
      logger.error('[CleanupService] Erro ao obter uso do disco:', error);
      return { total: 0, used: 0, free: 0, usagePercent: 0 };
    }
  }

  /**
   * Converte string de tamanho (ex: "10G", "500M") para bytes
   */
  parseSize(sizeStr) {
    const units = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4 };
    const match = sizeStr.match(/^([0-9.]+)([KMGT]?)$/);
    
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2] || '';
    
    return Math.round(value * (units[unit] || 1));
  }

  /**
   * Envia relatório de limpeza
   */
  async sendCleanupReport(type, results) {
    try {
      await alertService.triggerSystemAlert({
        type: 'cleanup_completed',
        cleanupType: type,
        results,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('[CleanupService] Erro ao enviar relatório de limpeza:', error);
    }
  }

  /**
   * Carrega configurações de limpeza
   */
  async loadCleanupConfig() {
    try {
      const configPath = path.join(__dirname, '../config/cleanup.json');
      
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Mesclar configurações carregadas
        Object.assign(this.config, config);
        
        logger.info('[CleanupService] Configurações de limpeza carregadas');
      } catch (error) {
        // Usar configurações padrão se arquivo não existir
        logger.info('[CleanupService] Usando configurações padrão de limpeza');
      }
    } catch (error) {
      logger.error('[CleanupService] Erro ao carregar configurações:', error);
    }
  }

  /**
   * Formata bytes em formato legível
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Obtém status do serviço de limpeza
   */
  getCleanupStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.cleanupJobs.keys()),
      config: this.config,
      lastCleanup: this.lastCleanup || null
    };
  }

  /**
   * Executa limpeza manual
   */
  async performManualCleanup(type = 'all') {
    try {
      logger.info(`[CleanupService] Executando limpeza manual: ${type}`);
      
      switch (type) {
        case 'local':
          await this.performLocalCleanup();
          break;
        case 's3':
          await this.performS3Cleanup();
          break;
        case 'database':
          await this.performDatabaseCleanup();
          break;
        case 'all':
        default:
          await this.performLocalCleanup();
          await this.performS3Cleanup();
          await this.performDatabaseCleanup();
          break;
      }
      
      logger.info('[CleanupService] Limpeza manual concluída');
    } catch (error) {
      logger.error('[CleanupService] Erro durante limpeza manual:', error);
      throw error;
    }
  }
}

export default new CleanupService();