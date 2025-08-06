import { Recording } from '../models/Recording.js';
import { Camera } from '../models/Camera.js';
import S3Service from './S3Service.js';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import axios from 'axios';

class RecordingService extends EventEmitter {
  constructor() {
    super();
    this.activeRecordings = new Map();
    this.exportJobs = new Map();
    
    // Inicializar Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Configuração do serviço
    this.config = {
      recordingsPath: process.env.RECORDINGS_PATH || './storage/recordings',
      exportsPath: process.env.EXPORTS_PATH || './storage/exports',
      zlmApiUrl: process.env.ZLMEDIAKIT_API_URL,
      zlmSecret: process.env.ZLMEDIAKIT_SECRET,
      maxSegmentDuration: 1800 // 30 minutos
    };
    
    // Inicializar diretórios
    this.initializeStorage();
  }
  
  async initializeStorage() {
    try {
      await fs.mkdir(this.config.recordingsPath, { recursive: true });
      await fs.mkdir(this.config.exportsPath, { recursive: true });
      logger.info('[RecordingService] Diretórios de armazenamento inicializados');
    } catch (error) {
      logger.error('[RecordingService] Erro ao inicializar armazenamento:', error);
    }
  }

  validateConfig() {
    if (!this.config.zlmApiUrl) throw new Error('ZLMEDIAKIT_API_URL não configurado');
    if (!this.config.zlmSecret) throw new Error('ZLMEDIAKIT_SECRET não configurado');
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.config.recordingsPath, { recursive: true });
    } catch (error) {
      logger.warn('Erro ao criar diretório de gravações:', error);
    }
  }

  // ==========================================
  // MÉTODOS DE GRAVAÇÃO
  // ==========================================

  async startRecording(cameraId, options = {}) {
    try {
      logger.info(`[RecordingService] 🎬 Iniciando gravação para câmera ${cameraId}`);
      
      const camera = await this.getCameraById(cameraId);
      if (!camera) throw new Error(`Câmera ${cameraId} não encontrada`);
      
      const isRecording = await this.isCameraRecording(cameraId);
      if (isRecording) {
        return { success: false, message: 'Câmera já está gravando' };
      }

      const recordingId = await this.createRecordingRecord(cameraId, options);
      
      const params = {
        type: options.type || 0,
        vhost: options.vhost || '__defaultVhost__',
        app: options.app || 'live',
        stream: cameraId,
        customized_path: options.customized_path || `recordings/${cameraId}`,
        max_second: options.max_second || this.config.maxSegmentDuration,
        secret: this.config.zlmSecret
      };

      const response = await this.callZLMediaKitAPI('/index/api/startRecord', params);
      if (response.code !== 0) throw new Error(`ZLMediaKit erro: ${response.msg}`);

      await this.updateRecordingStatus(recordingId, 'recording', {
        start_time: new Date().toISOString(),
        zlm_response: response
      });

      logger.info(`[RecordingService] ✅ Gravação iniciada: ${recordingId}`);
      return { success: true, recordingId, message: 'Gravação iniciada com sucesso' };

    } catch (error) {
      logger.error(`[RecordingService] Erro ao iniciar gravação:`, error);
      throw error;
    }
  }

  async stopRecording(cameraId, recordingId = null) {
    try {
      logger.info(`[RecordingService] ⏹️ Parando gravação para câmera ${cameraId}`);
      
      if (!recordingId) {
        const active = await this.getActiveRecordings(cameraId);
        if (active.length > 0) recordingId = active[0].id;
      }

      const params = {
        type: 0,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: cameraId,
        secret: this.config.zlmSecret
      };

      const response = await this.callZLMediaKitAPI('/index/api/stopRecord', params);
      
      if (recordingId) {
        await this.updateRecordingStatus(recordingId, 'completed', {
          end_time: new Date().toISOString(),
          zlm_response: response
        });
        
        // Processar arquivo em background
        this.processCompletedRecording(recordingId, cameraId).catch(console.error);
      }

      return { success: true, recordingId, message: 'Gravação parada com sucesso' };

    } catch (error) {
      logger.error(`[RecordingService] Erro ao parar gravação:`, error);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE STATUS
  // ==========================================

  async isCameraRecording(cameraId) {
    const { data } = await this.supabase
      .from('recordings')
      .select('id')
      .eq('camera_id', cameraId)
      .eq('status', 'recording')
      .limit(1);
    
    return data && data.length > 0;
  }

  async getActiveRecordings(cameraId = null) {
    let query = this.supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (cameraId) query = query.eq('camera_id', cameraId);
    
    const { data } = await query;
    return data || [];
  }

  async updateRecordingStatus(recordingId, status, additionalData = {}) {
    const updateData = { status, ...additionalData };
    
    const { error } = await this.supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recordingId);
    
    if (error) throw error;
    return true;
  }

  // ==========================================
  // MÉTODOS DE BUSCA
  // ==========================================

  async searchRecordings(filters = {}, pagination = {}) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 50;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('recordings')
      .select('*', { count: 'exact' });

    // Aplicar filtros
    if (filters.camera_id) query = query.eq('camera_id', filters.camera_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.start_date) query = query.gte('created_at', filters.start_date);
    if (filters.end_date) query = query.lte('created_at', filters.end_date);

    query = query.order('created_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  }

  async getRecordingStats(filters = {}) {
    let query = this.supabase
      .from('recordings')
      .select('*');

    if (filters.start_date) query = query.gte('created_at', filters.start_date);
    if (filters.end_date) query = query.lte('created_at', filters.end_date);

    const { data } = await query;
    
    const stats = {
      total: data.length,
      byStatus: {},
      byCamera: {},
      totalSize: 0
    };

    data.forEach(rec => {
      stats.byStatus[rec.status] = (stats.byStatus[rec.status] || 0) + 1;
      stats.byCamera[rec.camera_id] = (stats.byCamera[rec.camera_id] || 0) + 1;
      stats.totalSize += rec.file_size || 0;
    });

    return stats;
  }

  async getTrends(filters = {}) {
    const { data } = await this.supabase
      .from('recordings')
      .select('created_at, status, file_size, camera_id')
      .gte('created_at', filters.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .lte('created_at', filters.end_date || new Date());

    const trends = {};
    data.forEach(rec => {
      const date = new Date(rec.created_at).toISOString().split('T')[0];
      if (!trends[date]) trends[date] = { count: 0, size: 0 };
      trends[date].count++;
      trends[date].size += rec.file_size || 0;
    });

    return Object.entries(trends).map(([date, data]) => ({
      date,
      count: data.count,
      size: data.size
    }));
  }

  // ==========================================
  // MÉTODOS DE ARQUIVO
  // ==========================================

  async prepareDownload(recordingId) {
    const { data: recording } = await this.supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (!recording) throw new Error('Gravação não encontrada');
    if (recording.status !== 'completed') throw new Error('Gravação não finalizada');

    const filePath = path.join(this.config.recordingsPath, recording.file_path);
    if (!existsSync(filePath)) throw new Error('Arquivo não encontrado');

    return {
      fileName: recording.file_name,
      filePath,
      fileSize: recording.file_size,
      mimeType: 'video/mp4'
    };
  }

  async processCompletedRecording(recordingId, cameraId) {
    try {
      const recordingDir = path.join(this.config.recordingsPath, cameraId);
      const files = await fs.readdir(recordingDir);
      
      const latestFile = files
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ name: f, path: path.join(recordingDir, f) }))
        .sort((a, b) => fs.stat(b.path).mtime - fs.stat(a.path).mtime)[0];

      if (latestFile) {
        const stats = await fs.stat(latestFile.path);
        await this.updateRecordingStatus(recordingId, 'completed', {
          file_path: path.join(cameraId, latestFile.name),
          file_name: latestFile.name,
          file_size: stats.size,
          duration: Math.floor(stats.size / (1024 * 1024)) // Estimativa
        });
      }
    } catch (error) {
      logger.error(`[RecordingService] Erro ao processar gravação:`, error);
    }
  }

  // ==========================================
  // MÉTODOS DE EXPORTAÇÃO
  // ==========================================

  async exportRecordings(recordingIds, options = {}) {
    const exportId = `export_${Date.now()}`;
    
    try {
      const recordings = await Promise.all(
        recordingIds.map(id => this.supabase.from('recordings').select('*').eq('id', id).single())
      );

      const validRecordings = recordings.filter(r => r.data && r.data.status === 'completed');
      
      return {
        exportId,
        status: 'processing',
        recordings: validRecordings.map(r => r.data),
        message: 'Exportação iniciada'
      };

    } catch (error) {
      logger.error(`[RecordingService] Erro ao exportar:`, error);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS UTILITÁRIOS
  // ==========================================

  async getCameraById(cameraId) {
    const { data } = await this.supabase
      .from('cameras')
      .select('*')
      .eq('id', cameraId)
      .single();
    return data;
  }

  async createRecordingRecord(cameraId, options = {}) {
    const { data, error } = await this.supabase
      .from('recordings')
      .insert({
        camera_id: cameraId,
        status: 'starting',
        type: options.type || 'continuous',
        quality: options.quality || 'high',
        max_duration: options.max_duration || this.config.maxSegmentDuration,
        metadata: options.metadata || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  async callZLMediaKitAPI(endpoint, params) {
    try {
      const response = await axios.get(`${this.config.zlmApiUrl}${endpoint}`, {
        params,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      logger.error(`[RecordingService] Erro na API ZLMediaKit:`, error);
      throw new Error('Falha ao comunicar com servidor de mídia');
    }
  }

  // Métodos de compatibilidade
  async getRecordings() {
    const result = await this.searchRecordings({}, { page: 1, limit: 1000 });
    return result.data;
  }

  async getExportStatus(exportId) {
    return { exportId, status: 'completed', message: 'Exportação concluída' };
  }

  async cancelExport(exportId) {
    return { exportId, status: 'cancelled', message: 'Exportação cancelada' };
  }

  async getFileStream(recordingId) {
    const download = await this.prepareDownload(recordingId);
    return fs.createReadStream(download.filePath);
  }

  async cleanupOldFiles(options = {}) {
    const days = options.days || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const { data } = await this.supabase
      .from('recordings')
      .select('id, file_path, file_name')
      .lt('created_at', cutoff)
      .eq('status', 'completed');

    let deleted = 0;
    for (const recording of data || []) {
      try {
        const filePath = path.join(this.config.recordingsPath, recording.file_path);
        if (existsSync(filePath)) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch (error) {
        logger.warn(`[RecordingService] Erro ao deletar arquivo:`, error);
      }
    }

    return { deleted, message: `${deleted} arquivos removidos` };
  }
}

export default new RecordingService();