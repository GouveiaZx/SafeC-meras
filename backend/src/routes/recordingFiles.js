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

const router = express.Router();

/**
 * Check if S3 streaming should be preferred
 */
function shouldPreferS3() {
  return FeatureFlagService.isEnabled('prefer_s3_streaming');
}

/**
 * Unified streaming endpoint - ALWAYS prefer local file (much faster than S3)
 * GET /:recordingId/stream - Smart routing between local and S3
 */
router.get('/:recordingId/stream', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { force_s3 = false } = req.query;

    logger.info(`📹 Unified stream request: ${recordingId}`, { force_s3 });

    // Get recording details
    const recording = await RecordingService.getRecordingById(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // ALWAYS try local first (much faster than S3 proxy)
    if (!force_s3) {
      try {
        const localFile = await RecordingService.findRecordingFile(recording);
        if (localFile && localFile.exists) {
          logger.info(`💾 Using local stream (fast): ${recordingId}`);
          return await serveLocalFile(req, res, recordingId, 'stream');
        }
      } catch (localError) {
        logger.debug(`Local file not available for ${recordingId}: ${localError.message}`);
      }
    }

    // Fall back to S3 only if local not available
    if (recording.s3_key && recording.upload_status === 'uploaded') {
      try {
        const s3Filename = recording.s3_key.split('/').pop();
        if (recording.filename && s3Filename !== recording.filename) {
          logger.warn(`⚠️ S3_KEY inconsistente para ${recordingId}`);
          return res.status(404).json({ error: 'Recording file not found (S3 key mismatch)' });
        }

        logger.info(`🌐 Falling back to S3 stream for: ${recordingId}`);
        return await serveS3File(req, res, recording, 'stream');

      } catch (s3Error) {
        logger.error(`S3 streaming failed for ${recordingId}:`, s3Error.message);
      }
    }

    return res.status(404).json({ error: 'Recording file not found' });

  } catch (error) {
    logger.error('Error in unified stream endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Unified download endpoint - ALWAYS prefer local file (much faster than S3)
 * GET /:recordingId/download - Smart routing between local and S3
 */
router.get('/:recordingId/download', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { force_s3 = false } = req.query;

    logger.info(`📥 Unified download request: ${recordingId}`, { force_s3 });

    // Get recording details
    const recording = await RecordingService.getRecordingById(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // ALWAYS try local first (much faster than S3)
    if (!force_s3) {
      try {
        const localFile = await RecordingService.findRecordingFile(recording);
        if (localFile && localFile.exists) {
          logger.info(`💾 Using local download (fast): ${recordingId}`);
          return await serveLocalFile(req, res, recordingId, 'download');
        }
      } catch (localError) {
        logger.debug(`Local file not available for ${recordingId}: ${localError.message}`);
      }
    }

    // Fall back to S3 only if local not available
    if (recording.s3_key && recording.upload_status === 'uploaded') {
      try {
        const s3Filename = recording.s3_key.split('/').pop();
        if (recording.filename && s3Filename !== recording.filename) {
          logger.warn(`⚠️ S3_KEY inconsistente para ${recordingId}`);
          return res.status(404).json({ error: 'Recording file not found (S3 key mismatch)' });
        }

        logger.info(`🌐 Falling back to S3 download for: ${recordingId}`);
        return await serveS3File(req, res, recording, 'download');

      } catch (s3Error) {
        logger.error(`S3 download failed for ${recordingId}:`, s3Error.message);
      }
    }

    return res.status(404).json({ error: 'Recording file not found' });

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
 * Helper function to serve local files
 * @private
 */
async function serveLocalFile(req, res, recordingId, mode = 'stream') {
  const fileInfo = await RecordingService.preparePlayback(recordingId);
  
  if (!fileInfo) {
    return res.status(404).json({ error: 'Recording file not found' });
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
 * Helper function to serve files from S3 via proxy (avoids CORS issues)
 * Uses STREAMING to avoid loading entire file into memory
 * @private
 */
async function serveS3File(req, res, recording, mode = 'stream') {
  const range = req.headers.range;

  try {
    // First, get file metadata from S3
    const s3Info = await S3Service.headObject(recording.s3_key);

    if (!s3Info.exists) {
      logger.warn(`S3 object not found: ${recording.s3_key}`);
      throw new Error('S3 object not found');
    }

    const totalSize = s3Info.size;

    // Set base headers
    const headers = {
      'Content-Type': s3Info.contentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'X-Storage-Location': 's3',
      'Cache-Control': 'max-age=3600'
    };

    // Add download-specific headers
    if (mode === 'download') {
      headers['Content-Disposition'] = `attachment; filename="${recording.filename}"`;
    }

    // Handle range requests for streaming
    if (range && mode === 'stream') {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunksize = (end - start) + 1;

      logger.info(`📥 S3 range stream: bytes ${start}-${end}/${totalSize} (${(chunksize/1024/1024).toFixed(2)}MB)`);

      // Get S3 stream directly (no full download!)
      const { stream } = S3Service.getObjectStream(recording.s3_key, `bytes=${start}-${end}`);

      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Content-Length': chunksize
      });

      // Pipe S3 stream directly to response
      stream.pipe(res);

      // Handle stream completion
      stream.on('end', () => {
        logger.info(`✅ S3 range stream completed for: ${recording.filename}`);
      });

      stream.on('error', (err) => {
        logger.error(`S3 stream error for ${recording.filename}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });

    } else {
      // Full file response (also use streaming!)
      logger.info(`📥 S3 full stream: ${(totalSize/1024/1024).toFixed(2)}MB`);

      const { stream } = S3Service.getObjectStream(recording.s3_key, null);

      res.writeHead(200, {
        ...headers,
        'Content-Length': totalSize
      });

      // Pipe S3 stream directly to response
      stream.pipe(res);

      stream.on('end', () => {
        logger.info(`✅ S3 full stream completed for: ${recording.filename}`);
      });

      stream.on('error', (err) => {
        logger.error(`S3 stream error for ${recording.filename}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });
    }

  } catch (error) {
    logger.error(`Failed to serve S3 file ${recording.s3_key}:`, error);
    throw error;
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
    
    const { filePath, fileSize, recording } = fileInfo;
    
    logger.info(`📹 Servindo arquivo: ${recording.filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
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