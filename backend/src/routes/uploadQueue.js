/**
 * Upload Queue Routes
 * Manages S3 upload queue operations
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import UploadQueueService from '../services/UploadQueueService.js';

const router = express.Router();
const logger = createModuleLogger('UploadQueueRoutes');
const uploadQueueService = UploadQueueService; // UploadQueueService já é uma instância (singleton)

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/upload-queue
 * List upload queue items
 */
router.get('/', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const {
    status,
    limit = 50,
    offset = 0,
    sortBy = 'priority',
    sortOrder = 'DESC'
  } = req.query;

  logger.info('Listing upload queue', { status, limit, offset });

  let query = supabaseAdmin
    .from('recordings')
    .select('id, camera_id, filename, status, upload_status, priority, created_at, updated_at, s3_key, file_size', { count: 'exact' })
    .in('upload_status', ['pending', 'uploading', 'failed', 'completed'])
    .order(sortBy, { ascending: sortOrder === 'ASC' })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  // Filter by upload status if provided
  if (status) {
    query = query.eq('upload_status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to list upload queue:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list upload queue',
      details: error.message
    });
  }

  res.json({
    success: true,
    data,
    pagination: {
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: count > (parseInt(offset) + parseInt(limit))
    }
  });
}));

/**
 * POST /api/upload-queue
 * Add recording to upload queue
 */
router.post('/', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const { recordingId, priority = 5, force = false } = req.body;

  if (!recordingId) {
    return res.status(400).json({
      success: false,
      error: 'recordingId is required'
    });
  }

  logger.info('Adding recording to upload queue', { recordingId, priority, force });

  try {
    const result = await uploadQueueService.enqueue(recordingId, {
      priority: parseInt(priority),
      force
    });

    res.status(201).json({
      success: true,
      data: result,
      queueId: recordingId
    });
  } catch (error) {
    logger.error('Failed to enqueue recording:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enqueue recording',
      details: error.message
    });
  }
}));

/**
 * GET /api/upload-queue/stats
 * Get upload queue statistics
 */
router.get('/stats', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  logger.info('Getting upload queue statistics');

  try {
    const stats = await uploadQueueService.getQueueStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get upload queue stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload queue statistics',
      details: error.message
    });
  }
}));

/**
 * POST /api/upload-queue/pause
 * Pause upload queue processing
 */
router.post('/pause', requireRole('admin'), asyncHandler(async (req, res) => {
  logger.info('Pausing upload queue');

  try {
    uploadQueueService.isProcessing = false;

    res.json({
      success: true,
      message: 'Upload queue paused',
      data: {
        isProcessing: uploadQueueService.isProcessing
      }
    });
  } catch (error) {
    logger.error('Failed to pause upload queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause upload queue',
      details: error.message
    });
  }
}));

/**
 * POST /api/upload-queue/resume
 * Resume upload queue processing
 */
router.post('/resume', requireRole('admin'), asyncHandler(async (req, res) => {
  logger.info('Resuming upload queue');

  try {
    uploadQueueService.isProcessing = true;

    res.json({
      success: true,
      message: 'Upload queue resumed',
      data: {
        isProcessing: uploadQueueService.isProcessing
      }
    });
  } catch (error) {
    logger.error('Failed to resume upload queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume upload queue',
      details: error.message
    });
  }
}));

/**
 * DELETE /api/upload-queue/cleanup
 * Cleanup old completed uploads
 */
router.delete('/cleanup', requireRole('admin'), asyncHandler(async (req, res) => {
  const { olderThan = 7 } = req.query;

  logger.info('Cleaning up old uploads', { olderThan });

  try {
    const result = await uploadQueueService.cleanupOldUploads(parseInt(olderThan));

    res.json({
      success: true,
      message: `Cleaned up uploads older than ${olderThan} days`,
      data: result
    });
  } catch (error) {
    logger.error('Failed to cleanup uploads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup uploads',
      details: error.message
    });
  }
}));

/**
 * POST /api/upload-queue/:id/cancel
 * Cancel upload in progress
 */
router.post('/:id/cancel', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info('Cancelling upload', { recordingId: id });

  try {
    await uploadQueueService.updateStatus(id, 'cancelled', {
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.user.id
    });

    res.json({
      success: true,
      message: 'Upload cancelled successfully',
      data: {
        recordingId: id,
        status: 'cancelled'
      }
    });
  } catch (error) {
    logger.error('Failed to cancel upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel upload',
      details: error.message
    });
  }
}));

/**
 * PUT /api/upload-queue/:id/priority
 * Update upload priority
 */
router.put('/:id/priority', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  if (priority === undefined || priority < 0 || priority > 10) {
    return res.status(400).json({
      success: false,
      error: 'Priority must be between 0 and 10'
    });
  }

  logger.info('Updating upload priority', { recordingId: id, priority });

  try {
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .update({ priority: parseInt(priority) })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Priority updated successfully',
      data
    });
  } catch (error) {
    logger.error('Failed to update priority:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update priority',
      details: error.message
    });
  }
}));

/**
 * GET /api/upload-queue/metrics
 * Get upload performance metrics
 */
router.get('/metrics', requireRole('admin'), asyncHandler(async (req, res) => {
  logger.info('Getting upload metrics');

  try {
    // Get metrics from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: uploads, error } = await supabaseAdmin
      .from('recordings')
      .select('upload_status, file_size, created_at, updated_at')
      .gte('updated_at', yesterday)
      .in('upload_status', ['completed', 'failed']);

    if (error) throw error;

    // Calculate metrics
    const completed = uploads.filter(u => u.upload_status === 'completed');
    const failed = uploads.filter(u => u.upload_status === 'failed');

    const totalSize = completed.reduce((sum, u) => sum + (u.file_size || 0), 0);
    const avgUploadTime = completed.reduce((sum, u) => {
      const uploadTime = new Date(u.updated_at) - new Date(u.created_at);
      return sum + uploadTime;
    }, 0) / (completed.length || 1);

    const metrics = {
      last24Hours: {
        totalUploads: uploads.length,
        completed: completed.length,
        failed: failed.length,
        successRate: uploads.length > 0 ? (completed.length / uploads.length * 100).toFixed(2) + '%' : '0%',
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        avgUploadTimeMs: Math.round(avgUploadTime),
        avgUploadTimeSec: (avgUploadTime / 1000).toFixed(2)
      }
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get upload metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload metrics',
      details: error.message
    });
  }
}));

/**
 * POST /api/upload-queue/retry-failed
 * Retry all failed uploads
 */
router.post('/retry-failed', requireRole('admin'), asyncHandler(async (req, res) => {
  const { maxRetries = 3 } = req.body;

  logger.info('Retrying failed uploads', { maxRetries });

  try {
    const result = await uploadQueueService.retryFailed({ maxRetries: parseInt(maxRetries) });

    res.json({
      success: true,
      message: 'Failed uploads retry initiated',
      data: result
    });
  } catch (error) {
    logger.error('Failed to retry uploads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry uploads',
      details: error.message
    });
  }
}));

export default router;
