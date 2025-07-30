import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';

class RecordingService {
  constructor() {
    // Usando SERVICE_ROLE_KEY para operações administrativas
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Diretórios de armazenamento
    this.recordingsPath = process.env.RECORDINGS_PATH || './storage/recordings';
    this.exportsPath = process.env.EXPORTS_PATH || './storage/exports';
    
    // Jobs de exportação em andamento
    this.exportJobs = new Map();
    
    this.initializeStorage();
  }
  
  /**
   * Inicializar diretórios de armazenamento
   */
  async initializeStorage() {
    try {
      await fs.mkdir(this.recordingsPath, { recursive: true });
      await fs.mkdir(this.exportsPath, { recursive: true });
      logger.info('Diretórios de armazenamento inicializados');
    } catch (error) {
      logger.error('Erro ao inicializar armazenamento:', error);
    }
  }
  
  /**
   * Iniciar gravação de uma câmera
   */
  async startRecording(cameraId) {
    try {
      logger.info(`[RecordingService] Iniciando gravação para câmera ${cameraId}`);
      
      // Verificar variáveis de ambiente necessárias
      if (!process.env.ZLMEDIAKIT_API_URL) {
        logger.error('[RecordingService] ZLMEDIAKIT_API_URL não configurado');
        throw new Error('ZLMEDIAKIT_API_URL não está configurado');
      }
      
      if (!process.env.ZLMEDIAKIT_SECRET) {
        logger.error('[RecordingService] ZLMEDIAKIT_SECRET não configurado');
        throw new Error('ZLMEDIAKIT_SECRET não está configurado');
      }
      
      // Buscar dados da câmera
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();
      
      if (cameraError || !camera) {
        logger.error(`[RecordingService] Câmera ${cameraId} não encontrada:`, cameraError);
        throw new Error(`Câmera ${cameraId} não encontrada`);
      }
      
      logger.info(`[RecordingService] Câmera encontrada: ${camera.name}`);
      
      // Extrair informações do stream
      const streamInfo = this.parseRtspUrl(camera.rtsp_url);
      
      // Configurar parâmetros de gravação
      const recordParams = {
        type: 0, // 0=hls+mp4, 1=hls, 2=mp4
        vhost: streamInfo.vhost || '__defaultVhost__',
        app: streamInfo.app || 'live',
        stream: streamInfo.stream,
        customized_path: `recordings/${cameraId}`,
        max_second: 3600, // 1 hora máximo por arquivo
        secret: process.env.ZLMEDIAKIT_SECRET
      };
      
      logger.info(`[RecordingService] Parâmetros de gravação:`, recordParams);
      
      // Chamar API do ZLMediaKit
      const zlmResponse = await axios.get(
        `${process.env.ZLMEDIAKIT_API_URL}/index/api/startRecord`,
        {
          params: recordParams,
          timeout: 10000
        }
      );
      
      logger.info(`[RecordingService] Resposta ZLMediaKit:`, zlmResponse.data);
      
      if (zlmResponse.data.code !== 0) {
        throw new Error(`ZLMediaKit erro: ${zlmResponse.data.msg}`);
      }
      
      // Criar registro de gravação no banco
      const recordingId = await this.createRecordingRecord(cameraId, recordParams);
      
      logger.info(`[RecordingService] Gravação iniciada com sucesso. ID: ${recordingId}`);
      
      return {
        success: true,
        recordingId,
        message: 'Gravação iniciada com sucesso',
        zlmResponse: zlmResponse.data
      };
      
    } catch (error) {
      logger.error(`[RecordingService] Erro ao iniciar gravação:`, error);
      throw error;
    }
  }

  /**
   * Parar gravação de uma câmera
   */
  async stopRecording(cameraId, recordingId = null) {
    try {
      logger.info(`[RecordingService] Parando gravação para câmera ${cameraId}`);
      
      // Buscar dados da câmera
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();
      
      if (cameraError || !camera) {
        throw new Error(`Câmera ${cameraId} não encontrada`);
      }
      
      const streamInfo = this.parseRtspUrl(camera.rtsp_url);
      
      // Configurar parâmetros para parar gravação
      const stopParams = {
        type: 0,
        vhost: streamInfo.vhost || '__defaultVhost__',
        app: streamInfo.app || 'live',
        stream: streamInfo.stream,
        secret: process.env.ZLMEDIAKIT_SECRET
      };
      
      logger.info(`[RecordingService] Parâmetros para parar:`, stopParams);
      
      // Chamar API do ZLMediaKit
      const zlmResponse = await axios.get(
        `${process.env.ZLMEDIAKIT_API_URL}/index/api/stopRecord`,
        {
          params: stopParams,
          timeout: 10000
        }
      );
      
      logger.info(`[RecordingService] Resposta ZLMediaKit (stop):`, zlmResponse.data);
      
      // Atualizar status no banco se recordingId fornecido
      if (recordingId) {
        await this.updateRecordingStatus(recordingId, 'stopped');
      }
      
      logger.info(`[RecordingService] Gravação parada com sucesso`);
      
      return {
        success: true,
        message: 'Gravação parada com sucesso',
        zlmResponse: zlmResponse.data
      };
      
    } catch (error) {
      logger.error(`[RecordingService] Erro ao parar gravação:`, error);
      throw error;
    }
  }

  /**
   * Extrair informações de stream da URL RTSP
   */
  parseRtspUrl(rtspUrl) {
    try {
      // Exemplo: rtsp://user:pass@ip:port/app/stream
      const url = new URL(rtspUrl);
      const pathParts = url.pathname.split('/').filter(p => p);
      
      // Para URLs do tipo rtsp://user:pass@ip:port/stream
      // ou rtsp://user:pass@ip:port/app/stream
      let app = 'live';
      let stream = pathParts[0];
      
      if (pathParts.length >= 2) {
        app = pathParts[0];
        stream = pathParts[1];
      } else if (pathParts.length === 1) {
        stream = pathParts[0];
      } else {
        stream = `camera_${Date.now()}`;
      }
      
      return {
        vhost: '__defaultVhost__',
        app: app,
        stream: stream
      };
    } catch (error) {
      logger.warn(`[RecordingService] Erro ao parsear RTSP URL: ${error.message}`);
      return {
        vhost: '__defaultVhost__',
        app: 'live',
        stream: `camera_${Date.now()}`
      };
    }
  }

  /**
   * Criar registro de gravação no banco de dados
   */
  async createRecordingRecord(cameraId, params) {
    try {
      const recordingId = uuidv4();
      
      const { data, error } = await this.supabase
        .from('recordings')
        .insert([{
          id: recordingId,
          camera_id: cameraId,
          filename: `recording_${Date.now()}`,
          file_path: params.customized_path,
          status: 'recording',
          created_at: new Date().toISOString(),
          metadata: {
            vhost: params.vhost,
            app: params.app,
            stream: params.stream,
            type: params.type
          }
        }])
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      return recordingId;
    } catch (error) {
      logger.error('Erro ao criar registro de gravação:', error);
      throw error;
    }
  }

  /**
   * Atualizar status de gravação
   */
  async updateRecordingStatus(recordingId, status) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
      logger.info(`[RecordingService] Status de gravação ${recordingId} atualizado para: ${status}`);
    } catch (error) {
      logger.error('Erro ao atualizar status de gravação:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as gravações
   */
  async getRecordings() {
    try {
      const { data, error } = await this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (id, name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return data;
    } catch (error) {
      logger.error('Erro ao buscar gravações:', error);
      throw error;
    }
  }

  /**
   * Buscar gravações por câmera
   */
  async getRecordingsByCamera(cameraId) {
    try {
      const { data, error } = await this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (id, name)
        `)
        .eq('camera_id', cameraId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return data;
    } catch (error) {
      logger.error('Erro ao buscar gravações por câmera:', error);
      throw error;
    }
  }

  /**
   * Buscar gravação por ID
   */
  async getRecordingById(recordingId) {
    try {
      const { data, error } = await this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (id, name)
        `)
        .eq('id', recordingId)
        .single();
      
      if (error) {
        throw error;
      }
      
      return data;
    } catch (error) {
      logger.error('Erro ao buscar gravação:', error);
      throw error;
    }
  }

  /**
   * Deletar gravação
   */
  async deleteRecording(recordingId) {
    try {
      // Buscar gravação para obter caminho do arquivo
      const recording = await this.getRecordingById(recordingId);
      
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }
      
      // Deletar arquivo se existir
      if (recording.file_path) {
        const filePath = path.join(this.recordingsPath, recording.file_path);
        try {
          await fs.unlink(filePath);
          logger.info(`[RecordingService] Arquivo deletado: ${filePath}`);
        } catch (fileError) {
          logger.warn(`[RecordingService] Erro ao deletar arquivo: ${fileError.message}`);
        }
      }
      
      // Deletar do banco
      const { error } = await this.supabase
        .from('recordings')
        .delete()
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
      logger.info(`[RecordingService] Gravação ${recordingId} deletada com sucesso`);
      
      return { success: true, message: 'Gravação deletada com sucesso' };
    } catch (error) {
      logger.error('Erro ao deletar gravação:', error);
      throw error;
    }
  }

  /**
   * Exportar gravação
   */
  async exportRecording(recordingId, format = 'zip') {
    try {
      const recording = await this.getRecordingById(recordingId);
      
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }
      
      const exportId = uuidv4();
      const exportPath = path.join(this.exportsPath, `${exportId}.${format}`);
      
      // Adicionar job ao mapa de exportações
      this.exportJobs.set(exportId, {
        status: 'processing',
        progress: 0,
        recordingId,
        format,
        exportPath
      });
      
      // Processar exportação em background
      this.processExport(exportId, recording, format);
      
      return {
        exportId,
        status: 'processing',
        message: 'Exportação iniciada'
      };
    } catch (error) {
      logger.error('Erro ao exportar gravação:', error);
      throw error;
    }
  }

  /**
   * Processar exportação em background
   */
  async processExport(exportId, recording, format) {
    try {
      const job = this.exportJobs.get(exportId);
      if (!job) return;
      
      job.progress = 10;
      
      // Verificar se o arquivo existe
      const sourcePath = path.join(this.recordingsPath, recording.file_path);
      
      if (!await this.fileExists(sourcePath)) {
        throw new Error('Arquivo de gravação não encontrado');
      }
      
      job.progress = 30;
      
      if (format === 'zip') {
        await this.createZipExport(sourcePath, job.exportPath);
      } else {
        throw new Error(`Formato de exportação não suportado: ${format}`);
      }
      
      job.progress = 100;
      job.status = 'completed';
      
      logger.info(`[RecordingService] Exportação ${exportId} concluída`);
      
    } catch (error) {
      const job = this.exportJobs.get(exportId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
      
      logger.error(`[RecordingService] Erro na exportação ${exportId}:`, error);
    }
  }

  /**
   * Criar exportação ZIP
   */
  async createZipExport(sourcePath, exportPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(exportPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.file(sourcePath, { name: path.basename(sourcePath) });
      archive.finalize();
    });
  }

  /**
   * Verificar se arquivo existe
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Buscar status de exportação
   */
  getExportStatus(exportId) {
    const job = this.exportJobs.get(exportId);
    if (!job) {
      return { status: 'not_found', message: 'Exportação não encontrada' };
    }
    
    return {
      exportId,
      status: job.status,
      progress: job.progress,
      error: job.error,
      downloadUrl: job.status === 'completed' ? `/api/recordings/export/${exportId}/download` : null
    };
  }

  /**
   * Baixar arquivo exportado
   */
  async downloadExport(exportId) {
    const job = this.exportJobs.get(exportId);
    if (!job || job.status !== 'completed') {
      throw new Error('Exportação não encontrada ou não concluída');
    }
    
    const exists = await this.fileExists(job.exportPath);
    if (!exists) {
      throw new Error('Arquivo de exportação não encontrado');
    }
    
    return {
      filePath: job.exportPath,
      fileName: `recording_${job.recordingId}.${job.format}`,
      mimeType: job.format === 'zip' ? 'application/zip' : 'application/octet-stream'
    };
  }

  /**
   * Limpar exportações antigas
   */
  async cleanupOldExports() {
    try {
      const files = await fs.readdir(this.exportsPath);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas
      
      for (const file of files) {
        const filePath = path.join(this.exportsPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.info(`[RecordingService] Exportação antiga deletada: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Erro ao limpar exportações antigas:', error);
    }
  }
}

export default new RecordingService();