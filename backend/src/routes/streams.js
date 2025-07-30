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

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * Middleware de autenticação para HLS (suporta query parameter)
 * Melhorado com tratamento CORS otimizado e logs detalhados
 */
const authenticateHLS = async (req, res, next) => {
  try {
    // Headers CORS primeiro (antes de qualquer validação)
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      logger.debug('🔄 HLS CORS preflight request handled');
      return res.status(200).end();
    }
    
    logger.debug(`🚀 HLS Auth - ${req.method} ${req.path}`);
    logger.debug(`🔍 HLS Auth - Origin: ${req.headers.origin || 'N/A'}`);
    logger.debug(`🔍 HLS Auth - User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'N/A'}...`);
    
    let token = null;
    let tokenSource = 'none';
    
    // Múltiplas fontes de token (prioridade: header > query > x-auth-token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      tokenSource = 'header';
      logger.debug('🔐 Token encontrado no header Authorization');
    }
    
    if (!token && req.query.token) {
      token = req.query.token;
      tokenSource = 'query';
      logger.debug('🔐 Token encontrado no query parameter');
    }
    
    if (!token && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
      tokenSource = 'x-auth-token';
      logger.debug('🔐 Token encontrado no header x-auth-token');
    }
    
    if (!token) {
      logger.warn('❌ HLS Auth - Nenhum token fornecido');
      return res.status(401).json({
        error: 'Token de acesso requerido',
        message: 'Autenticação necessária para acessar stream HLS',
        code: 'NO_TOKEN'
      });
    }
    
    // Validação básica do token
    if (typeof token !== 'string' || token.length < 10) {
      logger.warn('❌ HLS Auth - Token inválido (muito curto ou tipo incorreto)');
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Formato de token inválido',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }
    
    // Verificar token JWT com melhor error handling
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.debug(`✅ Token JWT válido para userId: ${decoded.userId} (fonte: ${tokenSource})`);
    } catch (jwtError) {
      logger.error('❌ Erro JWT:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expirado',
          message: 'Sua sessão expirou. Recarregue a página.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Token malformado',
          message: 'Token de acesso inválido',
          code: 'MALFORMED_TOKEN'
        });
      }
      
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Falha na verificação do token',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }
    
    // Buscar usuário no banco usando supabaseAdmin
    const { supabaseAdmin } = await import('../config/database.js');
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single();
    
    if (error || !user) {
      logger.warn(`❌ Usuário não encontrado ou inativo: ${decoded.userId}`);
      return res.status(401).json({
        error: 'Usuário inválido',
        message: 'Usuário não encontrado ou inativo',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Verificar se o usuário não foi bloqueado
    if (user.blocked_at) {
      logger.warn(`❌ Usuário bloqueado: ${user.email}`);
      return res.status(403).json({
        error: 'Usuário bloqueado',
        message: 'Sua conta foi bloqueada. Entre em contato com o administrador.',
        code: 'USER_BLOCKED'
      });
    }
    
    // Adicionar informações do usuário à requisição
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions || [],
      camera_access: user.camera_access || []
    };
    
    logger.debug(`✅ HLS autenticado: ${user.email} (${user.role}) via ${tokenSource}`);
    next();
    
  } catch (error) {
    logger.error('💥 Erro crítico no middleware HLS:', error);
    
    // Headers CORS mesmo em caso de erro
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    
    return res.status(500).json({
      error: 'Erro interno',
      message: 'Erro ao processar autenticação HLS',
      code: 'INTERNAL_ERROR'
    });
  }
};







/**
 * @route GET /api/streams/:stream_id/hls
 * @desc Redirecionar para o manifesto HLS principal
 * @access Private (requer token HLS)
 */
router.get('/:stream_id/hls', authenticateHLS, asyncHandler(async (req, res) => {
  const { stream_id } = req.params;
  const { token } = req.query;
  
  // Redirecionar para o arquivo principal do manifesto HLS
  const redirectUrl = `/api/streams/${stream_id}/hls/hls.m3u8${token ? `?token=${token}` : ''}`;
  res.redirect(302, redirectUrl);
}));

/**
 * @route GET /api/streams/:stream_id/hls/*
 * @desc Rota de proxy para manifestos HLS (.m3u8) e segmentos (.ts)
 * @access Private (via token HLS)
 */
router.get('/:stream_id/hls/*', authenticateHLS, asyncHandler(async (req, res) => {
  const { stream_id } = req.params;
  const file = req.params[0] || 'hls.m3u8'; // Captura todo o caminho restante ou usa o default
  const { token } = req.query;

  if (!file.endsWith('.m3u8') && !file.endsWith('.ts')) {
    return res.status(400).send('Tipo de arquivo inválido.');
  }

  const activeStream = streamingService.getStream(stream_id);
  if (!activeStream) {
    return res.status(404).send('Stream não encontrado.');
  }

  if (req.user.role !== 'admin' && !req.user.camera_access.includes(activeStream.camera_id)) {
    return res.status(403).send('Acesso negado a este stream.');
  }

  const ZLM_BASE_URL = process.env.ZLM_BASE_URL || 'http://localhost:8001';
  const proxyUrl = `${ZLM_BASE_URL}/live/${stream_id}/${file}`;

  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    if (file.endsWith('.m3u8')) {
      let manifest = await response.text();
      const baseUrl = `/api/streams/${stream_id}/hls`;

      // Reescreve as URLs para apontar para o nosso proxy
      manifest = manifest.replace(/^(.*\.m3u8)$/gm, `${baseUrl}/$1?token=${token}`)
                         .replace(/^(.*\.ts)$/gm, `${baseUrl}/$1?token=${token}`);

      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(manifest);
    } else {
      res.set('Content-Type', 'video/mp2t');
      if (req.method === 'HEAD') {
        res.set('Content-Length', response.headers.get('content-length') || '0');
        res.end();
      } else {
        const reader = response.body.getReader();
        const pump = () => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          });
        };
        pump().catch(err => {
          logger.error('Erro ao fazer stream do segmento:', err);
          res.end();
        });
      }
    }
  } catch (error) {
    logger.error(`Erro no proxy HLS para ${proxyUrl}:`, error);
    res.status(500).send('Erro interno no proxy HLS.');
  }
}));

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
 * @route POST /api/streams/:cameraId/start
 * @desc Iniciar stream de uma câmera
 * @access Private
 */
router.post('/:cameraId/start',
  // LOG DETALHADO ANTES DOS MIDDLEWARES
  (req, res, next) => {
    console.log('🔍 [STREAM START DEBUG] === INÍCIO DA REQUISIÇÃO ===');
    console.log('🔍 [STREAM START DEBUG] URL:', req.originalUrl);
    console.log('🔍 [STREAM START DEBUG] Method:', req.method);
    console.log('🔍 [STREAM START DEBUG] Headers:', {
      authorization: req.headers.authorization ? 'Bearer [PRESENTE]' : 'AUSENTE',
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    });
    console.log('🔍 [STREAM START DEBUG] Params RAW:', req.params);
    console.log('🔍 [STREAM START DEBUG] Body RAW:', req.body);
    console.log('🔍 [STREAM START DEBUG] Query:', req.query);
    console.log('🔍 [STREAM START DEBUG] User antes dos middlewares:', req.user || 'UNDEFINED');
    next();
  },
  validateParams({
    cameraId: {
      required: true,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    }
  }),
  // LOG APÓS VALIDAÇÃO DE PARAMS
  (req, res, next) => {
    console.log('🔍 [STREAM START DEBUG] === APÓS VALIDAÇÃO DE PARAMS ===');
    console.log('🔍 [STREAM START DEBUG] Params validados:', req.params);
    console.log('🔍 [STREAM START DEBUG] Erros de validação:', req.validationErrors || 'NENHUM');
    next();
  },
  requireCameraAccess,
  // LOG APÓS CAMERA ACCESS
  (req, res, next) => {
    console.log('🔍 [STREAM START DEBUG] === APÓS CAMERA ACCESS ===');
    console.log('🔍 [STREAM START DEBUG] User após camera access:', req.user || 'UNDEFINED');
    next();
  },
  requirePermission('streams.control'),
  // LOG APÓS PERMISSION
  (req, res, next) => {
    console.log('🔍 [STREAM START DEBUG] === APÓS PERMISSION CHECK ===');
    console.log('🔍 [STREAM START DEBUG] User após permission:', req.user || 'UNDEFINED');
    next();
  },
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
  // LOG APÓS VALIDAÇÃO DE SCHEMA
  (req, res, next) => {
    console.log('🔍 [STREAM START DEBUG] === APÓS VALIDAÇÃO DE SCHEMA ===');
    console.log('🔍 [STREAM START DEBUG] ValidatedData:', req.validatedData || 'UNDEFINED');
    console.log('🔍 [STREAM START DEBUG] Erros de schema:', req.validationErrors || 'NENHUM');
    next();
  },
  asyncHandler(async (req, res) => {
    console.log('🔍 [STREAM START DEBUG] === DENTRO DO HANDLER PRINCIPAL ===');
    console.log('🔍 [STREAM START DEBUG] Dados finais recebidos:', {
      params: req.params,
      body: req.body,
      validatedData: req.validatedData,
      user: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : null,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [PRESENTE]' : 'AUSENTE',
        'content-type': req.headers['content-type']
      },
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    
    const { cameraId } = req.params;
    const { quality, format, audio } = req.validatedData;

    try {
      // Verificar se câmera existe
      console.log('🔍 [STREAM START DEBUG] Buscando câmera com ID:', cameraId);
      const camera = await Camera.findById(cameraId);
      if (!camera) {
        console.log('❌ [STREAM START DEBUG] Câmera não encontrada para ID:', cameraId);
        throw new NotFoundError('Câmera não encontrada');
      }
      
      console.log('✅ [STREAM START DEBUG] Câmera encontrada:', {
        id: camera.id,
        name: camera.name,
        status: camera.status,
        stream_type: camera.stream_type,
        rtmp_url: camera.rtmp_url,
        rtsp_url: camera.rtsp_url,
        ip_address: camera.ip_address
      });

      // Permitir iniciar stream mesmo se câmera estiver offline
      // O streaming service tentará conectar e atualizar o status
      logger.info(`Tentando iniciar stream para câmera ${camera.name} (status: ${camera.status})`);

      // Obter token do usuário para autenticação HLS
      const userToken = req.headers.authorization?.substring(7); // Remove 'Bearer '
      
      console.log('🔍 [STREAM START DEBUG] Parâmetros para startStream:', {
        quality,
        format,
        audio,
        userId: req.user.id,
        userToken: userToken ? 'PRESENTE' : 'AUSENTE'
      });
      
      // Iniciar stream usando o serviço de streaming
      const streamConfig = await streamingService.startStream(camera, {
        quality,
        format,
        audio,
        userId: req.user.id,
        userToken
      });
      
      console.log('✅ [STREAM START DEBUG] Stream iniciado com sucesso:', streamConfig);

      logger.info(`Stream iniciado para câmera ${cameraId} por: ${req.user.email}`);

      res.status(201).json({
        message: 'Stream iniciado com sucesso',
        data: streamConfig
      });
    } catch (error) {
      console.log('❌ [STREAM START DEBUG] Erro ao iniciar stream:', {
        error: error.message,
        stack: error.stack,
        name: error.name,
        cameraId,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
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

    // Construir URLs completas para o cliente
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const streamInfo = {
      ...stream,
      urls: {
        ...stream.urls,
        hls: `${baseUrl}/api/streams/${stream_id}/hls`,
        flv: `${baseUrl}/api/streams/${stream_id}/flv`,
        thumbnail: `${baseUrl}/api/streams/${stream_id}/thumbnail`
      }
    };

    res.json({
      message: 'Stream encontrado',
      data: streamInfo
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
    const zlmUrl = `${ZLM_BASE_URL}/live/${stream_id}.live.flv`;
    
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
 * @route PUT /api/streams/:stream_id/settings
 * @desc Atualizar configurações do stream (qualidade e FPS)
 * @access Private (Admin/Operator)
 */
router.put('/:stream_id/settings',
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
      required: false,
      enum: ['low', 'medium', 'high', 'ultra']
    },
    fps: {
      required: false,
      type: 'number',
      min: 15,
      max: 60
    }
  }),
  asyncHandler(async (req, res) => {
    const { stream_id } = req.params;
    const { quality, fps } = req.validatedData;

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

    // Atualizar configurações
    const oldSettings = {
      quality: stream.quality,
      fps: stream.fps
    };

    if (quality) {
      stream.quality = quality;
      stream.resolution = streamingService.getQualityResolution(quality, stream.resolution);
      stream.bitrate = streamingService.getQualityBitrate(quality);
    }

    if (fps) {
      stream.fps = fps;
    }

    stream.settings_changed_at = new Date().toISOString();
    stream.settings_changed_by = req.user.id;

    // Nota: Mudança de configurações em tempo real requer reinicialização do stream

    logger.info(`Configurações do stream ${stream_id} alteradas por: ${req.user.email}`, {
      old: oldSettings,
      new: { quality: stream.quality, fps: stream.fps }
    });

    res.json({
      message: 'Configurações do stream atualizadas com sucesso',
      data: {
        id: stream.id,
        quality: stream.quality,
        fps: stream.fps,
        resolution: stream.resolution,
        bitrate: stream.bitrate
      }
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