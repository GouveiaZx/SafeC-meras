/**
 * UploadWorker - Background worker for processing S3 upload queue
 * Extends existing worker architecture with upload functionality
 */

import { createModuleLogger } from '../config/logger.js';
import UploadQueueService from '../services/UploadQueueService.js';

const logger = createModuleLogger('UploadWorker');

class UploadWorker {
  constructor(options = {}) {
    this.isRunning = false;
    this.isPaused = false;
    this.concurrency = options.concurrency || parseInt(process.env.S3_UPLOAD_CONCURRENCY) || 2;
    this.pollInterval = options.pollInterval || parseInt(process.env.UPLOAD_POLL_INTERVAL) || 30000; // 30 seconds
    this.maxIdleTime = options.maxIdleTime || 300000; // 5 minutes
    
    this.activeUploads = new Map(); // Track active upload promises
    this.stats = {
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: null,
      lastActivity: null
    };

    // Event callbacks
    this.onUploadComplete = options.onUploadComplete || null;
    this.onUploadError = options.onUploadError || null;
    this.onQueueEmpty = options.onQueueEmpty || null;

    logger.info('UploadWorker initialized', {
      concurrency: this.concurrency,
      pollInterval: this.pollInterval,
      maxIdleTime: this.maxIdleTime
    });
  }

  /**
   * Start the upload worker
   */
  async start() {
    if (this.isRunning) {
      logger.warn('UploadWorker is already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.stats.startTime = new Date();
    this.stats.lastActivity = new Date();

    logger.info('🚀 UploadWorker started');

    // Start the main processing loop
    this.processLoop();

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Stop the upload worker
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('UploadWorker is not running');
      return;
    }

    logger.info('🛑 Stopping UploadWorker...');
    this.isRunning = false;

    // Wait for active uploads to complete
    if (this.activeUploads.size > 0) {
      logger.info(`Waiting for ${this.activeUploads.size} active uploads to complete...`);
      await Promise.allSettled(this.activeUploads.values());
    }

    // Clear any remaining timers
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    logger.info('✅ UploadWorker stopped');
  }

  /**
   * Pause the upload worker
   */
  pause() {
    if (!this.isRunning || this.isPaused) {
      logger.warn('UploadWorker is not running or already paused');
      return;
    }

    this.isPaused = true;
    logger.info('⏸️ UploadWorker paused');
  }

  /**
   * Resume the upload worker
   */
  resume() {
    if (!this.isRunning || !this.isPaused) {
      logger.warn('UploadWorker is not running or not paused');
      return;
    }

    this.isPaused = false;
    logger.info('▶️ UploadWorker resumed');
    
    // Restart processing immediately
    this.processLoop();
  }

  /**
   * Main processing loop
   */
  async processLoop() {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    try {
      // Check if we have capacity for more uploads
      if (this.activeUploads.size < this.concurrency) {
        const available = this.concurrency - this.activeUploads.size;
        
        // Try to start new uploads up to our concurrency limit
        for (let i = 0; i < available; i++) {
          const recording = await UploadQueueService.dequeue();
          
          if (recording) {
            this.startUpload(recording);
            this.stats.lastActivity = new Date();
          } else {
            // No more recordings in queue
            break;
          }
        }
      }

      // Schedule next iteration
      this.scheduleNextProcess();

    } catch (error) {
      logger.error('Error in processing loop:', error);
      this.scheduleNextProcess();
    }
  }

  /**
   * Start upload for a single recording
   */
  async startUpload(recording) {
    const uploadId = `${recording.id}_${Date.now()}`;
    
    logger.info(`Starting upload: ${recording.id}`, {
      uploadId,
      filename: recording.filename,
      activeUploads: this.activeUploads.size + 1
    });

    const uploadPromise = this.processUpload(recording, uploadId);
    this.activeUploads.set(uploadId, uploadPromise);

    // Handle completion/cleanup
    uploadPromise
      .then((result) => this.handleUploadComplete(uploadId, recording, result))
      .catch((error) => this.handleUploadError(uploadId, recording, error))
      .finally(() => {
        this.activeUploads.delete(uploadId);
        
        // If no more active uploads and queue might be empty, check again soon
        if (this.activeUploads.size === 0) {
          this.scheduleNextProcess(5000); // Check again in 5 seconds
        }
      });
  }

  /**
   * Process upload for a recording
   */
  async processUpload(recording, uploadId) {
    try {
      logger.debug(`Processing upload: ${recording.id}`, { uploadId });
      
      const result = await UploadQueueService.processUpload(recording);
      
      this.stats.processed++;
      
      if (result.success) {
        this.stats.successful++;
        logger.info(`Upload completed: ${recording.id}`, {
          uploadId,
          s3_key: result.s3_key,
          duration_ms: result.duration_ms
        });
      } else {
        this.stats.failed++;
        logger.warn(`Upload failed: ${recording.id}`, {
          uploadId,
          error: result.error,
          will_retry: result.will_retry
        });
      }

      return result;

    } catch (error) {
      this.stats.processed++;
      this.stats.failed++;
      logger.error(`Upload processing error: ${recording.id}`, {
        uploadId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle successful upload completion
   */
  handleUploadComplete(uploadId, recording, result) {
    logger.debug(`Upload completed: ${uploadId}`, {
      recording_id: recording.id,
      success: result.success
    });

    // Call custom callback if provided
    if (this.onUploadComplete) {
      try {
        this.onUploadComplete(recording, result);
      } catch (error) {
        logger.warn(`Error in upload complete callback:`, error);
      }
    }
  }

  /**
   * Handle upload error
   */
  handleUploadError(uploadId, recording, error) {
    logger.error(`Upload error: ${uploadId}`, {
      recording_id: recording.id,
      error: error.message
    });

    // Call custom callback if provided
    if (this.onUploadError) {
      try {
        this.onUploadError(recording, error);
      } catch (callbackError) {
        logger.warn(`Error in upload error callback:`, callbackError);
      }
    }
  }

  /**
   * Schedule next processing iteration
   */
  scheduleNextProcess(delay = null) {
    if (!this.isRunning) {
      return;
    }

    const nextDelay = delay || this.pollInterval;
    
    this.processTimer = setTimeout(() => {
      this.processLoop();
    }, nextDelay);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    this.healthTimer = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Check every minute
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      const now = new Date();
      const timeSinceActivity = now - this.stats.lastActivity;

      // Check if worker has been idle too long
      if (timeSinceActivity > this.maxIdleTime && this.activeUploads.size === 0) {
        logger.info('Worker has been idle, checking queue status...');
        
        const stats = await UploadQueueService.getQueueStats();
        
        if (stats.total_in_queue > 0) {
          logger.warn(`Queue has ${stats.total_in_queue} items but worker is idle. Triggering process loop.`);
          this.processLoop();
        }
      }

      // Log periodic stats
      if (this.stats.processed > 0) {
        const uptime = now - this.stats.startTime;
        const successRate = ((this.stats.successful / this.stats.processed) * 100).toFixed(1);
        
        logger.info('UploadWorker health check', {
          uptime_ms: uptime,
          processed: this.stats.processed,
          successful: this.stats.successful,
          failed: this.stats.failed,
          success_rate: `${successRate}%`,
          active_uploads: this.activeUploads.size,
          is_paused: this.isPaused
        });
      }

    } catch (error) {
      logger.error('Error in health check:', error);
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    const now = new Date();
    const uptime = this.stats.startTime ? now - this.stats.startTime : 0;
    const successRate = this.stats.processed > 0 ? 
      ((this.stats.successful / this.stats.processed) * 100).toFixed(1) : 0;

    return {
      is_running: this.isRunning,
      is_paused: this.isPaused,
      uptime_ms: uptime,
      active_uploads: this.activeUploads.size,
      concurrency: this.concurrency,
      stats: {
        ...this.stats,
        success_rate: `${successRate}%`
      },
      config: {
        poll_interval: this.pollInterval,
        max_idle_time: this.maxIdleTime
      }
    };
  }

  /**
   * Force process queue (useful for testing/debugging)
   */
  async forceProcess() {
    logger.info('Force processing queue...');
    await this.processLoop();
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return await UploadQueueService.getQueueStats();
  }

  /**
   * Retry failed uploads
   */
  async retryFailed(options = {}) {
    logger.info('Retrying failed uploads...', options);
    const result = await UploadQueueService.retryFailed(options);
    
    // Trigger immediate processing if items were retried
    if (result.retried > 0) {
      this.processLoop();
    }
    
    return result;
  }
}

export default UploadWorker;