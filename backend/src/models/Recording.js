/**
 * Modelo de Gravações para o sistema NewCAM
 * Gerencia metadados das gravações de vídeo
 */

import { supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('Recording');

export class Recording {
  constructor(data = {}) {
    this.id = data.id;
    this.camera_id = data.camera_id;
    this.filename = data.filename;
    this.file_path = data.file_path;
    this.s3_key = data.s3_key;
    this.s3_url = data.s3_url;
    this.file_size = data.file_size;
    this.duration = data.duration;
    this.start_time = data.start_time;
    this.end_time = data.end_time;
    this.quality = data.quality || 'medium';
    this.codec = data.codec || 'h264';
    this.resolution = data.resolution;
    this.fps = data.fps;
    this.bitrate = data.bitrate;
    this.status = data.status || 'recording'; // recording, completed, uploaded, error
    this.upload_status = data.upload_status || 'pending'; // pending, uploading, completed, failed
    this.upload_attempts = data.upload_attempts || 0;
    this.error_message = data.error_message;
    this.metadata = data.metadata || {};
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Criar nova gravação
   * @param {Object} recordingData - Dados da gravação
   * @returns {Promise<Recording>}
   */
  static async create(recordingData) {
    try {
      const { data, error } = await supabaseAdmin
        .from('recordings')
        .insert({
          camera_id: recordingData.camera_id,
          filename: recordingData.filename,
          file_path: recordingData.file_path,
          file_size: recordingData.file_size,
          duration: recordingData.duration,
          start_time: recordingData.start_time,
          end_time: recordingData.end_time,
          quality: recordingData.quality || 'medium',
          codec: recordingData.codec || 'h264',
          resolution: recordingData.resolution,
          fps: recordingData.fps,
          bitrate: recordingData.bitrate,
          status: recordingData.status || 'recording',
          upload_status: recordingData.upload_status || 'pending',
          metadata: recordingData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        logger.error('Erro ao criar gravação:', error);
        throw new Error(`Erro ao criar gravação: ${error.message}`);
      }

      logger.info(`Gravação criada: ${data.id}`);
      return new Recording(data);
    } catch (error) {
      logger.error('Erro ao criar gravação:', error);
      throw error;
    }
  }

  /**
   * Buscar gravação por ID
   * @param {string} id - ID da gravação
   * @returns {Promise<Recording|null>}
   */
  static async findById(id) {
    try {
      const { data, error } = await supabaseAdmin
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name,
            location
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Erro ao buscar gravação: ${error.message}`);
      }

      return new Recording(data);
    } catch (error) {
      logger.error('Erro ao buscar gravação:', error);
      throw error;
    }
  }

  /**
   * Buscar gravações por câmera
   * @param {string} cameraId - ID da câmera
   * @param {Object} options - Opções de busca
   * @returns {Promise<Array<Recording>>}
   */
  static async findByCamera(cameraId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        status,
        limit = 50,
        offset = 0,
        orderBy = 'start_time',
        orderDirection = 'desc'
      } = options;

      let query = supabaseAdmin
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name,
            location
          )
        `)
        .eq('camera_id', cameraId);

      if (startDate) {
        query = query.gte('start_time', startDate);
      }

      if (endDate) {
        query = query.lte('end_time', endDate);
      }

      if (status) {
        query = query.eq('status', status);
      }

      query = query
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Erro ao buscar gravações: ${error.message}`);
      }

      return data.map(recording => new Recording(recording));
    } catch (error) {
      logger.error('Erro ao buscar gravações por câmera:', error);
      throw error;
    }
  }

  /**
   * Buscar gravações por período
   * @param {string} startDate - Data de início
   * @param {string} endDate - Data de fim
   * @param {Object} options - Opções de busca
   * @returns {Promise<Array<Recording>>}
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    try {
      const {
        cameraIds,
        status,
        limit = 100,
        offset = 0
      } = options;

      let query = supabaseAdmin
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name,
            location
          )
        `)
        .gte('start_time', startDate)
        .lte('end_time', endDate);

      if (cameraIds && cameraIds.length > 0) {
        query = query.in('camera_id', cameraIds);
      }

      if (status) {
        query = query.eq('status', status);
      }

      query = query
        .order('start_time', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Erro ao buscar gravações por período: ${error.message}`);
      }

      return data.map(recording => new Recording(recording));
    } catch (error) {
      logger.error('Erro ao buscar gravações por período:', error);
      throw error;
    }
  }

  /**
   * Buscar gravações pendentes de upload
   * @param {number} limit - Limite de resultados
   * @returns {Promise<Array<Recording>>}
   */
  static async findPendingUploads(limit = 10) {
    try {
      const { data, error } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .in('upload_status', ['pending', 'failed'])
        .lt('upload_attempts', 3)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`Erro ao buscar gravações pendentes: ${error.message}`);
      }

      return data.map(recording => new Recording(recording));
    } catch (error) {
      logger.error('Erro ao buscar gravações pendentes:', error);
      throw error;
    }
  }

  /**
   * Atualizar gravação
   * @param {Object} updates - Dados para atualizar
   * @returns {Promise<Recording>}
   */
  async update(updates) {
    try {
      const { data, error } = await supabaseAdmin
        .from('recordings')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar gravação: ${error.message}`);
      }

      // Atualizar propriedades do objeto
      Object.assign(this, data);
      
      logger.info(`Gravação atualizada: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Erro ao atualizar gravação:', error);
      throw error;
    }
  }

  /**
   * Marcar como uploadada
   * @param {string} s3Key - Chave do arquivo no S3
   * @param {string} s3Url - URL do arquivo no S3
   * @returns {Promise<Recording>}
   */
  async markAsUploaded(s3Key, s3Url) {
    return this.update({
      s3_key: s3Key,
      s3_url: s3Url,
      upload_status: 'completed',
      status: 'uploaded'
    });
  }

  /**
   * Marcar erro no upload
   * @param {string} errorMessage - Mensagem de erro
   * @returns {Promise<Recording>}
   */
  async markUploadError(errorMessage) {
    return this.update({
      upload_status: 'failed',
      upload_attempts: this.upload_attempts + 1,
      error_message: errorMessage
    });
  }

  /**
   * Deletar gravação
   * @returns {Promise<boolean>}
   */
  async delete() {
    try {
      const { error } = await supabaseAdmin
        .from('recordings')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new Error(`Erro ao deletar gravação: ${error.message}`);
      }

      logger.info(`Gravação deletada: ${this.id}`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar gravação:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de gravações
   * @param {Object} options - Opções de filtro
   * @returns {Promise<Object>}
   */
  static async getStats(options = {}) {
    try {
      const { cameraId, startDate, endDate } = options;

      let query = supabaseAdmin
        .from('recordings')
        .select('status, file_size, duration');

      if (cameraId) {
        query = query.eq('camera_id', cameraId);
      }

      if (startDate) {
        query = query.gte('start_time', startDate);
      }

      if (endDate) {
        query = query.lte('end_time', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Erro ao obter estatísticas: ${error.message}`);
      }

      const stats = {
        total_recordings: data.length,
        total_size: data.reduce((sum, r) => sum + (r.file_size || 0), 0),
        total_duration: data.reduce((sum, r) => sum + (r.duration || 0), 0),
        by_status: {}
      };

      // Agrupar por status
      data.forEach(recording => {
        const status = recording.status || 'unknown';
        if (!stats.by_status[status]) {
          stats.by_status[status] = {
            count: 0,
            size: 0,
            duration: 0
          };
        }
        stats.by_status[status].count++;
        stats.by_status[status].size += recording.file_size || 0;
        stats.by_status[status].duration += recording.duration || 0;
      });

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Converter para JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      camera_id: this.camera_id,
      filename: this.filename,
      file_path: this.file_path,
      s3_key: this.s3_key,
      s3_url: this.s3_url,
      file_size: this.file_size,
      duration: this.duration,
      start_time: this.start_time,
      end_time: this.end_time,
      quality: this.quality,
      codec: this.codec,
      resolution: this.resolution,
      fps: this.fps,
      bitrate: this.bitrate,
      status: this.status,
      upload_status: this.upload_status,
      upload_attempts: this.upload_attempts,
      error_message: this.error_message,
      metadata: this.metadata,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}