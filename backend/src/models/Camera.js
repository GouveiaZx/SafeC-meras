/**
 * Modelo de dados para câmeras do sistema NewCAM
 * Gerencia operações CRUD e validações de câmeras
 */

import { supabaseAdmin, dbUtils, TABLES } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import net from 'net';
import { spawn } from 'child_process';

const logger = createModuleLogger('CameraModel');

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

class Camera {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    
    // Campos existentes na tabela
    this.rtsp_url = data.rtsp_url;
    this.rtmp_url = data.rtmp_url;
    this.hls_url = data.hls_url;
    this.status = data.status || 'online';
    this.is_streaming = data.is_streaming || false;
    this.is_recording = data.is_recording || false;
    this.location = data.location;
    this.resolution = data.resolution || '1920x1080';
    this.fps = data.fps || 30;
    // this.bitrate = data.bitrate || 2000; // Campo removido - não existe na tabela
    this.user_id = data.user_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    
    // Campos novos (podem não existir na tabela ainda)
    this.ip_address = data.ip_address;
    this.port = data.port || 554;
    this.username = data.username;
    this.password = data.password;
    this.type = data.type || 'ip';
    this.stream_type = data.stream_type || 'rtsp';
    this.brand = data.brand;
    this.model = data.model;
    this.zone = data.zone;
    this.recording_enabled = data.recording_enabled || false;
    this.motion_detection = data.motion_detection || false;
    this.audio_enabled = data.audio_enabled || false;
    this.ptz_enabled = data.ptz_enabled || false;
    this.night_vision = data.night_vision || false;
    this.quality_profile = data.quality_profile || 'medium';
    this.retention_days = data.retention_days || 30;
    this.created_by = data.created_by;
    this.active = data.active !== undefined ? data.active : true;
    this.thumbnail_url = data.thumbnail_url;
    this.last_seen = data.last_seen;
    this.settings = data.settings || {};
    this.metadata = data.metadata || {};

    // Gerar URLs de streaming se necessário
    this.generateStreamingUrls();
  }

  // Validar dados da câmera
  validate() {
    const errors = [];

    // Validar nome
    if (!this.name) {
      errors.push('Nome é obrigatório');
    } else if (this.name.length < 2 || this.name.length > 100) {
      errors.push('Nome deve ter entre 2 e 100 caracteres');
    }

    // Validar IP (opcional se URLs de stream são fornecidas)
    if (!this.ip_address && !this.rtsp_url && !this.rtmp_url) {
      errors.push('Deve ser fornecido pelo menos um: IP da câmera, URL RTSP ou URL RTMP');
    } else if (this.ip_address) {
      // Validar IP numérico
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (ipRegex.test(this.ip_address)) {
        // É um IP válido
      } else {
        // Validar hostname/domínio
        const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?))*$/;
        if (!hostnameRegex.test(this.ip_address) || this.ip_address.length > 253) {
          errors.push('Endereço IP deve ter um formato válido ou ser um hostname válido');
        }
      }
    }

    // Validar porta
    if (this.port) {
      const port = parseInt(this.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push('Porta deve ser um número entre 1 e 65535');
      }
    }

    // Validar tipo
    const validTypes = ['ip', 'analog', 'usb', 'virtual'];
    if (!validTypes.includes(this.type)) {
      errors.push('Tipo deve ser ip, analog, usb ou virtual');
    }

    // Validar resolução
    if (this.resolution) {
      const resolutionRegex = /^\d{3,4}x\d{3,4}$/;
      if (!resolutionRegex.test(this.resolution)) {
        errors.push('Resolução deve ter formato WIDTHxHEIGHT (ex: 1920x1080)');
      }
    }

    // Validar FPS
    if (this.fps) {
      const fps = parseInt(this.fps);
      if (isNaN(fps) || fps < 1 || fps > 60) {
        errors.push('FPS deve ser um número entre 1 e 60');
      }
    }

    // Validar status
    const validStatuses = ['online', 'offline', 'error', 'maintenance'];
    if (!validStatuses.includes(this.status)) {
      errors.push('Status deve ser online, offline, error ou maintenance');
    }

    // Validar perfil de qualidade
    const validProfiles = ['low', 'medium', 'high', 'ultra'];
    if (!validProfiles.includes(this.quality_profile)) {
      errors.push('Perfil de qualidade deve ser low, medium, high ou ultra');
    }

    // Validar dias de retenção
    if (this.retention_days) {
      const days = parseInt(this.retention_days);
      if (isNaN(days) || days < 1 || days > 365) {
        errors.push('Dias de retenção deve ser um número entre 1 e 365');
      }
    }

    // Validar created_by (se fornecido)
    if (this.created_by && !isValidUUID(this.created_by)) {
      errors.push('ID do criador inválido');
    }

    if (errors.length > 0) {
      throw new ValidationError('Dados de câmera inválidos', errors);
    }
  }

  // Sanitizar dados
  sanitize() {
    if (this.name) this.name = sanitizeInput(this.name.trim());
    if (this.description) this.description = sanitizeInput(this.description.trim());
    if (this.ip_address) this.ip_address = sanitizeInput(this.ip_address.trim());
    if (this.username) this.username = sanitizeInput(this.username.trim());
    if (this.type) this.type = sanitizeInput(this.type.toLowerCase());
    if (this.brand) this.brand = sanitizeInput(this.brand.trim());
    if (this.model) this.model = sanitizeInput(this.model.trim());
    if (this.location) this.location = sanitizeInput(this.location.trim());
    if (this.zone) this.zone = sanitizeInput(this.zone.trim());
    if (this.quality_profile) this.quality_profile = sanitizeInput(this.quality_profile.toLowerCase());
  }

  // Gerar URLs de streaming
  generateStreamingUrls() {
    // Se já temos URLs definidas, não gerar automaticamente
    if (this.rtsp_url || this.rtmp_url) {
      // HLS URL sempre baseada no stream existente
      if (this.rtsp_url || this.rtmp_url) {
        const streamId = this.id || 'temp';
        this.hls_url = `/api/streams/${streamId}/hls/playlist.m3u8`;
      }
      return;
    }
    
    // Só gerar URLs se temos IP e porta
    if (!this.ip_address) {
      return;
    }
    
    const baseUrl = `${this.ip_address}:${this.port}`;
    const auth = this.username && this.password ? `${this.username}:${this.password}@` : '';
    
    // RTSP URL - gerar se o tipo for RTSP ou não especificado
    if (!this.stream_type || this.stream_type === 'rtsp') {
      this.rtsp_url = `rtsp://${auth}${baseUrl}/stream1`;
    }
    
    // RTMP URL - gerar se o tipo for RTMP
    if (this.stream_type === 'rtmp') {
      this.rtmp_url = `rtmp://${this.ip_address}:${this.port}/live/stream`;
    }
    
    // HLS URL sempre baseada no stream
    const streamId = this.id || 'temp';
    this.hls_url = `/api/streams/${streamId}/hls/playlist.m3u8`;
  }

  // Verificar conectividade da câmera
  async checkConnectivity() {
    try {
      logger.debug(`Verificando conectividade da câmera ${this.name} (${this.ip_address}:${this.port})`);
      
      // Primeiro teste: verificar se o IP/porta estão acessíveis via TCP
      const isTcpReachable = await this.checkTcpConnection();
      
      if (!isTcpReachable) {
        logger.debug(`Câmera ${this.name} não está acessível via TCP`);
        await this.updateStatus('offline');
        return false;
      }
      
      logger.debug(`Câmera ${this.name} está acessível via TCP, verificando stream...`);
      
      // Segundo teste: verificar se o stream RTSP/RTMP está funcionando
      const isStreamWorking = await this.checkStreamConnection();
      
      if (!isStreamWorking) {
        logger.debug(`Stream da câmera ${this.name} não está funcionando`);
        await this.updateStatus('offline');
        return false;
      }
      
      // Câmera está online e stream funcionando
       logger.info(`Câmera ${this.name} está online e stream funcionando`);
       await this.updateStatus('online');
       
       // Tentar iniciar stream automaticamente
       await this.autoStartStream();
       
       return true;
    } catch (error) {
      logger.error(`Erro ao verificar conectividade da câmera ${this.name}:`, error);
      await this.updateStatus('offline');
      return false;
    }
  }
  
  // Verificar conexão TCP
  checkTcpConnection() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 3000; // 3 segundos de timeout
      
      socket.setTimeout(timeout);
      
      // Tentar conectar
      socket.connect(this.port || 554, this.ip_address, () => {
        socket.end();
        resolve(true);
      });
      
      // Lidar com timeout
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      // Lidar com erro
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
  
  // Verificar conexão do stream
  checkStreamConnection() {
    return new Promise((resolve) => {
      try {
        const url = this.stream_type === 'rtmp' ? this.rtmp_url : this.rtsp_url;
        if (!url) {
          resolve(false);
          return;
        }
        
        // Usar ffprobe para verificar o stream
        const timeout = 5000; // 5 segundos de timeout
        const ffprobe = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'stream=codec_type',
          '-of', 'json',
          '-analyzeduration', '3000000',
          '-probesize', '3000000',
          url
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
          if (code === 0 && output.includes('codec_type')) {
            resolve(true);
          } else {
            logger.debug(`FFprobe falhou para ${url}: ${errorOutput}`);
            resolve(false);
          }
        });
        
        // Definir timeout
        setTimeout(() => {
          try {
            ffprobe.kill('SIGKILL');
          } catch (e) {
            // Ignorar erro ao matar processo
          }
          resolve(false);
        }, timeout);
      } catch (error) {
        logger.error('Erro ao verificar stream:', error);
        resolve(false);
      }
    });
   }
   
   // Iniciar stream automaticamente
   async autoStartStream() {
     try {
       logger.info(`Tentando iniciar stream automaticamente para câmera ${this.name}`);
       
       // Importar StreamingService dinamicamente para evitar dependência circular
       const { default: StreamingService } = await import('../services/StreamingService.js');
       const streamingService = new StreamingService();
       
       // Inicializar serviço se necessário
       if (!streamingService.isInitialized) {
         await streamingService.init();
       }
       
       // Tentar iniciar stream
       const streamConfig = await streamingService.startStream(this, {
         quality: 'medium',
         format: 'hls',
         audio: true
       });
       
       if (streamConfig && streamConfig.urls) {
         // Atualizar status de streaming
         await this.updateStreamingStatus(true);
         logger.info(`Stream iniciado automaticamente para câmera ${this.name}: ${streamConfig.urls.hls}`);
         return streamConfig;
       }
     } catch (error) {
       logger.warn(`Falha ao iniciar stream automaticamente para câmera ${this.name}:`, error.message);
       // Não propagar erro - stream automático é opcional
       return null;
     }
   }
   
   // Atualizar status de streaming
   async updateStreamingStatus(isStreaming) {
     try {
       this.is_streaming = isStreaming;
       
       const { error } = await supabaseAdmin
         .from(TABLES.CAMERAS)
         .update({
           is_streaming: this.is_streaming,
           updated_at: new Date().toISOString()
         })
         .eq('id', this.id);

       if (error) {
         throw new AppError(`Erro ao atualizar status de streaming: ${error.message}`);
       }

       logger.debug(`Status de streaming da câmera ${this.name} atualizado para: ${isStreaming}`);
       return this;
     } catch (error) {
       logger.error('Erro ao atualizar status de streaming da câmera:', error);
       throw error;
     }
   }
 
   // Converter para objeto JSON (sem senha)
  toJSON() {
    const { password, ...cameraWithoutPassword } = this;
    return cameraWithoutPassword;
  }

  // Salvar câmera
  async save() {
    try {
      // Validação básica apenas para campos essenciais
      if (!this.name || this.name.trim().length === 0) {
        throw new ValidationError('Nome da câmera é obrigatório');
      }
      
      // Deve ter pelo menos uma URL de stream ou IP
      if (!this.rtsp_url && !this.rtmp_url && !this.ip_address) {
        throw new ValidationError('Deve ser fornecido pelo menos um: IP da câmera, URL RTSP ou URL RTMP');
      }

      // Sanitizar dados básicos
      this.name = this.name.trim();
      if (this.description) this.description = this.description.trim();
      if (this.location) this.location = this.location.trim();
      if (this.rtsp_url) this.rtsp_url = this.rtsp_url.trim();
      if (this.rtmp_url) this.rtmp_url = this.rtmp_url.trim();
      if (this.ip_address) this.ip_address = this.ip_address.trim();
      
      // Definir valores padrão
      this.status = this.status || 'offline';
      this.is_streaming = this.is_streaming || false;
      this.is_recording = this.is_recording || false;
      this.resolution = this.resolution || '1920x1080';
      this.fps = this.fps || 30;
      // this.bitrate = this.bitrate || 2000; // Campo removido - não existe na tabela

      const now = new Date().toISOString();

      if (this.id) {
        // Atualizar câmera existente - usar apenas campos que existem na tabela
        this.updated_at = now;
        
        const { data, error } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .update({
            name: this.name,
            description: this.description,
            rtsp_url: this.rtsp_url,
            rtmp_url: this.rtmp_url,
            hls_url: this.hls_url,
            status: this.status,
            is_streaming: this.is_streaming,
            is_recording: this.is_recording,
            location: this.location,
            resolution: this.resolution,
            fps: this.fps,
            // bitrate: this.bitrate, // Campo removido - não existe na tabela
            updated_at: this.updated_at
          })
          .eq('id', this.id)
          .select()
          .single();

        if (error) {
          logger.error('Erro ao atualizar câmera:', error);
          if (error.code === '23505') {
            throw new ConflictError('Já existe uma câmera com este nome');
          }
          throw new AppError(`Erro ao atualizar câmera: ${error.message}`);
        }

        Object.assign(this, data);
        logger.info(`Câmera atualizada: ${this.name}`);
      } else {
        // Criar nova câmera - usar apenas campos que existem na tabela
        this.created_at = now;
        this.updated_at = now;

        // Preparar dados para inserção
        const insertData = {
          name: this.name,
          rtsp_url: this.rtsp_url,
          rtmp_url: this.rtmp_url,
          status: this.status || 'connecting',
          location: this.location
        };
        
        // Só incluir ip_address se for um IP válido (não hostname)
        if (this.ip_address) {
          const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          if (ipRegex.test(this.ip_address)) {
            insertData.ip_address = this.ip_address;
          }
          // Se for hostname, não incluir no banco (campo INET não aceita)
        }

        const { data, error } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .insert(insertData)
          .select()
          .single();

        if (error) {
          logger.error('Erro ao criar câmera:', error);
          if (error.code === '23505') {
            throw new ConflictError('Já existe uma câmera com este nome');
          }
          throw new AppError(`Erro ao criar câmera: ${error.message}`);
        }

        Object.assign(this, data);
        logger.info(`Câmera criada: ${this.name}`);
        
        // Verificar conectividade automaticamente após criação
        setTimeout(async () => {
          try {
            await this.checkConnectivity();
          } catch (error) {
            logger.error(`Erro na verificação automática da câmera ${this.name}:`, error);
          }
        }, 1000); // Aguardar 1 segundo antes de verificar
      }

      return this;
    } catch (error) {
      logger.error('Erro ao salvar câmera:', error);
      throw error;
    }
  }

  // Deletar câmera
  async delete() {
    try {
      if (!this.id) {
        throw new ValidationError('ID da câmera é obrigatório para deletar');
      }

      const { error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao deletar câmera: ${error.message}`);
      }

      logger.info(`Câmera deletada: ${this.name}`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar câmera:', error);
      throw error;
    }
  }

  // Atualizar status
  async updateStatus(status, lastSeen = null) {
    try {
      const validStatuses = ['online', 'offline', 'error', 'maintenance'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError('Status inválido');
      }

      this.status = status;
      this.last_seen = lastSeen || new Date().toISOString();
      
      const { error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .update({
          status: this.status,
          last_seen: this.last_seen,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao atualizar status: ${error.message}`);
      }

      logger.debug(`Status da câmera ${this.name} atualizado para: ${status}`);
      return this;
    } catch (error) {
      logger.error('Erro ao atualizar status da câmera:', error);
      throw error;
    }
  }

  // Atualizar thumbnail
  async updateThumbnail(thumbnailUrl) {
    try {
      this.thumbnail_url = thumbnailUrl;
      
      const { error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .update({
          thumbnail_url: this.thumbnail_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao atualizar thumbnail: ${error.message}`);
      }

      return this;
    } catch (error) {
      logger.error('Erro ao atualizar thumbnail:', error);
      throw error;
    }
  }

  // Métodos estáticos

  // Buscar câmera por ID
  static async findById(id) {
    try {
      if (!isValidUUID(id)) {
        throw new ValidationError('ID de câmera inválido');
      }

      const { data, error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new AppError(`Erro ao buscar câmera: ${error.message}`);
      }

      return new Camera(data);
    } catch (error) {
      logger.error('Erro ao buscar câmera por ID:', error);
      throw error;
    }
  }

  // Buscar câmera por IP
  static async findByIp(ipAddress) {
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*')
        .eq('ip_address', ipAddress)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new AppError(`Erro ao buscar câmera: ${error.message}`);
      }

      return new Camera(data);
    } catch (error) {
      logger.error('Erro ao buscar câmera por IP:', error);
      throw error;
    }
  }

  // Listar câmeras com paginação
  static async findAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status = null,
        active = null,
        type = null,
        zone = null,
        sortBy = 'created_at',
        sortOrder = 'desc',
        userId = null
      } = options;

      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*', { count: 'exact' });

      // Filtros
      if (search) {
        query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,ip_address.ilike.%${search}%`);
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (active !== null) {
        query = query.eq('active', active);
      }

      if (type) {
        query = query.eq('type', type);
      }

      if (zone) {
        query = query.eq('zone', zone);
      }

      // Filtrar por acesso do usuário (se não for admin)
      if (userId) {
        const user = await import('./User.js').then(m => m.User.findById(userId));
        if (user && user.role !== 'admin') {
          query = query.in('id', user.camera_access);
        }
      }

      // Ordenação
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginação
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new AppError(`Erro ao listar câmeras: ${error.message}`);
      }

      const cameras = data.map(cameraData => new Camera(cameraData));

      return {
        cameras,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Erro ao listar câmeras:', error);
      throw error;
    }
  }

  // Contar câmeras
  static async count(filters = {}) {
    try {
      let query = supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*', { count: 'exact', head: true });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.active !== undefined) {
        query = query.eq('active', filters.active);
      }

      if (filters.type) {
        query = query.eq('type', filters.type);
      }

      const { count, error } = await query;

      if (error) {
        throw new AppError(`Erro ao contar câmeras: ${error.message}`);
      }

      return count;
    } catch (error) {
      logger.error('Erro ao contar câmeras:', error);
      throw error;
    }
  }

  // Verificar se IP já existe
  static async ipExists(ipAddress, excludeId = null) {
    try {
      let query = supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('id')
        .eq('ip_address', ipAddress);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        throw new AppError(`Erro ao verificar IP: ${error.message}`);
      }

      return !!data;
    } catch (error) {
      logger.error('Erro ao verificar se IP existe:', error);
      throw error;
    }
  }

  // Buscar câmeras online
  static async findOnline() {
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*')
        .eq('status', 'online')
        .eq('active', true);

      if (error) {
        throw new AppError(`Erro ao buscar câmeras online: ${error.message}`);
      }

      return data.map(cameraData => new Camera(cameraData));
    } catch (error) {
      logger.error('Erro ao buscar câmeras online:', error);
      throw error;
    }
  }

  // Buscar câmeras por usuário
  static async findByUserId(userId) {
    try {
      if (!userId) {
        return [];
      }

      // Buscar usuário para verificar permissões
      const user = await import('./User.js').then(m => m.User.findById(userId));
      
      if (!user) {
        return [];
      }

      let query = supabaseAdmin
        .from(TABLES.CAMERAS)
        .select('*')
        .eq('active', true);

      // Se não for admin, filtrar por acesso do usuário
      if (user.role !== 'admin') {
        if (!user.camera_access || user.camera_access.length === 0) {
          return [];
        }
        query = query.in('id', user.camera_access);
      }

      const { data, error } = await query;

      if (error) {
        throw new AppError(`Erro ao buscar câmeras do usuário: ${error.message}`);
      }

      return data.map(cameraData => new Camera(cameraData));
    } catch (error) {
      logger.error('Erro ao buscar câmeras por usuário:', error);
      throw error;
    }
  }
}

export { Camera };