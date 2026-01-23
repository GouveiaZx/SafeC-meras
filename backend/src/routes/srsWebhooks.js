/**
 * SRS Webhook Routes
 *
 * Handles HTTP callbacks from SRS (Simple Realtime Server) for stream events.
 * These endpoints are called by SRS when streams start (on_publish) and stop (on_unpublish).
 *
 * SRS Configuration Example:
 * http_hooks {
 *   enabled on;
 *   on_publish http://backend:3002/api/srs/webhook/on-publish;
 *   on_unpublish http://backend:3002/api/srs/webhook/on-unpublish;
 * }
 *
 * Endpoints:
 * - POST /api/srs/webhook/on-publish - Called when stream starts
 * - POST /api/srs/webhook/on-unpublish - Called when stream stops
 * - POST /api/srs/webhook/on-connect - Optional: client connection
 * - POST /api/srs/webhook/on-close - Optional: client disconnection
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import srsIntegrationService from '../services/SRSIntegrationService.js';
import { supabaseAdmin, TABLES } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import videoMetadata from '../utils/videoMetadata.js';

const router = express.Router();
const logger = createModuleLogger('SRSWebhooks');

/**
 * Validate SRS webhook signature (optional security layer)
 * Can be configured with SRS_WEBHOOK_SECRET env variable
 */
function validateWebhookSignature(req) {
  const webhookSecret = process.env.SRS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // If no secret configured, allow all webhooks
    return true;
  }

  const signature = req.headers['x-srs-signature'];
  if (!signature || signature !== webhookSecret) {
    logger.warn('Invalid webhook signature received');
    return false;
  }

  return true;
}

/**
 * Extract stream information from SRS webhook payload
 * SRS sends different payload formats depending on version
 */
function extractStreamInfo(body) {
  // SRS 4.x/5.x format
  if (body.stream) {
    return {
      streamKey: body.stream,
      app: body.app,
      tcUrl: body.tcUrl,
      ip: body.ip,
      vhost: body.vhost,
      serverId: body.server_id
    };
  }

  // Fallback for older SRS versions
  if (body.param) {
    const streamPath = body.param.split('/');
    return {
      streamKey: streamPath[streamPath.length - 1],
      app: streamPath[streamPath.length - 2] || 'live',
      tcUrl: body.tcUrl,
      ip: body.ip,
      vhost: body.vhost,
      serverId: body.server_id
    };
  }

  // Try to parse from tcUrl
  if (body.tcUrl) {
    const url = new URL(body.tcUrl);
    const pathParts = url.pathname.split('/').filter(p => p);
    return {
      streamKey: pathParts[pathParts.length - 1],
      app: pathParts[pathParts.length - 2] || 'live',
      tcUrl: body.tcUrl,
      ip: body.ip,
      vhost: body.vhost,
      serverId: body.server_id
    };
  }

  return null;
}

/**
 * POST /api/srs/webhook/on-publish
 * Called by SRS when a stream starts publishing
 *
 * Request Body (SRS format):
 * {
 *   action: "on_publish",
 *   client_id: number,
 *   ip: string,
 *   vhost: string,
 *   app: string,
 *   stream: string,
 *   param: string,
 *   tcUrl: string,
 *   server_id: string
 * }
 */
router.post('/on-publish', async (req, res, next) => {
  try {
    logger.info('SRS on_publish webhook received', {
      body: req.body,
      headers: req.headers
    });

    // Validate webhook signature
    if (!validateWebhookSignature(req)) {
      return res.status(403).json({
        code: 1,
        message: 'Invalid webhook signature'
      });
    }

    // Extract stream information
    const streamInfo = extractStreamInfo(req.body);

    if (!streamInfo || !streamInfo.streamKey) {
      logger.error('Failed to extract stream key from webhook', req.body);
      return res.status(400).json({
        code: 1,
        message: 'Invalid stream information'
      });
    }

    const { streamKey, app, ip, tcUrl } = streamInfo;

    logger.info(`Stream publish detected: ${streamKey} from ${ip}`);

    // Update stream status in database
    let updatedStream = await srsIntegrationService.handleStreamEvent(streamKey, 'publish');
    let cameraId = updatedStream?.camera_id;

    // If not found in rtmp_pool, try to find camera by rtmp_url or stream_key
    if (!cameraId) {
      // Try UUID match first
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(streamKey)) {
        const { data: cameraById } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .eq('id', streamKey)
          .single();
        if (cameraById) cameraId = cameraById.id;
      }

      // Try rtmp_url match
      if (!cameraId) {
        const { data: cameraByRtmp } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .ilike('rtmp_url', `%${streamKey}%`)
          .single();
        if (cameraByRtmp) {
          cameraId = cameraByRtmp.id;
          logger.info(`[SRS] Camera found by rtmp_url match for on_publish`, { streamKey, cameraId });
        }
      }

      // Try stream_key field
      if (!cameraId) {
        const { data: cameraByStreamKey } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .eq('stream_key', streamKey)
          .single();
        if (cameraByStreamKey) cameraId = cameraByStreamKey.id;
      }
    }

    if (!cameraId) {
      logger.warn(`Stream ${streamKey} not linked to any camera, allowing anyway`);
      return res.json({
        code: 0,
        message: 'Stream allowed (not linked to camera)'
      });
    }

    // Update camera status
    if (cameraId) {
      await supabaseAdmin
        .from(TABLES.CAMERAS)
        .update({
          is_streaming: true,
          status: 'online',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);

      logger.info(`Camera ${cameraId} marked as streaming`);

      // Registrar stream ativo no serviço em memória
      try {
        const { default: streamingService } = await import('../services/StreamingService.js');

        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
        const rawSrsBase = process.env.SRS_HLS_URL || process.env.SRS_BASE_URL || 'http://localhost:8081';
        const normalizedSrsBase = rawSrsBase.endsWith('/') ? rawSrsBase.slice(0, -1) : rawSrsBase;
        const srsLiveBase = normalizedSrsBase.endsWith('/live') ? normalizedSrsBase : `${normalizedSrsBase}/live`;
        const activeStreamKey = updatedStream?.stream_key || streamKey;

        // Buscar dados da câmera para metadados e flag de gravação
        const { data: cameraData } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('*')
          .eq('id', cameraId)
          .single();

        const streamConfig = {
          id: cameraId,
          camera_id: cameraId,
          camera_name: cameraData?.name || cameraId,
          status: 'active',
          server: 'srs',
          format: 'hls',
          quality: cameraData?.quality_profile || 'medium',
          audio: cameraData?.audio_enabled ?? true,
          stream_key: activeStreamKey,
          urls: {
            rtmp: cameraData?.rtmp_url || null,
            hls: `${backendUrl}/api/streams/${cameraId}/hls`,
            flv: `${backendUrl}/api/streams/${cameraId}/flv`,
            thumbnail: `${backendUrl}/api/streams/${cameraId}/thumbnail`
          },
          directUrls: {
            rtmp: cameraData?.rtmp_url || null,
            hls: `${srsLiveBase}/${activeStreamKey}.m3u8`,
            flv: `${srsLiveBase}/${activeStreamKey}.flv`,
            thumbnail: null
          },
          viewers: 0,
          created_by: 'srs-webhook'
        };

        streamingService.activeStreams.set(cameraId, streamConfig);
        if (!streamingService.streamViewers.get(cameraId)) {
          streamingService.streamViewers.set(cameraId, new Set());
        }

        logger.info(`📹 [SRS] Stream registrado em activeStreams para câmera ${cameraId}`);

        // Gravação é feita nativamente pelo SRS DVR (configurado em srs.conf)
        if (cameraData?.recording_enabled) {
          logger.info(`📹 [SRS] Câmera ${cameraId} com gravação habilitada - SRS DVR ativo`);
        }
      } catch (serviceError) {
        logger.error('Erro ao registrar stream/gravacao via webhook SRS:', serviceError);
      }
    }

    // Respond to SRS (code: 0 = success, allow stream)
    res.json({
      code: 0,
      message: 'Stream accepted'
    });

  } catch (error) {
    logger.error('Error handling on_publish webhook:', error);

    // Still allow the stream even if we have internal errors
    // This prevents SRS from rejecting legitimate streams
    res.json({
      code: 0,
      message: 'Stream allowed (error in handler)'
    });
  }
});

/**
 * POST /api/srs/webhook/on-unpublish
 * Called by SRS when a stream stops publishing
 *
 * Request Body: Same format as on_publish
 */
router.post('/on-unpublish', async (req, res, next) => {
  try {
    logger.info('SRS on_unpublish webhook received', {
      body: req.body,
      headers: req.headers
    });

    // Validate webhook signature
    if (!validateWebhookSignature(req)) {
      return res.status(403).json({
        code: 1,
        message: 'Invalid webhook signature'
      });
    }

    // Extract stream information
    const streamInfo = extractStreamInfo(req.body);

    if (!streamInfo || !streamInfo.streamKey) {
      logger.error('Failed to extract stream key from webhook', req.body);
      return res.status(400).json({
        code: 1,
        message: 'Invalid stream information'
      });
    }

    const { streamKey, ip } = streamInfo;

    logger.info(`Stream unpublish detected: ${streamKey} from ${ip}`);

    // Update stream status in database
    let updatedStream = await srsIntegrationService.handleStreamEvent(streamKey, 'unpublish');
    let cameraId = updatedStream?.camera_id;

    // FALLBACKS: Se não encontrou no pool, tentar encontrar câmera de outras formas
    // (igual ao on_publish para garantir consistência)
    if (!cameraId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Tentar UUID match primeiro
      if (uuidRegex.test(streamKey)) {
        const { data: cameraById } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .eq('id', streamKey)
          .single();
        if (cameraById) {
          cameraId = cameraById.id;
          logger.info(`[SRS] Camera encontrada por UUID para on_unpublish`, { streamKey, cameraId });
        }
      }

      // Tentar rtmp_url match
      if (!cameraId) {
        const { data: cameraByRtmp } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .ilike('rtmp_url', `%${streamKey}%`)
          .single();
        if (cameraByRtmp) {
          cameraId = cameraByRtmp.id;
          logger.info(`[SRS] Camera encontrada por rtmp_url para on_unpublish`, { streamKey, cameraId });
        }
      }

      // Tentar stream_key field
      if (!cameraId) {
        const { data: cameraByStreamKey } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id')
          .eq('stream_key', streamKey)
          .single();
        if (cameraByStreamKey) {
          cameraId = cameraByStreamKey.id;
          logger.info(`[SRS] Camera encontrada por stream_key para on_unpublish`, { streamKey, cameraId });
        }
      }
    }

    // Se não encontrou câmera por nenhum método, apenas loggar e retornar
    if (!cameraId) {
      logger.warn(`[SRS] Stream ${streamKey} não vinculado a nenhuma câmera - apenas confirmando unpublish`);
      return res.json({
        code: 0,
        message: 'Stream ended (not linked to camera)'
      });
    }

    // Atualizar status da câmera para offline
    await supabaseAdmin
      .from(TABLES.CAMERAS)
      .update({
        is_streaming: false,
        is_recording: false,
        status: 'offline',
        updated_at: new Date().toISOString()
      })
      .eq('id', cameraId);

    logger.info(`✅ [SRS] Camera ${cameraId} marcada como offline (streaming=false, recording=false)`);

    // Remover do serviço em memória
    try {
      const { default: streamingService } = await import('../services/StreamingService.js');
      streamingService.activeStreams.delete(cameraId);
      streamingService.streamViewers.delete(cameraId);
      logger.info(`📹 [SRS] Stream removido da memória - câmera ${cameraId}`);
    } catch (serviceError) {
      logger.error('Erro ao limpar stream via webhook SRS:', serviceError);
    }

    // Finalizar gravações ativas desta câmera no banco
    try {
      const { data: activeRecordings } = await supabaseAdmin
        .from('recordings')
        .select('id')
        .eq('camera_id', cameraId)
        .eq('status', 'recording');

      if (activeRecordings?.length > 0) {
        await supabaseAdmin
          .from('recordings')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .in('id', activeRecordings.map(r => r.id));

        logger.info(`📹 [SRS] Finalizadas ${activeRecordings.length} gravações para câmera ${cameraId}`);
      }
    } catch (recordingError) {
      logger.error('Erro ao finalizar gravações no on_unpublish:', recordingError);
    }

    // Respond to SRS
    res.json({
      code: 0,
      message: 'Stream ended acknowledged'
    });

  } catch (error) {
    logger.error('Error handling on_unpublish webhook:', error);

    res.json({
      code: 0,
      message: 'Stream ended (error in handler)'
    });
  }
});

/**
 * POST /api/srs/webhook/on-connect
 * Optional: Called when a client connects to SRS
 */
router.post('/on-connect', async (req, res, next) => {
  try {
    logger.debug('SRS on_connect webhook received', req.body);

    // Basic validation
    if (!validateWebhookSignature(req)) {
      return res.status(403).json({
        code: 1,
        message: 'Invalid webhook signature'
      });
    }

    // Allow connection
    res.json({
      code: 0,
      message: 'Connection allowed'
    });

  } catch (error) {
    logger.error('Error handling on_connect webhook:', error);
    res.json({
      code: 0,
      message: 'Connection allowed (error in handler)'
    });
  }
});

/**
 * POST /api/srs/webhook/on-close
 * Optional: Called when a client disconnects from SRS
 */
router.post('/on-close', async (req, res, next) => {
  try {
    logger.debug('SRS on_close webhook received', req.body);

    // Just acknowledge
    res.json({
      code: 0,
      message: 'Disconnection acknowledged'
    });

  } catch (error) {
    logger.error('Error handling on_close webhook:', error);
    res.json({
      code: 0,
      message: 'Disconnection acknowledged'
    });
  }
});

/**
 * POST /api/srs/webhook/on-play
 * Called when a client starts playing a stream (HLS, FLV, etc)
 */
router.post('/on-play', async (req, res, next) => {
  try {
    const { client_id, ip, vhost, app, stream } = req.body;

    logger.debug('[SRS] on_play webhook received', {
      client_id,
      ip,
      app,
      stream
    });

    // Allow playback
    res.json({
      code: 0,
      message: 'Playback allowed'
    });

  } catch (error) {
    logger.error('[SRS] Error handling on_play webhook:', error);
    res.json({
      code: 0,
      message: 'Playback allowed'
    });
  }
});

/**
 * POST /api/srs/webhook/on-stop
 * Called when a client stops playing a stream
 */
router.post('/on-stop', async (req, res, next) => {
  try {
    const { client_id, ip, vhost, app, stream } = req.body;

    logger.debug('[SRS] on_stop webhook received', {
      client_id,
      ip,
      app,
      stream
    });

    // Acknowledge stop
    res.json({
      code: 0,
      message: 'Stop acknowledged'
    });

  } catch (error) {
    logger.error('[SRS] Error handling on_stop webhook:', error);
    res.json({
      code: 0,
      message: 'Stop acknowledged'
    });
  }
});

/**
 * POST /api/srs/webhook/on-dvr
 * Called by SRS when a DVR segment is completed
 */
router.post('/on-dvr', async (req, res, next) => {
  try {
    const { client_id, ip, vhost, app, stream, cwd, file } = req.body;

    logger.info('[SRS] on_dvr webhook received', {
      stream,
      file,
      cwd
    });

    // Extract camera ID from stream name
    const streamInfo = extractStreamInfo(req.body);
    const streamKey = streamInfo?.streamKey || stream;

    if (streamKey && file) {
      const filename = file.split('/').pop();
      const rawPath = file.replace('./objs/nginx/html/', '').replace(/^\//, '');
      const relativePath = rawPath.startsWith('record/') ? `storage/www/${rawPath}` : rawPath;

      // SRS Docker volume path for file access
      const srsVolumePath = '/var/lib/docker/volumes/newcam_srs_data/_data';
      const physicalPath = path.join(srsVolumePath, rawPath);

      // First try to find camera by ID (if streamKey is a UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let camera = null;
      let targetCameraId = null;

      if (uuidRegex.test(streamKey)) {
        const { data } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id, name, recording_enabled, retention_days')
          .eq('id', streamKey)
          .single();
        camera = data;
        targetCameraId = streamKey;
      }

      // If not found by UUID, try finding by rtmp_url containing the stream key
      if (!camera) {
        const { data: cameraByRtmp } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id, name, recording_enabled, retention_days')
          .ilike('rtmp_url', `%${streamKey}%`)
          .single();

        if (cameraByRtmp) {
          camera = cameraByRtmp;
          targetCameraId = cameraByRtmp.id;
          logger.info('[SRS] Camera found by rtmp_url match', { streamKey, cameraId: targetCameraId });
        }
      }

      // Fallback: try stream_key field on cameras table
      if (!camera) {
        const { data: cameraByStreamKey } = await supabaseAdmin
          .from(TABLES.CAMERAS)
          .select('id, name, recording_enabled, retention_days')
          .eq('stream_key', streamKey)
          .single();

        if (cameraByStreamKey) {
          camera = cameraByStreamKey;
          targetCameraId = cameraByStreamKey.id;
          logger.info('[SRS] Camera found by stream_key field', { streamKey, cameraId: targetCameraId });
        }
      }

      if (!camera) {
        logger.info('[SRS] Stream not linked to any camera - skipping recording save', { streamKey });
        return res.json({ code: 0 });
      }

      if (!camera.recording_enabled) {
        logger.info('[SRS] Recording disabled for camera - skipping save', { cameraId: targetCameraId });
        return res.json({ code: 0 });
      }

      // Extract start_time from filename (format: stream001.1764388367746.mp4)
      // The number is epoch milliseconds
      const timestampMatch = filename.match(/\.(\d{13})\./);
      const startTime = timestampMatch
        ? new Date(parseInt(timestampMatch[1])).toISOString()
        : new Date().toISOString();

      // Get actual file size and duration from disk (using SRS Docker volume path)
      let fileSize = 0;
      let duration = null; // Will be extracted via FFprobe
      let durationSource = 'pending';

      try {
        const stats = await fs.stat(physicalPath);
        fileSize = stats.size;
        logger.info('[SRS] Got file size from disk', { physicalPath, fileSize });

        // Use FFprobe to get REAL duration (not estimation!)
        try {
          const metadata = await videoMetadata.extractBasicInfo(physicalPath);
          if (metadata && metadata.duration && metadata.duration > 0) {
            duration = Math.round(metadata.duration);
            durationSource = 'ffprobe';
            logger.info(`[SRS] ✅ Duração real via FFprobe: ${duration}s (${Math.round(duration/60)} min) para ${filename}`);
          }
        } catch (ffprobeError) {
          logger.warn(`[SRS] ⚠️ FFprobe falhou para ${filename}: ${ffprobeError.message}`);
        }

        // Fallback: if FFprobe failed, estimate from file size (but mark as estimated)
        if (!duration && fileSize > 0) {
          // Use a more conservative estimate (300KB/s for better accuracy)
          const estimatedDuration = Math.round(fileSize / (300 * 1024));
          if (estimatedDuration > 0 && estimatedDuration < 7200) {
            duration = estimatedDuration;
            durationSource = 'estimated';
            logger.warn(`[SRS] ⚠️ Usando duração estimada: ${duration}s para ${filename}`);
          }
        }

        // Final fallback
        if (!duration) {
          duration = 1800; // Default 30 minutes
          durationSource = 'default';
        }
      } catch (statError) {
        logger.warn('[SRS] Could not get file size, using defaults', {
          physicalPath,
          relativePath,
          error: statError.message
        });
        duration = 1800;
        durationSource = 'default';
      }

      // Save recording to database
      // Use physical path for local_path so upload service can find the file
      const { data: recording, error: insertError } = await supabaseAdmin
        .from('recordings')
        .insert({
          camera_id: targetCameraId,
          filename: filename,
          local_path: physicalPath, // Actual file path on server
          file_path: relativePath,  // Logical path for reference
          status: 'completed',
          duration: duration,
          file_size: fileSize,
          upload_status: 'queued', // Auto-queue for S3 upload
          start_time: startTime,
          end_time: new Date(new Date(startTime).getTime() + duration * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            duration_source: durationSource,
            source: 'srs_dvr_webhook'
          }
        })
        .select()
        .single();

      if (insertError) {
        logger.error('[SRS] Error saving recording to database:', insertError);
      } else {
        logger.info('[SRS] Recording saved successfully', {
          filename,
          cameraId: targetCameraId,
          recordingId: recording.id,
          fileSize,
          duration,
          durationSource,
          physicalPath,
          uploadStatus: 'queued'
        });
      }
    }

    res.json({ code: 0 });
  } catch (error) {
    logger.error('[SRS] Error handling on_dvr webhook:', error);
    res.json({ code: 0 });
  }
});

/**
 * GET /api/srs/webhook/health
 * Health check endpoint for SRS webhooks
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SRS webhook handler is operational',
    timestamp: new Date().toISOString()
  });
});

export default router;
