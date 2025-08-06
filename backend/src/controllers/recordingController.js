/**
 * Controller unificado para gerenciamento de gravações
 * Centraliza toda a lógica de gravação do sistema NewCAM
 */

import { Camera } from '../models/Camera.js';
import RecordingService from '../services/RecordingService.js';
import { createModuleLogger } from '../config/logger.js';
import { 
  NotFoundError, 
  ValidationError,
  AuthorizationError 
} from '../middleware/errorHandler.js';

const logger = createModuleLogger('RecordingController');

class RecordingController {
  /**
   * Listar gravações de uma câmera específica
   */
  static async getCameraRecordings(req, res) {
    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      startDate = null,
      endDate = null
    } = req.query;

    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    // Buscar gravações da câmera usando RecordingService
    const searchParams = {
      camera_id: id,
      start_date: startDate,
      end_date: endDate,
      page: parseInt(page),
      limit: parseInt(limit),
      user_id: req.user.id
    };

    const recordings = await RecordingService.searchRecordings(searchParams);

    return {
      success: true,
      message: 'Gravações listadas com sucesso',
      data: recordings
    };
  }

  /**
   * Iniciar gravação de uma câmera
   */
  static async startCameraRecording(req, res) {
    const { id } = req.params;
    
    logger.info(`[CONTROLLER] 🎬 Iniciando gravação para câmera ${id}`);
    
    try {
      logger.info(`[CONTROLLER] 📞 Chamando RecordingService.startRecording...`);
      const result = await RecordingService.startRecording(id);
      
      logger.info(`[CONTROLLER] ✅ RecordingService retornou:`, result);
      
      return {
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: result
      };
    } catch (error) {
      logger.error(`[CONTROLLER] ❌ Erro ao iniciar gravação:`, error);
      throw error;
    }
  }

  /**
   * Parar gravação de uma câmera
   */
  static async stopCameraRecording(req, res) {
    const { id } = req.params;
    const { recordingId } = req.body;
    
    logger.info(`[CONTROLLER] Parando gravação para câmera ${id}`);
    
    const result = await RecordingService.stopRecording(id, recordingId);
    
    return {
      success: true,
      message: 'Gravação parada com sucesso',
      data: result
    };
  }

  /**
   * Verificar status de gravação de uma câmera
   */
  static async getCameraRecordingStatus(req, res) {
    const { id } = req.params;
    
    const activeRecordings = await RecordingService.getActiveRecordings(id);
    
    return {
      success: true,
      isRecording: activeRecordings.length > 0,
      activeRecordings
    };
  }

  /**
   * Listar todas as gravações com filtros
   */
  static async searchRecordings(req, res) {
    const userId = req.user.id;
    const filters = req.query;
    
    logger.info(`Usuário ${userId} buscando gravações com filtros:`, filters);
    
    // Verificar se o usuário tem acesso às câmeras especificadas
    if (filters.camera_id) {
      const camera = await Camera.findById(filters.camera_id);
      if (!camera) {
        throw new NotFoundError('Câmera não encontrada');
      }
      
      // Verificar permissão de acesso à câmera
      const userCameras = await Camera.findByUserId(userId);
      const hasAccess = userCameras.some(cam => cam.id === filters.camera_id);
      
      if (!hasAccess) {
        throw new AuthorizationError('Acesso negado à câmera especificada');
      }
    }
    
    const result = await RecordingService.searchRecordings(userId, filters);
    
    return {
      success: true,
      data: result.recordings,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      },
      filters: result.appliedFilters
    };
  }

  /**
   * Obter tendências de gravações
   */
  static async getTrends(req, res) {
    const userId = req.user.id;
    const { period = '24h' } = req.query;
    
    const trends = await RecordingService.getTrends(userId, period);
    
    return {
      success: true,
      data: trends
    };
  }

  /**
   * Obter estatísticas de gravações
   */
  static async getStats(req, res) {
    const userId = req.user.id;
    const { period = '7d' } = req.query;
    
    const stats = await RecordingService.getRecordingStats(userId, period);
    
    return {
      success: true,
      data: stats
    };
  }

  /**
   * Listar gravações ativas
   */
  static async getActiveRecordings(req, res) {
    const userId = req.user.id;
    
    const { data: activeRecordings } = await RecordingService.getActiveRecordings(userId);
    
    return {
      success: true,
      data: activeRecordings,
      count: activeRecordings.length
    };
  }

  /**
   * Obter gravação por ID
   */
  static async getRecordingById(req, res) {
    const recordingId = req.params.id;
    const userId = req.user.id;

    const recording = await RecordingService.getRecordingById(recordingId, userId);

    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    return {
      success: true,
      data: recording
    };
  }

  /**
   * Download de gravação
   */
  static async downloadRecording(req, res) {
    const recordingId = req.params.id;
    const userId = req.user.id;

    const recording = await RecordingService.getRecordingById(recordingId, userId);

    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    const downloadInfo = await RecordingService.prepareDownload(recordingId, userId);

    if (downloadInfo.type === 's3') {
      logger.info(`Redirecionando para S3 - Usuário: ${userId}, Gravação: ${recordingId}`);
      return res.redirect(downloadInfo.url);
    }

    // Download local
    const fileStream = await RecordingService.getFileStream(downloadInfo.filePath);
    
    logger.info(`Download local iniciado - Usuário: ${userId}, Gravação: ${recordingId}`);
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
    
    return fileStream.pipe(res);
  }

  /**
   * Gerenciar gravação contínua
   */
  static async manageContinuousRecording(req, res) {
    const { camera_id, enabled } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(camera_id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    let result;
    if (enabled) {
      result = await RecordingService.enableContinuousRecording(camera_id);
    } else {
      result = await RecordingService.disableContinuousRecording(camera_id);
    }

    return {
      success: true,
      message: `Gravação contínua ${enabled ? 'habilitada' : 'desabilitada'} com sucesso`,
      data: result
    };
  }

  /**
   * Habilitar gravação contínua
   */
  static async enableContinuousRecording(req, res) {
    const { camera_id } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(camera_id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    const result = await RecordingService.enableContinuousRecording(camera_id);

    return {
      success: true,
      message: 'Gravação contínua habilitada com sucesso',
      data: result
    };
  }

  /**
   * Desabilitar gravação contínua
   */
  static async disableContinuousRecording(req, res) {
    const { camera_id } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(camera_id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    const result = await RecordingService.disableContinuousRecording(camera_id);

    return {
      success: true,
      message: 'Gravação contínua desabilitada com sucesso',
      data: result
    };
  }

  /**
   * Obter status da gravação contínua
   */
  static async getContinuousRecordingStatus(req, res) {
    const { camera_id } = req.params;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(camera_id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    const status = await RecordingService.getContinuousRecordingStatus(camera_id);

    return {
      success: true,
      data: {
        camera: {
          id: camera.id,
          name: camera.name,
          continuous_recording: camera.continuous_recording,
          status: camera.status
        },
        recording: status
      }
    };
  }

  /**
   * Obter overview da gravação contínua
   */
  static async getContinuousRecordingOverview(req, res) {
    const userId = req.user.id;

    // Buscar câmeras do usuário
    const cameras = await Camera.findByUserId(userId);
    
    const overview = await Promise.all(cameras.map(async (camera) => {
      try {
        const status = await RecordingService.getContinuousRecordingStatus(camera.id);
        return {
          camera: {
            id: camera.id,
            name: camera.name,
            continuous_recording: camera.continuous_recording,
            status: camera.status
          },
          recording: status
        };
      } catch (error) {
        logger.warn(`Erro ao obter status da câmera ${camera.id}:`, error.message);
        return {
          camera: {
            id: camera.id,
            name: camera.name,
            continuous_recording: camera.continuous_recording,
            status: camera.status
          },
          recording: {
            enabled: false,
            isRecording: false,
            recordingId: null,
            error: error.message
          }
        };
      }
    }));

    const summary = {
      total_cameras: overview.length,
      continuous_enabled: overview.filter(item => item.camera.continuous_recording).length,
      currently_recording: overview.filter(item => item.recording.isRecording).length,
      cameras: overview
    };

    return {
      success: true,
      data: summary
    };
  }

  /**
   * Exportar gravações
   */
  static async exportRecordings(req, res) {
    const { recording_ids, format, include_metadata } = req.body;
    const userId = req.user.id;

    logger.info(`Usuário ${userId} exportando ${recording_ids.length} gravações`);

    // Verificar acesso às gravações
    const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
    if (accessCheck.inaccessibleIds.length > 0) {
      throw new AuthorizationError('Acesso negado a algumas gravações', {
        inaccessible_recordings: accessCheck.inaccessibleIds
      });
    }

    const exportJob = await RecordingService.createExportJob({
      userId,
      recordingIds: recording_ids,
      format,
      includeMetadata: include_metadata
    });

    return {
      success: true,
      message: 'Exportação iniciada com sucesso',
      data: {
        export_id: exportJob.id,
        status_url: `/api/recordings/export/${exportJob.id}/status`
      }
    };
  }

  /**
   * Obter status da exportação
   */
  static async getExportStatus(req, res) {
    const { exportId } = req.params;
    const userId = req.user.id;

    const exportStatus = await RecordingService.getExportStatus(exportId, userId);

    return {
      success: true,
      data: exportStatus
    };
  }

  /**
   * Deletar múltiplas gravações
   */
  static async deleteRecordings(req, res) {
    const { recording_ids, confirm } = req.body;
    const userId = req.user.id;

    logger.info(`Usuário ${userId} deletando ${recording_ids.length} gravações`);

    // Verificar acesso às gravações
    const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
    if (accessCheck.inaccessibleIds.length > 0) {
      throw new AuthorizationError('Acesso negado a algumas gravações', {
        inaccessible_recordings: accessCheck.inaccessibleIds
      });
    }

    const deleteResult = await RecordingService.deleteRecordings(recording_ids, userId);

    return {
      success: true,
      message: `${deleteResult.deletedCount} gravações deletadas com sucesso`,
      data: deleteResult
    };
  }

  /**
   * Deletar gravação individual
   */
  static async deleteRecording(req, res) {
    const recordingId = req.params.id;
    const userId = req.user.id;

    logger.info(`Usuário ${userId} deletando gravação ${recordingId}`);

    // Verificar se a gravação existe e o usuário tem acesso
    const recording = await RecordingService.getRecordingById(recordingId, userId);

    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    const deleteResult = await RecordingService.deleteRecording(recordingId, userId);

    return {
      success: true,
      message: 'Gravação deletada com sucesso',
      data: deleteResult
    };
  }

  /**
   * Criar nova gravação
   */
  static async createRecording(req, res) {
    const { cameraId, duration, quality, type } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    // Iniciar gravação usando o RecordingService
    const recording = await RecordingService.startRecording(cameraId);

    return {
      success: true,
      message: 'Gravação iniciada com sucesso',
      data: recording
    };
  }

  /**
   * Parar gravação por ID
   */
  static async stopRecording(req, res) {
    const recordingId = req.params.id;
    const userId = req.user.id;

    // Verificar se a gravação existe e o usuário tem acesso
    const recording = await RecordingService.getRecordingById(recordingId, userId);
    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    logger.info(`[DEBUG] Recording object:`, recording);
    logger.info(`Usuário ${userId} parando gravação ${recordingId} da câmera ${recording.camera_id}`);

    // Parar gravação usando o RecordingService
    const result = await RecordingService.stopRecording(recording.camera_id, recordingId);

    return {
      success: true,
      message: 'Gravação parada com sucesso',
      data: result
    };
  }

  /**
   * Iniciar gravação (alternativa)
   */
  static async startRecording(req, res) {
    const { cameraId } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    const result = await RecordingService.startRecording(cameraId);

    return {
      success: true,
      message: 'Gravação iniciada com sucesso',
      data: result
    };
  }

  /**
   * Parar gravação (alternativa)
   */
  static async stopRecordingAlt(req, res) {
    const { cameraId, recordingId } = req.body;
    const userId = req.user.id;

    // Verificar se a câmera existe e o usuário tem acesso
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    const result = await RecordingService.stopRecording(cameraId, recordingId);

    return {
      success: true,
      message: 'Gravação parada com sucesso',
      data: result
    };
  }

  /**
   * Obter gravação ativa de uma câmera
   */
  static async getActiveRecording(req, res) {
    const { cameraId } = req.params;
    const userId = req.user.id;

    const activeRecording = await RecordingService.getActiveRecording(cameraId, userId);

    return {
      success: true,
      hasActiveRecording: !!activeRecording,
      recording: activeRecording
    };
  }

  /**
   * Upload manual de gravação
   */
  static async uploadRecording(req, res) {
    const recordingId = req.params.id;
    const { priority = 'normal' } = req.body;
    const userId = req.user.id;

    logger.info(`[API] Upload manual solicitado - Usuário: ${userId}, Gravação: ${recordingId}`);

    // Verificar se a gravação existe e o usuário tem acesso
    const recording = await RecordingService.getRecordingById(recordingId, userId);

    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    // Verificar se já foi feito upload
    if (recording.s3_url) {
      return {
        success: true,
        message: 'Gravação já foi enviada para o S3',
        data: {
          s3Url: recording.s3_url,
          uploadedAt: recording.upload_completed_at
        }
      };
    }

    const result = await RecordingService.triggerManualUpload(recordingId, priority);

    return {
      success: true,
      message: 'Upload iniciado com sucesso',
      data: result
    };
  }

  /**
   * Obter status do upload
   */
  static async getUploadStatus(req, res) {
    const recordingId = req.params.id;
    const userId = req.user.id;

    // Verificar se a gravação existe e o usuário tem acesso
    const recording = await RecordingService.getRecordingById(recordingId, userId);

    if (!recording) {
      throw new NotFoundError('Gravação não encontrada');
    }

    const uploadStatus = await RecordingService.getUploadStatus(recordingId);

    return {
      success: true,
      data: uploadStatus
    };
  }

  /**
   * Obter estatísticas da fila de upload
   */
  static async getUploadQueueStats(req, res) {
    const queueStats = await RecordingService.getUploadQueueStats();

    return {
      success: true,
      data: queueStats
    };
  }

  /**
   * Processar arquivo de gravação
   */
  static async processRecordingFile(req, res) {
    const { filePath, cameraId, recordingId, metadata } = req.body;

    if (!filePath || !cameraId || !recordingId) {
      throw new ValidationError('Parâmetros obrigatórios: filePath, cameraId, recordingId');
    }

    logger.info(`[API] Processamento de arquivo solicitado: ${recordingId}`);

    const result = await RecordingService.processRecordingFile(
      filePath,
      cameraId,
      recordingId,
      metadata
    );

    return {
      success: true,
      message: 'Arquivo processado com sucesso',
      data: result
    };
  }
}

export default RecordingController;