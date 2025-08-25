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
import uploadQueueService from './UploadQueueService.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('RecordingService');

class RecordingService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.logger = logger;
    
    // Configuração ZLMediaKit
    this.zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    
    // Usar PathResolver para caminhos consistentes
    this.pathResolver = PathResolver;
    this.recordingsBasePath = this.pathResolver.resolveToAbsolute('storage/www/record/live');
    
    // Timeout automático para gravações (30 minutos)
    this.recordingTimeout = 30 * 60 * 1000; // 30 minutos em ms
    
    // Serviço de upload
    this.uploadQueueService = uploadQueueService;
    
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
    // Delegar para PathResolver para consistência
    return this.pathResolver.resolveToAbsolute(relativePath);
  }

  /**
   * Buscar arquivo de gravação - USANDO PathResolver OTIMIZADO
   */
  async findRecordingFile(recording) {
    this.logger.info(`🔍 Buscando arquivo para gravação: ${recording.id}`);
    
    // Usar PathResolver para busca robusta e consistente
    const PathResolver = (await import('../utils/PathResolver.js')).default;
    
    try {
      const result = await PathResolver.findRecordingFile(recording);
      
      if (result && result.exists) {
        this.logger.info(`✅ Arquivo encontrado via PathResolver: ${result.absolutePath}`);
        return result.absolutePath;
      } else {
        this.logger.warn(`❌ Arquivo não encontrado para gravação: ${recording.id}`, {
          recording: {
            filename: recording.filename,
            file_path: recording.file_path,
            local_path: recording.local_path,
            camera_id: recording.camera_id
          }
        });
        return null;
      }
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar arquivo para gravação ${recording.id}:`, error);
      return null;
    }
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
      
      // Generate proper filename without leading dot
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const filename = `${timestamp}-${streamId}.mp4`;
      const customPath = `record/live/${streamId}/${now.toISOString().slice(0, 10)}/${filename}`;
      
      const response = await axios.post(`${this.zlmApiUrl}/startRecord`, null, {
        params: {
          secret: this.zlmSecret,
          type: 1, // MP4
          vhost: '__defaultVhost__',
          app: app,
          stream: streamId,
          customized_path: customPath
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
        
        // FALLBACK ROBUSTO DE DURAÇÃO - múltiplas fontes
        let duration = recording.duration || 0;
        
        // Tentativa 1: calcular por start_time e end_time
        if (!duration && recording.start_time && recording.end_time) {
          const startTime = new Date(recording.start_time);
          const endTime = new Date(recording.end_time);
          const calculatedDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          
          if (calculatedDuration > 0 && calculatedDuration < 7200) { // Máximo 2 horas válido
            duration = calculatedDuration;
            this.logger.debug(`📊 Duração calculada por timestamps para ${recording.id}: ${duration}s`);
          }
        }
        
        // Tentativa 2: calcular por started_at e ended_at se timestamps principais falharem
        if (!duration && recording.started_at && recording.ended_at) {
          const startTime = new Date(recording.started_at);
          const endTime = new Date(recording.ended_at);
          const calculatedDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          
          if (calculatedDuration > 0 && calculatedDuration < 7200) { // Máximo 2 horas válido
            duration = calculatedDuration;
            this.logger.debug(`📊 Duração calculada por started/ended para ${recording.id}: ${duration}s`);
          }
        }
        
        // Tentativa 3: duração padrão baseada no status se nada funcionar
        if (!duration && recording.status === 'completed') {
          duration = 30; // Duração padrão de 30s para gravações completed sem duração
          this.logger.debug(`📊 Duração padrão aplicada para ${recording.id}: ${duration}s`);
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
          download_url: `http://localhost:3002/api/recording-files/${recording.id}/download`,
          stream_url: `http://localhost:3002/api/recording-files/${recording.id}/play`,
          play_web_url: `http://localhost:3002/api/recording-files/${recording.id}/play-web`,
          file_exists: hasValidFile,
          file_valid: hasValidFile && hasValidSize,
          playable: hasValidFile && (recording.status === 'completed' || recording.status === 'uploaded'),
          cameras: camera, // Manter compatibilidade com frontend
          segments: [], // Will be populated separately if needed
          // Upload-related fields for frontend status display
          upload_status: recording.upload_status || 'pending',
          uploadStatus: recording.upload_status || 'pending', // Camel case for frontend compatibility
          s3_key: recording.s3_key || null,
          s3Key: recording.s3_key || null,
          s3_url: recording.s3_url || null,
          s3Url: recording.s3_url || null,
          localPath: recording.local_path || recording.file_path,
          uploaded_at: recording.uploaded_at,
          upload_progress: recording.upload_progress || null,
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

      console.log(`✅ [DEBUG] Recording found:`, { id: recording.id, filename: recording.filename, file_path: recording.file_path, local_path: recording.local_path, upload_status: recording.upload_status, s3_key: recording.s3_key });

      // Try local file first
      const filePath = await this.findRecordingFile(recording);
      if (filePath) {
        try {
          const stats = await fs.stat(filePath);
          console.log(`✅ [DEBUG] Local file exists, size: ${stats.size} bytes`);
          
          return {
            filePath,
            fileSize: stats.size,
            recording,
            source: 'local'
          };
        } catch (error) {
          console.log(`⚠️ [DEBUG] Local file access error: ${filePath}`, error.message);
          this.logger.warn(`Erro ao acessar arquivo local: ${filePath}`, error);
          // Continue to S3 fallback
        }
      }

      // Fallback to S3 if file uploaded and local not available
      if (recording.upload_status === 'uploaded' && recording.s3_key) {
        console.log(`🌐 [DEBUG] Falling back to S3: ${recording.s3_key}`);
        this.logger.info(`💾 Arquivo local não encontrado, usando S3: ${recording.s3_key}`, {
          recordingId: recording.id,
          filename: recording.filename,
          s3Key: recording.s3_key,
          uploadStatus: recording.upload_status,
          s3Size: recording.s3_size,
          uploadedAt: recording.uploaded_at
        });
        
        // Import S3Service dynamically to avoid circular imports
        const S3Service = (await import('./S3Service.js')).default;
        
        try {
          // BYPASS headObject check that causes 301/403 errors
          // Generate presigned URL directly since we know file exists (upload_status='uploaded')
          console.log(`🔍 [DEBUG] Bypassing headObject check, generating presigned URL directly for: ${recording.s3_key}`);
          
          // Generate presigned URL for streaming with string replacement fix
          const presignedUrl = await S3Service.getSignedUrl(recording.s3_key, {
            expiresIn: 3600, // 1 hour
            responseHeaders: {
              contentType: 'video/mp4',
              cacheControl: 'max-age=3600'
            }
          });

          console.log(`✅ [DEBUG] S3 presigned URL generated successfully with string replacement fix`);
          this.logger.info(`S3 presigned URL generated successfully (bypassed headObject)`, {
            recordingId: recording.id,
            s3Key: recording.s3_key,
            expiresIn: 3600,
            uploadStatus: recording.upload_status
          });
          
          return {
            s3Url: presignedUrl,
            s3Key: recording.s3_key,
            fileSize: recording.s3_size || recording.file_size || 0,
            recording,
            source: 's3',
            validation: {
              accessible: true,
              method: 'bypassed_headobject',
              uploadStatus: recording.upload_status
            }
          };
          
        } catch (s3Error) {
          console.log(`❌ [DEBUG] S3 access error:`, s3Error.message);
          this.logger.error(`Erro ao acessar S3: ${recording.s3_key}`, {
            error: s3Error.message,
            code: s3Error.code,
            recordingId: recording.id,
            stack: s3Error.stack
          });
          return null;
        }
      }

      console.log(`❌ [DEBUG] No playback source available for recording: ${recordingId}`);
      this.logger.error(`Nenhuma fonte de reprodução disponível para gravação: ${recordingId}`);
      return null;
      
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
      
      // Buscar estatísticas gerais (incluindo upload_status)
      const { data: generalStats, error: generalError } = await this.supabase
        .from('recordings')
        .select('id, file_size, duration, status, upload_status, created_at');

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

      // Calcular estatísticas de upload usando upload_status
      const uploadedRecordings = recordings.filter(r => r.upload_status === 'uploaded');
      const pendingUploads = recordings.filter(r => r.upload_status === 'pending' || r.upload_status === 'queued');
      const processingUploads = recordings.filter(r => r.upload_status === 'uploading');
      const failedUploads = recordings.filter(r => r.upload_status === 'failed');
      
      // Debug: Log upload status breakdown
      this.logger.info(`📊 [UPLOAD STATS] Breakdown:`, {
        total: recordings.length,
        uploaded: uploadedRecordings.length,
        pending: pendingUploads.length,
        processing: processingUploads.length,
        failed: failedUploads.length,
        uploadStatuses: recordings.map(r => ({ id: r.id, upload_status: r.upload_status, file_size: r.file_size }))
      });
      
      // Calcular tamanho S3 aproximado (gravações já enviadas)
      const s3Size = uploadedRecordings.reduce((sum, r) => sum + (r.file_size || 0), 0);

      const stats = {
        // Compatibilidade com frontend RecordingsPage.tsx
        totalRecordings: total,
        activeRecordings: activeRecordingsCount,
        pendingUploads: pendingUploads.length,
        failedUploads: failedUploads.length,
        storageUsed: {
          s3: s3Size,
          local: totalSize
        },
        uploadQueue: {
          pending: pendingUploads.length,
          processing: processingUploads.length,
          failed: failedUploads.length
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

      console.log('🔍 [DEBUG] Stats object before return:', JSON.stringify(stats, null, 2));
      this.logger.info(`📊 Estatísticas calculadas:`, JSON.stringify(stats, null, 2));
      return stats;

    } catch (error) {
      this.logger.error('Erro ao obter estatísticas:', error);
      return {
        // Compatibilidade com frontend RecordingsPage.tsx
        totalRecordings: 0,
        activeRecordings: 0,
        pendingUploads: 0,
        failedUploads: 0,
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
  async getTrends(userId = null, period = '24h') {
    try {
      const now = new Date();
      let startDate;
      
      // Calculate start date based on period
      if (period === '24h') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (period === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
      }

      this.logger.info(`📊 Fetching upload trends from ${startDate} to ${now}`);

      // Query upload statistics from recordings table
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('upload_status, created_at, updated_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error('Error fetching upload trends:', error);
        throw error;
      }

      // Group by hour for 24h charts
      const hourlyData = {};
      const hours = 24;
      
      // Initialize hourly buckets
      for (let i = 0; i < hours; i++) {
        const hour = new Date(startDate.getTime() + i * 60 * 60 * 1000);
        const hourKey = hour.getHours().toString().padStart(2, '0') + ':00';
        hourlyData[hourKey] = {
          time: hourKey,
          uploads: 0,     // Renamed from successful
          failures: 0,    // Renamed from failed
          size: 0,        // Added size field
          pending: 0,
          total: 0
        };
      }

      // Process recordings and count by status
      recordings?.forEach(recording => {
        const recordingTime = new Date(recording.created_at);
        const hourKey = recordingTime.getHours().toString().padStart(2, '0') + ':00';
        
        if (hourlyData[hourKey]) {
          hourlyData[hourKey].total++;
          
          const status = recording.upload_status;
          const fileSize = recording.file_size || recording.s3_size || 0;
          
          if (status === 'uploaded') {
            hourlyData[hourKey].uploads++;
            hourlyData[hourKey].size += fileSize;
          } else if (status === 'failed') {
            hourlyData[hourKey].failures++;
          } else if (status === 'pending' || status === 'queued' || status === 'uploading') {
            hourlyData[hourKey].pending++;
          }
        }
      });

      // Convert to array format expected by frontend
      const hourly = Object.values(hourlyData);
      
      // Calculate totals
      const totals = hourly.reduce((acc, hour) => ({
        uploads: acc.uploads + hour.uploads,
        failures: acc.failures + hour.failures,
        pending: acc.pending + hour.pending,
        total: acc.total + hour.total,
        size: acc.size + hour.size
      }), { uploads: 0, failures: 0, pending: 0, total: 0, size: 0 });

      this.logger.info(`✅ Upload trends calculated:`, {
        period,
        recordingsFound: recordings?.length || 0,
        totals
      });

      return {
        period,
        hourly,
        totals
      };
      
    } catch (error) {
      this.logger.error('Erro ao obter tendências:', error);
      return {
        period,
        hourly: [],
        totals: { uploads: 0, failures: 0, pending: 0, total: 0, size: 0 }
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
   * Processa a fila de uploads para o Wasabi S3
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processUploadQueue() {
    this.logger.debug('📤 [RecordingService] Processando fila de uploads...');
    
    try {
      // Verificar se upload está habilitado
      const uploadEnabled = process.env.S3_UPLOAD_ENABLED === 'true';
      if (!uploadEnabled) {
        this.logger.debug('📤 Upload S3 desabilitado via env var');
        return {
          processed: 0,
          success: 0,
          failed: 0,
          message: 'S3 upload disabled'
        };
      }

      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalFailed = 0;

      // Buscar gravações elegíveis para upload
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, filename, status, upload_status')
        .eq('status', 'completed')
        .in('upload_status', ['pending', 'failed'])
        .limit(10); // Processar até 10 por vez

      if (error) {
        this.logger.error('📤 Erro ao buscar gravações para upload:', error);
        throw error;
      }

      if (!recordings || recordings.length === 0) {
        this.logger.debug('📤 Nenhuma gravação pendente para upload');
        return {
          processed: 0,
          success: 0,
          failed: 0,
          message: 'No recordings pending upload'
        };
      }

      this.logger.info(`📤 Encontradas ${recordings.length} gravações para upload`);

      // Processar cada gravação
      for (const recording of recordings) {
        try {
          this.logger.debug(`📤 Enfileirando gravação: ${recording.id}`);
          await this.uploadQueueService.enqueue(recording.id);
          totalProcessed++;
          totalSuccess++;
        } catch (error) {
          this.logger.error(`📤 Erro ao enfileirar ${recording.id}:`, error);
          totalProcessed++;
          totalFailed++;
        }
      }

      const result = {
        processed: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        message: `Processed ${totalProcessed} recordings (${totalSuccess} success, ${totalFailed} failed)`
      };

      this.logger.info('📤 Resultado do processamento da fila:', result);
      return result;

    } catch (error) {
      this.logger.error('📤 Erro crítico no processamento da fila:', error);
      return {
        processed: 0,
        success: 0,
        failed: 0,
        message: `Error: ${error.message}`
      };
    }
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

  /**
   * Atualiza estatísticas das gravações
   * Recalcula métricas, duração, tamanhos, etc.
   */
  async updateRecordingStatistics() {
    try {
      this.logger.info('🔄 Iniciando atualização de estatísticas das gravações...');
      
      let updated = 0;
      
      // Buscar gravações que precisam de atualização de estatísticas
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('*')
        .or('duration.is.null,file_size.is.null')
        .order('created_at', { ascending: false })
        .limit(100); // Processar em lotes de 100
      
      if (error) {
        this.logger.error('Erro ao buscar gravações para atualização:', error);
        throw error;
      }
      
      if (!recordings || recordings.length === 0) {
        this.logger.info('✅ Todas as gravações já possuem estatísticas atualizadas');
        return { updated: 0, total: 0 };
      }
      
      this.logger.info(`📊 Processando ${recordings.length} gravações para atualização de estatísticas`);
      
      for (const recording of recordings) {
        try {
          let hasUpdates = false;
          const updateData = {};
          
          // Se não tem duração, tentar extrair do arquivo
          if (!recording.duration || recording.duration === 0) {
            const filePath = await this.findRecordingFile(recording);
            if (filePath) {
              try {
                // Usar VideoMetadataExtractor se disponível
                const VideoMetadataExtractor = (await import('../utils/videoMetadata.js')).VideoMetadataExtractor;
                const extractor = new VideoMetadataExtractor();
                const metadata = await extractor.extractMetadata(filePath);
                
                if (metadata.duration) {
                  updateData.duration = Math.round(metadata.duration);
                  hasUpdates = true;
                }
                
                if (metadata.fileSize && !recording.file_size) {
                  updateData.file_size = metadata.fileSize;
                  hasUpdates = true;
                }
                
              } catch (metadataError) {
                this.logger.warn(`Erro ao extrair metadados para ${recording.filename}:`, metadataError.message);
              }
            }
          }
          
          // Aplicar atualizações se houver
          if (hasUpdates) {
            updateData.updated_at = new Date().toISOString();
            
            const { error: updateError } = await this.supabase
              .from('recordings')
              .update(updateData)
              .eq('id', recording.id);
            
            if (updateError) {
              this.logger.error(`Erro ao atualizar gravação ${recording.id}:`, updateError);
            } else {
              updated++;
              this.logger.debug(`✅ Estatísticas atualizadas para ${recording.filename}`);
            }
          }
          
        } catch (recordingError) {
          this.logger.error(`Erro ao processar gravação ${recording.id}:`, recordingError);
        }
      }
      
      this.logger.info(`📊 Atualização de estatísticas concluída: ${updated}/${recordings.length} gravações atualizadas`);
      
      return {
        updated,
        total: recordings.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error('Erro ao atualizar estatísticas das gravações:', error);
      throw error;
    }
  }
}

// Singleton
const recordingService = new RecordingService();

export default recordingService;