import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';

class RecordingService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
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
   * Buscar gravações com filtros
   */
  async searchRecordings(userId, filters = {}) {
    try {
      const {
        camera_id,
        start_date,
        end_date,
        duration_min,
        duration_max,
        file_size_min,
        file_size_max,
        quality,
        event_type,
        page = 1,
        limit = 20,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = filters;
      
      // Construir query base
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras!inner(
            id,
            name,
            ip,
            location
          )
        `);
      
      // Filtrar por câmeras do usuário
      const userCameras = await Camera.findByUserId(userId);
      const cameraIds = userCameras.map(cam => cam.id);
      
      if (cameraIds.length === 0) {
        return {
          recordings: [],
          total: 0,
          page,
          limit,
          pages: 0,
          appliedFilters: filters
        };
      }
      
      query = query.in('camera_id', cameraIds);
      
      // Aplicar filtros
      if (camera_id) {
        query = query.eq('camera_id', camera_id);
      }
      
      if (start_date) {
        query = query.gte('created_at', start_date);
      }
      
      if (end_date) {
        query = query.lte('created_at', end_date);
      }
      
      if (duration_min) {
        query = query.gte('duration', duration_min);
      }
      
      if (duration_max) {
        query = query.lte('duration', duration_max);
      }
      
      if (file_size_min) {
        query = query.gte('file_size', file_size_min);
      }
      
      if (file_size_max) {
        query = query.lte('file_size', file_size_max);
      }
      
      if (quality) {
        query = query.eq('quality', quality);
      }
      
      if (event_type) {
        query = query.eq('event_type', event_type);
      }
      
      // Contar total
      const { count } = await query.select('*', { count: 'exact', head: true });
      
      // Aplicar paginação e ordenação
      const offset = (page - 1) * limit;
      query = query
        .order(sort_by, { ascending: sort_order === 'asc' })
        .range(offset, offset + limit - 1);
      
      const { data: recordings, error } = await query;
      
      if (error) {
        throw error;
      }
      
      // Processar dados das gravações
      const processedRecordings = recordings.map(recording => ({
        ...recording,
        duration_formatted: this.formatDuration(recording.duration),
        file_size_formatted: this.formatFileSize(recording.file_size),
        thumbnail_url: recording.thumbnail_path ? 
          `/api/recordings/${recording.id}/thumbnail` : null,
        download_url: `/api/recordings/${recording.id}/download`,
        stream_url: `/api/recordings/${recording.id}/stream`
      }));
      
      return {
        recordings: processedRecordings,
        total: count || 0,
        page,
        limit,
        pages: Math.ceil((count || 0) / limit),
        appliedFilters: filters
      };
      
    } catch (error) {
      logger.error('Erro ao buscar gravações:', error);
      throw error;
    }
  }
  
  /**
   * Obter gravação por ID
   */
  async getRecordingById(recordingId, userId) {
    try {
      const { data: recording, error } = await this.supabase
        .from('recordings')
        .select(`
          *,
          cameras!inner(
            id,
            name,
            ip,
            location,
            user_id
          )
        `)
        .eq('id', recordingId)
        .single();
      
      if (error) {
        throw error;
      }
      
      if (!recording) {
        return null;
      }
      
      // Verificar acesso do usuário
      if (recording.cameras.user_id !== userId) {
        return null;
      }
      
      // Verificar se arquivo existe
      const filePath = path.join(this.recordingsPath, recording.file_path);
      const fileExists = await this.fileExists(filePath);
      
      return {
        ...recording,
        duration_formatted: this.formatDuration(recording.duration),
        file_size_formatted: this.formatFileSize(recording.file_size),
        file_exists: fileExists,
        thumbnail_url: recording.thumbnail_path ? 
          `/api/recordings/${recording.id}/thumbnail` : null,
        download_url: `/api/recordings/${recording.id}/download`,
        stream_url: `/api/recordings/${recording.id}/stream`
      };
      
    } catch (error) {
      logger.error('Erro ao obter gravação:', error);
      throw error;
    }
  }
  
  /**
   * Preparar download de gravação
   */
  async prepareDownload(recordingId, userId) {
    try {
      const recording = await this.getRecordingById(recordingId, userId);
      
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }
      
      const filePath = path.join(this.recordingsPath, recording.file_path);
      const exists = await this.fileExists(filePath);
      
      if (!exists) {
        return {
          exists: false,
          message: 'Arquivo não encontrado'
        };
      }
      
      const stats = await fs.stat(filePath);
      const filename = `${recording.cameras.name}_${recording.created_at.replace(/[^\w]/g, '_')}.mp4`;
      
      return {
        exists: true,
        filePath,
        filename,
        fileSize: stats.size,
        recording
      };
      
    } catch (error) {
      logger.error('Erro ao preparar download:', error);
      throw error;
    }
  }
  
  /**
   * Obter stream de arquivo
   */
  async getFileStream(filePath) {
    const fs = require('fs');
    return fs.createReadStream(filePath);
  }
  
  /**
   * Verificar acesso em lote
   */
  async checkBulkAccess(recordingIds, userId) {
    try {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select(`
          id,
          cameras!inner(
            user_id
          )
        `)
        .in('id', recordingIds);
      
      if (error) {
        throw error;
      }
      
      const accessibleIds = [];
      const inaccessibleIds = [];
      
      recordingIds.forEach(id => {
        const recording = recordings.find(r => r.id === id);
        if (recording && recording.cameras.user_id === userId) {
          accessibleIds.push(id);
        } else {
          inaccessibleIds.push(id);
        }
      });
      
      return {
        allAccessible: inaccessibleIds.length === 0,
        accessibleIds,
        inaccessibleIds
      };
      
    } catch (error) {
      logger.error('Erro ao verificar acesso em lote:', error);
      throw error;
    }
  }
  
  /**
   * Criar job de exportação
   */
  async createExportJob(options) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      userId: options.userId,
      recordingIds: options.recordingIds,
      format: options.format,
      includeMetadata: options.includeMetadata,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      estimatedTime: options.recordingIds.length * 30 // 30s por gravação
    };
    
    this.exportJobs.set(jobId, job);
    
    // Iniciar processamento assíncrono
    this.processExportJob(jobId).catch(error => {
      logger.error(`Erro no job de exportação ${jobId}:`, error);
      const job = this.exportJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
    });
    
    return job;
  }
  
  /**
   * Processar job de exportação
   */
  async processExportJob(jobId) {
    const job = this.exportJobs.get(jobId);
    if (!job) return;
    
    try {
      job.status = 'processing';
      
      // Obter dados das gravações
      const recordings = [];
      for (let i = 0; i < job.recordingIds.length; i++) {
        const recordingId = job.recordingIds[i];
        const recording = await this.getRecordingById(recordingId, job.userId);
        
        if (recording && recording.file_exists) {
          recordings.push(recording);
        }
        
        job.progress = Math.round(((i + 1) / job.recordingIds.length) * 50);
      }
      
      if (recordings.length === 0) {
        throw new Error('Nenhuma gravação válida encontrada');
      }
      
      // Criar arquivo de exportação
      const exportFileName = `export_${jobId}.${job.format}`;
      const exportPath = path.join(this.exportsPath, exportFileName);
      
      if (job.format === 'zip') {
        await this.createZipExport(recordings, exportPath, job);
      } else {
        await this.createTarExport(recordings, exportPath, job);
      }
      
      job.status = 'completed';
      job.progress = 100;
      job.downloadUrl = `/api/recordings/export/${jobId}/download`;
      job.completedAt = new Date();
      
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      logger.error(`Erro no processamento do job ${jobId}:`, error);
    }
  }
  
  /**
   * Criar exportação ZIP
   */
  async createZipExport(recordings, exportPath, job) {
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(exportPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      
      recordings.forEach((recording, index) => {
        const filePath = path.join(this.recordingsPath, recording.file_path);
        const fileName = `${recording.cameras.name}_${recording.created_at.replace(/[^\w]/g, '_')}.mp4`;
        
        archive.file(filePath, { name: fileName });
        
        if (job.includeMetadata) {
          const metadata = {
            id: recording.id,
            camera: recording.cameras.name,
            location: recording.cameras.location,
            created_at: recording.created_at,
            duration: recording.duration,
            file_size: recording.file_size,
            quality: recording.quality,
            event_type: recording.event_type
          };
          
          archive.append(JSON.stringify(metadata, null, 2), {
            name: `${fileName}.metadata.json`
          });
        }
        
        job.progress = 50 + Math.round(((index + 1) / recordings.length) * 50);
      });
      
      archive.finalize();
    });
  }
  
  /**
   * Obter status de exportação
   */
  async getExportStatus(exportId, userId) {
    const job = this.exportJobs.get(exportId);
    
    if (!job || job.userId !== userId) {
      return null;
    }
    
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      created_at: job.createdAt,
      completed_at: job.completedAt,
      download_url: job.downloadUrl,
      error: job.error,
      estimated_time: job.estimatedTime
    };
  }
  
  /**
   * Deletar gravações
   */
  async deleteRecordings(recordingIds, userId) {
    try {
      let deletedCount = 0;
      let failedCount = 0;
      let freedSpace = 0;
      
      for (const recordingId of recordingIds) {
        try {
          const recording = await this.getRecordingById(recordingId, userId);
          
          if (!recording) {
            failedCount++;
            continue;
          }
          
          // Deletar arquivo físico
          const filePath = path.join(this.recordingsPath, recording.file_path);
          if (await this.fileExists(filePath)) {
            const stats = await fs.stat(filePath);
            await fs.unlink(filePath);
            freedSpace += stats.size;
          }
          
          // Deletar thumbnail se existir
          if (recording.thumbnail_path) {
            const thumbnailPath = path.join(this.recordingsPath, recording.thumbnail_path);
            if (await this.fileExists(thumbnailPath)) {
              await fs.unlink(thumbnailPath);
            }
          }
          
          // Deletar registro do banco
          const { error } = await this.supabase
            .from('recordings')
            .delete()
            .eq('id', recordingId);
          
          if (error) {
            throw error;
          }
          
          deletedCount++;
          
        } catch (error) {
          logger.error(`Erro ao deletar gravação ${recordingId}:`, error);
          failedCount++;
        }
      }
      
      return {
        deletedCount,
        failedCount,
        freedSpace: this.formatFileSize(freedSpace)
      };
      
    } catch (error) {
      logger.error('Erro ao deletar gravações:', error);
      throw error;
    }
  }
  
  /**
   * Obter estatísticas de gravações
   */
  async getRecordingStats(userId, period = '7d') {
    try {
      const userCameras = await Camera.findByUserId(userId);
      const cameraIds = userCameras.map(cam => cam.id);
      
      if (cameraIds.length === 0) {
        return this.getEmptyStats();
      }
      
      // Calcular data de início baseada no período
      const startDate = this.getStartDateForPeriod(period);
      
      // Buscar todas as gravações do período
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .in('camera_id', cameraIds)
        .gte('created_at', startDate.toISOString());
      
      if (error) {
        throw error;
      }
      
      if (!recordings || recordings.length === 0) {
        return this.getEmptyStats();
      }
      
      // Calcular estatísticas manualmente
      const totalRecordings = recordings.length;
      const totalSize = recordings.reduce((sum, r) => sum + (r.file_size || 0), 0);
      const totalDuration = recordings.reduce((sum, r) => sum + (r.duration || 0), 0);
      
      // Estatísticas por câmera
      const cameraStatsMap = new Map();
      recordings.forEach(r => {
        if (!cameraStatsMap.has(r.camera_id)) {
          cameraStatsMap.set(r.camera_id, {
            camera_id: r.camera_id,
            count: 0,
            total_size: 0,
            total_duration: 0
          });
        }
        const stats = cameraStatsMap.get(r.camera_id);
        stats.count++;
        stats.total_size += r.file_size || 0;
        stats.total_duration += r.duration || 0;
      });
      
      // Estatísticas por tipo de evento
      const eventStatsMap = new Map();
      recordings.forEach(r => {
        const eventType = r.event_type || 'unknown';
        if (!eventStatsMap.has(eventType)) {
          eventStatsMap.set(eventType, { event_type: eventType, count: 0 });
        }
        eventStatsMap.get(eventType).count++;
      });
      
      // Estatísticas por qualidade
      const qualityStatsMap = new Map();
      recordings.forEach(r => {
        const quality = r.quality || 'unknown';
        if (!qualityStatsMap.has(quality)) {
          qualityStatsMap.set(quality, { quality, count: 0, total_size: 0 });
        }
        const stats = qualityStatsMap.get(quality);
        stats.count++;
        stats.total_size += r.file_size || 0;
      });
      
      return {
        period,
        total: {
          recordings: totalRecordings,
          total_size: totalSize,
          total_duration: totalDuration,
          total_size_formatted: this.formatFileSize(totalSize),
          total_duration_formatted: this.formatDuration(totalDuration)
        },
        by_camera: Array.from(cameraStatsMap.values()),
        by_event_type: Array.from(eventStatsMap.values()),
        by_quality: Array.from(qualityStatsMap.values()),
        storage_usage: await this.getStorageUsage(userId)
      };
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }
  
  /**
   * Obter tendências de upload de gravações
   */
  async getTrends(userId, period = '24h') {
    try {
      const userCameras = await Camera.findByUserId(userId);
      const cameraIds = userCameras.map(cam => cam.id);
      
      if (cameraIds.length === 0) {
        return [];
      }
      
      // Calcular intervalo baseado no período
      const now = new Date();
      let startDate, intervalHours;
      
      switch (period) {
        case '1h':
          startDate = new Date(now.getTime() - (1 * 60 * 60 * 1000));
          intervalHours = 0.1; // 6 minutos
          break;
        case '6h':
          startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
          intervalHours = 0.5; // 30 minutos
          break;
        case '24h':
        default:
          startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          intervalHours = 1; // 1 hora
          break;
        case '7d':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          intervalHours = 6; // 6 horas
          break;
      }
      
      // Buscar gravações no período
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('created_at, file_size, upload_status')
        .in('camera_id', cameraIds)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      if (!recordings || recordings.length === 0) {
        return [];
      }
      
      // Agrupar por intervalos de tempo
      const trends = [];
      const intervalMs = intervalHours * 60 * 60 * 1000;
      
      for (let time = startDate.getTime(); time <= now.getTime(); time += intervalMs) {
        const intervalStart = new Date(time);
        const intervalEnd = new Date(time + intervalMs);
        
        const intervalRecordings = recordings.filter(r => {
          const recordingTime = new Date(r.created_at).getTime();
          return recordingTime >= intervalStart.getTime() && recordingTime < intervalEnd.getTime();
        });
        
        const totalUploads = intervalRecordings.length;
        const successfulUploads = intervalRecordings.filter(r => r.upload_status === 'completed').length;
        const failedUploads = intervalRecordings.filter(r => r.upload_status === 'failed').length;
        const totalSize = intervalRecordings.reduce((sum, r) => sum + (r.file_size || 0), 0);
        
        trends.push({
          timestamp: intervalStart.toISOString(),
          hour: intervalStart.getHours(),
          total_uploads: totalUploads,
          successful_uploads: successfulUploads,
          failed_uploads: failedUploads,
          pending_uploads: totalUploads - successfulUploads - failedUploads,
          total_size: totalSize,
          total_size_formatted: this.formatFileSize(totalSize),
          success_rate: totalUploads > 0 ? Math.round((successfulUploads / totalUploads) * 100) : 0
        });
      }
      
      return trends;
      
    } catch (error) {
      logger.error('Erro ao obter tendências:', error);
      throw error;
    }
  }
  
  /**
   * Utilitários
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
  
  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }
  
  getStartDateForPeriod(period) {
    const now = new Date();
    const periodMap = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    
    const days = periodMap[period] || 7;
    return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  }
  
  getEmptyStats() {
    return {
      total: {
        recordings: 0,
        total_size: 0,
        total_duration: 0,
        total_size_formatted: '0 B',
        total_duration_formatted: '0s'
      },
      by_camera: [],
      by_event_type: [],
      by_quality: [],
      storage_usage: {
        used: 0,
        available: 0,
        percentage: 0
      }
    };
  }
  
  async getStorageUsage(userId) {
    // Implementar cálculo de uso de armazenamento
    return {
      used: 0,
      available: 0,
      percentage: 0
    };
  }
}

export default new RecordingService();