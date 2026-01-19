/**
 * SRS Integration Service
 *
 * Manages integration with SRS (Simple Realtime Server) for dynamic RTMP URL generation.
 * Handles sequential stream URL allocation, validation, and lifecycle management.
 *
 * Features:
 * - Request new sequential RTMP URLs from SRS
 * - Maintain local pool of available/assigned URLs
 * - Validate active streams via SRS API
 * - Release URLs when cameras are deleted
 * - Sync state between local database and remote SRS
 */

import axios from 'axios';
import { supabaseAdmin, TABLES } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';

const logger = createModuleLogger('SRSIntegrationService');

class SRSIntegrationService {
  constructor() {
    // SRS server configuration
    this.srsApiUrl = process.env.SRS_API_URL || 'http://localhost:1985/api/v1';
    this.srsHttpPort = process.env.SRS_HTTP_PORT || '8081';
    this.srsRtmpPort = process.env.SRS_RTMP_PORT || '1936';
    this.srsServerHost = process.env.SRS_SERVER_HOST || 'localhost';
    this.srsApiSecret = process.env.SRS_API_SECRET || '';

    // Stream configuration
    this.streamApp = process.env.SRS_STREAM_APP || 'live';
    this.streamKeyPrefix = process.env.SRS_STREAM_KEY_PREFIX || 'stream';
    this.streamKeyPadding = parseInt(process.env.SRS_STREAM_KEY_PADDING || '3', 10);

    // Pool configuration
    this.poolSize = parseInt(process.env.RTMP_POOL_SIZE || '100', 10);
    this.autoRefillThreshold = parseInt(process.env.RTMP_POOL_REFILL_THRESHOLD || '10', 10);

    logger.info('SRS Integration Service initialized', {
      srsApiUrl: this.srsApiUrl,
      srsServerHost: this.srsServerHost,
      streamApp: this.streamApp,
      poolSize: this.poolSize
    });
  }

  /**
   * Build full RTMP URL from components
   * Uses process.env directly to ensure latest values are used
   */
  buildRtmpUrl(streamKey) {
    const serverHost = process.env.SRS_SERVER_HOST || this.srsServerHost || 'localhost';
    const rtmpPort = process.env.SRS_RTMP_PORT || this.srsRtmpPort || '1936';
    const streamApp = process.env.SRS_STREAM_APP || this.streamApp || 'live';
    return `rtmp://${serverHost}:${rtmpPort}/${streamApp}/${streamKey}`;
  }

  /**
   * Generate stream key with sequential number
   */
  generateStreamKey(sequentialNumber) {
    const paddedNumber = String(sequentialNumber).padStart(this.streamKeyPadding, '0');
    return `${this.streamKeyPrefix}${paddedNumber}`;
  }

  /**
   * Request new stream URL from pool
   * Allocates the next available sequential RTMP URL
   *
   * @param {string} cameraId - UUID of camera requesting URL
   * @returns {Promise<Object>} Stream configuration object
   */
  async requestNewStreamUrl(cameraId) {
    try {
      logger.info(`Requesting new stream URL for camera: ${cameraId}`);

      // Find next available stream in pool
      const { data: availableStream, error: fetchError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .eq('status', 'available')
        .order('sequential_number', { ascending: true })
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new AppError(`Error fetching available stream: ${fetchError.message}`);
      }

      // If no available streams, try to generate new ones
      if (!availableStream) {
        logger.warn('No available streams in pool, generating new entries...');
        await this.refillPool();

        // Retry after refill
        const { data: newStream, error: retryError } = await supabaseAdmin
          .from('rtmp_stream_pool')
          .select('*')
          .eq('status', 'available')
          .order('sequential_number', { ascending: true })
          .limit(1)
          .single();

        if (retryError || !newStream) {
          throw new AppError('Failed to allocate stream URL: pool exhausted');
        }

        return await this._assignStreamToCamera(newStream, cameraId);
      }

      return await this._assignStreamToCamera(availableStream, cameraId);

    } catch (error) {
      logger.error('Error requesting new stream URL:', error);
      throw error;
    }
  }

  /**
   * Assign stream to camera (internal)
   */
  async _assignStreamToCamera(stream, cameraId) {
    const now = new Date().toISOString();

    // Update stream pool entry
    const { data: updatedStream, error: updateError } = await supabaseAdmin
      .from('rtmp_stream_pool')
      .update({
        status: 'assigned',
        camera_id: cameraId,
        assigned_at: now,
        updated_at: now
      })
      .eq('id', stream.id)
      .select()
      .single();

    if (updateError) {
      throw new AppError(`Error assigning stream: ${updateError.message}`);
    }

    // Update camera with stream reference
    const { error: cameraError } = await supabaseAdmin
      .from(TABLES.CAMERAS)
      .update({
        rtmp_stream_id: stream.id,
        rtmp_sequential_number: stream.sequential_number,
        rtmp_url: stream.full_url,
        use_dynamic_rtmp: true,
        updated_at: now
      })
      .eq('id', cameraId);

    if (cameraError) {
      logger.error('Error updating camera with stream:', cameraError);
      // Rollback stream assignment
      await supabaseAdmin
        .from('rtmp_stream_pool')
        .update({ status: 'available', camera_id: null, assigned_at: null })
        .eq('id', stream.id);

      throw new AppError(`Error linking stream to camera: ${cameraError.message}`);
    }

    logger.info(`Stream ${stream.stream_key} assigned to camera ${cameraId}`);

    return {
      id: updatedStream.id,
      sequentialNumber: updatedStream.sequential_number,
      streamKey: updatedStream.stream_key,
      rtmpUrl: updatedStream.rtmp_url,
      fullUrl: updatedStream.full_url,
      status: updatedStream.status,
      assignedAt: updatedStream.assigned_at,
      serverHost: process.env.SRS_SERVER_HOST || this.srsServerHost || 'localhost',
      rtmpPort: process.env.SRS_RTMP_PORT || this.srsRtmpPort || '1936',
      streamApp: process.env.SRS_STREAM_APP || this.streamApp || 'live',
      copyPasteUrl: updatedStream.full_url
    };
  }

  /**
   * Release stream URL when camera is deleted or changed
   *
   * @param {string} streamId - UUID of stream to release
   * @returns {Promise<boolean>} Success status
   */
  async releaseStreamUrl(streamId) {
    try {
      logger.info(`Releasing stream URL: ${streamId}`);

      const { data: stream, error: fetchError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .eq('id', streamId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          logger.warn(`Stream ${streamId} not found, already released?`);
          return true;
        }
        throw new AppError(`Error fetching stream: ${fetchError.message}`);
      }

      // Update stream to available
      const { error: updateError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .update({
          status: 'available',
          camera_id: null,
          assigned_at: null,
          stream_started_at: null,
          stream_ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', streamId);

      if (updateError) {
        throw new AppError(`Error releasing stream: ${updateError.message}`);
      }

      logger.info(`Stream ${stream.stream_key} released and returned to pool`);
      return true;

    } catch (error) {
      logger.error('Error releasing stream URL:', error);
      throw error;
    }
  }

  /**
   * Get list of available streams in pool
   *
   * @returns {Promise<Array>} Available streams
   */
  async getAvailableStreams() {
    try {
      const { data, error } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .eq('status', 'available')
        .order('sequential_number', { ascending: true });

      if (error) {
        throw new AppError(`Error fetching available streams: ${error.message}`);
      }

      return data || [];

    } catch (error) {
      logger.error('Error getting available streams:', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   *
   * @returns {Promise<Object>} Pool stats (total, available, assigned, streaming)
   */
  async getPoolStats() {
    try {
      const { data, error } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('status');

      if (error) {
        throw new AppError(`Error fetching pool stats: ${error.message}`);
      }

      const stats = {
        total: data.length,
        available: 0,
        assigned: 0,
        streaming: 0,
        error: 0,
        reserved: 0
      };

      data.forEach(stream => {
        if (stream.status) {
          stats[stream.status] = (stats[stream.status] || 0) + 1;
        }
      });

      stats.utilizationPercent = stats.total > 0
        ? Math.round(((stats.assigned + stats.streaming) / stats.total) * 100)
        : 0;

      return stats;

    } catch (error) {
      logger.error('Error getting pool stats:', error);
      throw error;
    }
  }

  /**
   * Validate if stream is currently active on SRS
   *
   * @param {string} streamKey - Stream key to validate
   * @returns {Promise<boolean>} True if stream is active
   */
  async validateStreamActive(streamKey) {
    try {
      const url = `${this.srsApiUrl}/streams/`;
      const headers = this.srsApiSecret ? { 'Authorization': `Bearer ${this.srsApiSecret}` } : {};

      const response = await axios.get(url, {
        headers,
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200 && response.data?.streams) {
        const activeStream = response.data.streams.find(s =>
          s.name === streamKey || s.stream === streamKey
        );
        return !!activeStream;
      }

      return false;

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.warn('SRS server not reachable, assuming stream inactive');
        return false;
      }
      logger.error(`Error validating stream ${streamKey}:`, error.message);
      return false;
    }
  }

  /**
   * Sync local pool state with SRS active streams
   * Updates stream status based on actual SRS state
   *
   * @returns {Promise<Object>} Sync results
   */
  async syncWithSRS() {
    try {
      logger.info('Starting sync with SRS server...');

      // Get all active streams from SRS
      const url = `${this.srsApiUrl}/streams/`;
      const headers = this.srsApiSecret ? { 'Authorization': `Bearer ${this.srsApiSecret}` } : {};

      let activeStreams = [];

      try {
        const response = await axios.get(url, {
          headers,
          timeout: 10000,
          validateStatus: (status) => status < 500
        });

        if (response.status === 200 && response.data?.streams) {
          activeStreams = response.data.streams.map(s => s.name || s.stream);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          logger.warn('SRS server not reachable during sync, skipping...');
          return { success: false, error: 'SRS server unreachable' };
        }
        throw error;
      }

      // Get all assigned/streaming entries from local pool
      const { data: localStreams, error: fetchError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .in('status', ['assigned', 'streaming']);

      if (fetchError) {
        throw new AppError(`Error fetching local streams: ${fetchError.message}`);
      }

      let updated = 0;
      let errors = 0;

      // Update status based on SRS state
      for (const stream of localStreams) {
        const isActive = activeStreams.includes(stream.stream_key);
        const shouldBeStreaming = isActive && stream.status !== 'streaming';
        const shouldBeAssigned = !isActive && stream.status === 'streaming';

        if (shouldBeStreaming) {
          // Stream is active but marked as only assigned
          await supabaseAdmin
            .from('rtmp_stream_pool')
            .update({
              status: 'streaming',
              stream_started_at: new Date().toISOString(),
              last_stream_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', stream.id);

          updated++;
          logger.debug(`Updated ${stream.stream_key}: assigned → streaming`);

        } else if (shouldBeAssigned) {
          // Stream ended but still marked as streaming
          await supabaseAdmin
            .from('rtmp_stream_pool')
            .update({
              status: 'assigned',
              stream_ended_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', stream.id);

          updated++;
          logger.debug(`Updated ${stream.stream_key}: streaming → assigned`);
        }
      }

      logger.info(`Sync completed: ${updated} streams updated, ${errors} errors`);

      return {
        success: true,
        activeStreamsOnSRS: activeStreams.length,
        localStreamsChecked: localStreams.length,
        updated,
        errors
      };

    } catch (error) {
      logger.error('Error syncing with SRS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Refill pool with new sequential stream entries
   * Called automatically when pool is running low
   *
   * @param {number} count - Number of new streams to add
   * @returns {Promise<number>} Number of streams added
   */
  async refillPool(count = null) {
    try {
      const targetCount = count || this.poolSize;

      // Get current max sequential number
      const { data: maxStream } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('sequential_number')
        .order('sequential_number', { ascending: false })
        .limit(1)
        .single();

      const startNumber = maxStream ? maxStream.sequential_number + 1 : 1;
      const endNumber = startNumber + targetCount - 1;

      logger.info(`Refilling pool with ${targetCount} streams (${startNumber}-${endNumber})`);

      // Use process.env directly for latest values
      const serverHost = process.env.SRS_SERVER_HOST || this.srsServerHost || 'localhost';
      const rtmpPort = process.env.SRS_RTMP_PORT || this.srsRtmpPort || '1936';
      const streamApp = process.env.SRS_STREAM_APP || this.streamApp || 'live';

      const newStreams = [];
      for (let i = startNumber; i <= endNumber; i++) {
        const streamKey = this.generateStreamKey(i);
        const rtmpBase = `rtmp://${serverHost}:${rtmpPort}/${streamApp}`;
        const fullUrl = `${rtmpBase}/${streamKey}`;

        newStreams.push({
          sequential_number: i,
          stream_key: streamKey,
          rtmp_url: rtmpBase,
          full_url: fullUrl,
          status: 'available',
          metadata: {
            generated_at: new Date().toISOString(),
            generator: 'SRSIntegrationService'
          }
        });
      }

      // Batch insert
      const { data, error } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .insert(newStreams)
        .select();

      if (error) {
        throw new AppError(`Error inserting new streams: ${error.message}`);
      }

      logger.info(`Successfully added ${data.length} new streams to pool`);
      return data.length;

    } catch (error) {
      logger.error('Error refilling pool:', error);
      throw error;
    }
  }

  /**
   * Check if pool needs refill and trigger if necessary
   *
   * @returns {Promise<boolean>} True if refill was triggered
   */
  async checkAndRefillPool() {
    try {
      const availableStreams = await this.getAvailableStreams();

      if (availableStreams.length <= this.autoRefillThreshold) {
        logger.warn(`Pool low (${availableStreams.length} available), triggering refill...`);
        const refillCount = this.poolSize - availableStreams.length;
        await this.refillPool(refillCount);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Error checking pool refill:', error);
      return false;
    }
  }

  /**
   * Initialize pool with default streams
   * Called on first setup or when pool is empty
   *
   * @returns {Promise<number>} Number of streams created
   */
  async initializePool() {
    try {
      const stats = await this.getPoolStats();

      if (stats.total === 0) {
        logger.info('Pool is empty, initializing with default streams...');
        return await this.refillPool(this.poolSize);
      }

      logger.info(`Pool already initialized with ${stats.total} streams`);
      return 0;

    } catch (error) {
      logger.error('Error initializing pool:', error);
      throw error;
    }
  }

  /**
   * Get stream by camera ID
   *
   * @param {string} cameraId - Camera UUID
   * @returns {Promise<Object|null>} Stream object or null
   */
  async getStreamByCameraId(cameraId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .eq('camera_id', cameraId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new AppError(`Error fetching stream: ${error.message}`);
      }

      return data || null;

    } catch (error) {
      logger.error('Error getting stream by camera:', error);
      throw error;
    }
  }

  /**
   * Update stream status when receiving SRS webhook
   *
   * @param {string} streamKey - Stream key from webhook
   * @param {string} event - Event type ('publish' or 'unpublish')
   * @returns {Promise<Object>} Updated stream
   */
  async handleStreamEvent(streamKey, event) {
    try {
      logger.info(`Handling stream event: ${event} for ${streamKey}`);

      const { data: stream, error: fetchError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .select('*')
        .eq('stream_key', streamKey)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          logger.warn(`Stream ${streamKey} not found in pool`);
          return null;
        }
        throw new AppError(`Error fetching stream: ${fetchError.message}`);
      }

      const now = new Date().toISOString();
      let updateData = { updated_at: now };

      if (event === 'publish') {
        updateData.status = 'streaming';
        updateData.stream_started_at = now;
        updateData.last_stream_at = now;
      } else if (event === 'unpublish') {
        updateData.status = stream.camera_id ? 'assigned' : 'available';
        updateData.stream_ended_at = now;
      }

      const { data: updatedStream, error: updateError } = await supabaseAdmin
        .from('rtmp_stream_pool')
        .update(updateData)
        .eq('id', stream.id)
        .select()
        .single();

      if (updateError) {
        throw new AppError(`Error updating stream: ${updateError.message}`);
      }

      logger.info(`Stream ${streamKey} updated: ${event}`);
      return updatedStream;

    } catch (error) {
      logger.error('Error handling stream event:', error);
      throw error;
    }
  }
}

// Export singleton instance
const srsIntegrationService = new SRSIntegrationService();
export default srsIntegrationService;
