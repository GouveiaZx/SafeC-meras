/**
 * UploadReaper Service
 * Responsible for cleaning up stuck uploads and managing upload lifecycle
 * Prevents zombie uploads from blocking the queue
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('UploadReaper');

class UploadReaper {
  constructor(options = {}) {
    this.supabase = supabaseAdmin;
    
    // Configuration
    this.stuckThresholdMinutes = options.stuckThresholdMinutes || 30;
    this.checkIntervalMinutes = options.checkIntervalMinutes || 5;
    this.maxRetries = options.maxRetries || 5;
    this.archiveAfterDays = options.archiveAfterDays || 30;
    
    // State
    this.isRunning = false;
    this.intervalId = null;
    this.lastRunStats = null;
    
    logger.info('UploadReaper initialized', {
      stuckThreshold: `${this.stuckThresholdMinutes} minutes`,
      checkInterval: `${this.checkIntervalMinutes} minutes`,
      maxRetries: this.maxRetries,
      archiveAfter: `${this.archiveAfterDays} days`
    });
  }

  /**
   * Start the reaper service
   */
  start() {
    if (this.isRunning) {
      logger.warn('UploadReaper is already running');
      return;
    }

    this.isRunning = true;
    
    // Run immediately on start
    this.runCleanupCycle();
    
    // Schedule periodic cleanup
    this.intervalId = setInterval(
      () => this.runCleanupCycle(),
      this.checkIntervalMinutes * 60 * 1000
    );
    
    logger.info('UploadReaper started');
  }

  /**
   * Stop the reaper service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('UploadReaper is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('UploadReaper stopped');
  }

  /**
   * Run a complete cleanup cycle
   */
  async runCleanupCycle() {
    const startTime = Date.now();
    const stats = {
      stuckReset: 0,
      maxRetriesReached: 0,
      archived: 0,
      errors: 0,
      duration: 0
    };

    try {
      logger.debug('Starting cleanup cycle');

      // 1. Clean stuck uploads
      stats.stuckReset = await this.cleanStuckUploads();

      // 2. Mark max retries as permanently failed
      stats.maxRetriesReached = await this.markMaxRetriesAsFailed();

      // 3. Archive old failed/completed uploads
      stats.archived = await this.archiveOldRecordings();

      stats.duration = Date.now() - startTime;
      this.lastRunStats = { ...stats, timestamp: new Date() };

      if (stats.stuckReset > 0 || stats.maxRetriesReached > 0 || stats.archived > 0) {
        logger.info('Cleanup cycle completed', stats);
      } else {
        logger.debug('Cleanup cycle completed (no changes)', stats);
      }

    } catch (error) {
      stats.errors++;
      stats.duration = Date.now() - startTime;
      logger.error('Error in cleanup cycle:', error);
      this.lastRunStats = { ...stats, timestamp: new Date(), error: error.message };
    }

    return stats;
  }

  /**
   * Clean stuck uploads (uploading status for too long)
   * @returns {Promise<number>} Number of recordings reset
   */
  async cleanStuckUploads() {
    try {
      const cutoffTime = new Date(Date.now() - this.stuckThresholdMinutes * 60 * 1000);
      
      // Find stuck uploads
      const { data: stuckRecordings, error: fetchError } = await this.supabase
        .from('recordings')
        .select('id, filename, upload_attempts, updated_at')
        .eq('upload_status', 'uploading')
        .lt('updated_at', cutoffTime.toISOString())
        .limit(100);

      if (fetchError) {
        throw fetchError;
      }

      if (!stuckRecordings || stuckRecordings.length === 0) {
        return 0;
      }

      logger.warn(`Found ${stuckRecordings.length} stuck uploads`, {
        recordings: stuckRecordings.map(r => ({
          id: r.id,
          filename: r.filename,
          stuck_for_minutes: Math.round((Date.now() - new Date(r.updated_at).getTime()) / 60000)
        }))
      });

      // Reset stuck uploads back to queued with incremented attempts
      const recordingIds = stuckRecordings.map(r => r.id);
      
      const { error: updateError } = await this.supabase
        .from('recordings')
        .update({
          upload_status: 'queued',
          upload_attempts: this.supabase.raw('upload_attempts + 1'),
          upload_progress: 0,
          upload_started_at: null,
          updated_at: new Date().toISOString()
        })
        .in('id', recordingIds);

      if (updateError) {
        throw updateError;
      }

      logger.info(`Reset ${stuckRecordings.length} stuck uploads to queued`);
      return stuckRecordings.length;

    } catch (error) {
      logger.error('Error cleaning stuck uploads:', error);
      throw error;
    }
  }

  /**
   * Mark recordings that exceeded max retries as permanently failed
   * @returns {Promise<number>} Number of recordings marked as failed
   */
  async markMaxRetriesAsFailed() {
    try {
      const { data: maxRetriedRecordings, error: fetchError } = await this.supabase
        .from('recordings')
        .select('id, filename, upload_attempts')
        .in('upload_status', ['queued', 'failed'])
        .gte('upload_attempts', this.maxRetries)
        .limit(100);

      if (fetchError) {
        throw fetchError;
      }

      if (!maxRetriedRecordings || maxRetriedRecordings.length === 0) {
        return 0;
      }

      const recordingIds = maxRetriedRecordings.map(r => r.id);

      const { error: updateError } = await this.supabase
        .from('recordings')
        .update({
          upload_status: 'failed',
          upload_error_code: 'MAX_RETRIES_EXCEEDED',
          error_message: `Upload failed after ${this.maxRetries} attempts`,
          updated_at: new Date().toISOString()
        })
        .in('id', recordingIds);

      if (updateError) {
        throw updateError;
      }

      logger.warn(`Marked ${maxRetriedRecordings.length} recordings as permanently failed (max retries exceeded)`, {
        recordings: maxRetriedRecordings.map(r => ({
          id: r.id,
          filename: r.filename,
          attempts: r.upload_attempts
        }))
      });

      return maxRetriedRecordings.length;

    } catch (error) {
      logger.error('Error marking max retries as failed:', error);
      throw error;
    }
  }

  /**
   * Archive old recordings to reduce active dataset size
   * @returns {Promise<number>} Number of recordings archived
   */
  async archiveOldRecordings() {
    try {
      const cutoffDate = new Date(Date.now() - this.archiveAfterDays * 24 * 60 * 60 * 1000);

      const { data: oldRecordings, error: fetchError } = await this.supabase
        .from('recordings')
        .select('id, filename, upload_status')
        .in('upload_status', ['uploaded', 'failed'])
        .lt('created_at', cutoffDate.toISOString())
        .neq('upload_status', 'archived')
        .limit(500);

      if (fetchError) {
        throw fetchError;
      }

      if (!oldRecordings || oldRecordings.length === 0) {
        return 0;
      }

      const recordingIds = oldRecordings.map(r => r.id);

      const { error: updateError } = await this.supabase
        .from('recordings')
        .update({
          upload_status: 'archived',
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', recordingIds);

      if (updateError) {
        throw updateError;
      }

      logger.info(`Archived ${oldRecordings.length} old recordings`, {
        uploaded_count: oldRecordings.filter(r => r.upload_status === 'uploaded').length,
        failed_count: oldRecordings.filter(r => r.upload_status === 'failed').length,
        older_than_days: this.archiveAfterDays
      });

      return oldRecordings.length;

    } catch (error) {
      logger.error('Error archiving old recordings:', error);
      throw error;
    }
  }

  /**
   * Get current reaper statistics
   * @returns {Object} Current stats and configuration
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      config: {
        stuckThresholdMinutes: this.stuckThresholdMinutes,
        checkIntervalMinutes: this.checkIntervalMinutes,
        maxRetries: this.maxRetries,
        archiveAfterDays: this.archiveAfterDays
      },
      lastRun: this.lastRunStats,
      nextRun: this.isRunning ? 
        new Date(Date.now() + this.checkIntervalMinutes * 60 * 1000) : null
    };
  }

  /**
   * Force an immediate cleanup cycle
   * @returns {Promise<Object>} Cleanup stats
   */
  async forceCleanup() {
    logger.info('Force cleanup requested');
    return await this.runCleanupCycle();
  }
}

// Export singleton instance
export default new UploadReaper();

// Also export class for testing
export { UploadReaper };