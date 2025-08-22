/**
 * Serviço de Finalização Automática de Gravações
 * Detecta e finaliza gravações órfãs automaticamente
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createModuleLogger('RecordingFinalization');

class RecordingFinalizationService {
  constructor() {
    this.isRunning = false;
    this.monitorInterval = null;
    this.MONITOR_INTERVAL = 30000; // 30 segundos
    this.ORPHAN_THRESHOLD = 60000; // 1 minuto para considerar órfã
  }

  /**
   * Inicia o serviço de monitoramento
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Serviço de finalização já está em execução');
      return;
    }

    logger.info('🚀 Iniciando serviço de finalização automática de gravações');
    this.isRunning = true;

    // Executar imediatamente
    this.checkOrphanRecordings();

    // Agendar execução periódica
    this.monitorInterval = setInterval(() => {
      this.checkOrphanRecordings();
    }, this.MONITOR_INTERVAL);

    logger.info(`⏰ Monitoramento agendado a cada ${this.MONITOR_INTERVAL / 1000} segundos`);
  }

  /**
   * Para o serviço de monitoramento
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('⚠️ Serviço de finalização não está em execução');
      return;
    }

    logger.info('🛑 Parando serviço de finalização automática');
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Verifica e corrige gravações órfãs
   */
  async checkOrphanRecordings() {
    try {
      logger.debug('🔍 Verificando gravações órfãs...');

      // Buscar gravações sem arquivo que podem estar órfãs
      const { data: suspiciousRecordings, error } = await supabaseAdmin
        .from('recordings')
        .select('id, camera_id, status, file_path, local_path, created_at, started_at')
        .or('file_path.is.null,local_path.is.null')
        .in('status', ['recording', 'completed']);

      if (error) {
        logger.error('❌ Erro ao buscar gravações suspeitas:', error);
        return;
      }

      if (!suspiciousRecordings || suspiciousRecordings.length === 0) {
        logger.debug('✅ Nenhuma gravação suspeita encontrada');
        return;
      }

      logger.info(`🔍 Encontradas ${suspiciousRecordings.length} gravações suspeitas`);

      for (const recording of suspiciousRecordings) {
        await this.processOrphanRecording(recording);
      }

    } catch (error) {
      logger.error('❌ Erro ao verificar gravações órfãs:', error);
    }
  }

  /**
   * Processa uma gravação órfã específica
   */
  async processOrphanRecording(recording) {
    try {
      const recordingAge = Date.now() - new Date(recording.created_at).getTime();
      
      logger.debug(`🔧 Processando gravação ${recording.id}:`, {
        cameraId: recording.camera_id,
        status: recording.status,
        age: `${Math.round(recordingAge / 1000)}s`,
        hasFile: !!recording.file_path
      });

      // Se a gravação é muito recente, aguardar
      if (recordingAge < this.ORPHAN_THRESHOLD) {
        logger.debug(`⏳ Gravação ${recording.id} muito recente (${Math.round(recordingAge / 1000)}s), aguardando...`);
        return;
      }

      // Tentar encontrar arquivo correspondente
      const foundFile = await this.findRecordingFile(recording.camera_id, recording.created_at);

      if (foundFile) {
        await this.finalizeRecordingWithFile(recording, foundFile);
      } else {
        await this.handleOrphanRecording(recording, recordingAge);
      }

    } catch (error) {
      logger.error(`❌ Erro ao processar gravação órfã ${recording.id}:`, error);
    }
  }

  /**
   * Procura arquivo de gravação correspondente
   */
  async findRecordingFile(cameraId, createdAt) {
    const searchPaths = [
      `./storage/www/record/live/${cameraId}`,
      `./storage/live/${cameraId}`,
      `./storage/${cameraId}`,
      `./recordings/${cameraId}`
    ];

    const createdTime = new Date(createdAt).getTime();
    const timeWindow = 5 * 60 * 1000; // 5 minutos de janela

    for (const searchPath of searchPaths) {
      try {
        const files = await this.findMP4FilesInPath(searchPath);
        
        // Procurar arquivo criado próximo ao tempo da gravação
        for (const file of files) {
          const stats = await fs.stat(file);
          const fileTime = stats.mtime.getTime();
          const timeDiff = Math.abs(fileTime - createdTime);

          if (timeDiff <= timeWindow) {
            logger.info(`✅ Arquivo encontrado para gravação órfã: ${file}`);
            return file;
          }
        }
      } catch (error) {
        logger.debug(`Caminho não encontrado: ${searchPath}`);
      }
    }

    return null;
  }

  /**
   * Procura arquivos MP4 em um caminho (incluindo temporários)
   */
  async findMP4FilesInPath(dirPath) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findMP4FilesInPath(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isMP4File(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignorar erros de acesso
    }
    
    return files;
  }

  /**
   * Verifica se é arquivo MP4 (incluindo temporários com ponto no início)
   */
  isMP4File(filename) {
    const name = filename.toLowerCase();
    return name.endsWith('.mp4') || name.match(/^\.\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d+\.mp4$/);
  }

  /**
   * Finaliza arquivo temporário renomeando-o
   */
  async finalizeTemporaryFile(tempFilePath) {
    try {
      const fileName = path.basename(tempFilePath);
      
      // Se arquivo temporário (inicia com ponto), renomear removendo o ponto
      if (fileName.startsWith('.') && fileName.endsWith('.mp4')) {
        const finalFileName = fileName.substring(1); // Remove o ponto do início
        const finalFilePath = path.join(path.dirname(tempFilePath), finalFileName);
        
        // Verificar se arquivo final já existe
        try {
          await fs.access(finalFilePath);
          logger.warn(`⚠️ Arquivo final já existe: ${finalFilePath}, removendo temporário`);
          await fs.unlink(tempFilePath);
          return finalFilePath;
        } catch {
          // Arquivo final não existe, pode renomear
          await fs.rename(tempFilePath, finalFilePath);
          logger.info(`✅ Arquivo temporário finalizado: ${tempFilePath} → ${finalFilePath}`);
          return finalFilePath;
        }
      }
      
      // Se não é temporário, retornar como está
      return tempFilePath;
      
    } catch (error) {
      logger.error(`❌ Erro ao finalizar arquivo temporário ${tempFilePath}:`, error);
      return tempFilePath;
    }
  }

  /**
   * Finaliza gravação com arquivo encontrado
   */
  async finalizeRecordingWithFile(recording, filePath) {
    try {
      logger.info(`🎬 Finalizando gravação órfã ${recording.id} com arquivo: ${filePath}`);

      // Finalizar arquivo temporário se necessário
      const finalFilePath = await this.finalizeTemporaryFile(filePath);
      
      // Normalizar path
      const relativePath = this.normalizePath(finalFilePath);
      
      // Obter informações do arquivo final
      const stats = await fs.stat(finalFilePath);
      const fileSizeBytes = stats.size;

      // Atualizar gravação
      const { error: updateError } = await supabaseAdmin
        .from('recordings')
        .update({
          file_path: relativePath,
          local_path: relativePath,
          file_size: fileSizeBytes,
          status: 'completed',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id);

      if (updateError) {
        logger.error(`❌ Erro ao finalizar gravação ${recording.id}:`, updateError);
      } else {
        logger.info(`✅ Gravação órfã ${recording.id} finalizada com sucesso`);
        logger.info(`   Arquivo: ${relativePath}`);
        logger.info(`   Tamanho: ${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB`);
      }

    } catch (error) {
      logger.error(`❌ Erro ao finalizar gravação com arquivo:`, error);
    }
  }

  /**
   * Trata gravação órfã sem arquivo
   */
  async handleOrphanRecording(recording, recordingAge) {
    const ageHours = recordingAge / (1000 * 60 * 60);

    if (ageHours > 1) {
      logger.warn(`⚠️ Gravação órfã ${recording.id} muito antiga (${ageHours.toFixed(1)}h), marcando como erro`);
      
      const { error: updateError } = await supabaseAdmin
        .from('recordings')
        .update({
          status: 'error',
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id);

      if (updateError) {
        logger.error(`❌ Erro ao marcar gravação como erro:`, updateError);
      } else {
        logger.info(`✅ Gravação órfã ${recording.id} marcada como erro`);
      }
    } else {
      logger.debug(`⏳ Gravação órfã ${recording.id} ainda recente, aguardando...`);
    }
  }

  /**
   * Normaliza caminho de arquivo
   */
  normalizePath(filePath) {
    if (!filePath) return null;
    
    // Converter para Unix style
    const normalized = filePath.replace(/\\/g, '/');
    
    // Encontrar a parte 'storage/www/record/live'
    if (normalized.includes('storage/www/record/live')) {
      const index = normalized.indexOf('storage/www/record/live');
      return normalized.substring(index);
    }
    
    // Se já é relativo, manter
    if (normalized.startsWith('storage/')) {
      return normalized;
    }
    
    // Remover path absoluto e manter apenas relativo
    const segments = normalized.split('/');
    const storageIndex = segments.findIndex(seg => seg === 'storage');
    
    if (storageIndex >= 0) {
      return segments.slice(storageIndex).join('/');
    }
    
    return normalized;
  }

  /**
   * Finaliza gravação ativa para uma câmera específica
   * Usado quando detectamos que uma stream parou
   */
  async finalizeActiveRecordingForCamera(cameraId) {
    try {
      logger.info(`🎯 Finalizando gravações ativas para câmera ${cameraId}`);

      // Buscar gravações ativas para esta câmera
      const { data: activeRecordings, error } = await supabaseAdmin
        .from('recordings')
        .select('id, camera_id, status, created_at')
        .eq('camera_id', cameraId)
        .eq('status', 'recording');

      if (error) {
        logger.error('❌ Erro ao buscar gravações ativas:', error);
        return;
      }

      if (!activeRecordings || activeRecordings.length === 0) {
        logger.debug(`📹 Nenhuma gravação ativa encontrada para câmera ${cameraId}`);
        return;
      }

      logger.info(`📹 Encontradas ${activeRecordings.length} gravações ativas para finalizar`);

      for (const recording of activeRecordings) {
        // Procurar arquivo correspondente
        const foundFile = await this.findRecordingFile(recording.camera_id, recording.created_at);

        if (foundFile) {
          await this.finalizeRecordingWithFile(recording, foundFile);
        } else {
          // Marcar como completed mas sem arquivo - será tratado pelo monitor
          const { error: updateError } = await supabaseAdmin
            .from('recordings')
            .update({
              status: 'completed',
              ended_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);

          if (updateError) {
            logger.error(`❌ Erro ao marcar gravação como completed:`, updateError);
          } else {
            logger.info(`✅ Gravação ${recording.id} marcada como completed (sem arquivo ainda)`);
          }
        }
      }

    } catch (error) {
      logger.error(`❌ Erro ao finalizar gravações para câmera ${cameraId}:`, error);
    }
  }

  /**
   * Status do serviço
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      monitorInterval: this.MONITOR_INTERVAL,
      orphanThreshold: this.ORPHAN_THRESHOLD
    };
  }
}

// Singleton
const recordingFinalizationService = new RecordingFinalizationService();

export default recordingFinalizationService;