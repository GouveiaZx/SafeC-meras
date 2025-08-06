import { createClient } from '@supabase/supabase-js';
import { createModuleLogger } from '../config/logger.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

const logger = createModuleLogger('RecordingIntegrityService');

/**
 * Serviço de validação de integridade de gravações
 * Verifica a integridade dos arquivos de gravação através de:
 * - Verificação de checksum (MD5/SHA256)
 * - Validação de formato de vídeo
 * - Verificação de duração e metadados
 * - Detecção de corrupção
 */
class RecordingIntegrityService extends EventEmitter {
  constructor() {
    super();
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Configurações
    this.config = {
      // Algoritmo de hash padrão
      hashAlgorithm: process.env.INTEGRITY_HASH_ALGORITHM || 'sha256',
      // Diretório base para gravações
      recordingsPath: process.env.RECORDINGS_PATH || './storage/recordings',
      // Timeout para verificações (em segundos)
      verificationTimeout: parseInt(process.env.VERIFICATION_TIMEOUT) || 300,
      // Intervalo para verificações automáticas (em horas)
      autoVerificationInterval: parseInt(process.env.AUTO_VERIFICATION_INTERVAL) || 24,
      // Tamanho do buffer para leitura de arquivos
      bufferSize: parseInt(process.env.INTEGRITY_BUFFER_SIZE) || 64 * 1024, // 64KB
      // Tolerância para diferença de duração (em segundos)
      durationTolerance: parseInt(process.env.DURATION_TOLERANCE) || 5
    };
    
    // Estado interno
    this.verificationQueue = [];
    this.activeVerifications = new Map();
    this.verificationStats = {
      totalVerified: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      corruptedFiles: 0
    };
    
    // Inicializar verificação automática
    this.setupAutoVerification();
    
    logger.info('[RecordingIntegrityService] Serviço inicializado com configurações:', this.config);
  }

  /**
   * Verificar integridade de uma gravação
   * @param {string} recordingId - ID da gravação
   * @param {Object} options - Opções de verificação
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async verifyRecordingIntegrity(recordingId, options = {}) {
    try {
      logger.info(`[RecordingIntegrityService] 🔍 Iniciando verificação de integridade: ${recordingId}`);
      
      // Buscar dados da gravação
      const recording = await this.getRecordingData(recordingId);
      
      if (!recording) {
        throw new Error(`Gravação ${recordingId} não encontrada`);
      }
      
      // Verificar se arquivo existe
      const filePath = this.getRecordingFilePath(recording);
      const fileExists = await this.checkFileExists(filePath);
      
      if (!fileExists) {
        return await this.handleMissingFile(recordingId, filePath);
      }
      
      // Executar verificações
      const verificationResult = {
        recordingId,
        filePath,
        timestamp: new Date(),
        checks: {}
      };
      
      // 1. Verificação de checksum
      if (options.checksum !== false) {
        verificationResult.checks.checksum = await this.verifyChecksum(filePath, recording);
      }
      
      // 2. Verificação de formato
      if (options.format !== false) {
        verificationResult.checks.format = await this.verifyVideoFormat(filePath);
      }
      
      // 3. Verificação de duração
      if (options.duration !== false) {
        verificationResult.checks.duration = await this.verifyDuration(filePath, recording);
      }
      
      // 4. Verificação de metadados
      if (options.metadata !== false) {
        verificationResult.checks.metadata = await this.verifyMetadata(filePath, recording);
      }
      
      // 5. Verificação de corrupção
      if (options.corruption !== false) {
        verificationResult.checks.corruption = await this.checkCorruption(filePath);
      }
      
      // Calcular resultado geral
      verificationResult.isValid = this.calculateOverallResult(verificationResult.checks);
      verificationResult.score = this.calculateIntegrityScore(verificationResult.checks);
      
      // Salvar resultado
      await this.saveVerificationResult(verificationResult);
      
      // Atualizar estatísticas
      this.updateStats(verificationResult);
      
      // Emitir evento
      this.emit('verificationCompleted', verificationResult);
      
      logger.info(`[RecordingIntegrityService] ✅ Verificação concluída:`, {
        recordingId,
        isValid: verificationResult.isValid,
        score: verificationResult.score
      });
      
      return verificationResult;
      
    } catch (error) {
      logger.error(`[RecordingIntegrityService] Erro na verificação de integridade:`, error);
      
      const errorResult = {
        recordingId,
        timestamp: new Date(),
        isValid: false,
        error: error.message,
        checks: {}
      };
      
      await this.saveVerificationResult(errorResult);
      this.emit('verificationFailed', errorResult);
      
      throw error;
    }
  }

  /**
   * Verificar checksum do arquivo
   * @param {string} filePath - Caminho do arquivo
   * @param {Object} recording - Dados da gravação
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async verifyChecksum(filePath, recording) {
    try {
      logger.debug(`[RecordingIntegrityService] Verificando checksum: ${filePath}`);
      
      const calculatedHash = await this.calculateFileHash(filePath);
      const storedHash = recording.file_hash || recording.checksum;
      
      const result = {
        calculated: calculatedHash,
        stored: storedHash,
        algorithm: this.config.hashAlgorithm,
        valid: false,
        timestamp: new Date()
      };
      
      if (storedHash) {
        result.valid = calculatedHash === storedHash;
      } else {
        // Se não há hash armazenado, salvar o calculado
        await this.updateRecordingHash(recording.id, calculatedHash);
        result.valid = true;
        result.note = 'Hash calculado e armazenado pela primeira vez';
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação de checksum:', error);
      return {
        valid: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Verificar formato do vídeo
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async verifyVideoFormat(filePath) {
    try {
      logger.debug(`[RecordingIntegrityService] Verificando formato: ${filePath}`);
      
      const metadata = await this.getVideoMetadata(filePath);
      
      const result = {
        valid: true,
        format: metadata.format,
        codec: metadata.codec,
        resolution: metadata.resolution,
        bitrate: metadata.bitrate,
        timestamp: new Date()
      };
      
      // Verificar se é um formato válido
      const validFormats = ['mp4', 'avi', 'mkv', 'mov'];
      if (!validFormats.includes(metadata.format?.toLowerCase())) {
        result.valid = false;
        result.error = `Formato inválido: ${metadata.format}`;
      }
      
      // Verificar se tem streams de vídeo
      if (!metadata.hasVideo) {
        result.valid = false;
        result.error = 'Arquivo não contém stream de vídeo';
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação de formato:', error);
      return {
        valid: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Verificar duração do vídeo
   * @param {string} filePath - Caminho do arquivo
   * @param {Object} recording - Dados da gravação
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async verifyDuration(filePath, recording) {
    try {
      logger.debug(`[RecordingIntegrityService] Verificando duração: ${filePath}`);
      
      const metadata = await this.getVideoMetadata(filePath);
      const actualDuration = metadata.duration;
      const expectedDuration = recording.duration;
      
      const result = {
        actual: actualDuration,
        expected: expectedDuration,
        difference: Math.abs(actualDuration - expectedDuration),
        tolerance: this.config.durationTolerance,
        valid: false,
        timestamp: new Date()
      };
      
      if (expectedDuration) {
        result.valid = result.difference <= this.config.durationTolerance;
      } else {
        // Se não há duração esperada, aceitar qualquer duração > 0
        result.valid = actualDuration > 0;
        result.note = 'Duração esperada não definida';
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação de duração:', error);
      return {
        valid: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Verificar metadados do arquivo
   * @param {string} filePath - Caminho do arquivo
   * @param {Object} recording - Dados da gravação
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async verifyMetadata(filePath, recording) {
    try {
      logger.debug(`[RecordingIntegrityService] Verificando metadados: ${filePath}`);
      
      const fileStats = await fs.stat(filePath);
      const metadata = await this.getVideoMetadata(filePath);
      
      const result = {
        fileSize: fileStats.size,
        expectedSize: recording.file_size,
        creationTime: fileStats.birthtime,
        modificationTime: fileStats.mtime,
        metadata: {
          duration: metadata.duration,
          resolution: metadata.resolution,
          bitrate: metadata.bitrate,
          codec: metadata.codec
        },
        valid: true,
        timestamp: new Date()
      };
      
      // Verificar tamanho do arquivo
      if (recording.file_size && Math.abs(fileStats.size - recording.file_size) > fileStats.size * 0.1) {
        result.valid = false;
        result.error = 'Tamanho do arquivo difere significativamente do esperado';
      }
      
      // Verificar se arquivo não está vazio
      if (fileStats.size === 0) {
        result.valid = false;
        result.error = 'Arquivo está vazio';
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação de metadados:', error);
      return {
        valid: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Verificar corrupção do arquivo
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async checkCorruption(filePath) {
    try {
      logger.debug(`[RecordingIntegrityService] Verificando corrupção: ${filePath}`);
      
      // Usar ffprobe para verificar integridade
      const probeResult = await this.probeVideoIntegrity(filePath);
      
      const result = {
        valid: probeResult.isValid,
        errors: probeResult.errors || [],
        warnings: probeResult.warnings || [],
        canPlay: probeResult.canPlay,
        timestamp: new Date()
      };
      
      if (probeResult.errors && probeResult.errors.length > 0) {
        result.error = `Erros detectados: ${probeResult.errors.join(', ')}`;
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação de corrupção:', error);
      return {
        valid: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Calcular hash do arquivo
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<string>} - Hash calculado
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.config.hashAlgorithm);
      const stream = require('fs').createReadStream(filePath, { highWaterMark: this.config.bufferSize });
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Obter metadados do vídeo usando ffprobe
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<Object>} - Metadados do vídeo
   */
  async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);
      
      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${errorOutput}`));
          return;
        }
        
        try {
          const metadata = JSON.parse(output);
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          
          resolve({
            format: metadata.format.format_name?.split(',')[0],
            duration: parseFloat(metadata.format.duration) || 0,
            size: parseInt(metadata.format.size) || 0,
            bitrate: parseInt(metadata.format.bit_rate) || 0,
            hasVideo: !!videoStream,
            codec: videoStream?.codec_name,
            resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
            fps: videoStream ? eval(videoStream.r_frame_rate) : null
          });
        } catch (error) {
          reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
        }
      });
      
      // Timeout
      setTimeout(() => {
        ffprobe.kill();
        reject(new Error('ffprobe timeout'));
      }, this.config.verificationTimeout * 1000);
    });
  }

  /**
   * Verificar integridade do vídeo usando ffprobe
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async probeVideoIntegrity(filePath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-f', 'null',
        '-',
        '-i', filePath
      ]);
      
      let errorOutput = '';
      
      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        const errors = [];
        const warnings = [];
        
        if (errorOutput) {
          const lines = errorOutput.split('\n').filter(line => line.trim());
          
          lines.forEach(line => {
            if (line.includes('error') || line.includes('Error')) {
              errors.push(line.trim());
            } else if (line.includes('warning') || line.includes('Warning')) {
              warnings.push(line.trim());
            }
          });
        }
        
        resolve({
          isValid: code === 0 && errors.length === 0,
          canPlay: code === 0,
          errors,
          warnings
        });
      });
      
      ffprobe.on('error', (error) => {
        reject(error);
      });
      
      // Timeout
      setTimeout(() => {
        ffprobe.kill();
        reject(new Error('Integrity check timeout'));
      }, this.config.verificationTimeout * 1000);
    });
  }

  /**
   * Calcular resultado geral da verificação
   * @param {Object} checks - Resultados das verificações
   * @returns {boolean} - True se todas as verificações passaram
   */
  calculateOverallResult(checks) {
    return Object.values(checks).every(check => check.valid !== false);
  }

  /**
   * Calcular pontuação de integridade
   * @param {Object} checks - Resultados das verificações
   * @returns {number} - Pontuação de 0 a 100
   */
  calculateIntegrityScore(checks) {
    const totalChecks = Object.keys(checks).length;
    if (totalChecks === 0) return 0;
    
    const passedChecks = Object.values(checks).filter(check => check.valid !== false).length;
    return Math.round((passedChecks / totalChecks) * 100);
  }

  /**
   * Salvar resultado da verificação
   * @param {Object} result - Resultado da verificação
   * @returns {Promise<void>}
   */
  async saveVerificationResult(result) {
    try {
      const verificationData = {
        recording_id: result.recordingId,
        verification_time: result.timestamp.toISOString(),
        is_valid: result.isValid,
        integrity_score: result.score || 0,
        checks_performed: Object.keys(result.checks || {}),
        check_results: result.checks || {},
        error_message: result.error,
        file_path: result.filePath
      };
      
      const { error } = await this.supabase
        .from('recording_integrity_checks')
        .insert(verificationData);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro ao salvar resultado:', error);
    }
  }

  /**
   * Configurar verificação automática
   */
  setupAutoVerification() {
    const intervalMs = this.config.autoVerificationInterval * 60 * 60 * 1000; // horas para ms
    
    setInterval(async () => {
      try {
        await this.runAutoVerification();
      } catch (error) {
        logger.error('[RecordingIntegrityService] Erro na verificação automática:', error);
      }
    }, intervalMs);
    
    logger.info(`[RecordingIntegrityService] Verificação automática configurada para cada ${this.config.autoVerificationInterval} horas`);
  }

  /**
   * Executar verificação automática
   * @returns {Promise<void>}
   */
  async runAutoVerification() {
    try {
      logger.info('[RecordingIntegrityService] 🔄 Iniciando verificação automática');
      
      // Buscar gravações que precisam de verificação
      const recordingsToVerify = await this.getRecordingsForVerification();
      
      logger.info(`[RecordingIntegrityService] Encontradas ${recordingsToVerify.length} gravações para verificar`);
      
      for (const recording of recordingsToVerify) {
        try {
          await this.verifyRecordingIntegrity(recording.id, { 
            checksum: true, 
            format: true, 
            corruption: true 
          });
        } catch (error) {
          logger.error(`Erro ao verificar gravação ${recording.id}:`, error);
        }
      }
      
      logger.info('[RecordingIntegrityService] ✅ Verificação automática concluída');
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na verificação automática:', error);
    }
  }

  /**
   * Obter gravações que precisam de verificação
   * @returns {Promise<Array>} - Lista de gravações
   */
  async getRecordingsForVerification() {
    try {
      // Buscar gravações que não foram verificadas nas últimas 24 horas
      const { data, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_path, created_at')
        .eq('status', 'completed')
        .not('id', 'in', 
          this.supabase
            .from('recording_integrity_checks')
            .select('recording_id')
            .gte('verification_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        )
        .limit(10); // Limitar para não sobrecarregar
      
      if (error) {
        throw error;
      }
      
      return data || [];
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro ao buscar gravações:', error);
      return [];
    }
  }

  /**
   * Obter dados da gravação
   * @param {string} recordingId - ID da gravação
   * @returns {Promise<Object|null>} - Dados da gravação
   */
  async getRecordingData(recordingId) {
    try {
      const { data, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      
      return data;
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro ao buscar gravação:', error);
      return null;
    }
  }

  /**
   * Obter caminho do arquivo de gravação
   * @param {Object} recording - Dados da gravação
   * @returns {string} - Caminho do arquivo
   */
  getRecordingFilePath(recording) {
    if (recording.file_path) {
      return path.isAbsolute(recording.file_path) 
        ? recording.file_path 
        : path.join(this.config.recordingsPath, recording.file_path);
    }
    
    // Fallback para filename
    return path.join(this.config.recordingsPath, recording.filename || `${recording.id}.mp4`);
  }

  /**
   * Verificar se arquivo existe
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<boolean>} - True se existe
   */
  async checkFileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lidar com arquivo ausente
   * @param {string} recordingId - ID da gravação
   * @param {string} filePath - Caminho esperado
   * @returns {Promise<Object>} - Resultado
   */
  async handleMissingFile(recordingId, filePath) {
    const result = {
      recordingId,
      filePath,
      timestamp: new Date(),
      isValid: false,
      error: 'Arquivo de gravação não encontrado',
      checks: {
        fileExists: {
          valid: false,
          error: 'Arquivo não encontrado',
          timestamp: new Date()
        }
      }
    };
    
    await this.saveVerificationResult(result);
    this.emit('fileMissing', result);
    
    return result;
  }

  /**
   * Atualizar hash da gravação
   * @param {string} recordingId - ID da gravação
   * @param {string} hash - Hash calculado
   * @returns {Promise<void>}
   */
  async updateRecordingHash(recordingId, hash) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({ file_hash: hash })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro ao atualizar hash:', error);
    }
  }

  /**
   * Atualizar estatísticas
   * @param {Object} result - Resultado da verificação
   */
  updateStats(result) {
    this.verificationStats.totalVerified++;
    
    if (result.isValid) {
      this.verificationStats.successfulVerifications++;
    } else {
      this.verificationStats.failedVerifications++;
      
      if (result.checks.corruption && !result.checks.corruption.valid) {
        this.verificationStats.corruptedFiles++;
      }
    }
  }

  /**
   * Obter estatísticas do serviço
   * @returns {Object} - Estatísticas
   */
  getStats() {
    return {
      ...this.verificationStats,
      activeVerifications: this.activeVerifications.size,
      queueSize: this.verificationQueue.length,
      config: this.config
    };
  }

  /**
   * Limpar recursos
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      logger.info('[RecordingIntegrityService] Limpando recursos...');
      
      // Cancelar verificações ativas
      for (const [id, verification] of this.activeVerifications) {
        try {
          if (verification.process) {
            verification.process.kill();
          }
        } catch (error) {
          logger.error(`Erro ao cancelar verificação ${id}:`, error);
        }
      }
      
      this.activeVerifications.clear();
      this.verificationQueue.length = 0;
      
      logger.info('[RecordingIntegrityService] Recursos limpos com sucesso');
      
    } catch (error) {
      logger.error('[RecordingIntegrityService] Erro na limpeza:', error);
    }
  }
}

export default new RecordingIntegrityService();