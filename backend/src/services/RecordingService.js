import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';
import S3Service from './S3Service.js';
import VideoMetadataExtractor from '../utils/videoMetadata.js';

class RecordingService {
  constructor() {
    // Usando SERVICE_ROLE_KEY para operações administrativas
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Diretórios de armazenamento
    this.recordingsPath = path.resolve(process.cwd(), process.env.RECORDINGS_PATH || './storage/bin/www/record');
    this.exportsPath = path.resolve(process.cwd(), process.env.EXPORTS_PATH || './storage/exports');
    
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
      
      // CORREÇÃO: Verificar se já existe uma gravação ativa para esta câmera
      const { data: activeRecording, error: activeError } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .single();
      
      if (!activeError && activeRecording) {
        logger.warn(`[RecordingService] Gravação já ativa para câmera ${cameraId}: ${activeRecording.id}`);
        return {
          success: true,
          recordingId: activeRecording.id,
          message: 'Gravação já está ativa para esta câmera',
          isExisting: true
        };
      }
      
      // Usar o ID da câmera como nome do stream (igual ao StreamingService)
      // Isso garante consistência entre os serviços
      const recordParams = {
        type: 0, // 0=hls+mp4, 1=hls, 2=mp4
        vhost: '__defaultVhost__',
        app: 'live',
        stream: cameraId, // Usar ID da câmera como nome do stream
        customized_path: `recordings/${cameraId}`,
        max_second: 1800, // 30 minutos máximo por arquivo
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
   * Pausar gravação de uma câmera
   */
  async pauseRecording(cameraId, recordingId = null) {
    try {
      logger.info(`[RecordingService] Pausando gravação para câmera ${cameraId}`);
      
      // Buscar dados da câmera
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();
      
      if (cameraError || !camera) {
        throw new Error(`Câmera ${cameraId} não encontrada`);
      }
      
      // Atualizar status das gravações ativas para 'completed' (pausar = finalizar segmento atual)
      const { data: pausedRecordings, error: pauseError } = await this.supabase
        .from('recordings')
        .update({ 
          status: 'completed',
          end_time: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .select();
      
      if (pauseError) {
        logger.error('[RecordingService] Erro ao pausar gravações:', pauseError);
        throw pauseError;
      }
      
      // Configurar parâmetros para parar gravação no ZLMediaKit
      const stopParams = {
        type: 0,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: cameraId,
        secret: process.env.ZLMEDIAKIT_SECRET
      };
      
      logger.info(`[RecordingService] Parâmetros para pausar:`, stopParams);
      
      // Chamar API do ZLMediaKit para parar gravação
      const zlmResponse = await axios.get(
        `${process.env.ZLMEDIAKIT_API_URL}/index/api/stopRecord`,
        { params: stopParams }
      );
      
      logger.info(`[RecordingService] Resposta ZLMediaKit (pause):`, zlmResponse.data);
      
      return {
        success: true,
        message: 'Gravação pausada com sucesso',
        paused_recordings: pausedRecordings,
        zlm_response: zlmResponse.data
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao pausar gravação:', error);
      throw error;
    }
  }

  /**
   * Retomar gravação de uma câmera
   */
  async resumeRecording(cameraId) {
    try {
      logger.info(`[RecordingService] Retomando gravação para câmera ${cameraId}`);
      
      // Buscar dados da câmera
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();
      
      if (cameraError || !camera) {
        throw new Error(`Câmera ${cameraId} não encontrada`);
      }
      
      // Verificar se há gravações recentemente pausadas (completed nos últimos 5 minutos)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: pausedRecordings, error: pausedError } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'completed')
        .gte('updated_at', fiveMinutesAgo);
      
      if (pausedError) {
        throw pausedError;
      }
      
      if (!pausedRecordings || pausedRecordings.length === 0) {
        throw new Error('Nenhuma gravação pausada encontrada para esta câmera');
      }
      
      // Iniciar nova gravação (o ZLMediaKit criará um novo segmento)
      const result = await this.startRecording(cameraId);
      
      // As gravações já estão como 'completed', apenas logamos a retomada
      logger.info(`[RecordingService] Retomando após ${pausedRecordings.length} gravação(ões) pausada(s)`);
      
      return {
        success: true,
        message: 'Gravação retomada com sucesso',
        new_recording: result,
        completed_recordings: pausedRecordings.length
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao retomar gravação:', error);
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
      
      // CORREÇÃO: Finalizar todas as gravações ativas desta câmera antes de parar
      const { data: activeRecordings, error: activeError } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording');
      
      if (!activeError && activeRecordings && activeRecordings.length > 0) {
        logger.info(`[RecordingService] Finalizando ${activeRecordings.length} gravação(ões) ativa(s) da câmera ${cameraId}`);
        
        for (const recording of activeRecordings) {
          await this.supabase
            .from('recordings')
            .update({
              status: 'completed',
              end_time: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', recording.id);
          
          logger.info(`[RecordingService] Gravação ${recording.id} finalizada`);
        }
      }
      
      // Configurar parâmetros para parar gravação
      // Usar o ID da câmera como nome do stream (igual ao StreamingService)
      const stopParams = {
        type: 0,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: cameraId, // Usar ID da câmera como nome do stream
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
      
      // Atualizar status no banco se recordingId específico foi fornecido
      if (recordingId) {
        await this.updateRecordingStatus(recordingId, 'completed');
      }
      
      logger.info(`[RecordingService] Gravação parada com sucesso`);
      
      return {
        success: true,
        message: 'Gravação parada com sucesso',
        zlmResponse: zlmResponse.data,
        finalized_recordings: activeRecordings?.length || 0
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
      const now = new Date().toISOString();
      
      const { data, error } = await this.supabase
        .from('recordings')
        .insert([{
          id: recordingId,
          camera_id: cameraId,
          filename: `recording_${Date.now()}`,
          file_path: params.customized_path,
          start_time: now, // Campo obrigatório
          started_at: now, // Timestamp quando a gravação foi iniciada
          status: 'recording',
          created_at: now,
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
  async updateRecordingStatus(recordingId, status, uploadStatus = null) {
    try {
      const updateData = {
        status: status,
        updated_at: new Date().toISOString()
      };
      
      // Atualizar upload_status se fornecido
      if (uploadStatus !== null) {
        updateData.upload_status = uploadStatus;
      }
      
      const { error } = await this.supabase
        .from('recordings')
        .update(updateData)
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
      const statusMsg = uploadStatus ? `${status} (upload: ${uploadStatus})` : status;
      logger.info(`[RecordingService] Status de gravação ${recordingId} atualizado para: ${statusMsg}`);
    } catch (error) {
      logger.error('Erro ao atualizar status de gravação:', error);
      throw error;
    }
  }

  /**
   * Atualizar erro de upload
   */
  async updateUploadError(recordingId, errorMessage) {
    try {
      const { error } = await this.supabase
        .from('recordings')
        .update({
          status: 'failed',
          upload_status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);
      
      if (error) {
        throw error;
      }
      
      logger.error(`[RecordingService] Erro de upload registrado para gravação ${recordingId}: ${errorMessage}`);
    } catch (error) {
      logger.error('Erro ao atualizar erro de upload:', error);
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
   * Buscar gravações com filtros e paginação
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

      // Buscar câmeras do usuário usando o modelo Camera
      const { Camera } = await import('../models/Camera.js');
      const cameras = await Camera.findByUserId(userId);
      
      logger.debug(`[RecordingService] searchRecordings - userId: ${userId}, cameras encontradas: ${cameras.length}`);
      if (cameras.length > 0) {
        logger.debug(`[RecordingService] IDs das câmeras: ${cameras.map(c => c.id).join(', ')}`);
      }

      if (!cameras || cameras.length === 0) {
        return {
          data: [],
          recordings: [], // Manter compatibilidade
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0,
          appliedFilters: {
            camera_id,
            start_date,
            end_date,
            duration_min,
            duration_max,
            file_size_min,
            file_size_max,
            quality,
            event_type,
            sort_by,
            sort_order
          }
        };
      }

      const cameraIds = cameras.map(cam => cam.id);

      // Construir query base
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (id, name, location)
        `, { count: 'exact' })
        .in('camera_id', cameraIds);

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

      // Aplicar ordenação
      const ascending = sort_order === 'asc';
      query = query.order(sort_by, { ascending });

      // Aplicar paginação
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const total = count || 0;
      const pages = Math.ceil(total / limit);

      return {
        data: data || [],
        recordings: data || [], // Manter compatibilidade
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages,
        appliedFilters: {
          camera_id,
          start_date,
          end_date,
          duration_min,
          duration_max,
          file_size_min,
          file_size_max,
          quality,
          event_type,
          sort_by,
          sort_order
        }
      };
    } catch (error) {
      logger.error('Erro ao buscar gravações com filtros:', error);
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
  async getRecordingById(recordingId, userId = null) {
    try {
      let query = this.supabase
        .from('recordings')
        .select(`
          *,
          cameras:camera_id (id, name)
        `)
        .eq('id', recordingId);

      // Se userId for fornecido, verificar permissões
      if (userId) {
        const { Camera } = await import('../models/Camera.js');
        const cameras = await Camera.findByUserId(userId);
        
        if (!cameras || cameras.length === 0) {
          return null;
        }
        
        const cameraIds = cameras.map(cam => cam.id);
        query = query.in('camera_id', cameraIds);
      }

      const { data, error } = await query.single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Não encontrado
        }
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
  async deleteRecording(recordingId, userId = null) {
    try {
      // Buscar gravação para obter caminho do arquivo
      const recording = await this.getRecordingById(recordingId, userId);
      
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
   * Deletar múltiplas gravações
   */
  async deleteRecordings(recordingIds, userId = null) {
    try {
      logger.info(`[RecordingService] Deletando ${recordingIds.length} gravações`);
      
      let deletedCount = 0;
      let failedCount = 0;
      let freedSpace = 0;
      const errors = [];
      
      for (const recordingId of recordingIds) {
        try {
          // Buscar gravação para obter caminho do arquivo
          const recording = await this.getRecordingById(recordingId, userId);
          
          if (!recording) {
            failedCount++;
            errors.push(`Gravação ${recordingId} não encontrada`);
            continue;
          }
          
          // Deletar arquivo se existir
          if (recording.file_path) {
            const filePath = path.join(this.recordingsPath, recording.file_path);
            try {
              const stats = await fs.stat(filePath);
              freedSpace += stats.size;
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
            failedCount++;
            errors.push(`Erro ao deletar gravação ${recordingId}: ${error.message}`);
            logger.error(`[RecordingService] Erro ao deletar gravação ${recordingId}:`, error);
          } else {
            deletedCount++;
            logger.info(`[RecordingService] Gravação ${recordingId} deletada com sucesso`);
          }
          
        } catch (recordingError) {
          failedCount++;
          errors.push(`Erro ao processar gravação ${recordingId}: ${recordingError.message}`);
          logger.error(`[RecordingService] Erro ao processar gravação ${recordingId}:`, recordingError);
        }
      }
      
      const freedSpaceMB = (freedSpace / (1024 * 1024)).toFixed(2);
      
      logger.info(`[RecordingService] Deleção em lote concluída: ${deletedCount} deletadas, ${failedCount} falharam, ${freedSpaceMB} MB liberados`);
      
      return {
        deletedCount,
        failedCount,
        freedSpace,
        freedSpaceMB: parseFloat(freedSpaceMB),
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro na deleção em lote:', error);
      throw error;
    }
  }

  /**
   * Verificar acesso em lote a gravações
   */
  async checkBulkAccess(recordingIds, userId) {
    try {
      const accessibleIds = [];
      const inaccessibleIds = [];
      
      for (const recordingId of recordingIds) {
        try {
          const recording = await this.getRecordingById(recordingId, userId);
          if (recording) {
            accessibleIds.push(recordingId);
          } else {
            inaccessibleIds.push(recordingId);
          }
        } catch (error) {
          inaccessibleIds.push(recordingId);
        }
      }
      
      return {
        allAccessible: inaccessibleIds.length === 0,
        accessibleIds,
        inaccessibleIds
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao verificar acesso em lote:', error);
      throw error;
    }
  }

  /**
   * Exportar gravação
   */
  async exportRecording(recordingId, format = 'zip', userId = null) {
    try {
      const recording = await this.getRecordingById(recordingId, userId);
      
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

  /**
   * Limpar gravações antigas baseado na configuração de retenção
   */
  async cleanupOldRecordings(daysToKeep = null) {
    try {
      // Usar configuração padrão se não especificado
      const retentionDays = daysToKeep || parseInt(process.env.RECORDING_RETENTION_DAYS) || 30;
      
      // Calcular data de corte
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      logger.info(`[RecordingService] Iniciando limpeza de gravações anteriores a ${cutoffDate.toISOString()}`);
      
      // Buscar gravações antigas
      const { data: oldRecordings, error } = await this.supabase
        .from('recordings')
        .select('id, file_path, camera_id, created_at')
        .lt('created_at', cutoffDate.toISOString())
        .eq('status', 'completed');
      
      if (error) {
        throw error;
      }
      
      if (!oldRecordings || oldRecordings.length === 0) {
        logger.info('[RecordingService] Nenhuma gravação antiga encontrada para limpeza');
        return {
          deletedCount: 0,
          spaceFree: 0,
          message: 'Nenhuma gravação antiga encontrada'
        };
      }
      
      let deletedCount = 0;
      let spaceFree = 0;
      
      // Deletar cada gravação
      for (const recording of oldRecordings) {
        try {
          // Deletar arquivo físico se existir
          if (recording.file_path) {
            const filePath = path.join(this.recordingsPath, recording.file_path);
            try {
              const stats = await fs.stat(filePath);
              spaceFree += stats.size;
              await fs.unlink(filePath);
              logger.info(`[RecordingService] Arquivo deletado: ${filePath}`);
            } catch (fileError) {
              logger.warn(`[RecordingService] Erro ao deletar arquivo ${filePath}: ${fileError.message}`);
            }
          }
          
          // Deletar registro do banco
          const { error: deleteError } = await this.supabase
            .from('recordings')
            .delete()
            .eq('id', recording.id);
          
          if (deleteError) {
            logger.error(`[RecordingService] Erro ao deletar registro ${recording.id}:`, deleteError);
          } else {
            deletedCount++;
            logger.info(`[RecordingService] Gravação ${recording.id} deletada com sucesso`);
          }
          
        } catch (recordingError) {
          logger.error(`[RecordingService] Erro ao processar gravação ${recording.id}:`, recordingError);
        }
      }
      
      const spaceFreeMB = (spaceFree / (1024 * 1024)).toFixed(2);
      
      logger.info(`[RecordingService] Limpeza concluída: ${deletedCount} gravações deletadas, ${spaceFreeMB} MB liberados`);
      
      return {
        deletedCount,
        spaceFree: spaceFree,
        spaceFreeMB: parseFloat(spaceFreeMB),
        message: `${deletedCount} gravações antigas deletadas, ${spaceFreeMB} MB liberados`
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro na limpeza de gravações antigas:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de gravações
   */
  async getRecordingStats(userId, period = '7d') {
    try {
      // Calcular data de início baseado no período
      const startDate = new Date();
      switch (period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Buscar câmeras do usuário usando o modelo Camera
      const { Camera } = await import('../models/Camera.js');
      const cameras = await Camera.findByUserId(userId);

      if (!cameras || cameras.length === 0) {
        return {
          totalRecordings: 0,
          activeRecordings: 0,
          totalDuration: 0,
          totalSize: 0,
          averageDuration: 0,
          recordingsByStatus: {},
          recordingsByDay: [],
          totalSegments: 0,
          uploadedSize: 0,
          pendingUploads: 0,
          failedUploads: 0,
          storageUsed: {
            local: 0,
            s3: 0
          },
          uploadQueue: {
            pending: 0,
            processing: 0,
            failed: 0
          }
        };
      }

      const cameraIds = cameras.map(cam => cam.id);

      // Buscar gravações do período
      const { data: recordings, error: recordingsError } = await this.supabase
        .from('recordings')
        .select('*')
        .in('camera_id', cameraIds)
        .gte('created_at', startDate.toISOString());

      if (recordingsError) {
        throw recordingsError;
      }

      // Buscar gravações ativas (status = 'recording')
      const { data: activeRecordings, error: activeError } = await this.supabase
        .from('recordings')
        .select('*')
        .in('camera_id', cameraIds)
        .eq('status', 'recording');

      if (activeError) {
        this.logger.warn('Erro ao buscar gravações ativas:', activeError);
      }

      // Calcular estatísticas
      const totalRecordings = recordings.length;
      const activeRecordingsCount = activeRecordings?.length || 0;
      const totalDuration = recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
      const totalSize = recordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0);
      const averageDuration = totalRecordings > 0 ? totalDuration / totalRecordings : 0;

      // Agrupar por status
      const recordingsByStatus = recordings.reduce((acc, rec) => {
        acc[rec.status] = (acc[rec.status] || 0) + 1;
        return acc;
      }, {});

      // Agrupar por dia
      const recordingsByDay = recordings.reduce((acc, rec) => {
        const day = rec.created_at.split('T')[0];
        const existing = acc.find(item => item.date === day);
        if (existing) {
          existing.count++;
          existing.duration += rec.duration || 0;
        } else {
          acc.push({
            date: day,
            count: 1,
            duration: rec.duration || 0
          });
        }
        return acc;
      }, []);

      // Calcular estatísticas de upload
      const uploadedRecordings = recordings.filter(rec => rec.upload_status === 'uploaded');
      const pendingUploads = recordings.filter(rec => rec.upload_status === 'pending' || rec.upload_status === 'uploading').length;
      const failedUploads = recordings.filter(rec => rec.upload_status === 'failed').length;
      const uploadedSize = uploadedRecordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0);
      const localSize = recordings.filter(rec => rec.local_path).reduce((sum, rec) => sum + (rec.file_size || 0), 0);
      const s3Size = recordings.filter(rec => rec.s3_url).reduce((sum, rec) => sum + (rec.file_size || 0), 0);

      return {
        totalRecordings,
        activeRecordings: activeRecordingsCount,
        totalDuration,
        totalSize,
        averageDuration,
        recordingsByStatus,
        recordingsByDay: recordingsByDay.sort((a, b) => a.date.localeCompare(b.date)),
        totalSegments: totalRecordings, // Por enquanto, cada gravação é um segmento
        uploadedSize,
        pendingUploads,
        failedUploads,
        storageUsed: {
          local: localSize,
          s3: s3Size
        },
        uploadQueue: {
          pending: pendingUploads,
          processing: recordings.filter(rec => rec.upload_status === 'uploading').length,
          failed: failedUploads
        }
      };

    } catch (error) {
      logger.error('[RecordingService] Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Obter gravações ativas
   */
  async getActiveRecordings(userId) {
    try {
      // Buscar câmeras do usuário usando o modelo Camera
      const { Camera } = await import('../models/Camera.js');
      const cameras = await Camera.findByUserId(userId);

      if (!cameras || cameras.length === 0) {
        return { data: [] };
      }

      const cameraIds = cameras.map(cam => cam.id);

      // Buscar gravações ativas
      const { data: activeRecordings, error: recordingsError } = await this.supabase
        .from('recordings')
        .select('*')
        .in('camera_id', cameraIds)
        .eq('status', 'recording');

      if (recordingsError) {
        throw new Error(`Erro ao buscar gravações ativas: ${recordingsError.message}`);
      }

      return { data: activeRecordings || [] };

    } catch (error) {
      this.logger.error('Erro ao obter gravações ativas:', error);
      throw error;
    }
  }

  /**
   * Obter tendências de gravações
   */
  async getTrends(userId, period = '24h') {
    try {
      // Calcular data de início baseado no período
      const startDate = new Date();
      let intervalHours = 1;
      
      switch (period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          intervalHours = 1;
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          intervalHours = 24;
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          intervalHours = 24;
          break;
        default:
          startDate.setHours(startDate.getHours() - 24);
          intervalHours = 1;
      }

      // Buscar câmeras do usuário usando o modelo Camera
      const { Camera } = await import('../models/Camera.js');
      const cameras = await Camera.findByUserId(userId);

      if (!cameras || cameras.length === 0) {
        return { trends: [] };
      }

      const cameraIds = cameras.map(cam => cam.id);

      // Buscar gravações do período
      const { data: recordings, error: recordingsError } = await this.supabase
        .from('recordings')
        .select('created_at, duration, file_size')
        .in('camera_id', cameraIds)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (recordingsError) {
        throw recordingsError;
      }

      // Agrupar por intervalo de tempo
      const trends = [];
      const now = new Date();
      
      for (let i = 0; i < (period === '24h' ? 24 : period === '7d' ? 7 : 30); i++) {
        const intervalStart = new Date(startDate);
        intervalStart.setHours(intervalStart.getHours() + (i * intervalHours));
        
        const intervalEnd = new Date(intervalStart);
        intervalEnd.setHours(intervalEnd.getHours() + intervalHours);
        
        const intervalRecordings = recordings.filter(rec => {
          const recDate = new Date(rec.created_at);
          return recDate >= intervalStart && recDate < intervalEnd;
        });
        
        trends.push({
          timestamp: intervalStart.toISOString(),
          count: intervalRecordings.length,
          totalDuration: intervalRecordings.reduce((sum, rec) => sum + (rec.duration || 0), 0),
          totalSize: intervalRecordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0)
        });
      }

      return { trends };

    } catch (error) {
      logger.error('[RecordingService] Erro ao obter tendências:', error);
      throw error;
    }
  }

  /**
   * Preparar download de uma gravação
   */
  async prepareDownload(recordingId, userId) {
    try {
      // 🔍 [DEBUG] Log inicial do prepareDownload
      logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Iniciando prepareDownload:`, {
        recordingId,
        userId,
        recordingsPath: this.recordingsPath,
        timestamp: new Date().toISOString()
      });
      
      // Buscar gravação com verificação de permissão
      const recording = await this.getRecordingById(recordingId, userId);
      
      // 🔍 [DEBUG] Log da gravação encontrada
      logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Gravação encontrada:`, {
        recordingId,
        recording: recording ? {
          id: recording.id,
          filename: recording.filename,
          file_path: recording.file_path,
          file_size: recording.file_size,
          s3_url: recording.s3_url ? '[S3_URL_PRESENTE]' : null,
          camera_id: recording.camera_id,
          created_at: recording.created_at
        } : null
      });
      
      if (!recording) {
        logger.warn(`📁 [PREPARE_DOWNLOAD DEBUG] Gravação não encontrada: ${recordingId}`);
        return { exists: false, message: 'Gravação não encontrada' };
      }

      // Verificar se arquivo existe localmente
      let filePath = null;
      let fileSize = 0;
      
      // 🔍 [DEBUG] Log do início das estratégias de busca
      logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Iniciando estratégias de busca de arquivo:`, {
        recordingId,
        hasFilename: !!recording.filename,
        hasFilePath: !!recording.file_path,
        hasLocalPath: !!recording.local_path,
        hasS3Url: !!recording.s3_url
      });
      
      // Estratégia 0: Procurar por local_path (prioridade máxima)
      if (recording.local_path) {
        const localFilePath = path.resolve(this.recordingsPath, recording.local_path);
        
        // 🔍 [DEBUG] Log da estratégia 0
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ESTRATÉGIA 0 - Busca por local_path:`, {
          recordingId,
          localPath: recording.local_path,
          localFilePath,
          recordingsPath: this.recordingsPath
        });
        
        try {
          const stats = await fs.stat(localFilePath);
          if (stats.isFile()) {
            filePath = localFilePath;
            fileSize = stats.size;
            logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ ESTRATÉGIA 0 SUCESSO - Arquivo encontrado via local_path:`, {
              recordingId,
              filePath: localFilePath,
              fileSize: stats.size
            });
          }
        } catch (err) {
          logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 0 FALHOU - Arquivo local_path não encontrado:`, {
            recordingId,
            localFilePath,
            error: err.message
          });
        }
      }
      
      // Estratégia 1: Procurar por filename específico
      if (!filePath && recording.filename) {
        const directFilePath = path.resolve(this.recordingsPath, `${recording.filename}.mp4`);
        
        // 🔍 [DEBUG] Log da estratégia 1
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ESTRATÉGIA 1 - Busca por filename:`, {
          recordingId,
          filename: recording.filename,
          directFilePath,
          recordingsPath: this.recordingsPath
        });
        
        try {
          const stats = await fs.stat(directFilePath);
          if (stats.isFile()) {
            filePath = directFilePath;
            fileSize = stats.size;
            logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ ESTRATÉGIA 1 SUCESSO - Arquivo encontrado:`, {
              recordingId,
              filePath: directFilePath,
              fileSize: stats.size
            });
          }
        } catch (err) {
          logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 1 FALHOU - Arquivo não encontrado:`, {
            recordingId,
            directFilePath,
            error: err.message
          });
        }
      }
      
      // Estratégia 2: Procurar por padrão de nome baseado no timestamp
      if (!filePath && recording.filename) {
        // 🔍 [DEBUG] Log da estratégia 2
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ESTRATÉGIA 2 - Busca por timestamp:`, {
          recordingId,
          filename: recording.filename,
          recordingsPath: this.recordingsPath
        });
        
        try {
          const files = await fs.readdir(this.recordingsPath);
          
          // 🔍 [DEBUG] Log dos arquivos encontrados no diretório
          logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Arquivos no diretório de gravações:`, {
            recordingId,
            totalFiles: files.length,
            files: files.slice(0, 10) // Mostrar apenas os primeiros 10 para não poluir o log
          });
          
          // Procurar arquivos que contenham o timestamp do filename
          const timestampMatch = recording.filename.match(/recording_(\d+)/);
          if (timestampMatch) {
            const timestamp = timestampMatch[1];
            const matchingFiles = files.filter(file => 
              file.includes(timestamp) && (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi'))
            );
            
            // 🔍 [DEBUG] Log dos arquivos que correspondem ao timestamp
            logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Busca por timestamp:`, {
              recordingId,
              timestamp,
              matchingFiles,
              totalMatches: matchingFiles.length
            });
            
            if (matchingFiles.length > 0) {
              const matchedFile = matchingFiles[0];
              const matchedPath = path.resolve(this.recordingsPath, matchedFile);
              const stats = await fs.stat(matchedPath);
              
              filePath = matchedPath;
              fileSize = stats.size;
              logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ ESTRATÉGIA 2 SUCESSO - Arquivo encontrado:`, {
                recordingId,
                matchedFile,
                filePath: matchedPath,
                fileSize: stats.size
              });
            } else {
              logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 2 FALHOU - Nenhum arquivo correspondente ao timestamp`);
            }
          } else {
            logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 2 FALHOU - Timestamp não encontrado no filename`);
          }
        } catch (err) {
          logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 2 ERRO:`, {
            recordingId,
            error: err.message
          });
        }
      }
      
      // Estratégia 3: Procurar por file_path (método original)
      if (!filePath && recording.file_path) {
        let correctedFilePath = recording.file_path;
        
        // 🔍 [DEBUG] Log da estratégia 3
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ESTRATÉGIA 3 - Busca por file_path:`, {
          recordingId,
          originalFilePath: recording.file_path,
          recordingsPath: this.recordingsPath
        });
        
        // Se o caminho começa com 'record/live/', mapear para 'recordings/'
        if (correctedFilePath.startsWith('record/live/')) {
          correctedFilePath = correctedFilePath.replace('record/live/', 'recordings/');
          logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Mapeamento record/live/ -> recordings/:`, {
            recordingId,
            original: recording.file_path,
            corrected: correctedFilePath
          });
        }
        // Se começa apenas com 'record/', remover
        else if (correctedFilePath.startsWith('record/')) {
          correctedFilePath = correctedFilePath.substring(7);
          logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Removendo prefixo record/:`, {
            recordingId,
            original: recording.file_path,
            corrected: correctedFilePath
          });
        }
        
        const localPath = path.resolve(this.recordingsPath, correctedFilePath);
        
        // 🔍 [DEBUG] Log do caminho final calculado
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Caminho final calculado:`, {
          recordingId,
          originalFilePath: recording.file_path,
          correctedFilePath,
          localPath,
          recordingsPath: this.recordingsPath
        });
        
        try {
          const stats = await fs.stat(localPath);
          
          // 🔍 [DEBUG] Log do resultado da verificação do caminho
          logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Verificação do caminho:`, {
            recordingId,
            localPath,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            size: stats.size
          });
          
          if (stats.isDirectory()) {
            // Procurar arquivos de vídeo no diretório
            logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] É diretório - procurando arquivos de vídeo:`, {
              recordingId,
              directoryPath: localPath
            });
            
            try {
              const files = await fs.readdir(localPath);
              const videoFiles = files.filter(file => 
                file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.avi')
              );
              
              // 🔍 [DEBUG] Log dos arquivos encontrados no diretório
              logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] Arquivos no diretório:`, {
                recordingId,
                directoryPath: localPath,
                totalFiles: files.length,
                allFiles: files,
                videoFiles,
                videoFilesCount: videoFiles.length
              });
              
              if (videoFiles.length > 0) {
                const videoFile = videoFiles[0];
                const videoPath = path.join(localPath, videoFile);
                const videoStats = await fs.stat(videoPath);
                
                filePath = videoPath;
                fileSize = videoStats.size;
                logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ ESTRATÉGIA 3 SUCESSO - Arquivo encontrado no diretório:`, {
                  recordingId,
                  videoFile,
                  videoPath,
                  fileSize: videoStats.size
                });
              } else {
                logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 3 FALHOU - Nenhum arquivo de vídeo encontrado no diretório`);
              }
            } catch (dirError) {
              logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 3 ERRO ao ler diretório:`, {
                recordingId,
                directoryPath: localPath,
                error: dirError.message
              });
            }
          } else {
            filePath = localPath;
            fileSize = stats.size;
            logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ ESTRATÉGIA 3 SUCESSO - Arquivo encontrado diretamente:`, {
              recordingId,
              filePath: localPath,
              fileSize: stats.size
            });
          }
        } catch (err) {
          logger.debug(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ ESTRATÉGIA 3 FALHOU - Caminho não encontrado:`, {
            recordingId,
            localPath,
            error: err.message
          });
        }
      }
      
      // 🔍 [DEBUG] Log do resultado final da busca
      logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] RESULTADO FINAL da busca:`, {
        recordingId,
        filename: recording.filename,
        file_path: recording.file_path,
        foundFilePath: filePath,
        fileSize,
        hasS3Url: !!recording.s3_url,
        allStrategiesCompleted: true
      });

      // Se não há arquivo local, verificar S3
      if (!filePath && recording.s3_url) {
        logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ FALLBACK S3 - Usando URL S3:`, {
          recordingId,
          s3Available: true,
          fileSize: recording.file_size || 0
        });
        
        return {
          exists: true,
          isS3: true,
          s3Url: recording.s3_url,
          filename: recording.filename || `recording_${recordingId}.mp4`,
          fileSize: recording.file_size || 0
        };
      }

      if (!filePath) {
        logger.error(`📁 [PREPARE_DOWNLOAD DEBUG] ❌ FALHA TOTAL - Arquivo não encontrado:`, {
          recordingId,
          filename: recording.filename,
          file_path: recording.file_path,
          hasS3Url: !!recording.s3_url,
          recordingsPath: this.recordingsPath
        });
        
        return { exists: false, message: 'Arquivo não encontrado no armazenamento' };
      }

      logger.info(`📁 [PREPARE_DOWNLOAD DEBUG] ✅ SUCESSO TOTAL - Arquivo local encontrado:`, {
        recordingId,
        filePath,
        fileSize,
        filename: recording.filename || `recording_${recordingId}.mp4`
      });

      return {
        exists: true,
        isS3: false,
        filePath,
        filename: recording.filename || `recording_${recordingId}.mp4`,
        fileSize
      };

    } catch (error) {
      logger.error('[RecordingService] Erro ao preparar download:', error);
      throw error;
    }
  }

  /**
   * Obter stream de arquivo para download/reprodução
   */
  async getFileStream(filePath) {
    try {
      // Verificar se arquivo existe
      await fs.access(filePath);
      
      // Criar stream de leitura
      const stream = createReadStream(filePath);
      
      return stream;
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao criar stream de arquivo:', error);
      throw new Error('Arquivo não encontrado ou inacessível');
    }
  }

  /**
   * Obter URL de download temporária (para S3 ou local)
   */
  async getDownloadUrl(recordingId, expiresIn = 3600) {
    try {
      const recording = await this.getRecordingById(recordingId);
      
      if (!recording) {
        return null;
      }

      // Se está no S3, retornar URL direta
      if (recording.s3_url) {
        return recording.s3_url;
      }

      // Se é local, retornar endpoint de download
      return `/api/recordings/${recordingId}/download`;

    } catch (error) {
      logger.error('[RecordingService] Erro ao obter URL de download:', error);
      throw error;
    }
  }

  /**
   * Upload automático de gravação para S3/Wasabi
   */
  async uploadRecordingToS3(recordingId) {
    try {
      const recording = await this.getRecordingById(recordingId);
      
      if (!recording) {
        throw new Error('Gravação não encontrada');
      }

      if (recording.s3_url) {
        logger.info(`[RecordingService] Gravação ${recordingId} já está no S3`);
        return { success: true, alreadyUploaded: true };
      }

      // Verificar se arquivo local existe
      const localPath = path.resolve(this.recordingsPath, recording.file_path);
      
      try {
        await fs.access(localPath);
      } catch (err) {
        const errorMsg = 'Arquivo local não encontrado';
        await this.updateUploadError(recordingId, errorMsg);
        throw new Error(errorMsg);
      }

      // Incrementar tentativas de upload
      const currentAttempts = (recording.upload_attempts || 0) + 1;
      
      // Atualizar status para 'uploading' e incrementar tentativas
      await this.supabase
        .from('recordings')
        .update({
          status: 'uploading',
          upload_status: 'uploading',
          upload_attempts: currentAttempts,
          local_path: localPath,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);

      // Gerar chave S3
      const s3Key = S3Service.generateRecordingKey(
        recording.camera_id,
        recordingId,
        new Date(recording.created_at)
      );

      // Fazer upload
      const uploadResult = await S3Service.uploadWithRetry(
        localPath,
        s3Key,
        {
          'camera-id': recording.camera_id,
          'recording-id': recordingId,
          'upload-date': new Date().toISOString()
        }
      );

      if (uploadResult.success) {
        // Atualizar registro no banco com sucesso
        const { error } = await this.supabase
          .from('recordings')
          .update({
            s3_url: uploadResult.url,
            s3_key: uploadResult.key,
            upload_status: 'uploaded',
            status: 'completed',
            file_size: uploadResult.size,
            uploaded_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', recordingId);

        if (error) {
          throw error;
        }

        logger.info(`[RecordingService] Upload concluído para gravação ${recordingId}`);
        
        return {
          success: true,
          s3Url: uploadResult.url,
          s3Key: uploadResult.key,
          size: uploadResult.size
        };
      } else {
        throw new Error('Falha no upload para S3');
      }

    } catch (error) {
      logger.error(`[RecordingService] Erro no upload da gravação ${recordingId}:`, error);
      
      // Atualizar status para 'failed' com mensagem de erro
      await this.updateUploadError(recordingId, error.message);
      
      throw error;
    }
  }

  /**
   * Tentar novamente o upload de uma gravação
   */
  async retryUpload(recordingId) {
    try {
      logger.info(`[RecordingService] Iniciando retry de upload para gravação ${recordingId}`);
      
      const result = await this.uploadRecordingToS3(recordingId);
      
      return {
        success: true,
        message: 'Upload reiniciado com sucesso',
        uploadResult: result
      };
      
    } catch (error) {
      logger.error(`[RecordingService] Erro no retry de upload:`, error);
      throw error;
    }
  }

  /**
   * Tentar novamente o upload de um segmento específico
   */
  async retrySegmentUpload(recordingId, segmentId) {
    try {
      logger.info(`[RecordingService] Iniciando retry de upload para segmento ${segmentId}`);
      
      // Por enquanto, tratar como upload da gravação completa
      // Em implementações futuras, pode ser expandido para segmentos específicos
      const result = await this.uploadRecordingToS3(recordingId);
      
      return {
        success: true,
        message: 'Upload do segmento reiniciado com sucesso',
        uploadResult: result
      };
      
    } catch (error) {
      logger.error(`[RecordingService] Erro no retry de upload do segmento:`, error);
      throw error;
    }
  }

  /**
   * Obter fila de upload
   */
  async getUploadQueue() {
    try {
      const { data: pendingUploads, error } = await this.supabase
        .from('recordings')
        .select(`
          id,
          filename,
          file_path,
          file_size,
          status,
          upload_status,
          created_at,
          cameras:camera_id (id, name)
        `)
        .eq('status', 'completed')
        .or('upload_status.is.null,upload_status.eq.failed')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return {
        pending: pendingUploads || [],
        total: pendingUploads?.length || 0
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao obter fila de upload:', error);
      throw error;
    }
  }

  /**
   * Pausar/Retomar fila de upload
   */
  async toggleUploadQueue(action) {
    try {
      // Esta funcionalidade pode ser expandida com um sistema de fila mais robusto
      logger.info(`[RecordingService] Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'}`);
      
      return {
        success: true,
        action,
        message: `Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'} com sucesso`
      };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao alterar estado da fila:', error);
      throw error;
    }
  }

  /**
   * Processar uploads pendentes automaticamente
   */
  async processUploadQueue() {
    try {
      const queue = await this.getUploadQueue();
      
      if (queue.total === 0) {
        logger.debug('[RecordingService] Nenhum upload pendente na fila');
        return { processed: 0, success: 0, failed: 0 };
      }

      let processed = 0;
      let success = 0;
      let failed = 0;

      for (const recording of queue.pending) {
        try {
          // Processar gravações que não foram enviadas para S3 ou falharam
          if (recording.upload_status === null || recording.upload_status === 'failed') {
            logger.info(`[RecordingService] Processando upload da gravação ${recording.id}`);
            await this.uploadRecordingToS3(recording.id);
            success++;
          }
          processed++;
        } catch (error) {
          logger.error(`[RecordingService] Falha no upload automático da gravação ${recording.id}:`, error);
          failed++;
          processed++;
        }
      }

      logger.info(`[RecordingService] Processamento da fila concluído: ${processed} processados, ${success} sucessos, ${failed} falhas`);
      
      return { processed, success, failed };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao processar fila de upload:', error);
      throw error;
    }
  }

  /**
   * Processar gravação concluída (MELHORADO)
   * Versão aprimorada com validação robusta e múltiplas estratégias de localização
   */
  async processCompletedRecording(recordingData) {
    try {
      const {
        cameraId,
        fileName,
        filePath,
        fileSize,
        duration,
        startTime,
        streamName,
        format = 'mp4',
        hookId
      } = recordingData;

      logger.info(`🎬 [RecordingService] MELHORADO - Processando gravação concluída:`, {
        hookId,
        cameraId,
        fileName,
        fileSize,
        duration,
        filePath,
        startTime,
        streamName,
        format,
        timestamp: new Date().toISOString()
      });

      // VALIDAÇÃO ROBUSTA DE DADOS DE ENTRADA
      const validationResult = await this.validateRecordingData(recordingData);
      if (!validationResult.isValid) {
        logger.error(`❌ [RecordingService] Dados de gravação inválidos:`, validationResult.errors);
        throw new Error(`Dados inválidos: ${validationResult.errors.join(', ')}`);
      }

      // LOCALIZAÇÃO ROBUSTA DO ARQUIVO FÍSICO
      const fileLocationResult = await this.locateRecordingFileRobust({
        fileName,
        filePath,
        cameraId,
        startTime
      });

      if (!fileLocationResult.found) {
        logger.error(`❌ [RecordingService] Arquivo físico não encontrado:`, {
          fileName,
          filePath,
          searchedPaths: fileLocationResult.searchedPaths,
          reason: fileLocationResult.reason
        });
        throw new Error(`Arquivo físico não encontrado: ${fileLocationResult.reason}`);
      }

      logger.info(`✅ [RecordingService] Arquivo localizado com sucesso:`, {
        strategy: fileLocationResult.strategy,
        finalPath: fileLocationResult.finalPath,
        actualSize: fileLocationResult.actualSize
      });

      // Usar dados validados do arquivo físico
      const validatedFileSize = fileLocationResult.actualSize || fileSize;
      const validatedFilePath = fileLocationResult.finalPath;
      
      // Verificar se é uma gravação muito pequena
      if (duration && duration < 5) {
        logger.warn(`⚠️ [RecordingService] Gravação com duração muito pequena:`, {
          cameraId,
          fileName,
          duration,
          possivel_problema: 'Segmentação muito frequente ou erro de configuração'
        });
      }

      // Verificar se a câmera existe
      const { data: camera, error: cameraError } = await this.supabase
        .from('cameras')
        .select('*')
        .eq('id', cameraId)
        .single();

      if (cameraError || !camera) {
        logger.warn(`[RecordingService] Câmera ${cameraId} não encontrada, criando entrada temporária`);
        
        // Criar entrada temporária para câmera
        await this.supabase
          .from('cameras')
          .upsert({
            id: cameraId,
            name: `Câmera ${cameraId.substring(0, 8)}`,
            status: 'offline',
            rtsp_url: null,
            user_id: null,
            created_at: new Date().toISOString()
          });
      }

      // CORREÇÃO: Verificar se existe uma gravação ativa para esta câmera
      // Se existir, significa que esta é uma segmentação automática
      const { data: activeRecording, error: activeError } = await this.supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', cameraId)
        .eq('status', 'recording')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let isSegmentation = false;
      if (!activeError && activeRecording) {
        // Esta é uma segmentação automática - atualizar a gravação anterior para 'completed'
        logger.info(`[RecordingService] Detectada segmentação automática para câmera ${cameraId}. Finalizando gravação anterior: ${activeRecording.id}`);
        
        await this.supabase
          .from('recordings')
          .update({
            status: 'completed',
            end_time: startTime, // O fim da gravação anterior é o início da nova
            updated_at: new Date().toISOString()
          })
          .eq('id', activeRecording.id);
        
        isSegmentation = true;
      }

      // Criar registro de gravação no banco
      const recordingId = uuidv4();
      
      // Usar caminho validado do arquivo físico
      const localPath = validatedFilePath;
      
      // Determinar o status inicial:
      // - Se é segmentação, a nova gravação continua 'recording'
      // - Se não é segmentação, a gravação está 'completed'
      const initialStatus = isSegmentation ? 'recording' : 'completed';
      
      logger.info(`[RecordingService] 🔍 TENTANDO INSERIR GRAVAÇÃO NO BANCO (MELHORADO):`, {
        recordingId,
        cameraId,
        fileName,
        originalFilePath: filePath,
        validatedFilePath,
        localPath,
        originalFileSize: fileSize,
        validatedFileSize,
        fileLocationStrategy: fileLocationResult.strategy,
        duration: duration ? Math.round(parseFloat(duration)) : null,
        status: initialStatus,
        startTime
      });

      const { data: insertData, error: insertError } = await this.supabase
        .from('recordings')
        .insert({
          id: recordingId,
          camera_id: cameraId,
          filename: fileName,
          file_path: validatedFilePath, // Usar caminho validado
          local_path: localPath,
          file_size: validatedFileSize, // Usar tamanho validado
          duration: duration ? Math.round(parseFloat(duration)) : null,
          status: initialStatus,
          upload_status: null,
          start_time: startTime,
          created_at: startTime,
          updated_at: new Date().toISOString(),
          metadata: {
            stream_name: streamName,
            format: format,
            processed_by_hook: true,
            is_segmentation: isSegmentation,
            segment_number: isSegmentation ? (activeRecording?.metadata?.segment_number || 0) + 1 : 1,
            file_location_strategy: fileLocationResult.strategy,
            original_file_path: filePath,
            validated_at: new Date().toISOString()
          }
        })
        .select();

      if (insertError) {
        logger.error(`[RecordingService] ❌ ERRO CRÍTICO AO INSERIR NO BANCO:`, {
          error: insertError,
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        });
        throw insertError;
      }

      if (!insertData || insertData.length === 0) {
        logger.error(`[RecordingService] ❌ INSERÇÃO RETORNOU VAZIA - DADOS NÃO FORAM SALVOS`);
        throw new Error('Inserção no banco retornou vazia');
      }

      logger.info(`[RecordingService] ✅ GRAVAÇÃO INSERIDA COM SUCESSO NO BANCO:`, {
        recordingId,
        insertedData: insertData[0]
      });

      logger.info(`[RecordingService] Registro de gravação criado: ${recordingId} (status: ${initialStatus}, segmentação: ${isSegmentation})`);

      // Verificar se upload automático está habilitado (apenas para gravações completas)
      const autoUpload = process.env.AUTO_UPLOAD_WASABI === 'true' || process.env.ENABLE_S3_UPLOAD === 'true';
      
      if (autoUpload && initialStatus === 'completed') {
        logger.info(`[RecordingService] Upload automático habilitado, iniciando upload para Wasabi`);
        
        try {
          // Fazer upload para Wasabi em background
          setTimeout(async () => {
            try {
              await this.uploadRecordingToS3(recordingId);
              logger.info(`[RecordingService] Upload automático concluído para gravação ${recordingId}`);
            } catch (uploadError) {
              logger.error(`[RecordingService] Erro no upload automático da gravação ${recordingId}:`, uploadError);
            }
          }, 5000); // Aguardar 5 segundos para garantir que o arquivo foi completamente escrito
          
        } catch (uploadError) {
          logger.error(`[RecordingService] Erro ao iniciar upload automático:`, uploadError);
        }
      } else if (initialStatus === 'recording') {
        logger.info(`[RecordingService] Gravação continua ativa (segmentação), upload será feito quando finalizada`);
      } else {
        logger.info(`[RecordingService] Upload automático desabilitado`);
      }

      return {
        success: true,
        recordingId,
        isSegmentation,
        status: initialStatus,
        message: isSegmentation ? 'Segmento de gravação processado com sucesso' : 'Gravação processada com sucesso'
      };

    } catch (error) {
      logger.error(`[RecordingService] Erro ao processar gravação concluída:`, error);
      throw error;
    }
  }

  /**
   * Atualizar estatísticas de gravações existentes
   */
  async updateRecordingStatistics(recordingId = null) {
    try {
      logger.info('[RecordingService] Iniciando atualização de estatísticas de gravações');
      
      // Verificar se ffprobe está disponível
      const ffprobeAvailable = await VideoMetadataExtractor.checkFFProbeAvailability();
      
      if (!ffprobeAvailable) {
        logger.warn('[RecordingService] FFProbe não disponível, usando informações básicas de arquivo');
      }
      
      // Buscar gravações para atualizar
      let query = this.supabase
        .from('recordings')
        .select('id, filename, file_path, local_path, file_size, duration, metadata')
        .eq('status', 'completed');
      
      if (recordingId) {
        query = query.eq('id', recordingId);
      } else {
        // Atualizar apenas gravações com estatísticas zeradas ou nulas
        query = query.or('duration.is.null,duration.eq.0,file_size.is.null,file_size.eq.0');
      }
      
      const { data: recordings, error } = await query;
      
      if (error) {
        throw error;
      }
      
      if (!recordings || recordings.length === 0) {
        logger.info('[RecordingService] Nenhuma gravação encontrada para atualização');
        return { updated: 0, errors: 0 };
      }
      
      logger.info(`[RecordingService] Encontradas ${recordings.length} gravações para atualização`);
      
      let updated = 0;
      let errors = 0;
      
      for (const recording of recordings) {
        try {
          // Determinar caminho do arquivo
          let filePath = recording.local_path;
          
          if (!filePath && recording.file_path) {
            filePath = path.isAbsolute(recording.file_path) 
              ? recording.file_path 
              : path.resolve(this.recordingsPath, recording.file_path);
          }
          
          if (!filePath) {
            logger.warn(`[RecordingService] Caminho do arquivo não encontrado para gravação ${recording.id}`);
            errors++;
            continue;
          }
          
          // Verificar se arquivo existe
          try {
            await fs.access(filePath);
          } catch (accessError) {
            logger.warn(`[RecordingService] Arquivo não encontrado: ${filePath}`);
            errors++;
            continue;
          }
          
          // Extrair metadados
          let metadata;
          if (ffprobeAvailable) {
            metadata = await VideoMetadataExtractor.extractMetadata(filePath);
          } else {
            metadata = await VideoMetadataExtractor.extractBasicInfo(filePath);
          }
          
          // Preparar dados para atualização
          const updateData = {
            file_size: metadata.fileSize,
            duration: metadata.duration,
            updated_at: new Date().toISOString()
          };
          
          // Adicionar metadados estendidos se disponíveis
          if (ffprobeAvailable && metadata.width && metadata.height) {
            updateData.metadata = {
              ...recording.metadata,
              resolution: metadata.resolution,
              width: metadata.width,
              height: metadata.height,
              video_codec: metadata.videoCodec,
              audio_codec: metadata.audioCodec,
              bitrate: metadata.bitrate,
              frame_rate: metadata.frameRate,
              segments: metadata.segments,
              format: metadata.format,
              duration_formatted: metadata.durationFormatted,
              updated_metadata_at: new Date().toISOString()
            };
          }
          
          // Atualizar no banco de dados
          const { error: updateError } = await this.supabase
            .from('recordings')
            .update(updateData)
            .eq('id', recording.id);
          
          if (updateError) {
            logger.error(`[RecordingService] Erro ao atualizar gravação ${recording.id}:`, updateError);
            errors++;
          } else {
            logger.info(`[RecordingService] Estatísticas atualizadas para gravação ${recording.id}: ${metadata.resolution}, ${metadata.durationFormatted}, ${VideoMetadataExtractor.formatFileSize(metadata.fileSize)}`);
            updated++;
          }
          
        } catch (error) {
          logger.error(`[RecordingService] Erro ao processar gravação ${recording.id}:`, error);
          errors++;
        }
      }
      
      logger.info(`[RecordingService] Atualização de estatísticas concluída: ${updated} atualizadas, ${errors} erros`);
      
      return { updated, errors, total: recordings.length };
      
    } catch (error) {
      logger.error('[RecordingService] Erro ao atualizar estatísticas de gravações:', error);
      throw error;
    }
  }

  /**
   * Atualizar estatísticas de uma gravação específica
   */
  async updateSingleRecordingStatistics(recordingId) {
    return await this.updateRecordingStatistics(recordingId);
  }

  /**
   * VALIDAÇÃO ROBUSTA DE DADOS DE GRAVAÇÃO
   */
  async validateRecordingData(recordingData) {
    const errors = [];
    const {
      cameraId,
      fileName,
      filePath,
      fileSize,
      duration,
      startTime,
      streamName,
      format
    } = recordingData;

    // Validar cameraId
    if (!cameraId || typeof cameraId !== 'string' || cameraId.trim() === '') {
      errors.push('cameraId é obrigatório e deve ser uma string não vazia');
    }

    // Validar fileName
    if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') {
      errors.push('fileName é obrigatório e deve ser uma string não vazia');
    } else {
      // Verificar extensão do arquivo
      const validExtensions = ['.mp4', '.ts', '.flv', '.mkv'];
      const fileExt = path.extname(fileName).toLowerCase();
      if (!validExtensions.includes(fileExt)) {
        errors.push(`Extensão de arquivo inválida: ${fileExt}. Extensões válidas: ${validExtensions.join(', ')}`);
      }
    }

    // Validar fileSize
    if (fileSize !== undefined && (typeof fileSize !== 'number' || fileSize < 0)) {
      errors.push('fileSize deve ser um número positivo');
    }

    // Validar duration
    if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
      errors.push('duration deve ser um número positivo');
    }

    // Validar startTime
    if (startTime) {
      const timestamp = new Date(startTime);
      if (isNaN(timestamp.getTime())) {
        errors.push('startTime deve ser um timestamp válido');
      }
    }

    // Validar format
    if (format && typeof format !== 'string') {
      errors.push('format deve ser uma string');
    }

    // Verificar se a câmera existe no banco de dados
    if (cameraId && errors.length === 0) {
      try {
        const { data: camera, error } = await this.supabase
          .from('cameras')
          .select('id, name')
          .eq('id', cameraId)
          .single();

        if (error || !camera) {
          errors.push(`Câmera não encontrada no banco de dados: ${cameraId}`);
        }
      } catch (dbError) {
        logger.error(`❌ [RecordingService] Erro ao verificar câmera no banco:`, dbError);
        errors.push('Erro ao verificar câmera no banco de dados');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * LOCALIZAÇÃO ROBUSTA DE ARQUIVO FÍSICO
   * Usa múltiplas estratégias para encontrar o arquivo
   */
  async locateRecordingFileRobust({ fileName, filePath, cameraId, startTime }) {
    const searchedPaths = [];
    let finalPath = null;
    let strategy = null;
    let actualSize = null;

    logger.info(`🔍 [RecordingService] Iniciando localização robusta do arquivo:`, {
      fileName,
      filePath,
      cameraId,
      startTime
    });

    // Estratégia 1: Caminho direto fornecido
    if (filePath) {
      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        searchedPaths.push(absolutePath);
        
        if (fs.existsSync(absolutePath)) {
          const stats = fs.statSync(absolutePath);
          logger.info(`✅ [RecordingService] Estratégia 1 - Arquivo encontrado no caminho direto: ${absolutePath}`);
          return {
            found: true,
            strategy: 'direct_path',
            finalPath: absolutePath,
            actualSize: stats.size,
            searchedPaths
          };
        }
      } catch (error) {
        logger.warn(`⚠️ [RecordingService] Erro na estratégia 1:`, error.message);
      }
    }

    // Estratégia 2: Busca por nome de arquivo nos diretórios padrão
    const searchDirs = [
      path.join(process.cwd(), 'storage', 'recordings'),
      path.join(process.cwd(), 'storage', 'www', 'record'),
      path.join(process.cwd(), 'storage', 'files', 'recordings'),
      'C:\\ZLMediaKit\\www\\record',
      'C:\\ZLMediaKit\\recordings'
    ];

    for (const dir of searchDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        
        const possiblePath = path.join(dir, fileName);
        searchedPaths.push(possiblePath);
        
        if (fs.existsSync(possiblePath)) {
          const stats = fs.statSync(possiblePath);
          logger.info(`✅ [RecordingService] Estratégia 2 - Arquivo encontrado por nome: ${possiblePath}`);
          return {
            found: true,
            strategy: 'filename_search',
            finalPath: possiblePath,
            actualSize: stats.size,
            searchedPaths
          };
        }
      } catch (error) {
        logger.warn(`⚠️ [RecordingService] Erro na estratégia 2 para ${dir}:`, error.message);
      }
    }

    // Estratégia 3: Busca por padrão de timestamp
    if (startTime && cameraId) {
      try {
        const timestamp = new Date(startTime);
        const timePattern = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        for (const dir of searchDirs) {
          if (!fs.existsSync(dir)) continue;
          
          const files = fs.readdirSync(dir);
          const matchingFile = files.find(file => 
            file.includes(cameraId) && file.includes(timePattern.slice(0, 10))
          );
          
          if (matchingFile) {
            const possiblePath = path.join(dir, matchingFile);
            searchedPaths.push(possiblePath);
            
            if (fs.existsSync(possiblePath)) {
              const stats = fs.statSync(possiblePath);
              logger.info(`✅ [RecordingService] Estratégia 3 - Arquivo encontrado por timestamp: ${possiblePath}`);
              return {
                found: true,
                strategy: 'timestamp_pattern',
                finalPath: possiblePath,
                actualSize: stats.size,
                searchedPaths
              };
            }
          }
        }
      } catch (error) {
        logger.warn(`⚠️ [RecordingService] Erro na estratégia 3:`, error.message);
      }
    }

    // Estratégia 4: Busca fuzzy por nome similar
    if (fileName) {
      try {
        const baseName = path.parse(fileName).name;
        
        for (const dir of searchDirs) {
          if (!fs.existsSync(dir)) continue;
          
          const files = fs.readdirSync(dir);
          const similarFile = files.find(file => {
            const fileBaseName = path.parse(file).name;
            return fileBaseName.includes(baseName) || baseName.includes(fileBaseName);
          });
          
          if (similarFile) {
            const possiblePath = path.join(dir, similarFile);
            searchedPaths.push(possiblePath);
            
            if (fs.existsSync(possiblePath)) {
              const stats = fs.statSync(possiblePath);
              logger.info(`✅ [RecordingService] Estratégia 4 - Arquivo similar encontrado: ${possiblePath}`);
              return {
                found: true,
                strategy: 'fuzzy_search',
                finalPath: possiblePath,
                actualSize: stats.size,
                searchedPaths
              };
            }
          }
        }
      } catch (error) {
        logger.warn(`⚠️ [RecordingService] Erro na estratégia 4:`, error.message);
      }
    }

    logger.error(`❌ [RecordingService] Arquivo não encontrado após todas as estratégias:`, {
      fileName,
      filePath,
      searchedPaths
    });

    return {
      found: false,
      strategy: null,
      finalPath: null,
      actualSize: null,
      searchedPaths,
      reason: `Arquivo não encontrado em nenhum dos ${searchedPaths.length} caminhos pesquisados`
    };
  }
}

export default new RecordingService();