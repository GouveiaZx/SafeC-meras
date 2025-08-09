import RecordingService from '../services/RecordingService.js';
import LogService from '../services/LogService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class RecordingController {
  constructor() {
    this.recordingService = RecordingService;
    this.logger = LogService;
  }

  /**
   * Listar gravações com filtros
   */
  async getRecordings(req, res, next) {
    try {
      const {
        camera,
        status,
        search,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'startTime',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        camera,
        status,
        search,
        startDate,
        endDate
      };

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder
      };

      const result = await this.recordingService.getRecordings(filters, pagination);

      res.json(new ApiResponse({
        recordings: result.recordings,
        pagination: result.pagination,
        filters: filters
      }, 'Gravações recuperadas com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao buscar gravações:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Obter estatísticas de gravações
   */
  async getRecordingStats(req, res, next) {
    try {
      const stats = await this.recordingService.getRecordingStats();

      res.json(new ApiResponse(stats, 'Estatísticas de gravações recuperadas com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao buscar estatísticas:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Obter detalhes de uma gravação específica
   */
  async getRecordingById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const recording = await this.recordingService.getRecordingById(id, userId);

      if (!recording) {
        return next(new ApiError(404, 'Gravação não encontrada'));
      }

      res.json(new ApiResponse(recording, 'Gravação recuperada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao buscar gravação:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Iniciar gravação para uma câmera
   */
  async startRecording(req, res, next) {
    try {
      const { cameraId } = req.body;

      if (!cameraId) {
        return next(new ApiError(400, 'ID da câmera é obrigatório'));
      }

      const recording = await this.recordingService.startRecording(cameraId);

      this.logger.info(`[RecordingController] Gravação iniciada para câmera ${cameraId}`);

      res.status(201).json(new ApiResponse(recording, 'Gravação iniciada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao iniciar gravação:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Parar gravação
   */
  async stopRecording(req, res, next) {
    try {
      const { id } = req.params;
      const recording = await this.recordingService.stopRecording(id);

      if (!recording) {
        return next(new ApiError(404, 'Gravação não encontrada'));
      }

      this.logger.info(`[RecordingController] Gravação ${id} parada`);

      res.json(new ApiResponse(recording, 'Gravação parada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao parar gravação:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Tentar novamente o upload de uma gravação
   */
  async retryUpload(req, res, next) {
    try {
      const { id } = req.params;
      const result = await this.recordingService.retryUpload(id);

      if (!result) {
        return next(new ApiError(404, 'Gravação não encontrada'));
      }

      this.logger.info(`[RecordingController] Retry de upload iniciado para gravação ${id}`);

      res.json(new ApiResponse(result, 'Retry de upload iniciado com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao tentar novamente o upload:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Tentar novamente o upload de um segmento específico
   */
  async retrySegmentUpload(req, res, next) {
    try {
      const { id, segmentId } = req.params;
      const result = await this.recordingService.retrySegmentUpload(id, segmentId);

      if (!result) {
        return next(new ApiError(404, 'Gravação ou segmento não encontrado'));
      }

      this.logger.info(`[RecordingController] Retry de upload iniciado para segmento ${segmentId}`);

      res.json(new ApiResponse(result, 'Retry de upload do segmento iniciado com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao tentar novamente o upload do segmento:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Excluir gravação
   */
  async deleteRecording(req, res, next) {
    try {
      const { id } = req.params;
      const { deleteFromS3 = true } = req.query;
      const userId = req.user?.id;

      const result = await this.recordingService.deleteRecording(id, userId);

      if (!result) {
        return next(new ApiError(404, 'Gravação não encontrada'));
      }

      this.logger.info(`[RecordingController] Gravação ${id} excluída`);

      res.json(new ApiResponse(null, 'Gravação excluída com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao excluir gravação:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Obter URL de download de uma gravação
   */
  async getDownloadUrl(req, res, next) {
    try {
      const { id } = req.params;
      const { expiresIn = 3600 } = req.query; // 1 hora por padrão

      const url = await this.recordingService.getDownloadUrl(id, parseInt(expiresIn));

      if (!url) {
        return next(new ApiError(404, 'Gravação não encontrada ou não disponível para download'));
      }

      res.json(new ApiResponse({ downloadUrl: url }, 'URL de download gerada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao gerar URL de download:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Obter informações da fila de upload
   */
  async getUploadQueue(req, res, next) {
    try {
      const queue = await this.recordingService.getUploadQueue();

      res.json(new ApiResponse(queue, 'Fila de upload recuperada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao buscar fila de upload:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Limpar gravações antigas manualmente
   */
  async cleanupOldRecordings(req, res, next) {
    try {
      const { daysToKeep } = req.body;

      if (daysToKeep && (isNaN(daysToKeep) || daysToKeep < 1)) {
        return next(new ApiError(400, 'Número de dias deve ser um valor positivo'));
      }

      const result = await this.recordingService.cleanupOldRecordings(daysToKeep);

      this.logger.info(`[RecordingController] Limpeza manual executada: ${result.deletedCount} gravações removidas`);

      res.json(new ApiResponse(result, 'Limpeza de gravações antigas executada com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao executar limpeza:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Obter métricas de armazenamento
   */
  async getStorageMetrics(req, res, next) {
    try {
      const metrics = await this.recordingService.getStorageMetrics();

      res.json(new ApiResponse(metrics, 'Métricas de armazenamento recuperadas com sucesso'));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao buscar métricas de armazenamento:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }

  /**
   * Pausar/Retomar processamento da fila de upload
   */
  async toggleUploadQueue(req, res, next) {
    try {
      const { action } = req.body; // 'pause' ou 'resume'

      if (!['pause', 'resume'].includes(action)) {
        return next(new ApiError(400, 'Ação deve ser "pause" ou "resume"'));
      }

      const result = await this.recordingService.toggleUploadQueue(action);

      this.logger.info(`[RecordingController] Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'}`);

      res.json(new ApiResponse(result, `Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'} com sucesso`));

    } catch (error) {
      this.logger.error('[RecordingController] Erro ao alterar estado da fila:', error);
      next(new ApiError(500, 'Erro interno do servidor'));
    }
  }
}

export { RecordingController };