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
        .select('id, camera_id, filename, status, upload_status, local_path, file_path, s3_key, created_at')
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

      // Check if already uploaded (ENHANCED: prevent re-queuing uploaded items)
      if (recording.upload_status === 'uploaded' && recording.s3_key && !force) {
        logger.info(`Recording already uploaded: ${recordingId}`, {
          s3_key: recording.s3_key,
          upload_status: recording.upload_status
        });
        
        // Clean up any pending queue entries for this recording
        await this.cleanupQueueEntries(recordingId, 'already_uploaded');
        
        return { success: true, reason: 'already_uploaded', s3_key: recording.s3_key };
      }

      // Check if already in upload_queue (ENHANCED: detect stale items)
      const { data: existingQueueItems, error: queueError } = await this.supabase
        .from('upload_queue')
        .select('id, status, retry_count, updated_at, started_at')
        .eq('recording_id', recordingId)
        .in('status', ['pending', 'processing']);

      if (queueError) {
        logger.warn(`Error checking existing queue items for ${recordingId}:`, queueError);
      }

      if (existingQueueItems && existingQueueItems.length > 0) {
        // Check for stale processing items (stuck > 10 minutes)
        const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
        const staleItems = existingQueueItems.filter(item => {
          if (item.status !== 'processing') return false;
          const lastActivity = new Date(item.updated_at || item.started_at);
          return lastActivity < staleThreshold;
        });

        if (staleItems.length > 0) {
          logger.warn(`Found ${staleItems.length} stale processing items for recording ${recordingId}`, {
            stale_items: staleItems.map(item => ({
              id: item.id,
              status: item.status,
              stuck_minutes: Math.round((Date.now() - new Date(item.updated_at || item.started_at).getTime()) / 60000)
            }))
          });

          // Reset stale items to failed to prevent blocking
          await this.resetStaleItems(staleItems, recordingId);
        }

        // Check for non-stale active items
        const activeItems = existingQueueItems.filter(item => {
          if (item.status === 'pending') return true;
          if (item.status !== 'processing') return false;
          const lastActivity = new Date(item.updated_at || item.started_at);
          return lastActivity >= staleThreshold;
        });

        if (activeItems.length > 0 && !force) {
          const activeItem = activeItems[0];
          logger.info(`Recording already in upload queue: ${recordingId}`, {
            queue_status: activeItem.status,
            queue_id: activeItem.id,
            active_items: activeItems.length
          });
          return { success: true, reason: 'already_queued', queue_id: activeItem.id };
        }
      }

      // Verify file exists locally - USE ENHANCED PATHRESOLVER SEARCH
      logger.debug(`🔍 Procurando arquivo para gravação ${recordingId}:`, {
        filename: recording.filename,
        local_path: recording.local_path,
        file_path: recording.file_path
      });
      
      // DEBUG: Log complete recording object to compare with direct test
      console.log(`\n📊 FULL RECORDING OBJECT passed to PathResolver:`, JSON.stringify(recording, null, 2));
      
      const fileInfo = await PathResolver.findRecordingFile(recording);
      
      if (!fileInfo || !fileInfo.exists) {
        logger.error(`Local file not found for recording: ${recordingId}`, {
          local_path: recording.local_path,
          file_path: recording.file_path,
          filename: recording.filename,
          camera_id: recording.camera_id
        });
        
        // Add to queue with failed status
        await this.addToQueue(recordingId, {
          status: 'failed',
          error_code: 'FILE_NOT_FOUND',
          error_message: 'Local file not found',
          priority
        });
        
        return { success: false, reason: 'file_not_found' };
      }

      // Add to upload_queue (NEW: use dedicated queue table)
      const queueResult = await this.addToQueue(recordingId, {
        priority,
        file_size: fileInfo.size,
        file_path: fileInfo.absolutePath
      });

      // Update recording status to indicate it's queued
      await this.supabase
        .from('recordings')
        .update({
          upload_status: 'queued',
          updated_at: new Date().toISOString()
        })
        .eq('id', recordingId);

      logger.info(`Recording successfully enqueued: ${recordingId}`, {
        queue_id: queueResult.id,
        fileSize: fileInfo.size
      });

      return {
        success: true,
        recording_id: recordingId,
        queue_id: queueResult.id,
        file_size: fileInfo.size,
        local_path: fileInfo.relativePath
      };

    } catch (error) {
      logger.error(`Error enqueueing recording ${recordingId}:`, error);
      throw error;
    }
  }

  /**
   * Priority mapping from string to integer for database storage
   */
  static getPriorityInt(priority) {
    const priorityMap = {
      'low': 1,
      'normal': 2,
      'high': 3,
      'urgent': 4
    };
    return priorityMap[priority] || 2; // default to normal (2)
  }

  /**
   * Add recording to upload_queue table
   * @param {string} recordingId - Recording ID
   * @param {Object} options - Queue item options
   * @returns {Promise<Object>} - Created queue item
   */
  async addToQueue(recordingId, options = {}) {
    const { 
      status = 'pending', 
      priority = 'normal', 
      file_size = null, 
      file_path = null,
      error_code = null,
      error_message = null 
    } = options;

    const queueItem = {
      recording_id: recordingId,
      status,
      priority: UploadQueueService.getPriorityInt(priority), // Convert string to int
      file_size,
      file_path,
      error_code,
      error_message,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('upload_queue')
      .insert(queueItem)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to add recording ${recordingId} to upload queue:`, error);
      throw new Error(`Failed to add to queue: ${error.message}`);
    }

    logger.debug(`Added recording ${recordingId} to upload queue:`, {
      queue_id: data.id,
      status,
      priority
    });

    return data;
  }

  /**
   * Dequeue next recording for upload
   * @returns {Promise<Object|null>} - Next recording to upload or null
   */
  async dequeue() {
    try {
      // Get queued items from upload_queue table with recording details
      const { data: queueItems, error } = await this.supabase
        .from('upload_queue')
        .select(`
          id, recording_id, status, priority, retry_count, created_at, updated_at, started_at, file_path, file_size, error_code, error_message,
          recordings!inner (
            id, camera_id, filename, local_path, file_path, upload_status, upload_attempts, created_at, file_size, duration
          )
        `)
        .in('status', ['pending', 'processing']) // Use 'processing' instead of 'uploading' for queue table
        .order('priority', { ascending: false }) // Higher priority first
        .order('created_at', { ascending: true }) // FIFO within same priority
        .limit(15); // Check top 15 for efficiency

      if (error) {
        logger.error('Error fetching upload queue items:', error);
        throw error;
      }

      if (!queueItems || queueItems.length === 0) {
        return null; // No items in queue
      }

      // Find first queue item that is ready for retry (considering backoff)
      let selectedItem = null;
      for (const item of queueItems) {
        if (this.isQueueItemReadyForRetry(item)) {
          selectedItem = item;
          break;
        }
      }

      if (!selectedItem) {
        // All queued items are still in backoff period
        logger.debug('All queued items are in backoff period');
        return null;
      }

      // Log backoff info for retries
      if (selectedItem.retry_count > 0) {
        const nextDelay = this.calculateBackoffDelay(selectedItem.retry_count + 1);
        logger.info(`Processing retry for queue item ${selectedItem.id}`, {
          recording_id: selectedItem.recording_id,
          attempt: selectedItem.retry_count + 1,
          next_delay_ms: nextDelay,
          next_delay_readable: `${Math.round(nextDelay / 1000 / 60)} minutes`
        });
      }

      // Try to claim this queue item for processing (optimistic locking)
      // ENHANCED: Also reset stale processing items automatically
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      
      // First, check if this is a stale processing item that can be reclaimed
      let canClaim = selectedItem.status === 'pending';
      
      if (selectedItem.status === 'processing') {
        const lastActivity = new Date(selectedItem.updated_at || selectedItem.started_at);
        if (lastActivity.toISOString() < staleThreshold) {
          logger.warn(`Reclaiming stale processing item: ${selectedItem.id}`, {
            recording_id: selectedItem.recording_id,
            stuck_minutes: Math.round((Date.now() - lastActivity.getTime()) / 60000)
          });
          canClaim = true;
        }
      }
      
      if (!canClaim) {
        logger.debug(`Queue item ${selectedItem.id} is not claimable`, {
          status: selectedItem.status,
          last_activity: selectedItem.updated_at || selectedItem.started_at
        });
        return null;
      }
      
      const { data: claimed, error: claimError } = await this.supabase
        .from('upload_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedItem.id)
        .in('status', ['pending', 'processing']) // Allow claiming pending or stale processing items
        .select('id, recording_id, status, priority, retry_count, created_at, updated_at, started_at')
        .single();

      if (claimError || !claimed) {
        logger.warn(`Failed to claim queue item ${selectedItem.id}`, {
          error: claimError?.message || 'No error message',
          errorCode: claimError?.code,
          errorDetails: claimError?.details,
          claimedResult: claimed,
          itemStatus: selectedItem.status,
          itemStartedAt: selectedItem.started_at,
          staleThreshold
        });
        return null; // Another worker claimed it or status changed
      }

      // Fetch recording details separately
      const { data: recordingData, error: recordingError } = await this.supabase
        .from('recordings')
        .select('id, camera_id, filename, local_path, file_path, upload_status, upload_attempts, created_at, file_size, duration')
        .eq('id', claimed.recording_id)
        .single();

      if (recordingError || !recordingData) {
        logger.error(`Failed to fetch recording details for ${claimed.recording_id}:`, recordingError);
        // Rollback the claim by setting status back to pending
        await this.supabase
          .from('upload_queue')
          .update({ status: 'pending', started_at: null })
          .eq('id', claimed.id);
        return null;
      }

      // Flatten the structure for backward compatibility
      const recording = {
        ...recordingData,
        // Add queue-specific fields
        queue_id: claimed.id,
        queue_status: claimed.status,
        queue_priority: claimed.priority,
        queue_retry_count: claimed.retry_count,
        queue_created_at: claimed.created_at
      };

      logger.info(`Dequeued recording for upload: ${recording.id}`, {
        queue_id: claimed.id,
        filename: recording.filename,
        camera_id: recording.camera_id,
        retry_count: claimed.retry_count
      });

      return recording;

    } catch (error) {
      logger.error('Error dequeuing recording:', error);
      throw error;
    }
  }

  /**
   * Update upload status for a queue item or recording
   * @param {string} recordingId - Recording ID
   * @param {string} status - New status (pending, processing, completed, failed)
   * @param {Object} details - Additional details to update
   */
  async updateStatus(recordingId, status, details = {}) {
    try {
      // Update both upload_queue and recordings table
      const now = new Date().toISOString();
      
      // First, update the upload_queue item
      const queueUpdateData = {
        status: status,
        updated_at: now
      };

      if (status === 'processing') {
        queueUpdateData.started_at = now;
      }

      if (status === 'completed') {
        queueUpdateData.completed_at = now;
        queueUpdateData.progress = 100;
      }

      if (status === 'failed') {
        queueUpdateData.retry_count = (details.retry_count || 0);
        if (details.error_code) queueUpdateData.error_code = details.error_code;
        if (details.error_message) queueUpdateData.error_message = details.error_message;
      }

      if (details.progress !== undefined) {
        queueUpdateData.progress = Math.max(0, Math.min(100, details.progress));
      }

      // Update queue item
      const { error: queueError } = await this.supabase
        .from('upload_queue')
        .update(queueUpdateData)
        .eq('recording_id', recordingId)
        .in('status', ['pending', 'processing', 'uploading']); // Only update active items

      if (queueError) {
        logger.warn(`Failed to update queue status for ${recordingId}:`, queueError);
      }

      // Then update the recordings table for legacy compatibility
      // Map internal status to valid upload_status_enum values
      let uploadStatus = status;
      if (status === 'processing') {
        uploadStatus = 'uploading'; // Map 'processing' to valid enum value 'uploading'
      } else if (status === 'completed') {
        uploadStatus = 'uploaded';
      }
      
      const recordingUpdateData = {
        upload_status: uploadStatus,
        updated_at: now
      };

      // Add status-specific fields to recordings table
      if (status === 'completed') {
        recordingUpdateData.uploaded_at = now;
        recordingUpdateData.upload_progress = 100;
        
        if (details.s3_key) recordingUpdateData.s3_key = details.s3_key;
        if (details.s3_url) recordingUpdateData.s3_url = details.s3_url;
        if (details.s3_size) recordingUpdateData.s3_size = details.s3_size;
        if (details.s3_etag) recordingUpdateData.s3_etag = details.s3_etag;
      }

      if (status === 'failed') {
        recordingUpdateData.upload_attempts = (details.retry_count || 0);
        if (details.error_code) recordingUpdateData.upload_error_code = details.error_code;
        if (details.error_message) recordingUpdateData.error_message = details.error_message;
      }

      if (details.progress !== undefined) {
        recordingUpdateData.upload_progress = Math.max(0, Math.min(100, details.progress));
      }

      const { error: recordingError } = await this.supabase
        .from('recordings')
        .update(recordingUpdateData)
        .eq('id', recordingId);

      if (recordingError) {
        logger.error(`Failed to update recording status for ${recordingId}:`, recordingError);
        throw recordingError;
      }

      logger.debug(`Updated upload status for ${recordingId}:`, {
        status,
        progress: queueUpdateData.progress || details.progress
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

      // Mark as processing
      await this.updateStatus(recording.id, 'processing');

      // Create progress callback
      const progressCallback = (progress) => {
        this.updateStatus(recording.id, 'processing', {
          progress: progress.percentage
        }).catch(err => {
          logger.warn(`Failed to update progress for ${recording.id}:`, err.message);
        });
      };

      // Upload to S3
      const uploadResult = await S3Service.uploadRecording(recording, progressCallback);

      // Update status to completed
      await this.updateStatus(recording.id, 'completed', {
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
      const retryCount = (recording.retry_count || 0) + 1;
      
      logger.error(`Upload failed for recording ${recording.id}:`, {
        error: error.message,
        retry_count: retryCount,
        duration_ms: duration
      });

      // Determine if we should retry
      const shouldRetry = retryCount < this.maxRetries && 
                         !this.isPermanentError(error);

      const newStatus = shouldRetry ? 'pending' : 'failed';
      
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
      // Get stats from upload_queue table
      const { data, error } = await this.supabase
        .from('upload_queue')
        .select('status');

      if (error) {
        throw error;
      }

      const queueStats = data.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});

      // Also get recording upload statuses for comprehensive stats
      const { data: recordingData, error: recordingError } = await this.supabase
        .from('recordings')
        .select('upload_status')
        .in('upload_status', ['pending', 'queued', 'uploading', 'uploaded', 'failed']);

      if (recordingError) {
        logger.warn('Error getting recording stats:', recordingError);
      }

      const recordingStats = recordingData ? recordingData.reduce((acc, record) => {
        acc[record.upload_status] = (acc[record.upload_status] || 0) + 1;
        return acc;
      }, {}) : {};

      // Combine statistics
      const stats = {
        // Queue stats
        queue_pending: queueStats.pending || 0,
        queue_processing: queueStats.processing || 0,
        queue_completed: queueStats.completed || 0,
        queue_failed: queueStats.failed || 0,
        
        // Recording stats
        recording_pending: recordingStats.pending || 0,
        recording_queued: recordingStats.queued || 0,
        recording_uploading: recordingStats.uploading || 0,
        recording_uploaded: recordingStats.uploaded || 0,
        recording_failed: recordingStats.failed || 0,
        
        // Derived metrics
        total_in_queue: (queueStats.pending || 0) + (queueStats.processing || 0),
        total_completed: recordingStats.uploaded || 0,
        total_failed: (queueStats.failed || 0) + (recordingStats.failed || 0)
      };

      return stats;

    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Check if a queue item is ready for retry based on backoff period
   * @param {Object} queueItem - Queue item from upload_queue table
   * @returns {boolean} - True if ready for retry
   */
  isQueueItemReadyForRetry(queueItem) {
    // Always process items that haven't been retried yet
    if (queueItem.retry_count === 0) {
      return true;
    }

    // For retries, check if enough time has passed since last attempt
    const lastAttemptTime = new Date(queueItem.updated_at || queueItem.started_at || queueItem.created_at).getTime();
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;

    // Calculate required backoff delay
    const backoffDelay = this.calculateBackoffDelay(queueItem.retry_count);

    return timeSinceLastAttempt >= backoffDelay;
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
        .from('upload_queue')
        .select('id, recording_id, retry_count, updated_at')
        .eq('status', 'failed');

      if (!force_all) {
        // Only retry recent failures
        const cutoffTime = new Date(Date.now() - max_age_hours * 60 * 60 * 1000).toISOString();
        query = query.gte('updated_at', cutoffTime);
        
        // Only retry if under max retry limit
        query = query.lt('retry_count', this.maxRetries);
      }

      const { data: failedRecordings, error } = await query;

      if (error) {
        throw error;
      }

      if (!failedRecordings || failedRecordings.length === 0) {
        return { retried: 0, message: 'No failed recordings to retry' };
      }

      let retriedCount = 0;
      
      for (const queueItem of failedRecordings) {
        try {
          const { error } = await this.supabase
            .from('upload_queue')
            .update({ 
              status: 'pending',
              error_code: null,
              error_message: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);

          if (error) {
            logger.warn(`Failed to reset queue item ${queueItem.id}:`, error.message);
          } else {
            retriedCount++;
          }
        } catch (error) {
          logger.warn(`Failed to retry recording ${queueItem.recording_id}:`, error.message);
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
   * Clean up queue entries for a recording (NEW: prevent duplicate entries)
   * @param {string} recordingId - Recording ID to clean
   * @param {string} reason - Reason for cleanup
   */
  async cleanupQueueEntries(recordingId, reason) {
    try {
      const { data: cleanedItems, error } = await this.supabase
        .from('upload_queue')
        .delete()
        .eq('recording_id', recordingId)
        .in('status', ['pending', 'failed', 'processing'])
        .select('id, status');

      if (error) {
        logger.warn(`Failed to cleanup queue entries for ${recordingId}:`, error);
        return;
      }

      if (cleanedItems && cleanedItems.length > 0) {
        logger.info(`Cleaned up ${cleanedItems.length} queue entries for ${recordingId}`, {
          reason,
          cleaned_statuses: cleanedItems.map(item => item.status)
        });
      }
    } catch (error) {
      logger.warn(`Error cleaning up queue entries for ${recordingId}:`, error.message);
    }
  }

  /**
   * Reset stale processing items to prevent queue blockage (NEW)
   * @param {Array} staleItems - Array of stale queue items
   * @param {string} recordingId - Recording ID for context
   */
  async resetStaleItems(staleItems, recordingId) {
    try {
      for (const item of staleItems) {
        const { error } = await this.supabase
          .from('upload_queue')
          .update({
            status: 'failed',
            error_code: 'STALE_PROCESSING_RESET',
            error_message: 'Processing item was stuck and reset automatically',
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (error) {
          logger.warn(`Failed to reset stale item ${item.id}:`, error.message);
        } else {
          logger.info(`Reset stale processing item ${item.id} for recording ${recordingId}`);
        }
      }
    } catch (error) {
      logger.error(`Error resetting stale items for ${recordingId}:`, error.message);
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