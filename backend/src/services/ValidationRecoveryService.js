/**
 * ValidationRecoveryService - Sistema de validação e recovery automático
 * Valida integridade dos dados e corrige inconsistências automaticamente
 */

import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import PathResolver from '../utils/PathResolver.js';
import UploadQueueService from './UploadQueueService.js';

const logger = createModuleLogger('ValidationRecoveryService');

class ValidationRecoveryService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.uploadQueueService = UploadQueueService;
    this.isRunning = false;
    this.interval = null;
    this.validationIntervalMs = 15 * 60 * 1000; // 15 minutos
    
    logger.info('ValidationRecoveryService initialized');
  }

  /**
   * Iniciar serviço de validação
   * @param {Object} io - Socket.IO instance
   */
  start(io = null) {
    if (this.isRunning) {
      logger.warn('ValidationRecoveryService already running');
      return;
    }

    this.isRunning = true;
    this.uploadQueueService.setSocketIO(io);
    
    logger.info('🔍 ValidationRecoveryService started - validating every 15 minutes');
    
    // Executar após 2 minutos (dar tempo para outros serviços iniciarem)
    setTimeout(() => {
      this.runValidationCycle();
    }, 2 * 60 * 1000);
    
    // Configurar intervalo
    this.interval = setInterval(() => {
      this.runValidationCycle();
    }, this.validationIntervalMs);
  }

  /**
   * Parar serviço
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isRunning = false;
    logger.info('🛑 ValidationRecoveryService stopped');
  }

  /**
   * Executar ciclo completo de validação
   */
  async runValidationCycle() {
    try {
      logger.debug('🔍 Starting validation cycle...');
      
      const startTime = Date.now();
      const results = {
        missingFiles: 0,
        invalidDurations: 0,
        duplicateRecords: 0,
        inconsistentPaths: 0,
        stuckRecordings: 0,
        recoveredRecordings: 0
      };

      // 1. Validar arquivos físicos vs banco de dados
      const missingFiles = await this.validateFileExistence();
      results.missingFiles = missingFiles.length;
      await this.handleMissingFiles(missingFiles);

      // 2. Validar durações inválidas ou faltando
      const invalidDurations = await this.validateDurations();
      results.invalidDurations = invalidDurations.length;
      await this.fixInvalidDurations(invalidDurations);

      // 3. Detectar e resolver registros duplicados
      const duplicates = await this.detectDuplicateRecords();
      results.duplicateRecords = duplicates.length;
      await this.resolveDuplicateRecords(duplicates);

      // 4. Corrigir paths inconsistentes
      const inconsistentPaths = await this.validatePathConsistency();
      results.inconsistentPaths = inconsistentPaths.length;
      await this.fixInconsistentPaths(inconsistentPaths);

      // 5. Detectar gravações "presas" em recording
      const stuckRecordings = await this.detectStuckRecordings();
      results.stuckRecordings = stuckRecordings.length;
      results.recoveredRecordings = await this.recoverStuckRecordings(stuckRecordings);

      const duration = Date.now() - startTime;
      const totalIssues = Object.values(results).reduce((sum, count) => sum + count, 0) - results.recoveredRecordings;
      
      if (totalIssues > 0) {
        logger.info(`✅ Validation cycle completed in ${duration}ms:`, results);
      } else {
        logger.debug(`✅ Validation cycle completed - no issues found (${duration}ms)`);
      }

    } catch (error) {
      logger.error('Error in validation cycle:', error);
    }
  }

  /**
   * Validar existência de arquivos físicos
   */
  async validateFileExistence() {
    try {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, local_path, camera_id, status')
        .in('status', ['completed', 'recording'])
        .not('file_path', 'is', null)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Últimos 7 dias
        .limit(100);

      if (error) {
        logger.error('Error fetching recordings for file validation:', error);
        return [];
      }

      const missingFiles = [];
      
      for (const recording of recordings || []) {
        try {
          const fileInfo = await PathResolver.findRecordingFile(recording);
          if (!fileInfo || !fileInfo.exists) {
            missingFiles.push({
              ...recording,
              reason: 'file_not_found',
              searched_paths: fileInfo?.searchedPaths || []
            });
          }
        } catch (error) {
          logger.debug(`Error checking file for ${recording.id}:`, error.message);
          missingFiles.push({
            ...recording,
            reason: 'validation_error',
            error: error.message
          });
        }
      }

      return missingFiles;
    } catch (error) {
      logger.error('Error in validateFileExistence:', error);
      return [];
    }
  }

  /**
   * Tratar arquivos faltando
   */
  async handleMissingFiles(missingFiles) {
    for (const recording of missingFiles) {
      try {
        logger.warn(`📁 Missing file detected: ${recording.filename} (${recording.id})`);
        
        if (recording.status === 'recording') {
          // Gravação ainda ativa - não fazer nada, arquivo pode não ter sido criado ainda
          logger.debug(`Skipping active recording: ${recording.id}`);
          continue;
        }

        // Marcar como arquivo não encontrado
        await this.supabase
          .from('recordings')
          .update({
            upload_status: 'failed',
            upload_error_code: 'FILE_NOT_FOUND',
            error_message: `File not found: ${recording.file_path}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', recording.id);

        logger.info(`📝 Marked as failed due to missing file: ${recording.id}`);
        
      } catch (error) {
        logger.error(`Error handling missing file for ${recording.id}:`, error);
      }
    }
  }

  /**
   * Validar durações de gravações
   */
  async validateDurations() {
    try {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, local_path, camera_id, duration, start_time, end_time')
        .eq('status', 'completed')
        .or('duration.is.null,duration.eq.0')
        .not('file_path', 'is', null)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24h
        .limit(50);

      if (error) {
        logger.error('Error fetching recordings for duration validation:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in validateDurations:', error);
      return [];
    }
  }

  /**
   * Corrigir durações inválidas
   */
  async fixInvalidDurations(recordings) {
    for (const recording of recordings) {
      try {
        // Tentar calcular duração dos timestamps
        let duration = 0;
        if (recording.start_time && recording.end_time) {
          const start = new Date(recording.start_time);
          const end = new Date(recording.end_time);
          duration = Math.floor((end - start) / 1000);
        }

        // Se ainda não temos duração, tentar obter do arquivo
        if (duration <= 0) {
          const fileInfo = await PathResolver.findRecordingFile(recording);
          if (fileInfo && fileInfo.exists) {
            try {
              // Usar ffprobe via PathResolver se disponível
              const metadata = await this.getVideoMetadata(fileInfo.absolutePath);
              if (metadata && metadata.duration > 0) {
                duration = Math.floor(metadata.duration);
              }
            } catch (error) {
              logger.debug(`Could not get metadata for ${recording.id}:`, error.message);
            }
          }
        }

        // Se ainda não temos duração, usar valor padrão baseado na idade
        if (duration <= 0 && recording.start_time) {
          const start = new Date(recording.start_time);
          const now = new Date();
          duration = Math.floor((now - start) / 1000);
          duration = Math.min(duration, 1800); // Máximo 30 minutos
        }

        if (duration > 0) {
          await this.supabase
            .from('recordings')
            .update({
              duration: duration,
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          logger.info(`⏱️ Fixed duration for ${recording.id}: ${duration}s`);
        }

      } catch (error) {
        logger.error(`Error fixing duration for ${recording.id}:`, error);
      }
    }
  }

  /**
   * Detectar gravações duplicadas
   */
  async detectDuplicateRecords() {
    try {
      const { data: duplicates, error } = await this.supabase
        .rpc('find_duplicate_recordings')
        .limit(20);

      if (error) {
        logger.debug('No duplicate detection function available:', error.message);
        return [];
      }

      return duplicates || [];
    } catch (error) {
      logger.debug('Error detecting duplicates (expected if function not exists):', error.message);
      return [];
    }
  }

  /**
   * Resolver registros duplicados
   */
  async resolveDuplicateRecords(duplicates) {
    for (const duplicate of duplicates) {
      try {
        logger.warn(`🔍 Resolving duplicate records for: ${duplicate.filename}`);
        
        // Lógica para manter o melhor registro e remover duplicatas
        // Por enquanto, apenas log - implementar lógica específica conforme necessário
        
      } catch (error) {
        logger.error(`Error resolving duplicate for ${duplicate.filename}:`, error);
      }
    }
  }

  /**
   * Validar consistência de paths
   */
  async validatePathConsistency() {
    try {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, local_path')
        .neq('file_path', 'local_path')
        .not('file_path', 'is', null)
        .not('local_path', 'is', null)
        .limit(30);

      if (error) {
        logger.error('Error fetching recordings for path validation:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in validatePathConsistency:', error);
      return [];
    }
  }

  /**
   * Corrigir paths inconsistentes
   */
  async fixInconsistentPaths(recordings) {
    for (const recording of recordings) {
      try {
        // Normalizar paths para serem iguais (usar file_path como padrão)
        const normalizedPath = recording.file_path || recording.local_path;
        
        if (normalizedPath) {
          await this.supabase
            .from('recordings')
            .update({
              file_path: normalizedPath,
              local_path: normalizedPath,
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          logger.info(`🔧 Normalized paths for ${recording.id}: ${normalizedPath}`);
        }

      } catch (error) {
        logger.error(`Error fixing paths for ${recording.id}:`, error);
      }
    }
  }

  /**
   * Detectar gravações presas em "recording"
   */
  async detectStuckRecordings() {
    try {
      // Gravações em "recording" há mais de 2 horas
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('status', 'recording')
        .lte('start_time', twoHoursAgo)
        .limit(10);

      if (error) {
        logger.error('Error fetching stuck recordings:', error);
        return [];
      }

      return recordings || [];
    } catch (error) {
      logger.error('Error in detectStuckRecordings:', error);
      return [];
    }
  }

  /**
   * Recuperar gravações presas
   */
  async recoverStuckRecordings(recordings) {
    let recovered = 0;
    
    for (const recording of recordings) {
      try {
        logger.warn(`🔄 Recovering stuck recording: ${recording.id} (recording since ${recording.start_time})`);
        
        // Verificar se arquivo existe
        const fileInfo = await PathResolver.findRecordingFile(recording);
        
        if (fileInfo && fileInfo.exists) {
          // Arquivo existe - finalizar gravação
          const endTime = new Date().toISOString();
          const duration = Math.floor((Date.now() - new Date(recording.start_time).getTime()) / 1000);
          
          await this.supabase
            .from('recordings')
            .update({
              status: 'completed',
              end_time: endTime,
              duration: Math.min(duration, 7200), // Max 2 horas
              size: fileInfo.size || 0,
              upload_status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          // Enfileirar para upload se S3 estiver habilitado
          const s3Enabled = process.env.S3_UPLOAD_ENABLED === 'true';
          const queueEnabled = process.env.ENABLE_UPLOAD_QUEUE === 'true';
          
          if (s3Enabled && queueEnabled) {
            await this.uploadQueueService.enqueue(recording.id, {
              priority: 'normal',
              source: 'validation_recovery'
            });
          }

          logger.info(`✅ Recovered stuck recording: ${recording.id}`);
          recovered++;
          
        } else {
          // Arquivo não existe - marcar como falha
          await this.supabase
            .from('recordings')
            .update({
              status: 'failed',
              end_time: new Date().toISOString(),
              error_message: 'Recording stuck without file',
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          logger.info(`❌ Marked stuck recording as failed: ${recording.id}`);
        }

      } catch (error) {
        logger.error(`Error recovering stuck recording ${recording.id}:`, error);
      }
    }
    
    return recovered;
  }

  /**
   * Obter metadados de vídeo usando ffprobe
   */
  async getVideoMetadata(filePath) {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
          '-v', 'quiet',
          '-show_entries', 'format=duration',
          '-of', 'json',
          filePath
        ]);

        let output = '';
        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });

        ffprobe.on('close', () => {
          try {
            const parsed = JSON.parse(output);
            const duration = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0;
            resolve({ duration });
          } catch (error) {
            resolve({ duration: 0 });
          }
        });

        ffprobe.on('error', () => {
          resolve({ duration: 0 });
        });
      });
    } catch (error) {
      return { duration: 0 };
    }
  }

  /**
   * Obter estatísticas do serviço
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      validationInterval: this.validationIntervalMs,
      lastValidation: new Date().toISOString()
    };
  }
}

export default ValidationRecoveryService;