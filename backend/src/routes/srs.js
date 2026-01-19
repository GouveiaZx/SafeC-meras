/**
 * Rotas SRS - Callbacks específicos do Simple Realtime Server (SRS)
 * Mantém compatibilidade com o formato de resposta esperado pelo SRS
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import crypto from 'crypto';

const router = express.Router();
const logger = createModuleLogger('SRS-Hooks');

/**
 * Função utilitária para extrair camera_id do stream
 */
function extractCameraId(stream) {
  if (!stream) return null;
  
  // Formato esperado: {camera_id} ou {camera_id}_{format}_{quality}
  const streamParts = stream.split('_');
  const cameraId = streamParts[0];
  
  // Validar se é um UUID válido
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(cameraId)) {
    return cameraId;
  }
  
  // Se não é um UUID válido, gerar um UUID baseado no stream name
  const hash = crypto.createHash('md5').update(stream).digest('hex');
  
  // Converter hash MD5 para formato UUID v4
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16), // versão 4
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // variant
    hash.substring(20, 32)
  ].join('-');
  
  return uuid;
}

/**
 * SRS Hook: on_connect
 * Chamado quando um cliente se conecta ao SRS
 */
router.post('/on_connect', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, page_url } = req.body;
    
    logger.info('🔗 [SRS] Cliente conectado:', {
      client_id,
      ip,
      vhost,
      app,
      page_url
    });
    
    // SRS espera código 0 para permitir conexão
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_connect:', error);
    res.json({ code: 1 }); // Código 1 = rejeitar conexão
  }
});

/**
 * SRS Hook: on_close
 * Chamado quando um cliente se desconecta do SRS
 */
router.post('/on_close', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, send_bytes, recv_bytes } = req.body;
    
    logger.info('🔌 [SRS] Cliente desconectado:', {
      client_id,
      ip,
      vhost,
      app,
      send_bytes,
      recv_bytes
    });
    
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_close:', error);
    res.json({ code: 0 }); // Sempre permitir desconexão
  }
});

/**
 * SRS Hook: on_publish
 * Chamado quando alguém inicia publicação de stream
 */
router.post('/on_publish', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream, param } = req.body;
    
    logger.info('📡 [SRS] Publicação iniciada:', {
      client_id,
      ip,
      vhost,
      app,
      stream,
      param
    });
    
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      await supabaseAdmin
        .from('cameras')
        .update({
          status: 'online',
          is_streaming: true,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      logger.info('✅ [SRS] Câmera marcada como streaming ativo:', { cameraId });
    }
    
    // SRS espera código 0 para permitir publicação
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_publish:', error);
    res.json({ code: 1 }); // Código 1 = rejeitar publicação
  }
});

/**
 * SRS Hook: on_unpublish
 * Chamado quando uma publicação de stream é finalizada
 */
router.post('/on_unpublish', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream } = req.body;
    
    logger.info('📡 [SRS] Publicação finalizada:', {
      client_id,
      ip,
      vhost,
      app,
      stream
    });
    
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      await supabaseAdmin
        .from('cameras')
        .update({
          status: 'offline',
          is_streaming: false,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      logger.info('🔴 [SRS] Câmera marcada como stream parado:', { cameraId });
    }
    
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_unpublish:', error);
    res.json({ code: 0 }); // Sempre permitir unpublish
  }
});

/**
 * SRS Hook: on_play
 * Chamado quando alguém inicia reprodução de stream
 */
router.post('/on_play', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream, param, page_url } = req.body;
    
    logger.info('📺 [SRS] Reprodução iniciada:', {
      client_id,
      ip,
      vhost,
      app,
      stream,
      param,
      page_url
    });
    
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      logger.info(`✅ [SRS] Nova visualização da câmera ${cameraId} por ${ip}`);
    }
    
    // SRS espera código 0 para permitir reprodução
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_play:', error);
    res.json({ code: 1 }); // Código 1 = rejeitar reprodução
  }
});

/**
 * SRS Hook: on_stop
 * Chamado quando uma reprodução de stream é finalizada
 */
router.post('/on_stop', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream } = req.body;
    
    logger.info('📺 [SRS] Reprodução finalizada:', {
      client_id,
      ip,
      vhost,
      app,
      stream
    });
    
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_stop:', error);
    res.json({ code: 0 }); // Sempre permitir stop
  }
});

/**
 * SRS Hook: on_dvr
 * Chamado quando um segmento DVR (gravação) é finalizado
 * O SRS envia: client_id, ip, vhost, app, stream, cwd, file
 */
router.post('/on_dvr', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream, cwd, file } = req.body;

    logger.info('🎬 [SRS] Evento DVR recebido:', {
      client_id,
      ip,
      vhost,
      app,
      stream,
      cwd,
      file
    });

    const cameraId = extractCameraId(stream);

    if (cameraId && file) {
      // Extrair nome do arquivo do path completo
      const filename = file.split('/').pop();

      // Calcular path relativo para armazenamento
      // DVR path: ./objs/nginx/html/record/[app]/[stream]/[2006]-[01]-[02]/[stream].[timestamp].mp4
      const relativePath = file.replace('./objs/nginx/html/', '').replace(/^\//, '');

      // Verificar se câmera existe e tem gravação habilitada
      const { data: camera } = await supabaseAdmin
        .from('cameras')
        .select('id, name, recording_enabled, retention_days')
        .eq('id', cameraId)
        .single();

      if (!camera) {
        logger.warn(`📹 [SRS] Câmera ${cameraId} não encontrada - ignorando gravação`);
        return res.json({ code: 0 });
      }

      if (!camera.recording_enabled) {
        logger.info(`📹 [SRS] Gravação desabilitada para câmera ${camera.name} - ignorando`);
        return res.json({ code: 0 });
      }

      // Inserir registro de gravação no Supabase
      const { data: recording, error } = await supabaseAdmin
        .from('recordings')
        .insert({
          camera_id: cameraId,
          filename: filename,
          local_path: relativePath,
          file_path: relativePath,
          status: 'completed',
          duration: 1800, // Conforme configurado em dvr_duration
          file_size: 0, // Será atualizado depois se necessário
          source: 'srs_dvr',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        logger.error(`❌ [SRS] Erro ao salvar gravação no banco:`, error);
      } else {
        logger.info(`✅ [SRS] Gravação salva: ${filename} para câmera ${camera.name} (ID: ${recording.id})`);
      }
    }

    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_dvr:', error);
    res.json({ code: 0 });
  }
});

/**
 * SRS Hook: on_hls
 * Chamado durante eventos HLS
 */
router.post('/on_hls', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream, param, cwd, file, seq_no } = req.body;
    
    logger.debug('📼 [SRS] Evento HLS:', {
      client_id,
      ip,
      vhost,
      app,
      stream,
      file,
      seq_no
    });
    
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_hls:', error);
    res.json({ code: 0 });
  }
});

/**
 * SRS Hook: on_hls_notify
 * Chamado para notificações HLS (m3u8 atualizado)
 */
router.post('/on_hls_notify', async (req, res) => {
  try {
    const { client_id, ip, vhost, app, stream, param, cwd, file, url } = req.body;
    
    logger.debug('📋 [SRS] Notificação HLS:', {
      client_id,
      ip,
      vhost,
      app,
      stream,
      file,
      url
    });
    
    res.json({ code: 0 });
  } catch (error) {
    logger.error('❌ [SRS] Erro no hook on_hls_notify:', error);
    res.json({ code: 0 });
  }
});

/**
 * SRS Hook: heartbeat
 * Chamado periodicamente pelo SRS para verificar saúde
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { device_id, ip, summaries } = req.body;
    
    logger.debug('💓 [SRS] Heartbeat recebido:', {
      device_id,
      ip,
      summaries
    });
    
    res.json({ 
      code: 0,
      data: {
        enabled: true,
        heartbeat_interval: 30,
        summaries_enabled: false
      }
    });
  } catch (error) {
    logger.error('❌ [SRS] Erro no heartbeat:', error);
    res.json({ code: 0 });
  }
});

/**
 * Status endpoint para verificação de saúde dos hooks SRS
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    service: 'srs-hooks',
    timestamp: new Date().toISOString(),
    hooks: [
      'on_connect',
      'on_close', 
      'on_publish',
      'on_unpublish',
      'on_play',
      'on_stop',
      'on_dvr',
      'on_hls',
      'on_hls_notify',
      'heartbeat'
    ]
  });
});

export default router;