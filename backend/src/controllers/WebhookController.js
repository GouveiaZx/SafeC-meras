import logger from '../utils/logger.js';
import RecordingService from '../services/RecordingService.js';
import UploadLogService from '../services/UploadLogService.js';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Controller para webhooks do ZLMediaKit
 * Processa eventos de gravação finalizadas
 */
class WebhookController {
  /**
   * Webhook para quando uma gravação é finalizada pelo ZLMediaKit
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async onRecordMP4(req, res) {
    try {
      // Log detalhado do webhook
      UploadLogService.logWebhook('on_record_mp4', req.body);
      
      logger.info('[WebhookController] Webhook onRecordMP4 recebido:', req.body);
      
      const {
        app,
        stream,
        vhost,
        file_name,
        file_path,
        file_size,
        start_time,
        time_len,
        url
      } = req.body;
      
      // Validar dados obrigatórios
      if (!file_path || !stream) {
        logger.warn('[WebhookController] Dados obrigatórios ausentes no webhook:', {
          file_path,
          stream
        });
        return res.status(400).json({
          code: -1,
          msg: 'Dados obrigatórios ausentes (file_path, stream)'
        });
      }
      
      // Extrair camera_id do stream name
      // Assumindo formato: camera_{cameraId} ou apenas {cameraId}
      const cameraId = this.extractCameraId(stream);
      
      if (!cameraId) {
        logger.warn('[WebhookController] Não foi possível extrair camera_id do stream:', stream);
        return res.status(400).json({
          code: -1,
          msg: 'Não foi possível identificar a câmera'
        });
      }
      
      // Buscar gravação ativa para esta câmera
      const recordingId = await this.findActiveRecording(cameraId, stream);
      
      if (!recordingId) {
        logger.warn('[WebhookController] Gravação ativa não encontrada:', {
          cameraId,
          stream
        });
        return res.status(404).json({
          code: -1,
          msg: 'Gravação ativa não encontrada'
        });
      }
      
      // Processar arquivo de gravação
      const result = await RecordingService.processRecordingFile(
        file_path,
        cameraId,
        recordingId,
        {
          app,
          stream,
          vhost,
          file_name,
          file_size: parseInt(file_size) || 0,
          start_time: parseInt(start_time) || 0,
          duration: parseInt(time_len) || 0,
          url,
          webhook_received_at: new Date().toISOString()
        }
      );
      
      logger.info('[WebhookController] Arquivo processado com sucesso:', {
        recordingId,
        uploadJobId: result.uploadJobId
      });
      
      // Resposta para ZLMediaKit
      res.json({
        code: 0,
        msg: 'success'
      });
      
    } catch (error) {
      UploadLogService.logError('Erro ao processar webhook MP4', {
        error: error.message,
        stack: error.stack,
        webhookData: req.body
      });
      
      logger.error('[WebhookController] Erro no webhook onRecordMP4:', error);
      
      res.status(500).json({
        code: -1,
        msg: error.message
      });
    }
  }
  
  /**
   * Webhook para quando uma gravação HLS é finalizada
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async onRecordTS(req, res) {
    try {
      // Log detalhado do webhook
      UploadLogService.logWebhook('on_record_ts', req.body);
      
      logger.info('[WebhookController] Webhook onRecordTS recebido:', req.body);
      
      // Similar ao onRecordMP4, mas para arquivos HLS
      const {
        app,
        stream,
        vhost,
        file_name,
        file_path,
        file_size,
        start_time,
        time_len,
        url
      } = req.body;
      
      // Validar dados obrigatórios
      if (!file_path || !stream) {
        return res.status(400).json({
          code: -1,
          msg: 'Dados obrigatórios ausentes (file_path, stream)'
        });
      }
      
      // Para HLS, podemos ter múltiplos arquivos TS
      // Vamos processar apenas se for o arquivo principal (.m3u8)
      if (!file_name.endsWith('.m3u8')) {
        logger.info('[WebhookController] Ignorando arquivo TS individual:', file_name);
        return res.json({ code: 0, msg: 'success' });
      }
      
      const cameraId = this.extractCameraId(stream);
      
      if (!cameraId) {
        return res.status(400).json({
          code: -1,
          msg: 'Não foi possível identificar a câmera'
        });
      }
      
      const recordingId = await this.findActiveRecording(cameraId, stream);
      
      if (!recordingId) {
        return res.status(404).json({
          code: -1,
          msg: 'Gravação ativa não encontrada'
        });
      }
      
      // Processar arquivo HLS
      await RecordingService.processRecordingFile(
        file_path,
        cameraId,
        recordingId,
        {
          app,
          stream,
          vhost,
          file_name,
          file_size: parseInt(file_size) || 0,
          start_time: parseInt(start_time) || 0,
          duration: parseInt(time_len) || 0,
          url,
          format: 'hls',
          webhook_received_at: new Date().toISOString()
        }
      );
      
      res.json({ code: 0, msg: 'success' });
      
    } catch (error) {
      UploadLogService.logError('Erro ao processar webhook TS', {
        error: error.message,
        stack: error.stack,
        webhookData: req.body
      });
      
      logger.error('[WebhookController] Erro no webhook onRecordTS:', error);
      
      res.status(500).json({
        code: -1,
        msg: error.message
      });
    }
  }
  
  /**
   * Webhook genérico para outros eventos de gravação
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async onRecord(req, res) {
    try {
      logger.info('[WebhookController] Webhook onRecord recebido:', req.body);
      
      // Determinar tipo de arquivo e processar adequadamente
      const { file_name } = req.body;
      
      if (file_name && file_name.endsWith('.mp4')) {
        return this.onRecordMP4(req, res);
      } else if (file_name && (file_name.endsWith('.m3u8') || file_name.endsWith('.ts'))) {
        return this.onRecordTS(req, res);
      } else {
        logger.warn('[WebhookController] Tipo de arquivo não suportado:', file_name);
        return res.json({ code: 0, msg: 'file type not supported' });
      }
      
    } catch (error) {
      logger.error('[WebhookController] Erro no webhook onRecord:', error);
      
      res.status(500).json({
        code: -1,
        msg: error.message
      });
    }
  }
  
  /**
   * Extrair camera_id do nome do stream
   * @param {string} stream - Nome do stream
   * @returns {string|null} - ID da câmera ou null
   */
  extractCameraId(stream) {
    try {
      // Padrões suportados:
      // 1. camera_{uuid}
      // 2. {uuid}
      // 3. cam_{id}
      
      if (stream.startsWith('camera_')) {
        return stream.replace('camera_', '');
      }
      
      if (stream.startsWith('cam_')) {
        return stream.replace('cam_', '');
      }
      
      // Verificar se é um UUID válido
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(stream)) {
        return stream;
      }
      
      // Se não conseguir extrair, retornar o próprio stream como fallback
      logger.warn('[WebhookController] Usando stream como camera_id:', stream);
      return stream;
      
    } catch (error) {
      logger.error('[WebhookController] Erro ao extrair camera_id:', error);
      return null;
    }
  }
  
  /**
   * Buscar gravação ativa para uma câmera
   * @param {string} cameraId - ID da câmera
   * @param {string} stream - Nome do stream
   * @returns {string|null} - ID da gravação ou null
   */
  async findActiveRecording(cameraId, stream) {
    try {
      // Buscar gravações ativas para esta câmera
      const recordings = await RecordingService.getActiveRecordings(null, cameraId);
      
      if (!recordings.data || recordings.data.length === 0) {
        logger.warn('[WebhookController] Nenhuma gravação ativa encontrada:', cameraId);
        return null;
      }
      
      // Se houver múltiplas gravações ativas, pegar a mais recente
      const activeRecording = recordings.data
        .filter(r => r.status === 'recording')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      
      if (!activeRecording) {
        logger.warn('[WebhookController] Nenhuma gravação com status "recording" encontrada:', cameraId);
        return null;
      }
      
      logger.info('[WebhookController] Gravação ativa encontrada:', {
        recordingId: activeRecording.id,
        cameraId,
        stream
      });
      
      return activeRecording.id;
      
    } catch (error) {
      logger.error('[WebhookController] Erro ao buscar gravação ativa:', error);
      return null;
    }
  }
  
  /**
   * Webhook para teste de conectividade
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async ping(req, res) {
    try {
      logger.info('[WebhookController] Ping recebido');
      
      res.json({
        code: 0,
        msg: 'pong',
        timestamp: new Date().toISOString(),
        service: 'NewCAM Webhook Handler'
      });
      
    } catch (error) {
      logger.error('[WebhookController] Erro no ping:', error);
      
      res.status(500).json({
        code: -1,
        msg: error.message
      });
    }
  }
}

export default new WebhookController();