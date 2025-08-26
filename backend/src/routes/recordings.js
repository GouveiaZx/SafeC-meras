import express from 'express';
// Middleware de autenticação aplicado globalmente no server.js
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';
import RecordingService from '../services/RecordingService.js';
import { promises as fs } from 'fs';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/database.js';
import S3Service from '../services/S3Service.js';
import UploadQueueService from '../services/UploadQueueService.js';
import { computeEtag, computeLastModified, evaluateConditionalCache, setStandardCacheHeaders } from '../utils/httpCache.js';
import axios from 'axios';
import path from 'path';

const router = express.Router();

// Schemas de validação
const searchRecordingsSchema = Joi.object({
  camera_id: Joi.string().uuid().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  duration_min: Joi.number().min(0).optional(),
  duration_max: Joi.number().min(0).optional(),
  file_size_min: Joi.number().min(0).optional(),
  file_size_max: Joi.number().min(0).optional(),
  quality: Joi.string().valid('low', 'medium', 'high', 'ultra').optional(),
  event_type: Joi.string().valid('motion', 'scheduled', 'manual', 'alert').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sort_by: Joi.string().valid('created_at', 'duration', 'file_size', 'camera_name').default('created_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
});

const exportRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  format: Joi.string().valid('zip', 'tar').default('zip'),
  include_metadata: Joi.boolean().default(true)
});

const deleteRecordingsSchema = Joi.object({
  recording_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  confirm: Joi.boolean().valid(true).required()
});

const stopRecordingSchema = Joi.object({
  reason: Joi.string().valid('manual', 'timeout', 'error').default('manual')
});

/**
 * @route GET /api/recordings
 * @desc Listar gravações com filtros
 * @access Private
 */
router.get('/', 
  validateRequest('searchRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const filters = req.query;
      
      logger.info(`Usuário ${userId} buscando gravações com filtros:`, filters);
      
      // Verificar se o usuário tem acesso às câmeras especificadas
      if (filters.camera_id) {
        const camera = await Camera.findById(filters.camera_id);
        if (!camera) {
          return res.status(404).json({
            success: false,
            message: 'Câmera não encontrada'
          });
        }
        
        // TODO: Verificar permissão de acesso à câmera - temporariamente desabilitado
        // const userCameras = await Camera.findByUserId(userId);
        // const hasAccess = userCameras.some(cam => cam.id === filters.camera_id);
        
        // if (!hasAccess) {
        //   return res.status(403).json({
        //     success: false,
        //     message: 'Acesso negado à câmera especificada'
        //   });
        // }
      }
      
      const result = await RecordingService.searchRecordings(userId, filters);
      
      // Log para debug 
      logger.info(`📊 [ENDPOINT] Resultado searchRecordings:`, {
        hasData: !!result.data,
        dataLength: result.data?.length || 0,
        hasPagination: !!result.pagination,
        totalRecords: result.pagination?.total || 0,
        filters
      });
      
      res.json({
        success: true,
        data: result.data || [],
        pagination: result.pagination || {
          page: parseInt(filters.page) || 1,
          limit: parseInt(filters.limit) || 20,
          total: 0,
          pages: 0
        },
        filters: filters
      });
      
    } catch (error) {
      logger.error('Erro ao buscar gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Rotas específicas devem vir antes das rotas com parâmetros

/**
 * @route GET /api/recordings/stats
 * @desc Obter estatísticas de gravações
 * @access Private
 */
router.get('/stats',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = '7d' } = req.query;
      
      const stats = await RecordingService.getRecordingStats(userId, period);
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/trends
 * @desc Obter tendências de upload de gravações
 * @access Private
 */
router.get('/trends',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = '24h' } = req.query;
      
      const trends = await RecordingService.getTrends(userId, period);
      
      res.json({
        success: true,
        data: trends
      });
      
    } catch (error) {
      logger.error('Erro ao obter tendências de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/active
 * @desc Listar gravações ativas
 * @access Private
 */
router.get('/active',
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} buscando gravações ativas`);

      const { data: activeRecordings } = await RecordingService.getActiveRecordings(userId);

      res.json({
        success: true,
        data: activeRecordings,
        count: activeRecordings.length
      });

    } catch (error) {
      logger.error('Erro ao buscar gravações ativas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar gravações ativas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/:id/upload-status
 * @desc Get upload status for a specific recording
 * @access Private
 */
router.get('/:id/upload-status',
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      logger.info(`Getting upload status for recording: ${id}`);
      
      const recording = await RecordingService.getRecordingById(id, userId);
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Recording not found'
        });
      }
      
      res.json({
        success: true,
        data: {
          recording_id: recording.id,
          upload_status: recording.upload_status,
          upload_progress: recording.upload_progress || 0,
          upload_attempts: recording.upload_attempts || 0,
          upload_started_at: recording.upload_started_at,
          uploaded_at: recording.uploaded_at,
          s3_key: recording.s3_key,
          s3_url: recording.s3_url,
          error_message: recording.error_message,
          error_code: recording.upload_error_code
        }
      });
      
    } catch (error) {
      logger.error('Error getting upload status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/recordings/debug/status/:id
 * @desc Debug endpoint to check recording status
 * @access Private
 */
// Debug endpoint sem auth
router.get('/debug/status/:id', (req, res, next) => {
  req.skipAuth = true;
  next();
}, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: recording, error } = await supabaseAdmin
      .from('recordings')
      .select('id, filename, status, upload_status, s3_key, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Recording not found', details: error });
    }

    res.json({
      recording,
      frontend_should_show: recording.upload_status === 'uploaded' ? 'Na nuvem' : recording.upload_status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/recordings/:id/upload
 * @desc Manually trigger upload for a recording
 * @access Private
 */
router.post('/:id/upload',
  async (req, res) => {
    try {
      const { id } = req.params;
      const { force = false } = req.body;
      const userId = req.user.id;
      
      logger.info(`Manual upload trigger for recording: ${id}`, { force });
      
      const recording = await RecordingService.getRecordingById(id, userId);
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Recording not found'
        });
      }
      
      const result = await UploadQueueService.enqueue(id, { force });
      
      res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Upload queued successfully' : 'Failed to queue upload'
      });
      
    } catch (error) {
      logger.error('Error triggering manual upload:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/recordings/upload/queue-stats
 * @desc Get upload queue statistics
 * @access Private
 */
router.get('/upload/queue-stats',
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      logger.info(`Getting upload queue stats for user: ${userId}`);
      
      const stats = await UploadQueueService.getQueueStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('Error getting upload queue stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route POST /api/recordings/upload/retry-failed
 * @desc Retry failed uploads
 * @access Private
 */
router.post('/upload/retry-failed',
  async (req, res) => {
    try {
      const { max_age_hours = 24, force_all = false } = req.body;
      const userId = req.user.id;
      
      logger.info(`Retrying failed uploads for user: ${userId}`, { max_age_hours, force_all });
      
      const result = await UploadQueueService.retryFailed({ max_age_hours, force_all });
      
      res.json({
        success: true,
        data: result,
        message: `Retried ${result.retried} failed uploads`
      });
      
    } catch (error) {
      logger.error('Error retrying failed uploads:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route POST /api/recordings/start
 * @desc Iniciar gravação de uma câmera
 * @access Private
 */
router.post('/start',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} iniciando gravação para câmera ${cameraId}`);

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      const recording = await RecordingService.startRecording(cameraId);

      res.status(201).json({
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: recording
      });

    } catch (error) {
      logger.error('Erro ao iniciar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao iniciar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/pause
 * @desc Pausar gravação de uma câmera
 * @access Private
 */
router.post('/pause',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} pausando gravação para câmera ${cameraId}`);

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      const result = await RecordingService.pauseRecording(cameraId);

      res.json({
        success: true,
        message: 'Gravação pausada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('Erro ao pausar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao pausar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/resume
 * @desc Retomar gravação de uma câmera
 * @access Private
 */
router.post('/resume',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} retomando gravação para câmera ${cameraId}`);

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      const result = await RecordingService.resumeRecording(cameraId);

      res.json({
        success: true,
        message: 'Gravação retomada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('Erro ao retomar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao retomar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/stop
 * @desc Parar gravação de uma câmera
 * @access Private
 */
router.post('/stop',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} parando gravação para câmera ${cameraId}`);

      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      const result = await RecordingService.stopRecording(cameraId);

      res.json({
        success: true,
        message: 'Gravação finalizada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('Erro ao parar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao parar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/stop
 * @desc Parar uma gravação específica pelo ID
 * @access Private
 */
router.post('/:id/stop',
  async (req, res) => {
    try {
      const recordingId = req.params.id;
      const userId = req.user.id;
      
      logger.info(`Usuário ${userId} parando gravação ${recordingId}`);

      const result = await RecordingService.stopRecordingById(recordingId, userId);

      res.json({
        success: true,
        message: 'Gravação finalizada com sucesso',
        data: result
      });

    } catch (error) {
      logger.error('Erro ao parar gravação específica:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao parar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Middleware de autenticação para streaming (usado em :id/stream e :id/download)
const authenticateStreamToken = async (req, res, next) => {
  try {
    // Configurar CORS para suporte a requisições de diferentes origens
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag, Last-Modified, Cache-Control');

    // Responder a requisições OPTIONS rapidamente
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    let token = null;

    // Primeiro, tentar extrair token do cabeçalho Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      logger.debug('[StreamAuth] Token extraído do cabeçalho Authorization');
    }

    // Se não encontrado no cabeçalho, tentar query parameter
    if (!token && req.query.token) {
      token = req.query.token;
      logger.debug('[StreamAuth] Token extraído de query parameter');
    }

    if (!token) {
      logger.warn('[StreamAuth] Token não fornecido');
      return res.status(401).json({
        success: false,
        message: 'Token de acesso não fornecido'
      });
    }

    // 1) Tentar validar como JWT interno da aplicação
    try {
      logger.debug(`[StreamAuth] Tentando verificar JWT com secret: ${process.env.JWT_SECRET ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.debug(`[StreamAuth] JWT decodificado com sucesso:`, {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp
      });
      
      if (decoded && decoded.userId) {
        const { data: user, error } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', decoded.userId)
          .eq('active', true)
          .single();

        if (!error && user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            userType: user.role?.toUpperCase() || 'CLIENT',
            permissions: user.permissions || [],
            camera_access: user.camera_access || [],
            active: user.active,
            created_at: user.created_at
          };
          req.token = token;
          logger.info(`[StreamAuth] ✅ Usuário autenticado via JWT interno: ${user.email} (${user.id})`);
          return next();
        }

        logger.warn('[StreamAuth] JWT válido, mas usuário não encontrado/ativo na base:', {
          userId: decoded.userId,
          error: error?.message,
          userFound: !!user,
          userActive: user?.active
        });
        return res.status(401).json({ success: false, message: 'Token inválido - usuário não encontrado' });
      } else {
        logger.warn('[StreamAuth] JWT válido mas sem userId:', decoded);
        return res.status(401).json({ success: false, message: 'Token inválido - userId não encontrado' });
      }
    } catch (e) {
      logger.warn('[StreamAuth] Falha na validação JWT interno:', {
        error: e.message,
        name: e.name,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      
      // Se for erro de token expirado ou malformado, retornar erro direto
      if (e.name === 'TokenExpiredError') {
        logger.warn('[StreamAuth] Token expirado');
        return res.status(401).json({ success: false, message: 'Token expirado' });
      }
      if (e.name === 'JsonWebTokenError') {
        logger.warn('[StreamAuth] Token malformado');
        return res.status(401).json({ success: false, message: 'Token malformado' });
      }
      
      // Para outros erros, tentar fallback Supabase
      logger.debug('[StreamAuth] Tentando fallback Supabase...');
    }

    // 2) Fallback: validar como token de sessão do Supabase
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        // Confirmar que usuário existe e está ativo em nossa tabela
        const { data: dbUser } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', user.id)
          .eq('active', true)
          .single();

        if (!dbUser) {
          logger.warn('[StreamAuth] Usuário do Supabase não encontrado/ativo na tabela users');
          return res.status(401).json({ success: false, message: 'Token inválido' });
        }

        req.user = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          userType: dbUser.role?.toUpperCase() || 'CLIENT',
          permissions: dbUser.permissions || [],
          camera_access: dbUser.camera_access || [],
          active: dbUser.active,
          created_at: dbUser.created_at
        };
        req.token = token;
        logger.debug(`[StreamAuth] Usuário autenticado via token Supabase: ${dbUser.id}`);
        return next();
      }
    } catch (e) {
      logger.debug('[StreamAuth] Falha na validação via Supabase:', e?.message);
    }

    logger.warn('[StreamAuth] Token inválido ou expirado');
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  } catch (error) {
    logger.error('Erro na autenticação de streaming:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token malformado' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expirado' });
    }
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

/**
 * @route GET /api/recordings/:id/download
 * @desc Download de uma gravação
 * @access Private
 * @deprecated Use /api/recordings/:id/download from recordingFiles.js instead
 */
// DEPRECATED - Rota movida para recordingFiles.js para evitar duplicação
// TODO: Remover após migração completa do frontend
/*
router.get('/:id/download',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;

      const recording = await RecordingService.getRecordingById(recordingId, userId);
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }

      const downloadInfo = await RecordingService.prepareDownload(recordingId);

      logger.info(`[Download Debug] Download info:`, {
        exists: downloadInfo.exists,
        isS3: downloadInfo.isS3,
        filePath: downloadInfo.filePath,
        filename: downloadInfo.filename,
        fileSize: downloadInfo.fileSize,
        strategy: downloadInfo.strategy
      });

      if (!downloadInfo.exists) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo de gravação não encontrado no armazenamento'
        });
      }

      // Se é S3, redirecionar com URL pré-assinada (se possível)
      if (downloadInfo.isS3) {
        try {
          let signedUrl = null;
          if (downloadInfo.s3Key) {
            signedUrl = await S3Service.getSignedUrl(downloadInfo.s3Key, 3600);
          } else if (downloadInfo.s3Url) {
            try {
              const u = new URL(downloadInfo.s3Url);
              const pathParts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
              if (pathParts.length >= 2) {
                const derivedKey = pathParts.slice(1).join('/');
                signedUrl = await S3Service.getSignedUrl(derivedKey, 3600);
              }
            } catch (e) {
              logger.warn('Falha ao derivar S3 key da URL, usando s3Url direto');
            }
          }
          return res.redirect(signedUrl || downloadInfo.s3Url);
        } catch (e) {
          logger.warn('Falha ao gerar URL pré-assinada para S3, usando s3Url direto:', e?.message);
          return res.redirect(downloadInfo.s3Url);
        }
      }

      // Arquivo local: preparar metadados e condicionais de cache
      const filePath = downloadInfo.filePath;
      const stats = await fs.stat(filePath);
      const etag = computeEtag(stats);
      const lastModified = computeLastModified(stats);

      // Condicionais de cache
      const { notModified } = evaluateConditionalCache(req, stats, etag);
      if (notModified) {
        setStandardCacheHeaders(res, etag, lastModified);
        return res.status(304).end();
      }

      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Accept-Ranges', 'bytes');
      setStandardCacheHeaders(res, etag, lastModified);

      const { stream } = await RecordingService.getFileStream(filePath);
      stream.pipe(res);

      logger.info(`Download iniciado - Usuário: ${userId}, Gravação: ${recordingId}`);
    } catch (error) {
      logger.error('Erro no download da gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);
*/

/**
 * @route HEAD /api/recordings/:id/download
 * @desc Headers para download de uma gravação
 * @access Private
 * @deprecated Use HEAD /api/recordings/:id/info from recordingFiles.js instead
 */
// DEPRECATED - Usar HEAD /api/recordings/:id/info de recordingFiles.js
/*
router.head('/:id/download',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;

      const recording = await RecordingService.getRecordingById(recordingId, userId);
      if (!recording) {
        return res.status(404).end();
      }

      const downloadInfo = await RecordingService.prepareDownload(recordingId);
      if (!downloadInfo.exists) {
        return res.status(404).end();
      }
      if (downloadInfo.isS3) {
        // Gerar URL pré-assinada para HEAD redirecionar
        try {
          let signedUrl = null;
          if (downloadInfo.s3Key) {
            signedUrl = await S3Service.getSignedUrl(downloadInfo.s3Key, 3600);
          } else if (downloadInfo.s3Url) {
            try {
              const u = new URL(downloadInfo.s3Url);
              const pathParts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
              if (pathParts.length >= 2) {
                const derivedKey = pathParts.slice(1).join('/');
                signedUrl = await S3Service.getSignedUrl(derivedKey, 3600);
              }
            } catch (e) {
              logger.warn('Falha ao derivar S3 key da URL (HEAD)');
            }
          }
          res.setHeader('Location', signedUrl || downloadInfo.s3Url);
        } catch (e) {
          logger.warn('Falha ao gerar URL pré-assinada para S3 (HEAD):', e?.message);
          res.setHeader('Location', downloadInfo.s3Url);
        }
        return res.status(302).end();
      }

      const stats = await fs.stat(downloadInfo.filePath);
      const etag = computeEtag(stats);
      const lastModified = computeLastModified(stats);

      // Condicionais de cache
      const { notModified } = evaluateConditionalCache(req, stats, etag);
      if (notModified) {
        setStandardCacheHeaders(res, etag, lastModified);
        return res.status(304).end();
      }

      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Accept-Ranges', 'bytes');
      setStandardCacheHeaders(res, etag, lastModified);
      return res.end();
    } catch (error) {
      logger.error('Erro no HEAD /:id/download:', error);
      return res.status(500).end();
    }
  }
);
*/

/**
 * @route GET /api/recordings/:id/stream
 * @desc Stream de uma gravação para reprodução
 * @access Private
 * @deprecated Use /api/recordings/:id/stream from recordingFiles.js instead
 */
// DEPRECATED - Rota movida para recordingFiles.js
/*
router.get('/:id/stream',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const downloadInfo = await RecordingService.prepareDownload(recordingId);
      
      // Debug: log das informações de stream
      logger.info(`[Stream Debug] Stream info:`, {
        exists: downloadInfo.exists,
        isS3: downloadInfo.isS3,
        filePath: downloadInfo.filePath,
        filename: downloadInfo.filename,
        fileSize: downloadInfo.fileSize,
        strategy: downloadInfo.strategy
      });
      
      if (!downloadInfo.exists) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo de gravação não encontrado no armazenamento'
        });
      }
      
      // Se é S3, redirecionar com URL pré-assinada (se possível)
      if (downloadInfo.isS3) {
        try {
          let signedUrl = null;
          if (downloadInfo.s3Key) {
            signedUrl = await S3Service.getSignedUrl(downloadInfo.s3Key, 3600);
          } else if (downloadInfo.s3Url) {
            try {
              const u = new URL(downloadInfo.s3Url);
              const pathParts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
              if (pathParts.length >= 2) {
                const derivedKey = pathParts.slice(1).join('/');
                signedUrl = await S3Service.getSignedUrl(derivedKey, 3600);
              }
            } catch (e) {
              logger.warn('Falha ao derivar S3 key da URL (stream)');
            }
          }
          return res.redirect(signedUrl || downloadInfo.s3Url);
        } catch (e) {
          logger.warn('Falha ao gerar URL pré-assinada para S3 (stream):', e?.message);
          return res.redirect(downloadInfo.s3Url);
        }
      }
      
      // Verificar range request
      const range = req.headers.range;
      const filePath = downloadInfo.filePath;
      
      // Metadados de arquivo para headers
      const stats = await fs.stat(filePath);
      const etag = computeEtag(stats);
      const lastModified = computeLastModified(stats);

      // Headers básicos
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      setStandardCacheHeaders(res, etag, lastModified);
      
      // Condicionais de cache: apenas quando não for Range Request
      const { notModified } = evaluateConditionalCache(req, stats, etag);
      if (!range && notModified) {
         return res.status(304).end();
       }
      
      if (range) {
        // Range request - streaming parcial
        const { stream, contentLength, contentRange } = await RecordingService.getFileStream(filePath, range);
        
        res.status(206);
        res.setHeader('Content-Range', contentRange);
        res.setHeader('Content-Length', contentLength);
        
        stream.pipe(res);
      } else {
        // Request completo
        const { stream, contentLength } = await RecordingService.getFileStream(filePath);
        
        res.status(200);
        res.setHeader('Content-Length', contentLength);
        
        stream.pipe(res);
      }
      
      // Log do stream
      logger.info(`Stream iniciado - Usuário: ${userId}, Gravação: ${recordingId}, Range: ${range || 'completo'}`);
      
    } catch (error) {
      logger.error('Erro no stream da gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);
*/

/**
 * @route HEAD /api/recordings/:id/stream
 * @desc Headers para stream de uma gravação
 * @access Private
 * @deprecated Use HEAD /api/recordings/:id/info from recordingFiles.js instead
 */
// DEPRECATED - Usar HEAD /api/recordings/:id/info de recordingFiles.js
/*
router.head('/:id/stream',
  authenticateStreamToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;

      const recording = await RecordingService.getRecordingById(recordingId, userId);
      if (!recording) {
        return res.status(404).end();
      }

      const downloadInfo = await RecordingService.prepareDownload(recordingId);
      if (!downloadInfo.exists) {
        return res.status(404).end();
      }
      if (downloadInfo.isS3) {
        // Gerar URL pré-assinada para S3 (HEAD)
        try {
          let signedUrl = null;
          if (downloadInfo.s3Key) {
            signedUrl = await S3Service.getSignedUrl(downloadInfo.s3Key, 3600);
          } else if (downloadInfo.s3Url) {
            try {
              const u = new URL(downloadInfo.s3Url);
              const pathParts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
              if (pathParts.length >= 2) {
                const derivedKey = pathParts.slice(1).join('/');
                signedUrl = await S3Service.getSignedUrl(derivedKey, 3600);
              }
            } catch (e) {
              logger.warn('Falha ao derivar S3 key da URL (HEAD stream)');
            }
          }
          res.setHeader('Location', signedUrl || downloadInfo.s3Url);
        } catch (e) {
          logger.warn('Falha ao gerar URL pré-assinada para S3 (HEAD stream):', e?.message);
          res.setHeader('Location', downloadInfo.s3Url);
        }
        return res.status(302).end();
      }

      const filePath = downloadInfo.filePath;
      const stats = await fs.stat(filePath);
      const etag = computeEtag(stats);
      const lastModified = computeLastModified(stats);

      const range = req.headers.range;
      // Condicionais de cache (apenas quando não houver Range)
      const { notModified } = evaluateConditionalCache(req, stats, etag);
      if (!range && notModified) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        setStandardCacheHeaders(res, etag, lastModified);
        return res.status(304).end();
      }

      if (range) {
        const { contentLength, contentRange } = await RecordingService.getFileStream(filePath, range);
        res.status(206);
        res.setHeader('Content-Range', contentRange);
        res.setHeader('Content-Length', contentLength);
      } else {
        res.status(200);
        res.setHeader('Content-Length', stats.size);
      }

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      setStandardCacheHeaders(res, etag, lastModified);
      return res.end();
    } catch (error) {
      logger.error('Erro no HEAD /:id/stream:', error);
      return res.status(500).end();
    }
  }
);
*/

/**
 * @route POST /api/recordings/export
 * @desc Exportar múltiplas gravações
 * @access Private
 */
router.post('/export',
  validateRequest('exportRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recording_ids, format, include_metadata } = req.body;
      
      logger.info(`Usuário ${userId} exportando ${recording_ids.length} gravações`);
      
      // Verificar acesso a todas as gravações
      const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
      
      if (!accessCheck.allAccessible) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado a algumas gravações',
          inaccessible_recordings: accessCheck.inaccessibleIds
        });
      }
      
      // Iniciar processo de exportação
      const exportJob = await RecordingService.createExportJob({
        userId,
        recordingIds: recording_ids,
        format,
        includeMetadata: include_metadata
      });
      
      res.json({
        success: true,
        message: 'Exportação iniciada',
        export_id: exportJob.id,
        estimated_time: exportJob.estimatedTime,
        status_url: `/api/recordings/export/${exportJob.id}/status`
      });
      
    } catch (error) {
      logger.error('Erro na exportação de gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/export/:exportId/status
 * @desc Verificar status de exportação
 * @access Private
 */
router.get('/export/:exportId/status',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const exportId = req.params.exportId;
      
      const exportStatus = await RecordingService.getExportStatus(exportId, userId);
      
      if (!exportStatus) {
        return res.status(404).json({
          success: false,
          message: 'Exportação não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: exportStatus
      });
      
    } catch (error) {
      logger.error('Erro ao verificar status de exportação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route DELETE /api/recordings
 * @desc Deletar múltiplas gravações
 * @access Private
 */
router.delete('/',
  validateRequest('deleteRecordings'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recording_ids, confirm } = req.body;
      
      logger.info(`Usuário ${userId} deletando ${recording_ids.length} gravações`);
      
      // Verificar acesso a todas as gravações
      const accessCheck = await RecordingService.checkBulkAccess(recording_ids, userId);
      
      if (!accessCheck.allAccessible) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado a algumas gravações',
          inaccessible_recordings: accessCheck.inaccessibleIds
        });
      }
      
      // Executar deleção
      const deleteResult = await RecordingService.deleteRecordings(recording_ids, userId);
      
      res.json({
        success: true,
        message: `${deleteResult.deletedCount} gravações deletadas com sucesso`,
        deleted_count: deleteResult.deletedCount,
        failed_count: deleteResult.failedCount,
        freed_space: deleteResult.freedSpace
      });
      
    } catch (error) {
      logger.error('Erro ao deletar gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings
 * @desc Iniciar gravação para uma câmera
 * @access Private
 */
router.post('/',
  async (req, res) => {
    try {
      const { cameraId } = req.body;
      const userId = req.user.id;
      
      if (!cameraId) {
        return res.status(400).json({
          success: false,
          message: 'ID da câmera é obrigatório'
        });
      }

      // Verificar se a câmera existe e o usuário tem acesso
      const camera = await Camera.findById(cameraId);
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: 'Câmera não encontrada'
        });
      }

      // Verificar permissão de acesso à câmera
      const userCameras = await Camera.findByUserId(userId);
      const hasAccess = userCameras.some(cam => cam.id === cameraId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado à câmera especificada'
        });
      }

      logger.info(`Usuário ${userId} iniciando gravação para câmera ${cameraId}`);

      // Iniciar gravação usando o RecordingService
      const recording = await RecordingService.startRecording(cameraId);

      res.status(201).json({
        success: true,
        message: 'Gravação iniciada com sucesso',
        data: recording
      });

    } catch (error) {
      logger.error('Erro ao iniciar gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao iniciar gravação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/retry-upload
 * @desc Tentar novamente o upload de uma gravação
 * @access Private
 */
router.post('/:id/retry-upload',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const result = await RecordingService.retryUpload(recordingId);
      
      res.json({
        success: true,
        message: 'Retry de upload iniciado com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao tentar novamente o upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/:id/segments/:segmentId/retry-upload
 * @desc Tentar novamente o upload de um segmento específico
 * @access Private
 */
router.post('/:id/segments/:segmentId/retry-upload',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { id: recordingId, segmentId } = req.params;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const result = await RecordingService.retrySegmentUpload(recordingId, segmentId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Segmento não encontrado'
        });
      }
      
      res.json({
        success: true,
        message: 'Retry de upload do segmento iniciado com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao tentar novamente o upload do segmento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/:id/segments
 * @desc Buscar segmentos de uma gravação
 * @access Private
 */
router.get('/:id/segments',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { id: recordingId } = req.params;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      const segments = await RecordingService.getRecordingSegments(
        recordingId, 
        recording.camera_id, 
        recording.filename
      );
      
      res.json({
        success: true,
        data: segments
      });
      
    } catch (error) {
      logger.error('Erro ao buscar segmentos da gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/upload-queue
 * @desc Obter informações da fila de upload
 * @access Private
 */
router.get('/upload-queue',
  async (req, res) => {
    try {
      const queue = await RecordingService.getUploadQueue();
      
      res.json({
        success: true,
        data: queue
      });
      
    } catch (error) {
      logger.error('Erro ao buscar fila de upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/recordings/upload-queue/toggle
 * @desc Pausar/Retomar processamento da fila de upload
 * @access Private
 */
router.post('/upload-queue/toggle',
  async (req, res) => {
    try {
      const { action } = req.body; // 'pause' ou 'resume'
      
      if (!['pause', 'resume'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Ação deve ser "pause" ou "resume"'
        });
      }
      
      const result = await RecordingService.toggleUploadQueue(action);
      
      res.json({
        success: true,
        message: `Fila de upload ${action === 'pause' ? 'pausada' : 'retomada'} com sucesso`,
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao alterar status da fila de upload:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Rota genérica /:id deve vir por último para não interferir com rotas específicas
/**
 * @route DELETE /api/recordings/:id
 * @desc Deletar uma gravação específica
 * @access Private
 */
router.delete('/:id',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      logger.info(`Usuário ${userId} deletando gravação ${recordingId}`);
      
      const result = await RecordingService.deleteRecording(recordingId, userId);
      
      res.json({
        success: true,
        message: 'Gravação deletada com sucesso',
        data: result
      });
      
    } catch (error) {
      logger.error('Erro ao deletar gravação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/:id
 * @desc Obter detalhes de uma gravação específica
 * @access Private
 */
router.get('/:id',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const recordingId = req.params.id;
      
      const recording = await RecordingService.getRecordingById(recordingId, userId);
      
      if (!recording) {
        return res.status(404).json({
          success: false,
          message: 'Gravação não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: recording
      });
      
    } catch (error) {
      logger.error('Erro ao obter gravação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/recordings/camera/:cameraId/active
 * @desc Verificar se há gravação ativa para uma câmera
 * @access Private
 */
router.get('/camera/:cameraId/active',
  async (req, res) => {
    try {
      const { cameraId } = req.params;
      const userId = req.user.id;

      const activeRecording = await RecordingService.getActiveRecording(cameraId, userId);

      res.json({
        success: true,
        data: {
          hasActiveRecording: !!activeRecording,
          recording: activeRecording
        }
      });

    } catch (error) {
      logger.error('[API] Erro ao verificar gravação ativa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar gravação ativa'
      });
    }
  }
);

/**
 * @route POST /api/recordings/update-statistics
 * @desc Atualizar estatísticas das gravações (duração, tamanho, resolução)
 * @access Private
 */
router.post('/update-statistics',
  async (req, res) => {
    try {
      const { recordingId } = req.body;
      
      if (recordingId) {
        // Atualizar uma gravação específica
        const result = await RecordingService.updateSingleRecordingStatistics(recordingId);
        
        if (!result) {
          return res.status(404).json({
            success: false,
            message: 'Gravação não encontrada'
          });
        }
        
        res.json({
          success: true,
          message: 'Estatísticas da gravação atualizadas com sucesso',
          data: result
        });
      } else {
        // Atualizar todas as gravações com estatísticas zeradas
        const result = await RecordingService.updateRecordingStatistics();
        
        res.json({
          success: true,
          message: `Estatísticas atualizadas para ${result.updated} gravações`,
          data: result
        });
      }
      
    } catch (error) {
      logger.error('Erro ao atualizar estatísticas das gravações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// 🐛 DEBUG ENDPOINT - Informações detalhadas do sistema de gravação
router.get('/debug', async (req, res) => {
  try {
    logger.info('🔍 Endpoint de debug de gravações acessado');

    // 1. Status do RecordingMonitorService
    const monitorStatus = await req.app.locals.recordingMonitor?.getStatus?.() || { error: 'Monitor não disponível' };

    // 2. Status recente de gravações
    const { data: recentRecordings } = await supabaseAdmin
      .from('recordings')
      .select('id, camera_id, status, file_path, local_path, created_at, start_time, end_time')
      .order('created_at', { ascending: false })
      .limit(10);

    // 3. Status das câmeras
    const { data: cameras } = await supabaseAdmin
      .from('cameras')
      .select('id, name, status, is_streaming, recording_enabled, active')
      .eq('active', true);

    // 4. Verificar estado do ZLMediaKit
    let zlmStatus = { error: 'Não foi possível conectar' };
    try {
      const response = await axios.get(`${process.env.ZLM_API_URL || 'http://localhost:8000/index/api'}/getMediaList`, {
        params: { secret: process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK' },
        timeout: 3000
      });
      
      if (response.data.code === 0) {
        const streams = response.data.data || [];
        zlmStatus = {
          total_streams: streams.length,
          live_streams: streams.filter(s => s.app === 'live').length,
          recording_streams: streams.filter(s => s.isRecordingMP4).length,
          streams: streams.map(s => ({
            stream: s.stream,
            app: s.app,
            isRecordingMP4: s.isRecordingMP4,
            readerCount: s.readerCount
          }))
        };
      }
    } catch (error) {
      zlmStatus.error = error.message;
    }

    // 5. Verificar arquivos no sistema
    const storagePaths = [
      'storage/www/record/live',
      'storage/bin/www/record/live'
    ];

    const fileSystemStatus = {};
    for (const storagePath of storagePaths) {
      try {
        const fullPath = path.resolve(process.cwd(), storagePath);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          const cameraFolders = await fs.readdir(fullPath);
          fileSystemStatus[storagePath] = {
            exists: true,
            camera_folders: cameraFolders.length,
            folders: cameraFolders.slice(0, 5) // Primeiras 5 para não sobrecarregar
          };

          // Contar arquivos recentes para cada câmera
          for (const cameraFolder of cameraFolders.slice(0, 3)) { // Primeiras 3 câmeras
            try {
              const cameraPath = path.join(fullPath, cameraFolder);
              const today = new Date().toISOString().split('T')[0];
              const todayPath = path.join(cameraPath, today);
              
              try {
                const todayFiles = await fs.readdir(todayPath);
                const mp4Files = todayFiles.filter(f => f.endsWith('.mp4'));
                fileSystemStatus[storagePath].folders.forEach(folder => {
                  if (folder === cameraFolder) {
                    fileSystemStatus[storagePath][`${cameraFolder}_today_files`] = mp4Files.length;
                    fileSystemStatus[storagePath][`${cameraFolder}_sample_files`] = mp4Files.slice(0, 3);
                  }
                });
              } catch {
                fileSystemStatus[storagePath][`${cameraFolder}_today_files`] = 0;
              }
            } catch (err) {
              continue;
            }
          }
        }
      } catch (error) {
        fileSystemStatus[storagePath] = {
          exists: false,
          error: error.message
        };
      }
    }

    // 6. Gravações órfãs (sem file_path)
    const { data: orphanRecordings } = await supabaseAdmin
      .from('recordings')
      .select('id, camera_id, status, created_at')
      .is('file_path', null)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24h
      .order('created_at', { ascending: false });

    const debugInfo = {
      timestamp: new Date().toISOString(),
      system: {
        nodejs_version: process.version,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cwd: process.cwd()
      },
      recording_monitor: monitorStatus,
      zlmediakit: zlmStatus,
      filesystem: fileSystemStatus,
      database: {
        recent_recordings: recentRecordings?.length || 0,
        recordings_detail: recentRecordings || [],
        orphan_recordings: orphanRecordings?.length || 0,
        orphan_detail: orphanRecordings || [],
        active_cameras: cameras?.length || 0,
        cameras_with_recording: cameras?.filter(c => c.recording_enabled)?.length || 0
      },
      configuration: {
        ZLM_API_URL: process.env.ZLM_API_URL || 'http://localhost:8000/index/api',
        ZLM_SECRET: process.env.ZLM_SECRET ? '[CONFIGURED]' : '[MISSING]',
        SUPABASE_URL: process.env.SUPABASE_URL ? '[CONFIGURED]' : '[MISSING]'
      }
    };

    logger.info('✅ Debug info gerado com sucesso', {
      streams: zlmStatus.total_streams || 0,
      recordings: recentRecordings?.length || 0,
      orphans: orphanRecordings?.length || 0
    });

    res.json(debugInfo);

  } catch (error) {
    logger.error('❌ Erro no endpoint de debug:', error);
    res.status(500).json({
      error: 'Erro interno no debug',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route DELETE /api/recordings/multiple
 * @desc Deletar múltiplas gravações
 * @access Private
 */
router.delete('/multiple',
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { recording_ids, confirm } = req.body;

      // Validação
      if (!Array.isArray(recording_ids) || recording_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Lista de IDs de gravações é obrigatória'
        });
      }

      if (!confirm) {
        return res.status(400).json({
          success: false,
          message: 'Confirmação é obrigatória para deletar gravações'
        });
      }

      logger.info(`Usuário ${userId} deletando ${recording_ids.length} gravações`);

      let deletedCount = 0;
      const errors = [];

      // Deletar cada gravação
      for (const recordingId of recording_ids) {
        try {
          const result = await RecordingService.deleteRecording(recordingId, userId);
          if (result.success) {
            deletedCount++;
          }
        } catch (error) {
          logger.error(`Erro ao deletar gravação ${recordingId}:`, error);
          errors.push({
            recording_id: recordingId,
            error: error.message
          });
        }
      }

      logger.info(`${deletedCount} gravações deletadas com sucesso`);

      res.json({
        success: true,
        message: `${deletedCount} gravações deletadas com sucesso`,
        deleted_count: deletedCount,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      logger.error('Erro ao deletar múltiplas gravações:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao deletar gravações',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route PUT /api/recordings/:id/stop
 * @desc Parar gravação manualmente
 * @access Private
 */
router.put('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    logger.info(`🛑 [STOP RECORDING] Iniciando parada manual da gravação ${id}`, {
      userId: req.user.id,
      reason,
      timestamp: new Date().toISOString()
    });

    // Buscar gravação ativa
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', id)
      .eq('status', 'recording')
      .single();

    if (fetchError || !recording) {
      logger.warn(`⚠️ [STOP RECORDING] Gravação não encontrada ou não está ativa: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Gravação não encontrada ou não está ativa'
      });
    }

    // Verificar permissão de acesso à câmera
    if (req.user.role !== 'admin' && req.user.role !== 'integrator') {
      const hasAccess = req.user.camera_access?.includes(recording.camera_id);
      if (!hasAccess) {
        logger.warn(`🚫 [STOP RECORDING] Usuário ${req.user.id} sem acesso à câmera ${recording.camera_id}`);
        return res.status(403).json({
          success: false,
          message: 'Sem permissão para acessar esta câmera'
        });
      }
    }

    // Calcular duração se possível
    let duration = null;
    let endTime = new Date().toISOString();
    
    if (recording.start_time) {
      const startTime = new Date(recording.start_time);
      const now = new Date();
      duration = Math.round((now.getTime() - startTime.getTime()) / 1000);
    }

    // Atualizar status para completed
    const updateData = {
      status: 'completed',
      ended_at: endTime,
      end_time: endTime,
      duration: duration,
      metadata: {
        ...recording.metadata,
        stopped_by: req.user.id,
        stop_reason: reason,
        stopped_at: endTime,
        manual_stop: true
      },
      updated_at: new Date().toISOString()
    };

    const { data: updatedRecording, error: updateError } = await supabaseAdmin
      .from('recordings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error(`❌ [STOP RECORDING] Erro ao atualizar gravação ${id}:`, updateError);
      return res.status(500).json({
        success: false,
        message: 'Erro interno ao parar gravação'
      });
    }

    // Tentar parar gravação no ZLMediaKit se necessário
    try {
      const camera = await Camera.findById(recording.camera_id);
      if (camera) {
        const streamId = `${camera.id}`;
        const stopUrl = `${process.env.ZLM_API_URL}/stopRecord`;
        
        await axios.post(stopUrl, {
          secret: process.env.ZLM_SECRET,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId,
          type: 1 // MP4 recording
        });
        
        logger.info(`✅ [STOP RECORDING] Gravação parada no ZLMediaKit para stream ${streamId}`);
      }
    } catch (zlmError) {
      logger.warn(`⚠️ [STOP RECORDING] Erro ao parar gravação no ZLMediaKit (não crítico):`, zlmError.message);
    }

    logger.info(`✅ [STOP RECORDING] Gravação ${id} parada com sucesso`, {
      duration: duration,
      reason: reason,
      stoppedBy: req.user.email
    });

    res.json({
      success: true,
      message: 'Gravação parada com sucesso',
      data: {
        id: updatedRecording.id,
        status: updatedRecording.status,
        duration: updatedRecording.duration,
        ended_at: updatedRecording.ended_at
      }
    });

  } catch (error) {
    logger.error(`❌ [STOP RECORDING] Erro interno:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

export default router;