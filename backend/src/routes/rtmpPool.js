/**
 * RTMP Pool Routes
 *
 * API endpoints for managing the RTMP stream pool and SRS integration.
 * Provides functionality for requesting, releasing, and monitoring RTMP URLs.
 *
 * Endpoints:
 * - POST /api/rtmp/request-url - Request new RTMP URL for camera
 * - GET /api/rtmp/pool - List all streams in pool (admin)
 * - GET /api/rtmp/available - Get available stream count
 * - DELETE /api/rtmp/:id/release - Release specific stream
 * - GET /api/rtmp/stats - Get pool statistics
 * - POST /api/rtmp/sync - Trigger sync with SRS
 * - POST /api/rtmp/refill - Manually refill pool (admin)
 * - POST /api/rtmp/initialize - Initialize pool with default streams (admin)
 * - GET /api/rtmp/camera/:cameraId - Get stream for specific camera
 */

import express from 'express';
import srsIntegrationService from '../services/SRSIntegrationService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError, NotFoundError, ValidationError } from '../middleware/errorHandler.js';

const router = express.Router();
const logger = createModuleLogger('RTMPPoolRoutes');

/**
 * POST /api/rtmp/request-url
 * Request new RTMP URL for a camera
 * Allocates next available sequential stream from pool
 *
 * Body: { cameraId: string }
 * Auth: Required (admin, operator, integrator)
 */
router.post('/request-url', authenticateToken, requireRole(['admin', 'operator', 'integrator']), async (req, res, next) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      throw new ValidationError('Camera ID is required');
    }

    logger.info(`User ${req.user.id} requesting RTMP URL for camera ${cameraId}`);

    // Check if camera already has a stream assigned
    const existingStream = await srsIntegrationService.getStreamByCameraId(cameraId);
    if (existingStream) {
      logger.warn(`Camera ${cameraId} already has stream ${existingStream.stream_key}`);
      return res.status(200).json({
        success: true,
        message: 'Camera already has assigned stream',
        data: {
          id: existingStream.id,
          sequentialNumber: existingStream.sequential_number,
          streamKey: existingStream.stream_key,
          rtmpUrl: existingStream.rtmp_url,
          fullUrl: existingStream.full_url,
          status: existingStream.status,
          assignedAt: existingStream.assigned_at,
          copyPasteUrl: existingStream.full_url,
          isExisting: true
        }
      });
    }

    // Request new stream URL
    const streamConfig = await srsIntegrationService.requestNewStreamUrl(cameraId);

    // Check if pool needs refill
    await srsIntegrationService.checkAndRefillPool();

    res.status(201).json({
      success: true,
      message: 'RTMP URL allocated successfully',
      data: streamConfig
    });

  } catch (error) {
    logger.error('Error requesting RTMP URL:', error);
    next(error);
  }
});

/**
 * GET /api/rtmp/pool
 * List all streams in pool with filtering
 * Query params: status, page, limit
 *
 * Auth: Required (admin only)
 */
router.get('/pool', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    logger.debug(`Fetching pool streams - status: ${status}, page: ${page}, limit: ${limit}`);

    const { supabaseAdmin } = await import('../config/database.js');

    let query = supabaseAdmin
      .from('rtmp_stream_pool')
      .select('*, cameras(id, name, status)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .order('sequential_number', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new AppError(`Error fetching pool: ${error.message}`);
    }

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Error fetching pool:', error);
    next(error);
  }
});

/**
 * GET /api/rtmp/available
 * Get count of available streams
 *
 * Auth: Required (all authenticated users)
 */
router.get('/available', authenticateToken, async (req, res, next) => {
  try {
    const availableStreams = await srsIntegrationService.getAvailableStreams();

    res.json({
      success: true,
      data: {
        available: availableStreams.length,
        streams: availableStreams
      }
    });

  } catch (error) {
    logger.error('Error getting available streams:', error);
    next(error);
  }
});

/**
 * DELETE /api/rtmp/:id/release
 * Release RTMP stream back to pool
 *
 * Auth: Required (admin, operator, integrator)
 */
router.delete('/:id/release', authenticateToken, requireRole(['admin', 'operator', 'integrator']), async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`User ${req.user.id} releasing stream ${id}`);

    const result = await srsIntegrationService.releaseStreamUrl(id);

    if (!result) {
      throw new NotFoundError('Stream not found');
    }

    res.json({
      success: true,
      message: 'Stream released successfully'
    });

  } catch (error) {
    logger.error('Error releasing stream:', error);
    next(error);
  }
});

/**
 * GET /api/rtmp/stats
 * Get pool statistics and health metrics
 *
 * Auth: Required (all authenticated users)
 */
router.get('/stats', authenticateToken, async (req, res, next) => {
  try {
    const stats = await srsIntegrationService.getPoolStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error getting pool stats:', error);
    next(error);
  }
});

/**
 * POST /api/rtmp/sync
 * Trigger manual sync with SRS server
 * Updates local pool status based on active streams in SRS
 *
 * Auth: Required (admin only)
 */
router.post('/sync', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    logger.info(`User ${req.user.id} triggered SRS sync`);

    const result = await srsIntegrationService.syncWithSRS();

    res.json({
      success: result.success,
      message: result.success ? 'Sync completed successfully' : 'Sync failed',
      data: result
    });

  } catch (error) {
    logger.error('Error syncing with SRS:', error);
    next(error);
  }
});

/**
 * POST /api/rtmp/refill
 * Manually trigger pool refill
 * Body: { count: number } - optional, defaults to configured pool size
 *
 * Auth: Required (admin only)
 */
router.post('/refill', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { count } = req.body;

    logger.info(`User ${req.user.id} triggered pool refill (count: ${count || 'default'})`);

    const added = await srsIntegrationService.refillPool(count);

    res.json({
      success: true,
      message: `Added ${added} streams to pool`,
      data: {
        added
      }
    });

  } catch (error) {
    logger.error('Error refilling pool:', error);
    next(error);
  }
});

/**
 * POST /api/rtmp/initialize
 * Initialize pool with default streams
 * Used for first-time setup or when pool is empty
 *
 * Auth: Required (admin only)
 */
router.post('/initialize', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    logger.info(`User ${req.user.id} initializing RTMP pool`);

    const created = await srsIntegrationService.initializePool();

    res.json({
      success: true,
      message: created > 0 ? `Pool initialized with ${created} streams` : 'Pool already initialized',
      data: {
        created
      }
    });

  } catch (error) {
    logger.error('Error initializing pool:', error);
    next(error);
  }
});

/**
 * GET /api/rtmp/camera/:cameraId
 * Get RTMP stream assigned to specific camera
 *
 * Auth: Required (all authenticated users)
 */
router.get('/camera/:cameraId', authenticateToken, async (req, res, next) => {
  try {
    const { cameraId } = req.params;

    logger.debug(`Fetching stream for camera ${cameraId}`);

    const stream = await srsIntegrationService.getStreamByCameraId(cameraId);

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'No stream assigned to this camera'
      });
    }

    res.json({
      success: true,
      data: {
        id: stream.id,
        sequentialNumber: stream.sequential_number,
        streamKey: stream.stream_key,
        rtmpUrl: stream.rtmp_url,
        fullUrl: stream.full_url,
        status: stream.status,
        assignedAt: stream.assigned_at,
        streamStartedAt: stream.stream_started_at,
        lastStreamAt: stream.last_stream_at,
        copyPasteUrl: stream.full_url
      }
    });

  } catch (error) {
    logger.error('Error getting camera stream:', error);
    next(error);
  }
});

/**
 * GET /api/rtmp/validate/:streamKey
 * Validate if stream is currently active on SRS
 *
 * Auth: Required (all authenticated users)
 */
router.get('/validate/:streamKey', authenticateToken, async (req, res, next) => {
  try {
    const { streamKey } = req.params;

    logger.debug(`Validating stream ${streamKey}`);

    const isActive = await srsIntegrationService.validateStreamActive(streamKey);

    res.json({
      success: true,
      data: {
        streamKey,
        isActive,
        checkedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error validating stream:', error);
    next(error);
  }
});

export default router;
