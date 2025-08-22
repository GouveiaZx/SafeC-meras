/**
 * UploadQueueService - Database-backed queue for S3 uploads
 * Provides idempotent operations with optimistic locking
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import S3Service from './S3Service.js';
import PathResolver from '../utils/PathResolver.js';

const logger = createModuleLogger('UploadQueueService');

class UploadQueueService {
  constructor() {
    this.supabase = supabaseAdmin;
    this.isProcessing = false;
    this.concurrency = parseInt(process.env.S3_UPLOAD_CONCURRENCY) || 2;
    this.maxRetries = parseInt(process.env.S3_UPLOAD_MAX_RETRIES) || 3;
    this.retryDelayBase = parseInt(process.env.S3_UPLOAD_RETRY_DELAY) || 5000; // 5 seconds
    
    logger.info(`UploadQueueService initialized`, {
      concurrency: this.concurrency,
      maxRetries: this.maxRetries,
      retryDelayBase: this.retryDelayBase
    });
  }

  /**
   * Enqueue a recording for upload
   * @param {string} recordingId - Recording ID to upload
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} - Queue result
   */
  async enqueue(recordingId, options = {}) {
    const { priority = 'normal', force = false } = options;
    
    try {
      logger.info(`Enqueueing recording for upload: ${recordingId}`, { priority, force });

      // Check if recording exists and is eligible for upload
      const { data: recording, error: fetchError } = await this.supabase
        .from('recordings')
        .select('id, camera_id, filename, status, upload_status, local_path, file_path, s3_key')
        .eq('id', recordingId)
        .single();

      if (fetchError || !recording) {
        throw new Error(`Recording not found: ${recordingId}`);
      }

      // Check if recording is completed
      if (recording.status !== 'completed' && !force) {
        logger.warn(`Recording not completed, skipping enqueue: ${recordingId}`, {
          status: recording.status
        });
        return { success: false, reason: 'recording_not_completed' };
      }

      // Check if already uploaded
      if (recording.upload_status === 'uploaded' && recording.s3_key && !force) {
        logger.info(`Recording already uploaded: ${recordingId}`);
        return { success: true, reason: 'already_uploaded', s3_key: recording.s3_key };
      }

      // Check if already in queue
      if (['queued', 'uploading'].includes(recording.upload_status) && !force) {
        logger.info(`Recording already in queue: ${recordingId}`, {
          upload_status: recording.upload_status
        });
        return { success: true, reason: 'already_queued' };
      }

      // Verify file exists locally
      const fileInfo = await PathResolver.findRecordingFile(recording);
      if (!fileInfo || !fileInfo.exists) {
        logger.error(`Local file not found for recording: ${recordingId}`, {
          local_path: recording.local_path,
          file_path: recording.file_path
        });
        
        // Mark as failed
        await this.updateStatus(recordingId, 'failed', {
          error_code: 'FILE_NOT_FOUND',
          error_message: 'Local file not found'
        });
        
        return { success: false, reason: 'file_not_found' };
      }

      // Use optimistic locking to prevent race conditions
      const { data: updated, error: updateError } = await this.supabase
        .from('recordings')
        .update({
          upload_status: 'queued',
          upload_attempts: 0,
          upload_error_code: null,
          upload_progress: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId)
        .neq('upload_status', 'uploading') // Prevent overriding active uploads
        .select()
        .single();

      if (updateError) {
        logger.error(`Failed to enqueue recording: ${recordingId}`, updateError);
        throw new Error(`Failed to enqueue: ${updateError.message}`);
      }

      if (!updated) {
        logger.warn(`Recording may be currently uploading: ${recordingId}`);
        return { success: false, reason: 'already_uploading' };
      }

      logger.info(`Recording successfully enqueued: ${recordingId}`, {
        upload_status: updated.upload_status,
        fileSize: fileInfo.size
      });

      return {
        success: true,
        recording_id: recordingId,
        upload_status: updated.upload_status,
        file_size: fileInfo.size,
        local_path: fileInfo.relativePath
      };

    } catch (error) {
      logger.error(`Error enqueueing recording ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Dequeue next recording for upload
   * @returns {Promise<Object|null>} - Next recording to upload or null
   */
  async dequeue() {
    try {
      // Get all queued recordings to check backoff
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select(`
          id, camera_id, filename, local_path, file_path, 
          upload_status, upload_attempts, created_at, updated_at,
          file_size, duration
        `)
        .eq('upload_status', 'queued')
        .order('created_at', { ascending: true })
        .limit(10); // Check top 10 for efficiency

      if (error) {
        logger.error('Error fetching queued recordings:', error);
        throw error;
      }

      if (!recordings || recordings.length === 0) {
        return null; // No recordings in queue
      }

      // Find first recording that is ready for retry (considering backoff)
      let recording = null;
      for (const rec of recordings) {
        if (this.isReadyForRetry(rec)) {
          recording = rec;
          break;
        }
      }

      if (!recording) {
        // All queued recordings are still in backoff period
        logger.debug('All queued recordings are in backoff period');
        return null;
      }

      // Log backoff info
      if (recording.upload_attempts > 0) {
        const nextDelay = this.calculateBackoffDelay(recording.upload_attempts + 1);
        logger.info(`Processing retry for ${recording.id}`, {
          attempt: recording.upload_attempts + 1,
          next_delay_ms: nextDelay,
          next_delay_readable: `${Math.round(nextDelay / 1000 / 60)} minutes`
        });
      }

      // Try to claim this recording for upload (optimistic locking)
      const { data: claimed, error: claimError } = await this.supabase
        .from('recordings')
        .update({
          upload_status: 'uploading',
          upload_started_at: new Date().toISOString(),
          upload_progress: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id)
        .eq('upload_status', 'queued') // Only update if still queued
        .select()
        .single();

      if (claimError || !claimed) {
        logger.debug(`Failed to claim recording ${recording.id} (may have been claimed by another worker)`);
        return null; // Another worker claimed it or status changed
      }

      logger.info(`Dequeued recording for upload: ${recording.id}`, {
        filename: recording.filename,
        camera_id: recording.camera_id
      });

      return claimed;

    } catch (error) {
      logger.error('Error dequeuing recording:', error);
      throw error;
    }
  }

  /**
   * Update upload status for a recording
   * @param {string} recordingId - Recording ID
   * @param {string} status - New status
   * @param {Object} details - Additional details to update
   */
  async updateStatus(recordingId, status, details = {}) {
    try {
      const updateData = {
        upload_status: status,
        updated_at: new Date().toISOString()
      };

      // Add status-specific fields
      if (status === 'uploaded') {
        updateData.uploaded_at = new Date().toISOString();
        updateData.upload_progress = 100;
        
        if (details.s3_key) updateData.s3_key = details.s3_key;
        if (details.s3_url) updateData.s3_url = details.s3_url;
        if (details.s3_size) updateData.s3_size = details.s3_size;
        if (details.s3_etag) updateData.s3_etag = details.s3_etag;
      }

      if (status === 'failed') {
        updateData.upload_attempts = (details.retry_count || 0);
        if (details.error_code) updateData.upload_error_code = details.error_code;
        if (details.error_message) updateData.error_message = details.error_message;
      }

      if (details.progress !== undefined) {
        updateData.upload_progress = Math.max(0, Math.min(100, details.progress));
      }

      const { error } = await this.supabase
        .from('recordings')
        .update(updateData)
        .eq('id', recordingId);

      if (error) {
        logger.error(`Failed to update upload status for ${recordingId}:`, error);
        throw error;
      }

      logger.debug(`Updated upload status for ${recordingId}:`, {
        status,
        progress: updateData.upload_progress
      });

    } catch (error) {
      logger.error(`Error updating status for ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Process a recording upload
   * @param {Object} recording - Recording object from dequeue
   * @returns {Promise<Object>} - Upload result
   */
  async processUpload(recording) {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing upload for recording: ${recording.id}`, {
        filename: recording.filename,
        camera_id: recording.camera_id
      });

      // Create progress callback
      const progressCallback = (progress) => {
        this.updateStatus(recording.id, 'uploading', {
          progress: progress.percentage
        }).catch(err => {
          logger.warn(`Failed to update progress for ${recording.id}:`, err.message);
        });
      };

      // Upload to S3
      const uploadResult = await S3Service.uploadRecording(recording, progressCallback);

      // Update status to uploaded
      await this.updateStatus(recording.id, 'uploaded', {
        s3_key: uploadResult.s3Key,
        s3_url: uploadResult.url,
        s3_size: uploadResult.size,
        s3_etag: uploadResult.etag
      });

      const duration = Date.now() - startTime;
      
      logger.info(`Upload completed successfully: ${recording.id}`, {
        s3_key: uploadResult.s3Key,
        duration_ms: duration,
        file_size: uploadResult.size
      });

      return {
        success: true,
        recording_id: recording.id,
        s3_key: uploadResult.s3Key,
        s3_url: uploadResult.url,
        duration_ms: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const retryCount = (recording.upload_attempts || 0) + 1;
      
      logger.error(`Upload failed for recording ${recording.id}:`, {
        error: error.message,
        retry_count: retryCount,
        duration_ms: duration
      });

      // Determine if we should retry
      const shouldRetry = retryCount < this.maxRetries && 
                         !this.isPermanentError(error);

      const newStatus = shouldRetry ? 'queued' : 'failed';
      
      await this.updateStatus(recording.id, newStatus, {
        retry_count: retryCount,
        error_code: this.getErrorCode(error),
        error_message: error.message
      });

      return {
        success: false,
        recording_id: recording.id,
        error: error.message,
        retry_count: retryCount,
        will_retry: shouldRetry,
        duration_ms: duration
      };
    }
  }

  /**
   * Calculate backoff delay based on attempt number
   * @param {number} attempts - Number of attempts already made
   * @returns {number} - Delay in milliseconds
   */
  calculateBackoffDelay(attempts) {
    // Exponential backoff: 1m, 5m, 15m, 1h, 2h, 4h
    const delays = [
      60 * 1000,        // 1 minute
      5 * 60 * 1000,    // 5 minutes
      15 * 60 * 1000,   // 15 minutes
      60 * 60 * 1000,   // 1 hour
      2 * 60 * 60 * 1000, // 2 hours
      4 * 60 * 60 * 1000  // 4 hours
    ];
    
    const index = Math.min(attempts, delays.length - 1);
    const baseDelay = delays[index];
    
    // Add jitter (±10%) to prevent thundering herd
    const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
    
    return Math.floor(baseDelay + jitter);
  }

  /**
   * Check if enough time has passed for retry based on backoff
   * @param {Object} recording - Recording object with upload_attempts and updated_at
   * @returns {boolean} - True if ready for retry
   */
  isReadyForRetry(recording) {
    if (!recording.upload_attempts || recording.upload_attempts === 0) {
      return true; // First attempt
    }
    
    const backoffDelay = this.calculateBackoffDelay(recording.upload_attempts);
    const lastAttemptTime = new Date(recording.updated_at).getTime();
    const now = Date.now();
    
    return (now - lastAttemptTime) >= backoffDelay;
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} - Queue statistics
   */
  async getQueueStats() {
    try {
      const { data, error } = await this.supabase
        .from('recordings')
        .select('upload_status')
        .in('upload_status', ['pending', 'queued', 'uploading', 'uploaded', 'failed']);

      if (error) {
        throw error;
      }

      const stats = data.reduce((acc, record) => {
        acc[record.upload_status] = (acc[record.upload_status] || 0) + 1;
        return acc;
      }, {});

      // Add derived metrics
      stats.total_in_queue = (stats.pending || 0) + (stats.queued || 0);
      stats.processing = stats.uploading || 0;
      stats.completed = stats.uploaded || 0;
      stats.failed = stats.failed || 0;

      return stats;

    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Retry failed uploads
   * @param {Object} options - Retry options
   * @returns {Promise<Object>} - Retry result
   */
  async retryFailed(options = {}) {
    const { max_age_hours = 24, force_all = false } = options;
    
    try {
      let query = this.supabase
        .from('recordings')
        .select('id, filename, upload_attempts, updated_at')
        .eq('upload_status', 'failed');

      if (!force_all) {
        // Only retry recent failures
        const cutoffTime = new Date(Date.now() - max_age_hours * 60 * 60 * 1000);
        query = query.gte('updated_at', cutoffTime.toISOString());
        
        // Only retry if under max retry limit
        query = query.lt('upload_attempts', this.maxRetries);
      }

      const { data: failedRecordings, error } = await query;

      if (error) {
        throw error;
      }

      if (!failedRecordings || failedRecordings.length === 0) {
        return { retried: 0, message: 'No failed recordings to retry' };
      }

      let retriedCount = 0;
      
      for (const recording of failedRecordings) {
        try {
          await this.enqueue(recording.id, { force: true });
          retriedCount++;
        } catch (error) {
          logger.warn(`Failed to retry recording ${recording.id}:`, error.message);
        }
      }

      logger.info(`Retried ${retriedCount}/${failedRecordings.length} failed uploads`);

      return {
        retried: retriedCount,
        total_failed: failedRecordings.length,
        message: `Retried ${retriedCount} failed uploads`
      };

    } catch (error) {
      logger.error('Error retrying failed uploads:', error);
      throw error;
    }
  }

  /**
   * Clear completed uploads older than specified age
   * @param {number} days - Age in days
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupOldUploads(days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const { data, error } = await this.supabase
        .from('recordings')
        .update({ upload_status: 'archived' })
        .eq('upload_status', 'uploaded')
        .lt('uploaded_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        throw error;
      }

      const archivedCount = data ? data.length : 0;
      
      logger.info(`Archived ${archivedCount} old uploads older than ${days} days`);
      
      return {
        archived: archivedCount,
        cutoff_date: cutoffDate.toISOString()
      };

    } catch (error) {
      logger.error('Error cleaning up old uploads:', error);
      throw error;
    }
  }

  /**
   * Determine if error is permanent (non-retryable)
   * @private
   */
  isPermanentError(error) {
    const permanentErrors = [
      'FILE_NOT_FOUND',
      'INVALID_CREDENTIALS',
      'BUCKET_NOT_FOUND',
      'ACCESS_DENIED'
    ];
    
    return permanentErrors.some(code => 
      error.message.includes(code) || error.code === code
    );
  }

  /**
   * Extract error code from error
   * @private
   */
  getErrorCode(error) {
    if (error.code) return error.code;
    if (error.message.includes('not found')) return 'FILE_NOT_FOUND';
    if (error.message.includes('access')) return 'ACCESS_DENIED';
    if (error.message.includes('network')) return 'NETWORK_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }
}

export default new UploadQueueService();