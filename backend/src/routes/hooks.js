/**
 * Rotas de hooks do ZLMediaKit para o sistema NewCAM
 * Gerencia eventos de streaming em tempo real
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const router = express.Router();
const logger = createModuleLogger('ZLMHooks');

/**
 * Hook: on_publish
 * Chamado quando uma stream é publicada no ZLMediaKit
 */
router.post('/on_publish', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('Hook on_publish recebido:', {
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
      
      logger.info(`Câmera ${cameraId} marcada como streaming ativo`);
    }
    
    // Retornar sucesso para o ZLMediaKit
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_publish:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_play
 * Chamado quando alguém inicia a reprodução de uma stream
 */
router.post('/on_play', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    logger.info('Hook on_play recebido:', {
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
      logger.info(`Nova visualização da câmera ${cameraId} por ${ip}:${port}`);
    }
    
    // Permitir reprodução
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_play:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_changed
 * Chamado quando o status de uma stream muda (criada/destruída)
 */
router.post('/on_stream_changed', async (req, res) => {
  try {
    const { regist, app, stream, vhost, schema, params } = req.body;
    
    logger.info('Hook on_stream_changed recebido:', {
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
        
        logger.info(`Stream da câmera ${cameraId} foi criada`);
      } else {
        // Stream foi destruída
        await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', cameraId);
        
        logger.info(`Stream da câmera ${cameraId} foi destruída`);
      }
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_stream_changed:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_not_found
 * Chamado quando uma stream solicitada não é encontrada
 */
router.post('/on_stream_not_found', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    logger.warn('Hook on_stream_not_found recebido:', {
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
      logger.warn(`Stream não encontrada para câmera ${cameraId}`);
      
      // Tentar reativar a câmera automaticamente
      try {
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('*')
          .eq('id', cameraId)
          .single();
        
        if (camera && camera.active) {
          logger.info(`Tentando reativar stream da câmera ${camera.name}`);
          
          // Importar e executar o serviço de streaming
          const { default: streamingService } = await import('../services/StreamingService.js');
          
          // Tentar iniciar stream novamente
          await streamingService.startStream(camera, {
            quality: 'medium',
            format: 'hls',
            audio: true
          });
          
          logger.info(`Stream da câmera ${camera.name} reativada com sucesso`);
        }
      } catch (restartError) {
        logger.error(`Erro ao tentar reativar câmera ${cameraId}:`, restartError);
      }
    }
    
    // Retornar que não foi possível encontrar a stream
    res.json({ code: -1, msg: 'stream not found' });
  } catch (error) {
    logger.error('Erro no hook on_stream_not_found:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_none_reader
 * Chamado quando uma stream não tem mais visualizadores
 */
router.post('/on_stream_none_reader', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('Hook on_stream_none_reader recebido:', {
      app,
      stream,
      vhost,
      schema
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      logger.info(`Stream da câmera ${cameraId} não tem mais visualizadores`);
      
      // Opcional: manter stream ativa ou parar para economizar recursos
      // Por enquanto, vamos manter ativa para monitoramento contínuo
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_stream_none_reader:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_server_started
 * Chamado quando o ZLMediaKit inicia
 */
router.post('/on_server_started', async (req, res) => {
  try {
    logger.info('Hook on_server_started recebido - ZLMediaKit iniciado');
    
    // Opcional: executar inicialização de câmeras quando ZLM reinicia
    setTimeout(async () => {
      try {
        const { default: startCameraStreaming } = await import('../scripts/startCameraStreaming.js');
        await startCameraStreaming();
        logger.info('Câmeras reinicializadas após restart do ZLMediaKit');
      } catch (error) {
        logger.error('Erro ao reinicializar câmeras:', error);
      }
    }, 5000); // Aguardar 5 segundos para ZLM estar totalmente pronto
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_server_started:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Endpoint de status dos hooks
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
      'on_server_started'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;