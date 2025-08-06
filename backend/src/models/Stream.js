/**
 * Modelo de dados para streams do sistema NewCAM
 * Gerencia operações CRUD e validações de streams
 */

import { supabaseAdmin, dbUtils, TABLES } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';

const logger = createModuleLogger('StreamModel');

/**
 * Utilitários locais
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>"'&]/g, '');
}

function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

class Stream {
  constructor(data = {}) {
    console.log('🔍 [STREAM CONSTRUCTOR] Dados recebidos no construtor:', JSON.stringify(data, null, 2));
    console.log('🔍 [STREAM CONSTRUCTOR] Propriedades do objeto data:', Object.keys(data));
    
    this.id = data.id;
    this.camera_id = data.camera_id;
    this.stream_key = data.stream_key;
    this.rtsp_url = data.rtsp_url;
    this.rtmp_url = data.rtmp_url;
    this.hls_url = data.hls_url;
    this.flv_url = data.flv_url; // Campo correto da tabela
    this.status = data.status || 'inactive';
    this.quality = data.quality || 'medium';
    this.resolution = data.resolution;
    this.fps = data.fps;
    this.bitrate = data.bitrate;
    this.codec = data.codec || 'h264';
    this.audio_enabled = data.audio_enabled || false;
    this.viewer_count = data.viewer_count || 0;
    this.bandwidth_usage = data.bandwidth_usage || 0;
    this.server_type = data.server_type || 'zlm';
    this.server_url = data.server_url;
    this.started_at = data.started_at;
    this.stopped_at = data.stopped_at;
    this.last_activity = data.last_activity;
    this.error_message = data.error_message;
    this.metadata = data.metadata || {};
    this.settings = data.settings || {};
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Validar dados do stream
  validate() {
    const errors = [];
    
    console.log('[DEBUG] Validando Stream com dados:', {
      camera_id: this.camera_id,
      stream_key: this.stream_key,
      status: this.status,
      server_type: this.server_type,
      quality: this.quality,
      resolution: this.resolution,
      fps: this.fps,
      bitrate: this.bitrate
    });

    // Validar camera_id
    if (!this.camera_id) {
      console.log('[DEBUG] Erro na validação: camera_id ausente');
      errors.push('ID da câmera é obrigatório');
    } else if (!isValidUUID(this.camera_id)) {
      console.log('[DEBUG] Erro na validação: camera_id inválido:', this.camera_id);
      errors.push('ID da câmera deve ser um UUID válido');
    }

    // Validar stream_key
    if (!this.stream_key) {
      console.log('[DEBUG] Erro na validação: stream_key ausente');
      errors.push('Chave do stream é obrigatória');
    } else if (this.stream_key.length < 8 || this.stream_key.length > 64) {
      console.log('[DEBUG] Erro na validação: stream_key com tamanho inválido:', this.stream_key.length);
      errors.push('Chave do stream deve ter entre 8 e 64 caracteres');
    }

    // Validar status
    const validStatuses = ['active', 'inactive', 'error', 'starting', 'stopping'];
    if (!validStatuses.includes(this.status)) {
      console.log('[DEBUG] Erro na validação: status inválido:', this.status);
      errors.push('Status deve ser active, inactive, error, starting ou stopping');
    }

    // Validar server_type
    const validServerTypes = ['zlm', 'srs', 'nginx'];
    if (!validServerTypes.includes(this.server_type)) {
      console.log('[DEBUG] Erro na validação: server_type inválido:', this.server_type);
      errors.push('Tipo de servidor deve ser zlm, srs ou nginx');
    }

    // Validar quality
    const validQualities = ['low', 'medium', 'high', 'ultra'];
    if (this.quality && !validQualities.includes(this.quality)) {
      console.log('[DEBUG] Erro na validação: quality inválido:', this.quality);
      errors.push('Qualidade deve ser low, medium, high ou ultra');
    }

    // Validar resolução
    if (this.resolution) {
      const resolutionRegex = /^\d{3,4}x\d{3,4}$/;
      if (!resolutionRegex.test(this.resolution)) {
        console.log('[DEBUG] Erro na validação: resolution inválido:', this.resolution);
        errors.push('Resolução deve ter formato WIDTHxHEIGHT (ex: 1920x1080)');
      }
    }

    // Validar FPS
    if (this.fps) {
      const fps = parseInt(this.fps);
      if (isNaN(fps) || fps < 1 || fps > 60) {
        console.log('[DEBUG] Erro na validação: fps inválido:', this.fps);
        errors.push('FPS deve ser um número entre 1 e 60');
      }
    }

    // Validar bitrate
    if (this.bitrate) {
      const bitrate = parseInt(this.bitrate);
      if (isNaN(bitrate) || bitrate < 100 || bitrate > 50000) {
        console.log('[DEBUG] Erro na validação: bitrate inválido:', this.bitrate);
        errors.push('Bitrate deve ser um número entre 100 e 50000 kbps');
      }
    }



    // user_id removido - não existe na tabela streams

    console.log('[DEBUG] Erros de validação encontrados:', errors);
    
    if (errors.length > 0) {
      throw new ValidationError('Dados de stream inválidos', errors);
    }
  }

  // Sanitizar dados
  sanitize() {
    if (this.stream_key) this.stream_key = sanitizeInput(this.stream_key.trim());
    if (this.rtsp_url) this.rtsp_url = sanitizeInput(this.rtsp_url.trim());
    if (this.rtmp_url) this.rtmp_url = sanitizeInput(this.rtmp_url.trim());
    if (this.hls_url) this.hls_url = sanitizeInput(this.hls_url.trim());
    if (this.flv_url) this.flv_url = sanitizeInput(this.flv_url.trim());
    if (this.server_url) this.server_url = sanitizeInput(this.server_url.trim());
    if (this.error_message) this.error_message = sanitizeInput(this.error_message.trim());
    if (this.server_type) this.server_type = sanitizeInput(this.server_type.toLowerCase());
    if (this.quality) this.quality = sanitizeInput(this.quality.toLowerCase());
    if (this.resolution) this.resolution = sanitizeInput(this.resolution);
  }

  // Converter para objeto simples
  toJSON() {
    const data = {
      id: this.id,
      camera_id: this.camera_id,
      stream_key: this.stream_key,
      rtsp_url: this.rtsp_url,
      rtmp_url: this.rtmp_url,
      hls_url: this.hls_url,
      flv_url: this.flv_url,
      status: this.status,
      quality: this.quality,
      resolution: this.resolution,
      fps: this.fps,
      bitrate: this.bitrate,
      codec: this.codec,
      audio_enabled: this.audio_enabled,
      viewer_count: this.viewer_count,
      bandwidth_usage: this.bandwidth_usage,
      server_type: this.server_type,
      server_url: this.server_url,
      started_at: this.started_at,
      stopped_at: this.stopped_at,
      last_activity: this.last_activity,
      error_message: this.error_message,
      metadata: this.metadata,
      settings: this.settings,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
    
    // Remover user_id se existir (não deve estar presente)
    delete data.user_id;
    
    return data;
  }

  // Métodos estáticos para operações de banco de dados
  static async findAll(filters = {}) {
    try {
      let query = supabaseAdmin.from('streams').select('*');
      
      if (filters.camera_id) {
        query = query.eq('camera_id', filters.camera_id);
      }
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.server_type) {
        query = query.eq('server_type', filters.server_type);
      }
      
      // user_id removido - não existe na tabela streams
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        logger.error('Erro ao buscar streams:', error);
        throw new AppError('Erro ao buscar streams');
      }
      
      return data.map(stream => new Stream(stream));
    } catch (error) {
      logger.error('Erro ao buscar streams:', error);
      throw error;
    }
  }

  static async findByPk(id) {
    try {
      if (!isValidUUID(id)) {
        throw new ValidationError('ID do stream inválido');
      }
      
      const { data, error } = await supabaseAdmin
        .from('streams')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Erro ao buscar stream:', error);
        throw new AppError('Erro ao buscar stream');
      }
      
      return new Stream(data);
    } catch (error) {
      logger.error('Erro ao buscar stream por ID:', error);
      throw error;
    }
  }

  static async findByCameraId(cameraId) {
    try {
      if (!isValidUUID(cameraId)) {
        throw new ValidationError('ID da câmera inválido');
      }
      
      const { data, error } = await supabaseAdmin
        .from('streams')
        .select('*')
        .eq('camera_id', cameraId)
        .order('created_at', { ascending: false });
      
      if (error) {
        logger.error('Erro ao buscar streams da câmera:', error);
        throw new AppError('Erro ao buscar streams da câmera');
      }
      
      return data.map(stream => new Stream(stream));
    } catch (error) {
      logger.error('Erro ao buscar streams por câmera:', error);
      throw error;
    }
  }

  static async findByStreamKey(streamKey) {
    try {
      const { data, error } = await supabaseAdmin
        .from('streams')
        .select('*')
        .eq('stream_key', streamKey)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Erro ao buscar stream por chave:', error);
        throw new AppError('Erro ao buscar stream por chave');
      }
      
      return new Stream(data);
    } catch (error) {
      logger.error('Erro ao buscar stream por chave:', error);
      throw error;
    }
  }

  async save() {
    console.log('🚀 [STREAM SAVE] Iniciando save() do Stream');
    try {
      this.sanitize();
      this.validate();
      
      const streamData = this.toJSON();
      delete streamData.id; // Remove ID para inserção
      delete streamData.user_id; // Garantir que user_id seja removido
      
      console.log('🔍 [STREAM SAVE] Dados que serão enviados para o Supabase:', JSON.stringify(streamData, null, 2));
      console.log('🔍 [STREAM SAVE] Propriedades do objeto this:', Object.keys(this));
      
      const { data, error } = await supabaseAdmin
        .from('streams')
        .insert(streamData)
        .select()
        .single();
      
      if (error) {
        console.log('🔍 ERRO DETALHADO DO SUPABASE:', JSON.stringify({
          error: error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          streamData: streamData
        }, null, 2));
        logger.error('Erro ao salvar stream - Detalhes completos:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          streamData
        });
        if (error.code === '23505') {
          throw new ConflictError('Stream com esta chave já existe');
        }
        throw new AppError(`Erro ao salvar stream: ${error.message || error.code || 'Erro desconhecido'}`);
      }
      
      Object.assign(this, data);
      logger.info(`Stream criado: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Erro ao salvar stream:', error);
      throw error;
    }
  }

  async update(updateData) {
    try {
      if (!this.id) {
        throw new ValidationError('ID do stream é necessário para atualização');
      }
      
      Object.assign(this, updateData);
      this.sanitize();
      this.validate();
      
      const streamData = this.toJSON();
      delete streamData.id;
      delete streamData.created_at;
      streamData.updated_at = new Date().toISOString();
      
      const { data, error } = await supabaseAdmin
        .from('streams')
        .update(streamData)
        .eq('id', this.id)
        .select()
        .single();
      
      if (error) {
        logger.error('Erro ao atualizar stream:', error);
        throw new AppError('Erro ao atualizar stream');
      }
      
      Object.assign(this, data);
      logger.info(`Stream atualizado: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Erro ao atualizar stream:', error);
      throw error;
    }
  }

  async delete() {
    try {
      if (!this.id) {
        throw new ValidationError('ID do stream é necessário para exclusão');
      }
      
      const { error } = await supabaseAdmin
        .from('streams')
        .delete()
        .eq('id', this.id);
      
      if (error) {
        logger.error('Erro ao deletar stream:', error);
        throw new AppError('Erro ao deletar stream');
      }
      
      logger.info(`Stream deletado: ${this.id}`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar stream:', error);
      throw error;
    }
  }

  static async deleteById(id) {
    try {
      if (!isValidUUID(id)) {
        throw new ValidationError('ID do stream inválido');
      }
      
      const { error } = await supabaseAdmin
        .from('streams')
        .delete()
        .eq('id', id);
      
      if (error) {
        logger.error('Erro ao deletar stream:', error);
        throw new AppError('Erro ao deletar stream');
      }
      
      logger.info(`Stream deletado: ${id}`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar stream por ID:', error);
      throw error;
    }
  }
}

export { Stream };
export default Stream;