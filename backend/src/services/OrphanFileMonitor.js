/**
 * OrphanFileMonitor - Sistema de monitoramento de arquivos órfãos
 * Detecta arquivos MP4 que não foram associados a registros no banco de dados
 * e automaticamente os enfileira para upload
 */

import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from './UploadQueueService.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('OrphanFileMonitor');

class OrphanFileMonitor {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.scanIntervalMs = 60 * 1000; // 1 minuto
    this.supabase = supabaseAdmin;
    this.uploadQueueService = UploadQueueService;
    this.processedFiles = new Set(); // Cache para evitar reprocessamento
    
    logger.info('OrphanFileMonitor initialized');
  }

  /**
   * Iniciar monitoramento automático
   * @param {Object} io - Socket.IO instance for notifications
   */
  start(io = null) {
    if (this.isRunning) {
      logger.warn('OrphanFileMonitor already running');
      return;
    }

    this.isRunning = true;
    this.uploadQueueService.setSocketIO(io);
    
    logger.info('🔍 OrphanFileMonitor started - scanning every 60 seconds');
    
    // Executar imediatamente
    this.scanForOrphanFiles();
    
    // Configurar intervalo
    this.interval = setInterval(() => {
      this.scanForOrphanFiles();
    }, this.scanIntervalMs);
  }

  /**
   * Parar monitoramento
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isRunning = false;
    logger.info('🛑 OrphanFileMonitor stopped');
  }

  /**
   * Buscar por arquivos órfãos
   */
  async scanForOrphanFiles() {
    try {
      logger.debug('🔍 Scanning for orphan files...');
      
      const basePaths = [
        path.join(process.cwd(), 'storage', 'www', 'record', 'live'),
        path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'),
        '/opt/media/bin/www/record/live' // Docker path
      ];

      let foundFiles = 0;
      let processedFiles = 0;

      for (const basePath of basePaths) {
        try {
          await this.scanDirectory(basePath);
          foundFiles++;
        } catch (error) {
          logger.debug(`Directory not accessible: ${basePath}`);
        }
      }

      if (foundFiles === 0) {
        logger.debug('No recording directories found');
      } else if (processedFiles > 0) {
        logger.info(`✅ OrphanFileMonitor: processed ${processedFiles} orphan files`);
      }

    } catch (error) {
      logger.error('Error scanning for orphan files:', error);
    }
  }

  /**
   * Escanear um diretório específico
   * @param {string} basePath - Caminho base para escanear
   */
  async scanDirectory(basePath) {
    try {
      const cameras = await fs.readdir(basePath);
      
      for (const cameraId of cameras) {
        const cameraPath = path.join(basePath, cameraId);
        
        try {
          const dates = await fs.readdir(cameraPath);
          
          for (const date of dates) {
            const datePath = path.join(cameraPath, date);
            await this.scanDateDirectory(cameraId, datePath, date);
          }
        } catch (error) {
          logger.debug(`Cannot read camera directory: ${cameraPath}`);
        }
      }
    } catch (error) {
      logger.debug(`Cannot read base directory: ${basePath}`);
    }
  }

  /**
   * Escanear diretório de uma data específica
   * @param {string} cameraId - ID da câmera
   * @param {string} datePath - Caminho do diretório da data
   * @param {string} date - Data no formato YYYY-MM-DD
   */
  async scanDateDirectory(cameraId, datePath, date) {
    try {
      const files = await fs.readdir(datePath);
      
      for (const filename of files) {
        // Processar apenas arquivos MP4
        if (!filename.endsWith('.mp4')) continue;
        
        const fullPath = path.join(datePath, filename);
        const relativeDbPath = `storage/www/record/live/${cameraId}/${date}/${filename}`;
        
        // Verificar se já foi processado
        const fileKey = `${cameraId}_${date}_${filename}`;
        if (this.processedFiles.has(fileKey)) continue;
        
        // Verificar se arquivo existe no banco de dados
        const isOrphan = await this.isOrphanFile(cameraId, filename, relativeDbPath);
        
        if (isOrphan) {
          logger.info(`🆔 Found orphan file: ${relativeDbPath}`);
          await this.processOrphanFile(cameraId, fullPath, relativeDbPath, filename, date);
          this.processedFiles.add(fileKey);
        } else {
          // Arquivo já tem registro no banco
          this.processedFiles.add(fileKey);
        }
      }
    } catch (error) {
      logger.debug(`Cannot read date directory: ${datePath}`);
    }
  }

  /**
   * Verificar se um arquivo é órfão (não tem registro no banco)
   * @param {string} cameraId - ID da câmera
   * @param {string} filename - Nome do arquivo
   * @param {string} dbPath - Caminho relativo do banco
   * @returns {boolean} - True se for órfão
   */
  async isOrphanFile(cameraId, filename, dbPath) {
    try {
      // Buscar por arquivo no banco usando diferentes critérios
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, local_path, camera_id')
        .eq('camera_id', cameraId)
        .or(`filename.eq.${filename},file_path.eq.${dbPath},local_path.eq.${dbPath}`)
        .limit(1);

      if (error) {
        logger.error('Error checking orphan file:', error);
        return false;
      }

      return !recordings || recordings.length === 0;
    } catch (error) {
      logger.error('Error in isOrphanFile:', error);
      return false;
    }
  }

  /**
   * Processar arquivo órfão - criar registro e enfileirar
   * @param {string} cameraId - ID da câmera
   * @param {string} fullPath - Caminho completo do arquivo
   * @param {string} dbPath - Caminho relativo do banco
   * @param {string} filename - Nome do arquivo
   * @param {string} date - Data da gravação
   */
  async processOrphanFile(cameraId, fullPath, dbPath, filename, date) {
    try {
      // Obter estatísticas do arquivo
      const stats = await fs.stat(fullPath);
      
      // Extrair timestamp do nome do arquivo se possível
      const timestampMatch = filename.match(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
      let startTime = new Date();
      
      if (timestampMatch) {
        const [year, month, day, hour, minute, second] = timestampMatch[1].split('-');
        startTime = new Date(year, month - 1, day, hour, minute, second);
      } else {
        // Usar timestamp do arquivo
        startTime = stats.mtime;
      }

      // Calcular fim da gravação (estimativa)
      const endTime = new Date(stats.mtime);
      const duration = Math.floor((endTime - startTime) / 1000);

      logger.info('📝 Creating database record for orphan file:', {
        filename,
        cameraId,
        size: stats.size,
        duration
      });

      // Criar registro no banco de dados
      const { data: recording, error: insertError } = await this.supabase
        .from('recordings')
        .insert({
          camera_id: cameraId,
          filename: filename,
          file_path: dbPath,
          local_path: dbPath,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration: Math.max(duration, 1),
          size: stats.size,
          status: 'completed',
          upload_status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        logger.error('Failed to create recording record:', insertError);
        return;
      }

      logger.info('✅ Created database record:', {
        recordingId: recording.id,
        filename: recording.filename
      });

      // Enfileirar para upload se S3 estiver habilitado
      const s3Enabled = process.env.S3_UPLOAD_ENABLED === 'true';
      const queueEnabled = process.env.ENABLE_UPLOAD_QUEUE === 'true';

      if (s3Enabled && queueEnabled) {
        try {
          const enqueueResult = await this.uploadQueueService.enqueue(recording.id, {
            priority: 'normal',
            source: 'orphan_monitor'
          });

          if (enqueueResult.success) {
            logger.info('📤 Orphan file enqueued for upload:', {
              recordingId: recording.id,
              reason: enqueueResult.reason
            });
          } else {
            logger.warn('⚠️ Failed to enqueue orphan file:', {
              recordingId: recording.id,
              reason: enqueueResult.reason
            });
          }
        } catch (enqueueError) {
          logger.error('Error enqueuing orphan file:', enqueueError);
        }
      }

    } catch (error) {
      logger.error('Error processing orphan file:', error);
    }
  }

  /**
   * Limpar cache de arquivos processados (executar periodicamente)
   */
  clearProcessedCache() {
    const sizeBefore = this.processedFiles.size;
    this.processedFiles.clear();
    
    logger.info(`🧹 Cleared processed files cache: ${sizeBefore} entries removed`);
  }

  /**
   * Obter estatísticas do monitor
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      scanInterval: this.scanIntervalMs,
      processedFilesCount: this.processedFiles.size,
      lastScan: new Date().toISOString()
    };
  }
}

export default OrphanFileMonitor;