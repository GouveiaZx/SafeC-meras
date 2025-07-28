/**
 * Rotas de gerenciamento de streams para o sistema NewCAM
 * Controle de streaming de vídeo em tempo real
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { Camera } from '../models/Camera.js';
import { User } from '../models/User.js';
import { 
  authenticateToken, 
  requireRole, 
  requirePermission,
  requireCameraAccess 
} from '../middleware/auth.js';
import { 
  createValidationSchema, 
  validateParams 
} from '../middleware/validation.js';
import { 
  asyncHandler, 
  NotFoundError, 
  ValidationError,
  ConflictError 
} from '../middleware/errorHandler.js';
import { createModuleLogger } from '../config/logger.js';
import streamingService from '../services/StreamingService.js';

// Função utilitária local
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

const router = express.Router();
const logger = createModuleLogger('StreamRoutes');

/**
 * Middleware de autenticação para HLS (suporta query parameter)
 * Corrigido para usar o mesmo padrão do middleware principal
 */
const authenticateHLS = async (req, res, next) => {
  try {
    logger.debug(`authenticateHLS - Requisição recebida: ${req.method} ${req.path}`);
    logger.debug(`authenticateHLS - Headers: ${JSON.stringify(req.headers)}`);
    logger.debug(`authenticateHLS - Query: ${JSON.stringify(req.query)}`);
    
    let token = null;
    
    // Tentar autenticação via header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      logger.debug('authenticateHLS - Token encontrado no header Authorization');
    }
    
    // Tentar autenticação via query parameter se não encontrou no header
    if (!token && req.query.token) {
      token = req.query.token;
      logger.debug('authenticateHLS - Token encontrado no query parameter');
    }
    
    if (!token) {
      logger.warn('authenticateHLS - Nenhum token fornecido');
      return res.status(401).json({
        error: 'Token de acesso requerido',
        message: 'Você precisa estar logado para acessar este recurso'
      });
    }
    
    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    logger.debug(`authenticateHLS - Token decodificado para userId: ${decoded.userId}`);
    
    // Buscar usuário no banco usando supabaseAdmin (mesmo padrão do middleware principal)
    const { supabaseAdmin } = await import('../config/database.js');
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (error || !user) {
      logger.warn(`authenticateHLS - Usuário não encontrado ou inativo: ${decoded.userId}`);
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
    }
    
    // Verificar se o usuário não foi bloqueado
    if (user.blocked_at) {
      logger.warn(`authenticateHLS - Usuário bloqueado: ${user.email}`);
      return res.status(403).json({
        error: 'Usuário bloqueado',
        message: 'Sua conta foi bloqueada. Entre em contato com o administrador.'
      });
    }
    
    // Adicionar informações do usuário à requisição (mesmo formato do middleware principal)
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions || [],
      camera_access: user.camera_access || []
    };
    
    logger.debug(`authenticateHLS - Usuário autenticado: ${user.email}`);
    next();
  } catch (error) {
    logger.error('authenticateHLS - Erro na autenticação:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token malformado',
        message: 'Token de acesso inválido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
    }
    
    return res.status(500).json({
      error: 'Erro interno',
      message: 'Erro ao verificar autenticação'
    });
  }
};

/**
 * @route GET /api/streams/test-auth
 * @desc Testar autenticação HLS
 * @access Public
 */
router.get('/test-auth', async (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token não fornecido',
        debug: {
          headers: req.headers,
          query: req.query
        }
      });
    }
    
    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário no banco
    const { supabaseAdmin } = await import('../config/database.js');
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado',
        debug: {
          userId: decoded.userId,
          error: error?.message
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Autenticação HLS funcionando',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Erro no teste de autenticação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno',
      error: error.message
    });
  }
});

/**
 * @route GET /api/streams/test-zlm
 * @desc Testar conectividade com ZLMediaKit (sem autenticação)
 * @access Public
 */
router.get('/test-zlm', async (req, res) => {
  try {
    // Testar conectividade diretamente com ZLMediaKit
    const tests = await streamingService.testConnectivity();
    const zlmTest = tests.find(test => test.server === 'zlm');
    
    if (zlmTest && zlmTest.status === 'online') {
      res.json({
        success: true,
        message: 'ZLMediaKit está online',
        data: {
          status: 'online',
          server: 'ZLMediaKit',
          url: streamingService.zlmApiUrl,
          response: zlmTest.response
        }
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'ZLMediaKit não está disponível',
        data: {
          status: 'offline',
          server: 'ZLMediaKit',
          url: streamingService.zlmApiUrl,
          error: zlmTest ? zlmTest.error : 'Servidor não encontrado'
        }
      });
    }
  } catch (error) {
    logger.error('Erro ao testar conectividade ZLMediaKit:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao testar conectividade',
      error: error.message
    });
  }
});

/**
 * @route GET /api/streams/:stream_id/hls/*
 * @desc Proxy para stream HLS com autenticação específica
 * @access Private (via token HLS)
 */
router.get('/:stream_id/hls/*',
  authenticateHLS,
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    const hlsPath = req.params[0] || 'hls.m3u8'; // Captura o resto do caminho
    
    logger.debug(`authenticateHLS - Stream ID recebido: ${stream_id}`);
    logger.debug(`authenticateHLS - HLS Path: ${hlsPath}`);
    logger.debug(`authenticateHLS - Usuário autenticado: ${req.user?.email}`);
    
    // Verificar se o stream existe nos streams ativos
    const activeStream = streamingService.getStream(stream_id);
    if (!activeStream) {
      logger.warn(`Stream ${stream_id} não encontrado nos streams ativos`);
      return res.status(404).json({
        success: false,
        message: 'Stream não encontrado ou não está ativo'
      });
    }
    
    // Verificar permissão de acesso à câmera
    if (req.user.role !== 'admin' && 
        !req.user.camera_access.includes(activeStream.camera_id)) {
      logger.warn(`Usuário ${req.user.email} sem acesso à câmera ${activeStream.camera_id}`);
      return res.status(403).json({
        success: false,
        message: 'Sem permissão para acessar este stream'
      });
    }
    
    // Detectar qual servidor de streaming está sendo usado
    const streamingServer = process.env.STREAMING_SERVER || 'zlm';
    let proxyUrl;
    
    if (streamingServer === 'simple') {
      // Para SimpleStreamingService, usar porta 8081
      const SIMPLE_BASE_URL = `http://localhost:${process.env.SIMPLE_STREAMING_PORT || 8081}`;
      proxyUrl = `${SIMPLE_BASE_URL}/hls/${stream_id}/playlist.m3u8`;
    } else {
      // Para ZLMediaKit, usar porta 9902
      const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:9902';
      proxyUrl = `${ZLM_BASE_URL}/live/${stream_id}/${hlsPath}`;
    }
    
    logger.debug(`authenticateHLS - Fazendo proxy para: ${proxyUrl} (servidor: ${streamingServer})`);
    
    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        logger.error(`ZLMediaKit retornou erro: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Definir cabeçalhos apropriados
      res.set({
        'Content-Type': response.headers.get('content-type') || 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range'
      });
      
      // Pipe do stream usando ReadableStream
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (error) {
          logger.error('Erro no pipe do stream:', error);
          res.end();
        }
      };
      pump();
    } catch (error) {
      logger.error(`Erro ao fazer proxy HLS para ${proxyUrl}:`, error.message);
      res.status(502).json({
        success: false,
        message: 'Erro ao acessar stream HLS',
        error: error.message
      });
    }
  })
);

// Aplicar autenticação a todas as outras rotas
router.use(authenticateToken);

/**
 * @route GET /api/streams
 * @desc Listar streams ativos
 * @access Private
 */
router.get('/',
  requirePermission('streams.view'),
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      status = null,
      quality = null
    } = req.query;

    // Obter streams ativos do serviço
    let streams = streamingService.getActiveStreams();

    // Filtrar por status se especificado
    if (status) {
      streams = streams.filter(stream => stream.status === status);
    }

    // Filtrar por qualidade se especificado
    if (quality) {
      streams = streams.filter(stream => stream.quality === quality);
    }

    // Filtrar por acesso do usuário se não for admin
    if (req.user.role !== 'admin') {
      streams = streams.filter(stream => 
        req.user.camera_access.includes(stream.camera_id)
      );
    }

    // Paginação
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    const paginatedStreams = streams.slice(startIndex, endIndex);
    const totalPages = Math.ceil(streams.length / limitNum);

    logger.info(`Lista de streams solicitada por: ${req.user.email}`);

    res.json({
      message: 'Streams listados com sucesso',
      data: paginatedStreams,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: streams.length,
        pages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  })
);

/**
 * @route GET /api/streams/stats
 * @desc Obter estatísticas de streams
 * @access Private (Admin/Operator)
 */
router.get('/stats',
  requireRole(['admin', 'operator']),
  asyncHandler(async (req, res) => {
    // Obter estatísticas do serviço de streaming
    const stats = await streamingService.getStreamingStats();

    logger.info(`Estatísticas de streams solicitadas por: ${req.user.email}`);

    res.json({
      message: 'Estatísticas obtidas com sucesso',
      data: stats
    });
  })
);

/**
 * @route POST /api/streams/:camera_id/start
 * @desc Iniciar stream de uma câmera
 * @access Private
 */
router.post('/:camera_id/start',
  validateParams({
    camera_id: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  requireCameraAccess,
  requirePermission('streams.control'),
  createValidationSchema({
    quality: {
      required: false,
      enum: ['low', 'medium', 'high', 'ultra'],
      default: 'medium'
    },
    format: {
      required: false,
      enum: ['hls', 'rtmp', 'webrtc'],
      default: 'hls'
    },
    audio: {
      required: false,
      type: 'boolean',
      default: true
    }
  }),
  asyncHandler(async (req, res) => {
    const { camera_id } = req.params;
    const { quality, format, audio } = req.validatedData;

    // Verificar se câmera existe e está online
    const camera = await Camera.findById(camera_id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }

    if (camera.status !== 'online') {
      throw new ValidationError('Câmera não está online');
    }

    // Obter token do usuário para autenticação HLS
    const userToken = req.headers.authorization?.substring(7); // Remove 'Bearer '
    
    // Iniciar stream usando o serviço de streaming
    const streamConfig = await streamingService.startStream(camera, {
      quality,
      format,
      audio,
      userId: req.user.id,
      userToken
    });

    logger.info(`Stream iniciado para câmera ${camera_id} por: ${req.user.email}`);

    res.status(201).json({
      message: 'Stream iniciado com sucesso',
      data: streamConfig
    });
  })
);

/**
 * @route POST /api/streams/:stream_id/stop
 * @desc Parar stream
 * @access Private
 */
router.post('/:stream_id/stop',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  requirePermission('streams.control'),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;

    // Verificar se stream existe
    const stream = streamingService.getStream(stream_id);
    if (!stream) {
      throw new NotFoundError('Stream não encontrado');
    }

    // Verificar permissão para parar o stream
    if (req.user.role !== 'admin' && 
        !req.user.camera_access.includes(stream.camera_id)) {
      throw new AuthorizationError('Sem permissão para controlar este stream');
    }

    // Parar stream usando o serviço
    const stoppedStream = await streamingService.stopStream(stream_id, req.user.id);

    logger.info(`Stream ${stream_id} parado por: ${req.user.email}`);

    res.json({
      message: 'Stream parado com sucesso',
      data: stoppedStream
    });
  })
);

/**
 * @route GET /api/streams/:stream_id
 * @desc Obter informações de um stream específico
 * @access Private
 */
router.get('/:stream_id',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  requirePermission('streams.view'),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;

    const stream = streamingService.getStream(stream_id);
    if (!stream) {
      throw new NotFoundError('Stream não encontrado');
    }

    // Verificar acesso à câmera
    if (req.user.role !== 'admin' && 
        !req.user.camera_access.includes(stream.camera_id)) {
      throw new AuthorizationError('Sem permissão para visualizar este stream');
    }

    res.json({
      message: 'Stream encontrado',
      data: stream
    });
  })
);



/**
 * @route GET /api/streams/:stream_id/flv
 * @desc Proxy para stream FLV
 * @access Private
 */
router.get('/:stream_id/flv',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    
    const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:8000';
    const zlmUrl = `${ZLM_BASE_URL}/live/${stream_id}_flv_medium.live.flv`;
    
    try {
      const response = await fetch(zlmUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Definir cabeçalhos apropriados
      res.set({
        'Content-Type': 'video/x-flv',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      // Pipe do stream usando ReadableStream
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (error) {
          res.end();
        }
      };
      pump();
    } catch (error) {
      logger.error(`Erro ao fazer proxy FLV para ${zlmUrl}:`, error.message);
      res.status(502).json({
        success: false,
        message: 'Erro ao acessar stream FLV',
        error: error.message
      });
    }
  })
);

/**
 * @route GET /api/streams/:stream_id/thumbnail
 * @desc Proxy para thumbnail do stream
 * @access Private
 */
router.get('/:stream_id/thumbnail',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    
    const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:8000';
    const zlmUrl = `${ZLM_BASE_URL}/live/${stream_id}.live.jpg`;
    
    try {
      const response = await fetch(zlmUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Definir cabeçalhos apropriados
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*'
      });
      
      // Pipe da imagem usando ReadableStream
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (error) {
          res.end();
        }
      };
      pump();
    } catch (error) {
      logger.error(`Erro ao fazer proxy thumbnail para ${zlmUrl}:`, error.message);
      res.status(502).json({
        success: false,
        message: 'Erro ao acessar thumbnail',
        error: error.message
      });
    }
  })
);

/**
 * @route POST /api/streams/:stream_id/join
 * @desc Entrar em um stream (adicionar viewer)
 * @access Private
 */
router.post('/:stream_id/join',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  requirePermission('streams.view'),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    const userId = req.user.id;

    const stream = streamingService.getStream(stream_id);
    if (!stream) {
      throw new NotFoundError('Stream não encontrado');
    }

    // Verificar acesso à câmera
    if (req.user.role !== 'admin' && 
        !req.user.camera_access.includes(stream.camera_id)) {
      throw new AuthorizationError('Sem permissão para visualizar este stream');
    }

    if (stream.status !== 'active') {
      throw new ValidationError('Stream não está ativo');
    }

    // Adicionar usuário aos viewers
    const viewerCount = streamingService.addViewer(stream_id, userId);

    logger.info(`Usuário ${req.user.email} entrou no stream ${stream_id}`);

    res.json({
        message: 'Entrou no stream com sucesso',
        data: {
          stream_id,
          urls: stream.urls,
          quality: stream.quality,
          format: stream.format,
          viewers: viewerCount
        }
      });
  })
);

/**
 * @route POST /api/streams/:stream_id/leave
 * @desc Sair de um stream (remover viewer)
 * @access Private
 */
router.post('/:stream_id/leave',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    const userId = req.user.id;

    // Remover usuário dos viewers
    streamingService.removeViewer(stream_id, userId);

    logger.info(`Usuário ${req.user.email} saiu do stream ${stream_id}`);

    res.json({
      message: 'Saiu do stream com sucesso'
    });
  })
);

/**
 * @route PUT /api/streams/:stream_id/quality
 * @desc Alterar qualidade do stream
 * @access Private (Admin/Operator)
 */
router.put('/:stream_id/quality',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  requirePermission('streams.control'),
  createValidationSchema({
    quality: {
      required: true,
      enum: ['low', 'medium', 'high', 'ultra']
    }
  }),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    const { quality } = req.validatedData;

    const stream = streamingService.getStream(stream_id);
    if (!stream) {
      throw new NotFoundError('Stream não encontrado');
    }

    // Verificar permissão para controlar o stream
    if (req.user.role !== 'admin' && 
        !req.user.camera_access.includes(stream.camera_id)) {
      throw new AuthorizationError('Sem permissão para controlar este stream');
    }

    if (stream.status !== 'active') {
      throw new ValidationError('Stream não está ativo');
    }

    // Atualizar qualidade (implementação simplificada)
    const oldQuality = stream.quality;
    stream.quality = quality;
    stream.bitrate = streamingService.getQualityBitrate(quality);
    stream.resolution = streamingService.getQualityResolution(quality, stream.resolution);
    stream.quality_changed_at = new Date().toISOString();
    stream.quality_changed_by = req.user.id;

    // Nota: Mudança de qualidade em tempo real requer reinicialização do stream

    logger.info(`Qualidade do stream ${stream_id} alterada de ${oldQuality} para ${quality} por: ${req.user.email}`);

    res.json({
      message: 'Qualidade do stream alterada com sucesso',
      data: stream
    });
  })
);

/**
 * @route GET /api/streams/:stream_id/viewers
 * @desc Listar viewers de um stream
 * @access Private (Admin/Operator)
 */
router.get('/:stream_id/viewers',
  validateParams({
    stream_id: {
      required: true,
      type: 'nonEmptyString',
      message: 'ID do stream é obrigatório'
    }
  }),
  requireRole(['admin', 'operator']),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;

    const stream = streamingService.getStream(stream_id);
    if (!stream) {
      throw new NotFoundError('Stream não encontrado');
    }

    const viewers = streamingService.getViewers(stream_id);
    
    // Buscar informações dos usuários viewers
    const viewerList = [];
    
    if (viewers.size > 0) {
      const { supabase } = await import('../config/database.js');
      const viewerIds = Array.from(viewers);
      
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, role')
        .in('id', viewerIds);
      
      if (!usersError && users) {
        viewerList.push(...users.map(user => ({
          user_id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          joined_at: new Date().toISOString() // Em produção, armazenar timestamp real
        })));
      } else {
        // Fallback para IDs apenas se houver erro
        viewerList.push(...viewerIds.map(userId => ({
          user_id: userId,
          joined_at: new Date().toISOString()
        })));
      }
    }

    res.json({
      message: 'Viewers listados com sucesso',
      data: {
        stream_id,
        total_viewers: viewers.size,
        viewers: viewerList
      }
    });
  })
);

export default router;