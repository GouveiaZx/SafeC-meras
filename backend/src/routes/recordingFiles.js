/**
 * Rota simplificada para servir arquivos de gravação MP4 diretamente
 * Usa RecordingService unificado para busca consistente de arquivos
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import RecordingService from '../services/RecordingService.js';
import S3Service from '../services/S3Service.js';
import FeatureFlagService from '../services/FeatureFlagService.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/database.js';

const router = express.Router();

/**
 * Check if S3 streaming should be preferred
 */
function shouldPreferS3() {
  return FeatureFlagService.isEnabled('prefer_s3_streaming');
}

/**
 * Calculate recording age in days
 */
function getRecordingAgeInDays(recording) {
  const createdAt = new Date(recording.created_at || recording.start_time);
  const now = new Date();
  const diffInMs = now - createdAt;
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
  return diffInDays;
}

/**
 * Check if recording should use local storage based on 7-day retention policy
 */
function shouldUseLocalStorage(recording) {
  const retentionDays = parseInt(process.env.LOCAL_RETENTION_DAYS) || 7;
  const ageInDays = getRecordingAgeInDays(recording);
  
  logger.debug(`📅 Recording age check:`, {
    recordingId: recording.id,
    ageInDays: ageInDays.toFixed(2),
    retentionDays,
    shouldUseLocal: ageInDays < retentionDays
  });
  
  return ageInDays < retentionDays;
}

/**
 * Check if local file exists for recording
 */
async function checkLocalFileExists(recording) {
  try {
    const fileInfo = await RecordingService.preparePlayback(recording.id);
    const localExists = fileInfo && fileInfo.source === 'local';
    
    logger.debug(`📁 Local file existence check:`, {
      recordingId: recording.id,
      exists: localExists,
      source: fileInfo?.source,
      filePath: fileInfo?.filePath
    });
    
    return localExists;
  } catch (error) {
    logger.debug(`📁 Local file check failed for ${recording.id}:`, error.message);
    return false;
  }
}

/**
 * Unified streaming endpoint with S3 proxy streaming fallback
 * GET /:recordingId/stream - Smart routing between S3, proxy, and local
 */
router.get('/:recordingId/stream', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { force_local = false } = req.query;
    
    logger.info(`📹 Unified stream request: ${recordingId}`, {
      force_local,
      prefer_s3: shouldPreferS3(),
      range: req.headers.range || 'no range',
      userAgent: req.headers['user-agent']?.substring(0, 50) || 'unknown',
      referer: req.headers.referer || 'no referer'
    });

    // Get recording details
    const recording = await RecordingService.getRecordingById(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Implement 7-day local retention strategy
    const useLocalRetention = shouldUseLocalStorage(recording);
    
    logger.info(`📅 Retention strategy:`, {
      recordingId,
      ageInDays: getRecordingAgeInDays(recording).toFixed(2),
      useLocalRetention,
      hasS3: !!recording.s3_key,
      s3Status: recording.upload_status
    });

    // Check if local file actually exists for smart S3 routing
    const localFileExists = await checkLocalFileExists(recording);
    
    // Try S3 proxy streaming first if available and not forced local
    // Allow S3 streaming if: outside retention period OR local file doesn't exist
    const shouldTryS3 = !force_local && recording.s3_key && recording.upload_status === 'uploaded' && 
                        (!useLocalRetention || !localFileExists);
    
    logger.info(`🧠 Smart S3 routing decision:`, {
      recordingId,
      force_local,
      useLocalRetention,
      localFileExists,
      hasS3Key: !!recording.s3_key,
      uploadStatus: recording.upload_status,
      shouldTryS3,
      decision: shouldTryS3 ? 'S3_PROXY' : 'LOCAL_FALLBACK'
    });
    
    if (shouldTryS3) {
      try {
        logger.info(`🌐 Attempting S3 proxy stream for: ${recordingId}`, {
          s3_key: recording.s3_key,
          upload_status: recording.upload_status,
          s3_size: recording.s3_size,
          file_size: recording.file_size,
          force_local: force_local,
          useLocalRetention: useLocalRetention
        });
        
        // Bypass HeadObject for Wasabi compatibility - use recording metadata
        const fileSize = recording.s3_size || recording.file_size || 0;
        
        if (fileSize <= 0) {
          logger.warn(`⚠️ Invalid file size for S3 streaming: ${fileSize}, falling back`, {
            recordingId,
            s3_size: recording.s3_size,
            file_size: recording.file_size
          });
          throw new Error(`Invalid file size: ${fileSize}`);
        }
        
        logger.info(`✅ Bypassing HeadObject for Wasabi compatibility, starting S3 proxy stream for: ${recordingId}`, {
          size: Math.round(fileSize / 1024 / 1024 * 100) / 100 + 'MB',
          s3Key: recording.s3_key,
          uploadStatus: recording.upload_status,
          method: 'bypassed_headobject'
        });

        // Set response headers for video streaming
        const range = req.headers.range;

        if (range) {
          // Handle range request for seeking/progressive loading
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
            'Cache-Control': 'max-age=3600',
            'X-Storage-Location': 's3-proxy',
            'Access-Control-Allow-Origin': '*'
          });

          // Stream specific range from S3 with proper error handling
          try {
            logger.debug(`🔍 Calling S3Service.getObjectStream for range request`, {
              recordingId,
              s3_key: recording.s3_key,
              range: `bytes=${start}-${end}`
            });
            
            const s3Stream = await S3Service.getObjectStream(recording.s3_key, `bytes=${start}-${end}`);
            
            logger.debug(`✅ S3Service.getObjectStream successful for range`, {
              recordingId,
              streamType: s3Stream?.constructor?.name,
              hasAsyncIterator: !!s3Stream[Symbol.asyncIterator],
              hasPipeMethod: typeof s3Stream?.pipe === 'function'
            });
            
            // Convert AWS SDK v3 stream to Node.js Readable if needed
            const { Readable } = await import('stream');
            let nodeStream = s3Stream;
            
            // Ensure the stream is Node.js compatible
            if (s3Stream && typeof s3Stream.pipe === 'function') {
              nodeStream = s3Stream;
            } else if (s3Stream && s3Stream[Symbol.asyncIterator]) {
              // Convert async iterable to readable stream
              nodeStream = Readable.from(s3Stream);
            }

            logger.debug(`📺 S3 range stream setup for ${recordingId}`, {
              range: `bytes=${start}-${end}`,
              chunkSize: Math.round(chunksize / 1024) + 'KB',
              streamType: nodeStream.constructor.name,
              hasAsyncIterator: !!s3Stream[Symbol.asyncIterator],
              hasPipeMethod: typeof nodeStream.pipe === 'function',
              originalStreamType: s3Stream.constructor.name
            });

            nodeStream.on('error', (streamError) => {
              logger.error(`❌ S3 range stream error for ${recordingId}:`, {
                error: streamError.message,
                code: streamError.code,
                range: `bytes=${start}-${end}`,
                s3Key: recording.s3_key,
                headersSent: res.headersSent,
                responseDestroyed: res.destroyed,
                stack: streamError.stack?.split('\n')[0]
              });
              if (!res.headersSent && !res.destroyed) {
                res.status(500).json({ error: 'Stream error occurred' });
              }
            });

            nodeStream.pipe(res);
          } catch (streamError) {
            logger.error(`❌ S3 range streaming failed for ${recordingId}:`, {
              error: streamError.message,
              code: streamError.code,
              s3Key: recording.s3_key,
              range: `bytes=${start}-${end}`,
              streamType: streamError.constructor.name,
              stack: streamError.stack?.split('\n')[0]
            });
            throw streamError; // Will trigger fallback
          }

        } else {
          // Stream full file from S3
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'max-age=3600',
            'X-Storage-Location': 's3-proxy',
            'Access-Control-Allow-Origin': '*'
          });

          // Stream full file from S3 with proper error handling
          try {
            logger.debug(`🔍 Calling S3Service.getObjectStream for full file`, {
              recordingId,
              s3_key: recording.s3_key
            });
            
            const s3Stream = await S3Service.getObjectStream(recording.s3_key);
            
            logger.debug(`✅ S3Service.getObjectStream successful for full file`, {
              recordingId,
              streamType: s3Stream?.constructor?.name,
              hasAsyncIterator: !!s3Stream[Symbol.asyncIterator],
              hasPipeMethod: typeof s3Stream?.pipe === 'function'
            });
            
            // Convert AWS SDK v3 stream to Node.js Readable if needed
            const { Readable } = await import('stream');
            let nodeStream = s3Stream;
            
            // Ensure the stream is Node.js compatible
            if (s3Stream && typeof s3Stream.pipe === 'function') {
              nodeStream = s3Stream;
            } else if (s3Stream && s3Stream[Symbol.asyncIterator]) {
              // Convert async iterable to readable stream
              nodeStream = Readable.from(s3Stream);
            }

            logger.debug(`📺 S3 full stream setup for ${recordingId}`, {
              fileSize: Math.round(fileSize / 1024) + 'KB',
              streamType: nodeStream.constructor.name,
              hasAsync: !!s3Stream[Symbol.asyncIterator]
            });

            nodeStream.on('error', (streamError) => {
              logger.error(`❌ S3 full stream error for ${recordingId}:`, streamError.message);
              if (!res.headersSent && !res.destroyed) {
                res.status(500).json({ error: 'Stream error occurred' });
              }
            });

            nodeStream.pipe(res);
          } catch (streamError) {
            logger.error(`❌ S3 full streaming failed for ${recordingId}:`, streamError.message);
            throw streamError; // Will trigger fallback
          }
        }

        logger.info(`🎥 S3 proxy streaming started for: ${recordingId}`);
        return;
        
      } catch (s3Error) {
        logger.error(`❌ S3 proxy streaming failed for ${recordingId}`, {
          errorMessage: s3Error.message,
          errorName: s3Error.name,
          errorCode: s3Error.code || s3Error.Code,
          httpStatusCode: s3Error.$metadata?.httpStatusCode,
          s3_key: recording.s3_key,
          upload_status: recording.upload_status,
          file_size: recording.file_size,
          s3_size: recording.s3_size,
          stack: s3Error.stack?.split('\n')[0],
          fullError: JSON.stringify(s3Error, Object.getOwnPropertyNames(s3Error))
        });
        
        // Log the specific error type for debugging
        logger.error(`🔍 CRITICAL DEBUG - S3 Error Analysis for ${recordingId}:`, {
          isS3ServiceError: s3Error.name?.includes('S3') || s3Error.Code,
          hasWasabiEndpoint: s3Error.message?.includes('wasabisys'),
          is403Forbidden: s3Error.message?.includes('403') || s3Error.message?.includes('Forbidden'),
          is404NotFound: s3Error.message?.includes('404') || s3Error.message?.includes('NoSuchKey'),
          isSignatureError: s3Error.message?.includes('SignatureDoesNotMatch'),
          isNetworkError: s3Error.code === 'ENOTFOUND' || s3Error.code === 'ECONNREFUSED',
          shouldBypassLocalFallback: true
        });
        
        // Try to generate presigned URL as fallback instead of local streaming
        try {
          const presignedUrl = await S3Service.getSignedUrl(recording.s3_key, {
            expiresIn: 3600, // 1 hour
            responseHeaders: {
              contentType: 'video/mp4',
              cacheControl: 'max-age=300'
            }
          });
          
          logger.info(`🔗 S3 presigned URL fallback for ${recordingId}`);
          
          // Return JSON with presigned URL for frontend to handle
          res.json({
            source: 's3',
            url: presignedUrl,
            s3_key: recording.s3_key,
            fallback_reason: 'proxy_stream_failed'
          });
          return;
          
        } catch (presignedError) {
          logger.error(`❌ Presigned URL fallback also failed for ${recordingId}:`, presignedError.message);
          // Fall through to local streaming as last resort
        }
      }
    }

    // Fall back to local streaming
    logger.info(`💾 Using local stream for: ${recordingId}`);
    return await serveLocalFile(req, res, recordingId, 'stream');
    
  } catch (error) {
    logger.error('Error in unified stream endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Unified download endpoint with S3 presigned URL fallback
 * GET /:recordingId/download - Smart routing between S3 and local
 */
router.get('/:recordingId/download', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { force_local = false } = req.query;
    
    logger.info(`📥 Unified download request: ${recordingId}`, {
      force_local,
      prefer_s3: shouldPreferS3()
    });

    // Get recording details
    const recording = await RecordingService.getRecordingById(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Apply 7-day local retention strategy
    const useLocalRetention = shouldUseLocalStorage(recording);
    const recordingAge = getRecordingAgeInDays(recording);
    
    logger.info(`📅 Download retention check - Recording: ${recordingId}, Age: ${recordingAge.toFixed(1)} days, Use local: ${useLocalRetention}`);
    
    // Try S3 first if available, not forced local, and outside retention period
    if (!force_local && !useLocalRetention && recording.s3_key && recording.upload_status === 'uploaded') {
      try {
        logger.info(`🌐 Attempting S3 download for: ${recordingId}`);
        
        // Generate presigned URL for download
        const presignedUrl = await S3Service.getSignedUrl(recording.s3_key, {
          expiresIn: 3600, // 1 hour
          responseHeaders: {
            contentDisposition: `attachment; filename="${recording.filename}"`,
            contentType: 'video/mp4'
          }
        });

        logger.info(`✅ S3 presigned download URL generated for: ${recordingId}`);
        
        // Check if request expects JSON response (from frontend) or direct download
        const acceptsJson = req.headers.accept?.includes('application/json');
        
        if (acceptsJson) {
          // Return JSON response with S3 URL (for frontend handling)
          return res.json({
            success: true,
            source: 's3',
            url: presignedUrl,
            s3_key: recording.s3_key,
            filename: recording.filename,
            file_size: recording.file_size,
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
          });
        } else {
          // Direct redirect for browser downloads
          return res.redirect(302, presignedUrl);
        }
        
      } catch (s3Error) {
        logger.warn(`⚠️ S3 download failed for ${recordingId}, falling back to local:`, s3Error.message);
        // Fall through to local download
      }
    }

    // Fall back to local download
    logger.info(`💾 Using local download for: ${recordingId}`);
    return await serveLocalFile(req, res, recordingId, 'download');
    
  } catch (error) {
    logger.error('Error in unified download endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * HEAD endpoint to get file metadata without content
 * HEAD /:recordingId/info - Returns headers with file info
 */
router.head('/:recordingId/info', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    // Get recording details
    const recording = await RecordingService.getRecordingById(recordingId);
    if (!recording) {
      return res.status(404).end();
    }

    // Try S3 first if available
    if (recording.s3_key && recording.upload_status === 'uploaded') {
      try {
        const s3Info = await S3Service.headObject(recording.s3_key);
        
        if (s3Info.exists) {
          res.set({
            'Content-Length': s3Info.size,
            'Content-Type': s3Info.contentType,
            'Last-Modified': s3Info.lastModified,
            'ETag': s3Info.etag,
            'X-Storage-Location': 's3',
            'X-S3-Key': recording.s3_key
          });
          return res.status(200).end();
        }
      } catch (s3Error) {
        logger.warn(`S3 head request failed for ${recordingId}:`, s3Error.message);
      }
    }

    // Fall back to local file info
    const fileInfo = await RecordingService.findRecordingFile(recording);
    if (fileInfo && fileInfo.exists) {
      res.set({
        'Content-Length': fileInfo.size,
        'Content-Type': 'video/mp4',
        'Last-Modified': fileInfo.mtime?.toUTCString(),
        'X-Storage-Location': 'local',
        'X-Local-Path': fileInfo.relativePath
      });
      return res.status(200).end();
    }

    // File not found anywhere
    res.status(404).end();
    
  } catch (error) {
    logger.error('Error in HEAD endpoint:', error);
    res.status(500).end();
  }
});

/**
 * Helper function to serve local files only
 * @private
 */
async function serveLocalFile(req, res, recordingId, mode = 'stream') {
  const fileInfo = await RecordingService.preparePlayback(recordingId);
  
  if (!fileInfo) {
    return res.status(404).json({ error: 'Recording file not found' });
  }

  // If S3 source, this should not happen as we handle S3 proxy streaming above
  // This is now only for local files
  if (fileInfo.source === 's3') {
    logger.error(`⚠️ S3 source reached serveLocalFile - should use proxy streaming instead`);
    return res.status(500).json({ 
      error: 'S3 files should use proxy streaming', 
      hint: 'Use force_local=true parameter to force local file access'
    });
  }

  const { filePath, fileSize, recording } = fileInfo;
  
  // Get file stats
  const stat = await fs.promises.stat(filePath);
  const actualFileSize = stat.size;
  
  // Set base headers
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'X-Storage-Location': 'local'
  };

  // Add download-specific headers
  if (mode === 'download') {
    headers['Content-Disposition'] = `attachment; filename="${recording.filename}"`;
  }

  // Handle range requests for streaming
  const range = req.headers.range;
  if (range && mode === 'stream') {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : actualFileSize - 1;
    const chunksize = (end - start) + 1;
    
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${actualFileSize}`,
      'Content-Length': chunksize
    });
    
    const stream = RecordingService.createFileStream(filePath, range);
    stream.pipe(res);
  } else {
    // Full file response
    res.writeHead(200, {
      ...headers,
      'Content-Length': actualFileSize
    });
    
    const stream = RecordingService.createFileStream(filePath);
    stream.pipe(res);
  }
}

/**
 * Servir arquivo MP4 diretamente pelo ID da gravação
 * Requer autenticação
 */
router.get('/:recordingId/play', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    // Usar RecordingService para buscar o arquivo
    const fileInfo = await RecordingService.preparePlayback(recordingId);
    
    if (!fileInfo) {
      logger.error(`Gravação não encontrada: ${recordingId}`);
      return res.status(404).json({ error: 'Gravação não encontrada' });
    }
    
    // Check if it's S3 source - redirect to presigned URL
    if (fileInfo.source === 's3') {
      logger.info(`🌐 Redirecionando para S3: ${fileInfo.recording.filename}`);
      return res.redirect(302, fileInfo.s3Url);
    }
    
    const { filePath, fileSize, recording } = fileInfo;
    
    logger.info(`📹 Servindo arquivo local: ${recording.filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Obter informações do arquivo para garantir que está atualizado
    const stat = await fs.promises.stat(filePath);
    const actualFileSize = stat.size;
    
    // Configurar headers para streaming de vídeo
    const range = req.headers.range;
    
    if (range) {
      // Requisição com range (streaming parcial)
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : actualFileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${actualFileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range'
      });
      
      // Usar o método do RecordingService para criar o stream
      const stream = RecordingService.createFileStream(filePath, range);
      stream.pipe(res);
    } else {
      // Requisição completa
      res.writeHead(200, {
        'Content-Length': actualFileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      });
      
      // Usar o método do RecordingService para criar o stream
      const stream = RecordingService.createFileStream(filePath);
      stream.pipe(res);
    }
    
  } catch (error) {
    logger.error('Erro ao servir arquivo MP4:', error);
    res.status(500).json({ error: 'Erro ao carregar arquivo' });
  }
});

// ROTA DUPLICADA REMOVIDA - usar apenas a rota autenticada na linha 84

// ====== TEMPORARY DEBUG ENDPOINT - REMOVE IN PRODUCTION ======
// Test S3 proxy streaming without JWT authentication
router.get('/:recordingId/debug-s3-test', async (req, res) => {
  const { recordingId } = req.params;
  
  logger.info(`🧪 DEBUG S3 TEST - Testing S3 proxy streaming for ${recordingId}`);
  
  try {
    // Get recording from database
    const { data: recording, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
      
    if (error || !recording) {
      logger.error(`❌ DEBUG S3 TEST - Recording not found: ${recordingId}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    logger.info(`🔍 DEBUG S3 TEST - Recording details:`, {
      filename: recording.filename,
      s3_key: recording.s3_key,
      upload_status: recording.upload_status,
      file_size: recording.file_size
    });
    
    // Check if should use S3
    const shouldTryS3 = recording.s3_key && recording.upload_status === 'uploaded';
    
    if (!shouldTryS3) {
      return res.status(400).json({ 
        error: 'Recording not eligible for S3 test',
        details: {
          has_s3_key: !!recording.s3_key,
          upload_status: recording.upload_status
        }
      });
    }
    
    logger.info(`🚀 DEBUG S3 TEST - Starting S3 proxy streaming test...`);
    
    // Try S3 proxy streaming (copied from main endpoint)
    const range = req.headers.range;
    let s3Stream;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;
      
      logger.info(`📡 DEBUG S3 TEST - Requesting S3 range stream: ${start}-${end || 'end'}`);
      s3Stream = await S3Service.getObjectStream(recording.s3_key, { start, end });
    } else {
      logger.info(`📡 DEBUG S3 TEST - Requesting full S3 stream`);
      s3Stream = await S3Service.getObjectStream(recording.s3_key);
    }
    
    logger.info(`✅ DEBUG S3 TEST - S3 stream obtained successfully`);
    
    // Set appropriate headers
    const fileSize = recording.file_size || 0;
    if (range && fileSize > 0) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      });
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize > 0 ? fileSize : undefined,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      });
    }
    
    logger.info(`📤 DEBUG S3 TEST - Starting stream pipe to response`);
    s3Stream.pipe(res);
    
    s3Stream.on('end', () => {
      logger.info(`✅ DEBUG S3 TEST - Stream completed successfully`);
    });
    
    s3Stream.on('error', (streamError) => {
      logger.error(`❌ DEBUG S3 TEST - Stream error:`, streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error', details: streamError.message });
      }
    });
    
  } catch (debugError) {
    logger.error(`💥 DEBUG S3 TEST - Critical error for ${recordingId}:`, {
      errorMessage: debugError.message,
      errorName: debugError.name,
      errorStack: debugError.stack,
      isS3Error: debugError.name?.includes('S3') || debugError.Code,
      statusCode: debugError.$metadata?.httpStatusCode,
      isWasabiError: debugError.message?.includes('wasabisys'),
      is403: debugError.message?.includes('403') || debugError.message?.includes('Forbidden'),
      is404: debugError.message?.includes('404') || debugError.message?.includes('NoSuchKey'),
      isSignature: debugError.message?.includes('SignatureDoesNotMatch'),
      isNetwork: debugError.code === 'ENOTFOUND' || debugError.code === 'ECONNREFUSED'
    });
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'DEBUG S3 TEST FAILED',
        details: debugError.message,
        errorType: debugError.name,
        cause: 'This error shows why S3 proxy streaming fails in production'
      });
    }
  }
});

/**
 * Endpoint de transcodificação H264 para reprodução web
 * Converte HEVC/H265 para H264 em tempo real
 */
router.get('/:recordingId/play-web', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    logger.info(`🎬 Iniciando transcodificação H264 para: ${recordingId}`);
    
    // Usar RecordingService para buscar o arquivo
    const fileInfo = await RecordingService.preparePlayback(recordingId);
    
    if (!fileInfo) {
      logger.error(`Gravação não encontrada para transcodificação: ${recordingId}`);
      return res.status(404).json({ error: 'Gravação não encontrada' });
    }
    
    // For S3 sources, we can't transcode directly, redirect to normal S3 URL
    if (fileInfo.source === 's3') {
      logger.info(`🌐 S3 source - redirecionando sem transcodificação: ${fileInfo.recording.filename}`);
      return res.redirect(302, fileInfo.s3Url);
    }
    
    const { filePath, recording } = fileInfo;
    
    logger.info(`🔄 Transcodificando: ${recording.filename} de HEVC para H264`);
    
    // Configurar headers para streaming de vídeo H264
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Transfer-Encoding': 'chunked'
    });
    
    // Comando FFmpeg para transcodificação em tempo real
    const ffmpeg = spawn('docker', [
      'exec', 'newcam-zlmediakit', 'ffmpeg',
      '-i', filePath.replace(/\\/g, '/').replace(/.*www\/record\/live/, 'www/record/live'),
      '-c:v', 'libx264',           // Codec H264 compatível com browsers
      '-preset', 'ultrafast',      // Preset rápido para streaming
      '-tune', 'zerolatency',      // Otimizar para baixa latência
      '-profile:v', 'baseline',    // Perfil baseline para máxima compatibilidade
      '-level:v', '3.0',           // Level 3.0 para compatibilidade web
      '-crf', '23',                // Qualidade razoável (18-28)
      '-c:a', 'aac',               // Audio codec AAC
      '-b:a', '128k',              // Bitrate de audio
      '-f', 'mp4',                 // Formato MP4
      '-movflags', '+frag_keyframe+separate_moof+omit_tfhd_offset+empty_moov', // Otimização para streaming
      '-fflags', '+genpts',        // Gerar timestamps
      '-'                          // Output para stdout
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Log de depuração
    ffmpeg.stderr.on('data', (data) => {
      const stderr = data.toString();
      if (stderr.includes('frame=') || stderr.includes('time=')) {
        // Log de progresso (opcional, pode ser removido se muito verboso)
        logger.debug(`FFmpeg progress: ${stderr.trim()}`);
      } else if (stderr.includes('error') || stderr.includes('Error')) {
        logger.error(`FFmpeg error: ${stderr}`);
      }
    });
    
    // Pipe do output do FFmpeg para a resposta HTTP
    ffmpeg.stdout.pipe(res);
    
    // Lidar com erros e cleanup
    ffmpeg.on('error', (error) => {
      logger.error(`Erro no processo FFmpeg: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro na transcodificação' });
      }
    });
    
    ffmpeg.on('close', (code) => {
      logger.info(`🏁 Transcodificação concluída para ${recordingId} (exit code: ${code})`);
      if (code !== 0) {
        logger.error(`FFmpeg finalizou com código de erro: ${code}`);
      }
    });
    
    // Cleanup quando cliente desconecta
    req.on('close', () => {
      logger.info(`Cliente desconectou, finalizando transcodificação para ${recordingId}`);
      ffmpeg.kill('SIGTERM');
    });
    
  } catch (error) {
    logger.error('Erro na transcodificação H264:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro na transcodificação' });
    }
  }
});

export default router;