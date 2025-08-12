import express from 'express';
// Middleware de autenticação aplicado globalmente no server.js
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { Camera } from '../models/Camera.js';
import RecordingService from '../services/RecordingService.js';
import ImprovedRecordingService from '../services/RecordingService_improved.js';
import { promises as fs } from 'fs';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/database.js';
import S3Service from '../services/S3Service.js';
import { computeEtag, computeLastModified, evaluateConditionalCache, setStandardCacheHeaders } from '../utils/httpCache.js';

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
        
        // Verificar permissão de acesso à câmera
        const userCameras = await Camera.findByUserId(userId);
        const hasAccess = userCameras.some(cam => cam.id === filters.camera_id);
        
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado à câmera especificada'
          });
        }
      }
      
      const result = await RecordingService.searchRecordings(userId, filters);
      
      res.json({
        success: true,
        data: result.data || result.recordings || [],
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: result.pages
        },
        filters: result.appliedFilters
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
          logger.debug(`[StreamAuth] Usuário autenticado via JWT interno: ${user.id}`);
          return next();
        }

        logger.warn('[StreamAuth] JWT válido, mas usuário não encontrado/ativo na base');
        return res.status(401).json({ success: false, message: 'Token inválido' });
      }
    } catch (e) {
      // Ignorar e tentar fallback Supabase
      logger.debug('[StreamAuth] Falha na validação JWT interno, tentando Supabase...');
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
 */
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

      const downloadInfo = await ImprovedRecordingService.prepareDownload(recordingId);

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

      const { stream } = await ImprovedRecordingService.getFileStream(filePath);
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

/**
 * @route HEAD /api/recordings/:id/download
 * @desc Headers para download de uma gravação
 * @access Private
 */
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

      const downloadInfo = await ImprovedRecordingService.prepareDownload(recordingId);
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

/**
 * @route GET /api/recordings/:id/stream
 * @desc Stream de uma gravação para reprodução
 * @access Private
 */
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
      
      const downloadInfo = await ImprovedRecordingService.prepareDownload(recordingId);
      
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
        const { stream, contentLength, contentRange } = await ImprovedRecordingService.getFileStream(filePath, range);
        
        res.status(206);
        res.setHeader('Content-Range', contentRange);
        res.setHeader('Content-Length', contentLength);
        
        stream.pipe(res);
      } else {
        // Request completo
        const { stream, contentLength } = await ImprovedRecordingService.getFileStream(filePath);
        
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

/**
 * @route HEAD /api/recordings/:id/stream
 * @desc Headers para stream de uma gravação
 * @access Private
 */
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

      const downloadInfo = await ImprovedRecordingService.prepareDownload(recordingId);
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
        const { contentLength, contentRange } = await ImprovedRecordingService.getFileStream(filePath, range);
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

export default router;