/**
 * RecordingService Simplificado - Sistema de Gravações NewCAM
 * Versão otimizada com apenas funcionalidades essenciais
 * Foca em: buscar arquivos, iniciar/parar gravações, normalizar paths
 */

import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('RecordingService');

class RecordingService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.logger = logger;
    
    // Configuração ZLMediaKit
    this.zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    
    // Caminhos simplificados
    this.recordingsBasePath = path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live');
    
    // Timeout automático para gravações (30 minutos)
    this.recordingTimeout = 30 * 60 * 1000; // 30 minutos em ms
    
    this.logger.info(`[RecordingService] Serviço simplificado inicializado`);
    this.ensureDirectories();
    this.startTimeoutChecker();
  }

  /**
   * Garantir que diretórios necessários existem
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.recordingsBasePath, { recursive: true });
      this.logger.info('[RecordingService] Diretórios verificados');
    } catch (error) {
      this.logger.error('[RecordingService] Erro ao criar diretórios:', error);
    }
  }

  /**
   * Normalizar path para formato consistente (relativo)
   */
  normalizePath(filePath) {
    if (!filePath) return null;
    
    // Converter separadores para Unix
    const normalized = filePath.replace(/\\/g, '/');
    
    // Remover prefixos absolutos e manter apenas relativo
    if (normalized.includes('storage/www/record/live')) {
      const index = normalized.indexOf('storage/www/record/live');
      return normalized.substring(index);
    }
    
    // Se já é relativo, manter
    if (normalized.startsWith('storage/')) {
      return normalized;
    }
    
    return normalized;
  }

  /**
   * Resolver path absoluto a partir do relativo
   */
  resolveAbsolutePath(relativePath) {
    if (!relativePath) return null;
    
    // Se já é absoluto, retornar
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    
    // Definir raiz do projeto
    const projectRoot = process.cwd().includes('backend') 
      ? path.join(process.cwd(), '..')
      : process.cwd();
    
    // Construir path absoluto
    if (relativePath.startsWith('storage/')) {
      return path.join(projectRoot, relativePath);
    }
    
    // Default: assumir que está no diretório base
    return path.join(this.recordingsBasePath, relativePath);
  }

  /**
   * Buscar arquivo de gravação - SIMPLIFICADO
   */
  async findRecordingFile(recording) {
    this.logger.info(`🔍 Buscando arquivo para gravação: ${recording.id}`);
    
    // Paths de busca simplificados
    const searchPaths = [];
    
    // 1. Usar file_path e local_path se existir
    if (recording.file_path) {
      const absolutePath = this.resolveAbsolutePath(recording.file_path);
      if (absolutePath) searchPaths.push(absolutePath);
    }
    
    if (recording.local_path && recording.local_path !== recording.file_path) {
      const absolutePath = this.resolveAbsolutePath(recording.local_path);
      if (absolutePath) searchPaths.push(absolutePath);
    }
    
    // 2. Buscar por estrutura padrão se tiver camera_id
    if (recording.camera_id) {
      const date = recording.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
      const filename = recording.filename || '*.mp4';
      
      const basePath = path.join(process.cwd(), 'storage', 'www', 'record', 'live');
      searchPaths.push(
        path.join(basePath, recording.camera_id, date, filename),
        path.join(basePath, recording.camera_id, filename)
      );
    }
    
    // 3. Buscar no diretório processed (onde arquivos são salvos atualmente)
    const filename = recording.filename || (recording.file_path ? path.basename(recording.file_path) : null);
    this.logger.info(`📁 [FIND] Filename extraído: ${filename}`);
    if (filename) {
      // Buscar no diretório processed atual
      const processedPath = path.join(process.cwd(), 'storage', 'www', 'record', 'live', 'processed', filename);
      this.logger.info(`📁 [FIND] Adicionado path processed: ${processedPath}`);
      searchPaths.push(processedPath);
      
      // Também buscar em storage/www/record/live/ direto
      const directPath = path.join(process.cwd(), 'storage', 'www', 'record', 'live', filename);
      searchPaths.push(directPath);
    }
    
    // 4. Buscar usando estrutura por data se temos camera_id
    if (recording.camera_id && !filename) {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Buscar arquivos MP4 recentes para esta câmera
      const cameraPaths = [
        path.join(process.cwd(), 'storage', 'www', 'record', 'live', recording.camera_id, today),
        path.join(process.cwd(), 'storage', 'www', 'record', 'live', recording.camera_id, yesterday),
        path.join(process.cwd(), 'storage', 'www', 'record', 'live', 'processed'),
      ];
      
      for (const cameraPath of cameraPaths) {
        try {
          const files = await fs.readdir(cameraPath);
          const mp4Files = files.filter(f => f.endsWith('.mp4') && f.includes(recording.camera_id));
          if (mp4Files.length > 0) {
            // Pegar o arquivo mais recente
            const latestFile = mp4Files[mp4Files.length - 1];
            searchPaths.push(path.join(cameraPath, latestFile));
          }
        } catch (error) {
          // Diretório não existe, continuar
        }
      }
    }
    
    // Testar cada path
    for (const testPath of searchPaths) {
      try {
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          this.logger.info(`✅ Arquivo encontrado: ${testPath}`);
          return testPath;
        }
      } catch (error) {
        // Arquivo não encontrado, continuar
      }
    }
    
    this.logger.warn(`❌ Arquivo não encontrado para gravação: ${recording.id}`);
    return null;
  }

  /**
   * Buscar gravação por ID
   */
  async getRecordingById(recordingId, userId = null) {
    try {
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name
          )
        `)
        .eq('id', recordingId);

      // Note: cameras table doesn't have user_id column, skipping user filter

      const { data: recording, error } = await query.single();

      if (error) {
        this.logger.error('Erro ao buscar gravação:', error);
        throw error;
      }

      return recording;
    } catch (error) {
      this.logger.error(`Erro ao buscar gravação ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Iniciar gravação (via ZLMediaKit API)
   */
  async startRecording(cameraId, options = {}) {
    try {
      this.logger.info(`🎬 Iniciando gravação para câmera: ${cameraId}`);

      // Verificar se câmera existe
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();

      if (cameraError || !camera) {
        throw new Error(`Câmera ${cameraId} não encontrada`);
      }

      // Verificar se já existe gravação ativa
      const { data: activeRecording } = await this.supabase
        .from('recordings')
        .select('id')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .single();

      if (activeRecording) {
        this.logger.warn(`⚠️ Gravação já ativa para câmera ${cameraId}: ${activeRecording.id}`);
        return { success: false, message: 'Recording already active', recordingId: activeRecording.id };
      }

      // Iniciar gravação via ZLMediaKit
      const startResult = await this.startZLMRecording(cameraId);
      
      if (!startResult.success) {
        throw new Error(`Falha ao iniciar gravação no ZLM: ${startResult.message}`);
      }

      // Criar registro no banco
      const now = new Date().toISOString();
      const { data: recording, error: insertError } = await this.supabase
        .from('recordings')
        .insert([{
          camera_id: cameraId,
          status: 'recording',
          start_time: now,
          started_at: now,
          created_at: now,
          updated_at: now,
          metadata: {
            started_by: 'api',
            options: options
          }
        }])
        .select()
        .single();

      if (insertError) {
        this.logger.error('Erro ao criar registro de gravação:', insertError);
        throw insertError;
      }

      // Atualizar status da câmera
      await this.supabase
        .from('cameras')
        .update({
          is_recording: true,
          updated_at: now
        })
        .eq('id', cameraId);

      this.logger.info(`✅ Gravação iniciada com sucesso: ${recording.id}`);
      return { success: true, recordingId: recording.id };

    } catch (error) {
      this.logger.error(`Erro ao iniciar gravação para ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Parar gravação
   */
  async stopRecording(cameraId, recordingId = null) {
    try {
      this.logger.info(`🛑 Parando gravação para câmera: ${cameraId}`);

      // Buscar gravação ativa se não fornecida
      if (!recordingId) {
        const { data: activeRecording } = await this.supabase
          .from('recordings')
          .select('id')
          .eq('camera_id', cameraId)
          .eq('status', 'recording')
          .single();

        if (!activeRecording) {
          this.logger.warn(`⚠️ Nenhuma gravação ativa encontrada para câmera ${cameraId}`);
          return { success: false, message: 'No active recording found' };
        }
        
        recordingId = activeRecording.id;
      }

      // Parar gravação via ZLMediaKit
      await this.stopZLMRecording(cameraId);

      // Atualizar registro no banco
      const now = new Date().toISOString();
      const { error: updateError } = await this.supabase
        .from('recordings')
        .update({
          status: 'completed',
          ended_at: now,
          updated_at: now
        })
        .eq('id', recordingId);

      if (updateError) {
        this.logger.error('Erro ao atualizar registro de gravação:', updateError);
        throw updateError;
      }

      // Atualizar status da câmera
      await this.supabase
        .from('cameras')
        .update({
          is_recording: false,
          updated_at: now
        })
        .eq('id', cameraId);


      this.logger.info(`✅ Gravação parada com sucesso: ${recordingId}`);
      return { success: true, recordingId };

    } catch (error) {
      this.logger.error(`Erro ao parar gravação para ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Iniciar gravação no ZLMediaKit
   */
  async startZLMRecording(streamId, app = 'live', duration = 1800) {
    try {
      this.logger.info(`📡 Iniciando gravação ZLM para stream: ${streamId}`);
      
      const response = await axios.post(`${this.zlmApiUrl}/startRecord`, null, {
        params: {
          secret: this.zlmSecret,
          type: 1, // MP4
          vhost: '__defaultVhost__',
          app: app,
          stream: streamId
        },
        timeout: 10000
      });

      if (response.data && response.data.code === 0) {
        this.logger.info(`✅ Gravação ZLM iniciada para ${streamId}`);
        return { success: true, message: 'Recording started' };
      } else {
        this.logger.error(`❌ Falha ao iniciar gravação ZLM:`, response.data);
        return { success: false, message: response.data?.msg || 'Unknown error' };
      }

    } catch (error) {
      this.logger.error(`❌ Erro ao comunicar com ZLMediaKit:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Parar gravação no ZLMediaKit
   */
  async stopZLMRecording(streamId, app = 'live') {
    try {
      this.logger.info(`📡 Parando gravação ZLM para stream: ${streamId}`);
      
      const response = await axios.post(`${this.zlmApiUrl}/stopRecord`, null, {
        params: {
          secret: this.zlmSecret,
          type: 1, // MP4
          vhost: '__defaultVhost__',
          app: app,
          stream: streamId
        },
        timeout: 5000
      });

      this.logger.info(`✅ Comando stop enviado para ZLM: ${streamId}`);
      return { success: true };

    } catch (error) {
      this.logger.error(`❌ Erro ao parar gravação ZLM:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Buscar gravações com filtros simplificados
   */
  async searchRecordings(userId, filters = {}) {
    try {
      // Primeiro fazer query de contagem
      let countQuery = this.supabase
        .from('recordings')
        .select('id', { count: 'exact', head: true });

      // Aplicar mesmos filtros na contagem
      if (filters.camera_id) {
        countQuery = countQuery.eq('camera_id', filters.camera_id);
      }

      if (filters.status) {
        countQuery = countQuery.eq('status', filters.status);
      }

      if (filters.date_from) {
        countQuery = countQuery.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        countQuery = countQuery.lte('created_at', filters.date_to);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        this.logger.error('Erro ao contar gravações:', countError);
        throw countError;
      }

      // Query principal para dados
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name,
            location
          )
        `);

      // Note: cameras table doesn't have user_id column, skipping user filter

      if (filters.camera_id) {
        query = query.eq('camera_id', filters.camera_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      // Ordenar por data de criação (mais recente primeiro)
      query = query.order('created_at', { ascending: false });

      // Paginação
      const page = parseInt(filters.page) || 1;
      const limit = Math.min(parseInt(filters.limit) || 50, 100);
      const offset = (page - 1) * limit;
      
      query = query.range(offset, offset + limit - 1);

      const { data: recordings, error } = await query;

      if (error) {
        this.logger.error('Erro ao buscar gravações:', error);
        throw error;
      }

      // Log para debug
      this.logger.info(`📊 [SEARCH] Encontradas ${recordings?.length || 0} gravações de ${count || 0} total`, {
        page,
        limit,
        offset,
        count,
        filters
      });

      // CORREÇÃO: Formatação melhorada para garantir todos os dados necessários
      const formattedRecordings = (recordings || []).map(recording => {
        const camera = recording.cameras || {};
        
        // Calcular duração se não existir mas tiver start_time e end_time
        let duration = recording.duration || 0;
        if (!duration && recording.start_time && recording.end_time) {
          const startTime = new Date(recording.start_time);
          const endTime = new Date(recording.end_time);
          duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          
          // Log para debug quando calculamos duração
          this.logger.debug(`📊 Duração calculada para gravação ${recording.id}: ${duration}s`);
        }
        
        // Validar se todos os campos críticos estão presentes
        const hasValidFile = !!(recording.file_path || recording.local_path);
        const hasValidSize = recording.file_size && recording.file_size > 0;
        const hasValidCamera = camera.name || camera.id;
        
        if (!hasValidCamera) {
          this.logger.warn(`⚠️ Gravação ${recording.id} sem dados válidos de câmera`);
        }
        
        return {
          id: recording.id,
          camera_id: recording.camera_id,
          camera_name: camera.name || `Câmera ${recording.camera_id?.substring(0, 8) || 'Desconhecida'}`,
          camera_location: camera.location || 'Localização não definida',
          filename: recording.filename || `gravacao-${recording.id?.substring(0, 8)}.mp4`,
          file_path: recording.file_path,
          local_path: recording.local_path,
          start_time: recording.start_time,
          end_time: recording.end_time,
          started_at: recording.started_at,
          ended_at: recording.ended_at,
          created_at: recording.created_at,
          updated_at: recording.updated_at,
          status: recording.status || 'unknown',
          duration: duration,
          duration_formatted: this.formatDuration(duration),
          file_size: recording.file_size || 0,
          file_size_formatted: this.formatFileSize(recording.file_size || 0),
          quality: recording.quality || 'medium',
          event_type: recording.event_type || 'automatic',
          format: recording.format || 'mp4',
          codec: recording.codec || 'h264',
          resolution: recording.resolution || null,
          width: recording.width || null,
          height: recording.height || null,
          fps: recording.fps || null,
          bitrate: recording.bitrate || null,
          thumbnail_url: recording.thumbnail_url || null,
          // ADICIONADO: Campos de upload essenciais para o frontend
          upload_status: recording.upload_status || 'pending',
          upload_progress: recording.upload_progress || 0,
          s3_key: recording.s3_key || null,
          s3_url: recording.s3_url || null,
          download_url: `http://localhost:3002/api/recording-files/${recording.id}/download`,
          stream_url: `http://localhost:3002/api/recording-files/${recording.id}/play`,
          play_web_url: `http://localhost:3002/api/recording-files/${recording.id}/play-web`,
          file_exists: hasValidFile,
          file_valid: hasValidFile && hasValidSize,
          playable: hasValidFile && (recording.status === 'completed' || recording.status === 'uploaded'),
          cameras: camera, // Manter compatibilidade com frontend
          segments: [], // Will be populated separately if needed
          metadata: {
            ...recording.metadata || {},
            resolution: recording.resolution || 'N/A',
            fps: recording.fps || 0,
            codec: recording.codec || 'h264',
            bitrate: recording.bitrate || 0,
            width: recording.width || null,
            height: recording.height || null
          }
        };
      });

      // Retornar objeto com paginação
      return {
        data: formattedRecordings,
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      };

    } catch (error) {
      this.logger.error('Erro ao buscar gravações:', error);
      throw error;
    }
  }

  /**
   * Deletar gravação
   */
  async deleteRecording(recordingId, userId = null) {
    try {
      // Buscar gravação
      const recording = await this.getRecordingById(recordingId, userId);
      
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }

      this.logger.info(`🗑️ [DELETE] Iniciando exclusão da gravação ${recordingId}:`, {
        filename: recording.filename,
        file_path: recording.file_path,
        local_path: recording.local_path,
        camera_id: recording.camera_id
      });

      // Buscar arquivo físico usando o método findRecordingFile
      let fileDeleted = false;
      let deletedPath = null;

      try {
        const foundPath = await this.findRecordingFile(recording);
        
        if (foundPath) {
          await fs.unlink(foundPath);
          fileDeleted = true;
          deletedPath = foundPath;
          this.logger.info(`✅ [DELETE] Arquivo físico deletado: ${foundPath}`);
        } else {
          // Tentar deletar usando paths do banco como fallback
          const pathsToTry = [
            recording.file_path && this.resolveAbsolutePath(recording.file_path),
            recording.local_path && this.resolveAbsolutePath(recording.local_path)
          ].filter(Boolean);

          for (const testPath of pathsToTry) {
            try {
              await fs.access(testPath);
              await fs.unlink(testPath);
              fileDeleted = true;
              deletedPath = testPath;
              this.logger.info(`✅ [DELETE] Arquivo físico deletado (fallback): ${testPath}`);
              break;
            } catch (error) {
              this.logger.debug(`🔍 [DELETE] Arquivo não encontrado: ${testPath}`);
            }
          }

          if (!fileDeleted) {
            this.logger.warn(`⚠️ [DELETE] Arquivo físico não encontrado para gravação ${recordingId}`, {
              filename: recording.filename,
              searched_paths: pathsToTry,
              note: 'Arquivo pode já ter sido deletado ou movido'
            });
          }
        }
      } catch (error) {
        this.logger.error(`❌ [DELETE] Erro ao deletar arquivo físico:`, error);
        // Continuar com a exclusão do banco mesmo se o arquivo não puder ser deletado
      }

      // Deletar registro do banco
      const { error } = await this.supabase
        .from('recordings')
        .delete()
        .eq('id', recordingId);

      if (error) {
        this.logger.error(`❌ [DELETE] Erro ao deletar registro do banco:`, error);
        throw error;
      }

      this.logger.info(`✅ [DELETE] Gravação completamente deletada:`, {
        recordingId,
        filename: recording.filename,
        file_deleted: fileDeleted,
        deleted_path: deletedPath,
        database_deleted: true
      });

      return { 
        success: true, 
        file_deleted: fileDeleted, 
        deleted_path: deletedPath 
      };

    } catch (error) {
      this.logger.error(`❌ [DELETE] Erro ao deletar gravação ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Obter gravações ativas
   */
  async getActiveRecordings(userId = null) {
    try {
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras (
            id,
            name
          )
        `)
        .eq('status', 'recording');

      // Note: cameras table doesn't have user_id column, skipping user filter

      const { data: recordings, error } = await query;

      if (error) {
        throw error;
      }

      return recordings || [];

    } catch (error) {
      this.logger.error('Erro ao buscar gravações ativas:', error);
      throw error;
    }
  }

  /**
   * Preparar arquivo para reprodução
   * Required by /api/recording-files routes
   */
  async preparePlayback(recordingId) {
    try {
      console.log(`🎬 [DEBUG] preparePlayback called for: ${recordingId}`);
      this.logger.info(`🎬 Preparando playback para gravação: ${recordingId}`);
      
      // Buscar gravação
      const recording = await this.getRecordingById(recordingId);
      if (!recording) {
        console.log(`❌ [DEBUG] Recording not found: ${recordingId}`);
        this.logger.error(`Gravação não encontrada: ${recordingId}`);
        return null;
      }

      console.log(`✅ [DEBUG] Recording found:`, { id: recording.id, filename: recording.filename, file_path: recording.file_path, local_path: recording.local_path });

      // Buscar arquivo
      const filePath = await this.findRecordingFile(recording);
      if (!filePath) {
        console.log(`❌ [DEBUG] File not found for recording: ${recordingId}`);
        this.logger.error(`Arquivo não encontrado para gravação: ${recordingId}`);
        return null;
      }

      console.log(`📁 [DEBUG] File path found: ${filePath}`);

      // Verificar se arquivo existe
      try {
        const stats = await fs.stat(filePath);
        console.log(`✅ [DEBUG] File exists, size: ${stats.size} bytes`);
        
        return {
          filePath,
          fileSize: stats.size,
          recording
        };
      } catch (error) {
        console.log(`❌ [DEBUG] Error accessing file: ${filePath}`, error.message);
        this.logger.error(`Erro ao acessar arquivo: ${filePath}`, error);
        return null;
      }
    } catch (error) {
      console.log(`❌ [DEBUG] Error in preparePlayback: ${recordingId}`, error.message);
      this.logger.error(`Erro ao preparar playback: ${recordingId}`, error);
      return null;
    }
  }

  /**
   * Preparar arquivo para download
   * Similar to preparePlayback but with download headers
   */
  async prepareDownload(recordingId) {
    return this.preparePlayback(recordingId);
  }

  /**
   * Criar stream de arquivo para reprodução
   * Required by /api/recording-files routes for streaming
   */
  createFileStream(filePath, range = null) {
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const fileStats = fsSync.statSync(filePath);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStats.size - 1;
      
      return fsSync.createReadStream(filePath, { start, end });
    } else {
      // Full file stream
      return fsSync.createReadStream(filePath);
    }
  }

  /**
   * Get recordings (wrapper for searchRecordings)
   */
  async getRecordings(filters = {}, userId = null) {
    try {
      const result = await this.searchRecordings(userId, filters);
      // Return just the data array for backward compatibility
      return result.data || result || [];
    } catch (error) {
      this.logger.error('Erro ao obter gravações:', error);
      return [];
    }
  }

  /**
   * Get recording statistics (comprehensive implementation)
   */
  async getRecordingStats(userId = null, period = '7d') {
    try {
      this.logger.info(`📊 Calculando estatísticas de gravações...`);
      
      // Buscar estatísticas gerais
      const { data: generalStats, error: generalError } = await this.supabase
        .from('recordings')
        .select('id, file_size, duration, status, created_at');

      if (generalError) {
        this.logger.error('Erro ao buscar estatísticas gerais:', generalError);
        throw generalError;
      }

      const recordings = generalStats || [];
      this.logger.info(`📊 Total de registros encontrados: ${recordings.length}`);

      // Calcular data de hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Estatísticas básicas
      const total = recordings.length;
      const today_count = recordings.filter(r => new Date(r.created_at) >= today).length;
      const totalSize = recordings.reduce((sum, r) => sum + (r.file_size || 0), 0);
      
      // Calcular duração média (apenas de gravações com duração)
      const recordingsWithDuration = recordings.filter(r => r.duration && r.duration > 0);
      const avgDuration = recordingsWithDuration.length > 0 
        ? recordingsWithDuration.reduce((sum, r) => sum + r.duration, 0) / recordingsWithDuration.length 
        : 0;

      // Buscar gravações ativas
      const { data: activeRecordings, error: activeError } = await this.supabase
        .from('recordings')
        .select('camera_id')
        .eq('status', 'recording');

      if (activeError) {
        this.logger.warn('Erro ao buscar gravações ativas:', activeError);
      }

      const activeRecordingsCount = activeRecordings?.length || 0;
      const activeCameras = activeRecordings ? [...new Set(activeRecordings.map(r => r.camera_id))] : [];

      const stats = {
        // Compatibilidade com frontend RecordingsPage.tsx
        totalRecordings: total,
        activeRecordings: activeRecordingsCount,
        pendingUploads: recordings.filter(r => r.status === 'processing' || r.status === 'uploading').length,
        storageUsed: {
          s3: 0, // Placeholder - seria calculado do S3
          local: totalSize
        },
        uploadQueue: {
          pending: recordings.filter(r => r.status === 'processing').length,
          processing: recordings.filter(r => r.status === 'uploading').length,
          failed: recordings.filter(r => r.status === 'failed' || r.status === 'error').length
        },
        totalSegments: total, // Simplificação - cada gravação é um segmento
        
        // Campos originais para compatibilidade com Recordings.tsx
        total,
        today: today_count,
        totalSize,
        avgDuration: Math.round(avgDuration),
        activeCameras: activeCameras,
        completed: recordings.filter(r => r.status === 'completed').length,
        failed: recordings.filter(r => r.status === 'failed' || r.status === 'error').length,
        processing: recordings.filter(r => r.status === 'processing').length
      };

      this.logger.info(`📊 Estatísticas calculadas:`, JSON.stringify(stats, null, 2));
      return stats;

    } catch (error) {
      this.logger.error('Erro ao obter estatísticas:', error);
      return {
        // Compatibilidade com frontend RecordingsPage.tsx
        totalRecordings: 0,
        activeRecordings: 0,
        pendingUploads: 0,
        storageUsed: {
          s3: 0,
          local: 0
        },
        uploadQueue: {
          pending: 0,
          processing: 0,
          failed: 0
        },
        totalSegments: 0,
        
        // Campos originais para compatibilidade com Recordings.tsx
        total: 0,
        today: 0,
        totalSize: 0,
        avgDuration: 0,
        activeCameras: [],
        completed: 0,
        failed: 0,
        processing: 0
      };
    }
  }

  /**
   * Get recording trends (stub implementation)
   */
  async getTrends(userId = null, period = '7d') {
    try {
      // Calcular período baseado no parâmetro
      let hours = 24;
      if (period === '7d') hours = 24 * 7;
      if (period === '30d') hours = 24 * 30;
      
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);
      
      // Buscar gravações no período
      const { data: recordings } = await this.supabase
        .from('recordings')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      // Gerar dados por hora para o gráfico
      const hourlyData = [];
      const now = new Date();
      
      for (let i = 0; i < Math.min(hours, 24); i++) {
        const hour = new Date(now);
        hour.setHours(hour.getHours() - (23 - i));
        hour.setMinutes(0, 0, 0);
        
        const nextHour = new Date(hour);
        nextHour.setHours(nextHour.getHours() + 1);
        
        const hourRecordings = recordings?.filter(r => {
          const recordingTime = new Date(r.created_at);
          return recordingTime >= hour && recordingTime < nextHour;
        }) || [];
        
        hourlyData.push({
          time: hour.toISOString(),
          hour: hour.getHours(),
          uploads: hourRecordings.filter(r => r.upload_status === 'uploaded').length,
          total: hourRecordings.length,
          failures: hourRecordings.filter(r => r.upload_status === 'failed').length,
          size: hourRecordings.reduce((sum, r) => sum + (r.file_size || 0), 0)
        });
      }
      
      return {
        hourly: hourlyData,
        uploads: recordings?.filter(r => r.upload_status === 'uploaded') || [],
        failures: recordings?.filter(r => r.upload_status === 'failed') || [],
        period,
        totalUploads: recordings?.filter(r => r.upload_status === 'uploaded').length || 0,
        totalFailures: recordings?.filter(r => r.upload_status === 'failed').length || 0
      };
    } catch (error) {
      this.logger.error('Erro ao obter tendências:', error);
      return {
        hourly: [],
        uploads: [],
        failures: [],
        period,
        totalUploads: 0,
        totalFailures: 0
      };
    }
  }

  /**
   * Formatar duração em segundos para formato legível
   */
  formatDuration(duration) {
    if (!duration || duration <= 0) return '0:00';
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Formatar tamanho do arquivo em bytes para formato legível
   */
  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
  }

  /**
   * Processa a fila de uploads para o Wasabi S3 (método stub)
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processUploadQueue() {
    this.logger.debug('📤 [RecordingService] processUploadQueue chamado (método stub)');
    return {
      processed: 0,
      success: 0,
      failed: 0,
      message: 'Upload queue processing not implemented'
    };
  }

  /**
   * Iniciar verificador de timeout para gravações longas
   */
  startTimeoutChecker() {
    // Verificar gravações ativas a cada 5 minutos
    setInterval(() => {
      this.checkRecordingTimeouts().catch(error => {
        this.logger.error('[RecordingService] Erro no verificador de timeout:', error);
      });
    }, 5 * 60 * 1000); // 5 minutos

    this.logger.info('[RecordingService] Verificador de timeout iniciado (5min)');
  }

  /**
   * Buscar segmentos de uma gravação (arquivos relacionados)
   */
  async getRecordingSegments(recordingId, cameraId, filename) {
    try {
      if (!cameraId || !filename) {
        this.logger.warn(`⚠️ getRecordingSegments: parametros faltando`, { recordingId, cameraId, filename });
        return [];
      }

      // Limpar filename se começar com ponto
      let cleanFilename = filename;
      if (cleanFilename.startsWith('.')) {
        cleanFilename = cleanFilename.substring(1);
      }

      // Buscar outros arquivos da mesma câmera no mesmo período
      const baseFilename = cleanFilename.replace(/\.\w+$/, ''); // Remove extensão
      const timePattern = baseFilename.match(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
      
      if (!timePattern) {
        this.logger.warn(`⚠️ getRecordingSegments: padrão de tempo não encontrado no filename`, { filename, cleanFilename, baseFilename });
        return [];
      }

      const timePrefix = timePattern[1];
      
      this.logger.info(`🔍 Buscando segmentos relacionados:`, {
        recordingId,
        cameraId,
        originalFilename: filename,
        cleanFilename,
        timePrefix,
        searchPattern: `${timePrefix}%`
      });
      
      // Buscar gravações relacionadas no banco - incluir variações com/sem ponto
      const { data: relatedRecordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, file_size, duration, file_path, status, created_at')
        .eq('camera_id', cameraId)
        .or(`filename.ilike.${timePrefix}%,filename.ilike..${timePrefix}%`)
        .order('filename');

      if (error) {
        this.logger.error(`❌ Erro ao buscar gravações relacionadas:`, error);
        return [];
      }

      if (!relatedRecordings || relatedRecordings.length === 0) {
        this.logger.warn(`⚠️ Nenhuma gravação relacionada encontrada:`, {
          recordingId,
          cameraId,
          timePrefix,
          searchAttempted: `${timePrefix}% OR .${timePrefix}%`
        });
        return [];
      }

      this.logger.info(`✅ Encontradas ${relatedRecordings.length} gravações relacionadas:`, {
        recordings: relatedRecordings.map(r => ({
          id: r.id,
          filename: r.filename,
          status: r.status,
          size: r.file_size
        }))
      });

      // Formatar segmentos
      return relatedRecordings.map((rec, index) => ({
        id: rec.id,
        filename: rec.filename || `segment-${index + 1}.mp4`,
        size: rec.file_size || 0,
        duration: rec.duration || 0,
        status: rec.status || 'unknown',
        uploadStatus: 'completed', // Simplificado por enquanto
        path: rec.file_path,
        created_at: rec.created_at
      }));

    } catch (error) {
      this.logger.error(`❌ Erro ao buscar segmentos da gravação ${recordingId}:`, error);
      return [];
    }
  }

  /**
   * Verificar gravações que excedem o timeout e marcar como completed
   */
  async checkRecordingTimeouts() {
    try {
      const timeoutDate = new Date(Date.now() - this.recordingTimeout).toISOString();
      
      const { data: expiredRecordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('status', 'recording')
        .lt('start_time', timeoutDate);

      if (error) {
        this.logger.error('[RecordingService] Erro ao buscar gravações expiradas:', error);
        return;
      }

      if (!expiredRecordings || expiredRecordings.length === 0) {
        return; // Nenhuma gravação expirada
      }

      this.logger.info(`[RecordingService] Encontradas ${expiredRecordings.length} gravações expiradas por timeout`);

      for (const recording of expiredRecordings) {
        try {
          const now = new Date().toISOString();
          const duration = Math.round((Date.now() - new Date(recording.start_time).getTime()) / 1000);

          const updateData = {
            status: 'completed',
            ended_at: now,
            end_time: now,
            duration: duration,
            metadata: {
              ...recording.metadata,
              timeout_stopped: true,
              timeout_reason: 'automatic_30min_timeout',
              stopped_at: now
            },
            updated_at: now
          };

          const { error: updateError } = await this.supabase
            .from('recordings')
            .update(updateData)
            .eq('id', recording.id);

          if (updateError) {
            this.logger.error(`[RecordingService] Erro ao atualizar gravação expirada ${recording.id}:`, updateError);
          } else {
            this.logger.info(`⏰ [RecordingService] Gravação ${recording.id} marcada como completed por timeout (${Math.round(duration/60)}min)`);
          }

        } catch (recordingError) {
          this.logger.error(`[RecordingService] Erro ao processar gravação expirada ${recording.id}:`, recordingError);
        }
      }

    } catch (error) {
      this.logger.error('[RecordingService] Erro geral no verificador de timeout:', error);
    }
  }
}

// Singleton
const recordingService = new RecordingService();

export default recordingService;