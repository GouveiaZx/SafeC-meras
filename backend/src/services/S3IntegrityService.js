/**
 * Serviço de verificação de integridade dos uploads S3
 * Verifica se os arquivos enviados para o Wasabi S3 estão íntegros
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import { supabase } from '../config/database.js';
import S3Service from './S3Service.js';

const logger = createModuleLogger('S3IntegrityService');

class S3IntegrityService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.batchSize = parseInt(process.env.INTEGRITY_BATCH_SIZE) || 10;
    this.checkIntervalMs = parseInt(process.env.INTEGRITY_CHECK_INTERVAL) || 60 * 60 * 1000; // 1 hora
    this.maxRetries = parseInt(process.env.INTEGRITY_MAX_RETRIES) || 3;
  }

  /**
   * Inicializar o serviço
   */
  async initialize() {
    try {
      logger.info('Inicializando serviço de verificação de integridade S3...');
      
      // Verificar se o S3Service está configurado
      if (!S3Service.isConfigured()) {
        logger.warn('S3Service não está configurado, verificação de integridade desabilitada');
        return;
      }

      // Criar tabela de verificação de integridade se não existir
      await this.createIntegrityTable();
      
      logger.info('Serviço de verificação de integridade S3 inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar serviço de verificação de integridade:', error);
      throw error;
    }
  }

  /**
   * Iniciar verificação automática
   */
  startIntegrityCheck() {
    if (this.isRunning) {
      logger.warn('Verificação de integridade já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info(`Iniciando verificação automática de integridade (intervalo: ${this.checkIntervalMs}ms)`);
    
    // Executar primeira verificação imediatamente
    this.performIntegrityCheck();
    
    // Agendar verificações periódicas
    this.checkInterval = setInterval(() => {
      this.performIntegrityCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Parar verificação automática
   */
  stopIntegrityCheck() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.info('Verificação automática de integridade parada');
  }

  /**
   * Executar verificação de integridade
   */
  async performIntegrityCheck() {
    try {
      logger.info('Iniciando verificação de integridade dos uploads S3...');
      
      // Buscar gravações que precisam de verificação
      const recordingsToCheck = await this.getRecordingsForIntegrityCheck();
      
      if (recordingsToCheck.length === 0) {
        logger.info('Nenhuma gravação pendente para verificação de integridade');
        return;
      }

      logger.info(`Verificando integridade de ${recordingsToCheck.length} gravações...`);
      
      let checkedCount = 0;
      let validCount = 0;
      let invalidCount = 0;
      
      // Processar em lotes
      for (let i = 0; i < recordingsToCheck.length; i += this.batchSize) {
        const batch = recordingsToCheck.slice(i, i + this.batchSize);
        
        const results = await Promise.allSettled(
          batch.map(recording => this.checkRecordingIntegrity(recording))
        );
        
        for (const result of results) {
          checkedCount++;
          if (result.status === 'fulfilled' && result.value) {
            validCount++;
          } else {
            invalidCount++;
            if (result.status === 'rejected') {
              logger.error('Erro na verificação de integridade:', result.reason);
            }
          }
        }
        
        // Pequena pausa entre lotes para não sobrecarregar
        if (i + this.batchSize < recordingsToCheck.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`Verificação de integridade concluída: ${checkedCount} verificadas, ${validCount} válidas, ${invalidCount} inválidas`);
      
      // Registrar estatísticas
      await this.recordIntegrityStats({
        checked: checkedCount,
        valid: validCount,
        invalid: invalidCount,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Erro durante verificação de integridade:', error);
    }
  }

  /**
   * Verificar integridade de uma gravação específica
   */
  async checkRecordingIntegrity(recording) {
    try {
      logger.debug(`Verificando integridade da gravação ${recording.id}...`);
      
      // Verificar se o arquivo existe no S3
      const s3Exists = await S3Service.fileExists(recording.s3_key);
      if (!s3Exists) {
        logger.warn(`Arquivo não encontrado no S3: ${recording.s3_key}`);
        await this.recordIntegrityResult(recording.id, false, 'file_not_found');
        return false;
      }
      
      // Obter metadados do arquivo no S3
      const s3Metadata = await S3Service.getFileMetadata(recording.s3_key);
      
      // Verificar tamanho do arquivo
      if (s3Metadata.ContentLength !== recording.file_size) {
        logger.warn(`Tamanho do arquivo não confere: S3=${s3Metadata.ContentLength}, DB=${recording.file_size}`);
        await this.recordIntegrityResult(recording.id, false, 'size_mismatch');
        return false;
      }
      
      // Verificar hash se disponível
      if (recording.file_hash && s3Metadata.ETag) {
        const s3Hash = s3Metadata.ETag.replace(/"/g, ''); // Remover aspas do ETag
        if (recording.file_hash !== s3Hash) {
          logger.warn(`Hash do arquivo não confere: S3=${s3Hash}, DB=${recording.file_hash}`);
          await this.recordIntegrityResult(recording.id, false, 'hash_mismatch');
          return false;
        }
      }
      
      // Se chegou até aqui, o arquivo está íntegro
      logger.debug(`Gravação ${recording.id} verificada com sucesso`);
      await this.recordIntegrityResult(recording.id, true, 'valid');
      return true;
      
    } catch (error) {
      logger.error(`Erro ao verificar integridade da gravação ${recording.id}:`, error);
      await this.recordIntegrityResult(recording.id, false, 'check_error');
      return false;
    }
  }

  /**
   * Calcular hash MD5 de um arquivo
   */
  async calculateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('md5');
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      logger.error(`Erro ao calcular hash do arquivo ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Buscar gravações que precisam de verificação de integridade
   */
  async getRecordingsForIntegrityCheck() {
    try {
      // Buscar gravações uploadadas que ainda não foram verificadas ou falharam na última verificação
      const { data: recordings, error } = await supabase
        .from('recordings')
        .select(`
          id,
          s3_key,
          s3_url,
          file_size,
          file_hash,
          upload_status,
          created_at
        `)
        .eq('upload_status', 'uploaded')
        .not('s3_key', 'is', null)
        .not('s3_url', 'is', null)
        .order('created_at', { ascending: true })
        .limit(this.batchSize * 5); // Buscar mais que um lote para ter opções
      
      if (error) {
        logger.error('Erro ao buscar gravações para verificação:', error);
        return [];
      }
      
      if (!recordings || recordings.length === 0) {
        return [];
      }
      
      // Filtrar gravações que não foram verificadas recentemente
      const filteredRecordings = [];
      
      for (const recording of recordings) {
        const lastCheck = await this.getLastIntegrityCheck(recording.id);
        
        // Se nunca foi verificada ou a última verificação foi há mais de 24 horas
        if (!lastCheck || 
            (new Date() - new Date(lastCheck.checked_at)) > 24 * 60 * 60 * 1000) {
          filteredRecordings.push(recording);
        }
        
        // Limitar ao tamanho do lote
        if (filteredRecordings.length >= this.batchSize) {
          break;
        }
      }
      
      return filteredRecordings;
      
    } catch (error) {
      logger.error('Erro ao buscar gravações para verificação:', error);
      return [];
    }
  }

  /**
   * Obter última verificação de integridade de uma gravação
   */
  async getLastIntegrityCheck(recordingId) {
    try {
      const { data, error } = await supabase
        .from('s3_integrity_checks')
        .select('*')
        .eq('recording_id', recordingId)
        .order('checked_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Erro ao buscar última verificação:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      logger.error('Erro ao buscar última verificação:', error);
      return null;
    }
  }

  /**
   * Registrar resultado da verificação de integridade
   */
  async recordIntegrityResult(recordingId, isValid, status) {
    try {
      const { error } = await supabase
        .from('s3_integrity_checks')
        .insert({
          recording_id: recordingId,
          is_valid: isValid,
          status: status,
          checked_at: new Date().toISOString()
        });
      
      if (error) {
        logger.error('Erro ao registrar resultado da verificação:', error);
      }
    } catch (error) {
      logger.error('Erro ao registrar resultado da verificação:', error);
    }
  }

  /**
   * Registrar estatísticas da verificação
   */
  async recordIntegrityStats(stats) {
    try {
      const { error } = await supabase
        .from('system_logs')
        .insert({
          level: 'info',
          service: 'S3IntegrityService',
          message: `Verificação de integridade concluída: ${stats.checked} verificadas, ${stats.valid} válidas, ${stats.invalid} inválidas`,
          metadata: stats
        });
      
      if (error) {
        logger.error('Erro ao registrar estatísticas:', error);
      }
    } catch (error) {
      logger.error('Erro ao registrar estatísticas:', error);
    }
  }

  /**
   * Criar tabela de verificação de integridade
   */
  async createIntegrityTable() {
    try {
      // Esta função seria executada via migração SQL
      // Por enquanto, apenas log
      logger.debug('Tabela s3_integrity_checks deve ser criada via migração SQL');
    } catch (error) {
      logger.error('Erro ao criar tabela de integridade:', error);
    }
  }

  /**
   * Obter estatísticas de integridade
   */
  async getIntegrityStats(period = '24h') {
    try {
      const timeRange = this.getTimeRange(period);
      
      const { data: checks, error } = await supabase
        .from('s3_integrity_checks')
        .select('is_valid, status, checked_at')
        .gte('checked_at', timeRange.start)
        .lte('checked_at', timeRange.end);
      
      if (error) {
        logger.error('Erro ao buscar estatísticas de integridade:', error);
        return null;
      }
      
      const total = checks?.length || 0;
      const valid = checks?.filter(c => c.is_valid).length || 0;
      const invalid = total - valid;
      
      const statusCounts = {};
      checks?.forEach(check => {
        statusCounts[check.status] = (statusCounts[check.status] || 0) + 1;
      });
      
      return {
        period,
        total_checks: total,
        valid_files: valid,
        invalid_files: invalid,
        success_rate: total > 0 ? Math.round((valid / total) * 100 * 10) / 10 : 0,
        status_breakdown: statusCounts,
        last_check: checks?.length > 0 ? 
          checks.reduce((latest, c) => c.checked_at > latest ? c.checked_at : latest, checks[0].checked_at) :
          null
      };
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas de integridade:', error);
      return null;
    }
  }

  /**
   * Obter range de tempo
   */
  getTimeRange(period) {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const start = new Date(now.getTime() - ranges[period]);
    
    return {
      start: start.toISOString(),
      end: now.toISOString()
    };
  }
}

export default new S3IntegrityService();