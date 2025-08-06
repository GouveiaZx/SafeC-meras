import express from 'express';
import WebhookController from '../controllers/WebhookController.js';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import logger from '../utils/logger.js';

const router = express.Router();
const zlmLogger = createModuleLogger('ZLMHooks');

/**
 * Middleware para log de webhooks
 */
router.use((req, res, next) => {
  logger.info(`[Webhook] ${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    }
  });
  next();
});

/**
 * Middleware para validar secret do ZLMediaKit (opcional)
 */
const validateSecret = (req, res, next) => {
  const secret = req.body.secret || req.query.secret;
  const expectedSecret = process.env.ZLMEDIAKIT_SECRET;
  
  if (expectedSecret && secret !== expectedSecret) {
    logger.warn('[Webhook] Secret inválido:', {
      received: secret,
      path: req.path
    });
    return res.status(401).json({
      code: -1,
      msg: 'Unauthorized: Invalid secret'
    });
  }
  
  next();
};

/**
 * POST /api/webhooks/zlmediakit/on_record_mp4
 * Webhook chamado quando uma gravação MP4 é finalizada
 */
router.post('/zlmediakit/on_record_mp4', validateSecret, async (req, res) => {
  try {
    await WebhookController.onRecordMP4(req, res);
  } catch (error) {
    logger.error('[Webhook] Erro no on_record_mp4:', error);
    res.status(500).json({
      code: -1,
      msg: 'Internal server error'
    });
  }
});

/**
 * POST /api/webhooks/zlmediakit/on_record_ts
 * Webhook chamado quando uma gravação HLS é finalizada
 */
router.post('/zlmediakit/on_record_ts', validateSecret, async (req, res) => {
  try {
    await WebhookController.onRecordTS(req, res);
  } catch (error) {
    logger.error('[Webhook] Erro no on_record_ts:', error);
    res.status(500).json({
      code: -1,
      msg: 'Internal server error'
    });
  }
});

/**
 * POST /api/webhooks/zlmediakit/on_record
 * Webhook genérico para gravações
 */
router.post('/zlmediakit/on_record', validateSecret, async (req, res) => {
  try {
    await WebhookController.onRecord(req, res);
  } catch (error) {
    logger.error('[Webhook] Erro no on_record:', error);
    res.status(500).json({
      code: -1,
      msg: 'Internal server error'
    });
  }
});

/**
 * GET /api/webhooks/ping
 * Endpoint para teste de conectividade
 */
router.get('/ping', async (req, res) => {
  try {
    await WebhookController.ping(req, res);
  } catch (error) {
    logger.error('[Webhook] Erro no ping:', error);
    res.status(500).json({
      code: -1,
      msg: 'Internal server error'
    });
  }
});

/**
 * POST /api/webhooks/ping
 * Endpoint para teste de conectividade (POST)
 */
router.post('/ping', async (req, res) => {
  try {
    await WebhookController.ping(req, res);
  } catch (error) {
    logger.error('[Webhook] Erro no ping:', error);
    res.status(500).json({
      code: -1,
      msg: 'Internal server error'
    });
  }
});

/**
 * Hook: on_stream_changed
 * Chamado quando o status de uma stream muda (criada/destruída)
 */
router.post('/zlmediakit/on_stream_changed', validateSecret, async (req, res) => {
  try {
    const { regist, app, stream, vhost, schema, params } = req.body;
    
    zlmLogger.info('Hook on_stream_changed recebido:', {
      regist, // true = stream criada, false = stream destruída
      app,
      stream,
      vhost,
      schema
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      if (regist) {
        // Stream foi criada
        await supabaseAdmin
          .from('cameras')
          .update({
            status: 'online',
            is_streaming: true,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', cameraId);
        
        zlmLogger.info(`Stream da câmera ${cameraId} foi criada`);
      } else {
        // Stream foi destruída
        await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', cameraId);
        
        zlmLogger.info(`Stream da câmera ${cameraId} foi destruída`);
      }
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_stream_changed:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_publish
 * Chamado quando uma stream é publicada no ZLMediaKit
 */
router.post('/zlmediakit/on_publish', validateSecret, async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    zlmLogger.info('Hook on_publish recebido:', {
      app,
      stream,
      vhost,
      schema,
      params
    });
    
    // Extrair camera_id do stream (formato: {camera_id}_{format}_{quality})
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      // Atualizar status da câmera no banco
      await supabaseAdmin
        .from('cameras')
        .update({
          status: 'online',
          is_streaming: true,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      zlmLogger.info(`Câmera ${cameraId} marcada como streaming ativo`);
    }
    
    // Retornar sucesso para o ZLMediaKit
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_publish:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_play
 * Chamado quando alguém inicia a reprodução de uma stream
 */
router.post('/zlmediakit/on_play', validateSecret, async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    zlmLogger.info('Hook on_play recebido:', {
      app,
      stream,
      vhost,
      schema,
      viewer_ip: ip,
      viewer_port: port,
      viewer_id: id
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      // Incrementar contador de visualizadores (opcional)
      zlmLogger.info(`Nova visualização da câmera ${cameraId} por ${ip}:${port}`);
    }
    
    // Permitir reprodução
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_play:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_none_reader
 * Chamado quando uma stream não tem mais visualizadores
 */
router.post('/zlmediakit/on_stream_none_reader', validateSecret, async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    zlmLogger.info('Hook on_stream_none_reader recebido:', {
      app,
      stream,
      vhost,
      schema
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      zlmLogger.info(`Stream da câmera ${cameraId} não tem mais visualizadores`);
      
      // Opcional: manter stream ativa ou parar para economizar recursos
      // Por enquanto, vamos manter ativa para monitoramento contínuo
    }
    
    res.json({ code: 0, close: false, msg: 'success' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_stream_none_reader:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_not_found
 * Chamado quando uma stream solicitada não é encontrada
 */
router.post('/zlmediakit/on_stream_not_found', validateSecret, async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    zlmLogger.warn('Hook on_stream_not_found recebido:', {
      app,
      stream,
      vhost,
      schema,
      requester_ip: ip,
      requester_port: port,
      requester_id: id
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      zlmLogger.warn(`Stream não encontrada para câmera ${cameraId}`);
      
      // Tentar reativar a câmera automaticamente
      try {
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('*')
          .eq('id', cameraId)
          .single();
        
        if (camera && camera.active) {
          zlmLogger.info(`Tentando reativar stream da câmera ${camera.name}`);
          
          // Importar e executar o serviço de streaming unificado
          const { default: unifiedStreamingService } = await import('../services/UnifiedStreamingService.js');
          
          // Tentar iniciar stream novamente
          const streamResult = await unifiedStreamingService.startStream(camera.id, {
            quality: 'medium',
            format: 'hls',
            audio: true
          });
          
          if (streamResult && streamResult.success) {
            zlmLogger.info(`Stream da câmera ${camera.name} reativada com sucesso`);
          } else {
            zlmLogger.error(`Falha ao reativar stream da câmera ${camera.name}: ${streamResult.error || streamResult.message}`);
          }
        }
      } catch (restartError) {
        zlmLogger.error(`Erro ao tentar reativar câmera ${cameraId}:`, restartError);
      }
    }
    
    // Retornar que não foi possível encontrar a stream
    res.json({ code: -1, msg: 'stream not found' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_stream_not_found:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_server_started
 * Chamado quando o ZLMediaKit inicia
 */
router.post('/zlmediakit/on_server_started', validateSecret, async (req, res) => {
  try {
    zlmLogger.info('Hook on_server_started recebido - ZLMediaKit iniciado');
    
    // Opcional: executar inicialização de câmeras quando ZLM reinicia
    setTimeout(async () => {
      try {
        const { default: startCameraStreaming } = await import('../scripts/startCameraStreaming.js');
        await startCameraStreaming();
        zlmLogger.info('Câmeras reinicializadas após restart do ZLMediaKit');
      } catch (error) {
        zlmLogger.error('Erro ao reinicializar câmeras:', error);
      }
    }, 5000); // Aguardar 5 segundos para ZLM estar totalmente pronto
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    zlmLogger.error('Erro no hook on_server_started:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Endpoint de status dos webhooks
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    hooks: [
      'on_publish',
      'on_play', 
      'on_stream_changed',
      'on_stream_not_found',
      'on_stream_none_reader',
      'on_server_started',
      'on_record_mp4',
      'on_record_ts',
      'on_record'
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * Middleware de tratamento de erros para webhooks
 */
router.use((error, req, res, next) => {
  logger.error('[Webhook] Erro não tratado:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });
  
  res.status(500).json({
    code: -1,
    msg: 'Internal server error'
  });
});

export default router;