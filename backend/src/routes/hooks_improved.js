/**
 * Hooks melhorados do ZLMediaKit para o sistema NewCAM
 * Versão robusta com sincronização perfeita ZLMediaKit → Supabase
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const logger = createModuleLogger('ZLMHooks-Improved');

// Configuração de caminhos
const RECORDINGS_BASE_PATH = process.env.RECORDINGS_PATH || path.join(process.cwd(), 'recordings');

/**
 * Função utilitária para validar e normalizar caminhos de arquivo
 */
function normalizeFilePath(filePath, fileName) {
  if (!filePath && !fileName) {
    throw new Error('Caminho do arquivo ou nome do arquivo é obrigatório');
  }
  
  let normalizedPath = filePath;
  
  // Se não há filePath, construir a partir do fileName
  if (!normalizedPath && fileName) {
    normalizedPath = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
  }
  
  // Remover prefixos problemáticos
  if (normalizedPath.startsWith('record/live/')) {
    normalizedPath = normalizedPath.replace('record/live/', '');
  } else if (normalizedPath.startsWith('record/')) {
    normalizedPath = normalizedPath.substring(7);
  } else if (normalizedPath.startsWith('live/')) {
    normalizedPath = normalizedPath.substring(5);
  }
  
  // Garantir que o caminho seja relativo ao diretório de gravações
  const absolutePath = path.isAbsolute(normalizedPath) 
    ? normalizedPath 
    : path.join(RECORDINGS_BASE_PATH, normalizedPath);
  
  return {
    relativePath: normalizedPath,
    absolutePath: absolutePath,
    fileName: path.basename(absolutePath)
  };
}

/**
 * Função utilitária para verificar se arquivo existe fisicamente
 */
async function validateFileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
}

/**
 * Função utilitária para extrair camera_id do stream
 */
function extractCameraId(stream) {
  if (!stream) return null;
  
  // Formato esperado: {camera_id} ou {camera_id}_{format}_{quality}
  const streamParts = stream.split('_');
  const cameraId = streamParts[0];
  
  // Validar se é um UUID válido
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  return uuidRegex.test(cameraId) ? cameraId : null;
}

/**
 * Hook: on_record_mp4 - VERSÃO MELHORADA
 * Chamado quando uma gravação MP4 é concluída
 */
router.post('/on_record_mp4', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      start_time,
      file_size,
      time_len,
      file_path,
      file_name,
      folder,
      url,
      app,
      stream
    } = req.body;

    logger.info('🎬 [WEBHOOK] Hook on_record_mp4 recebido:', {
      file_name,
      file_size,
      duration: time_len,
      file_path,
      stream,
      start_time,
      timestamp: new Date().toISOString()
    });

    // 1. Extrair e validar camera_id
    const cameraId = extractCameraId(stream);
    if (!cameraId) {
      logger.error('❌ [WEBHOOK] Camera ID inválido extraído do stream:', { stream });
      return res.status(400).json({ code: -1, msg: 'Camera ID inválido' });
    }

    logger.info('✅ [WEBHOOK] Camera ID extraído:', { cameraId, stream });

    // 2. Normalizar e validar caminhos de arquivo
    let pathInfo;
    try {
      pathInfo = normalizeFilePath(file_path, file_name);
      logger.info('✅ [WEBHOOK] Caminhos normalizados:', pathInfo);
    } catch (error) {
      logger.error('❌ [WEBHOOK] Erro ao normalizar caminhos:', error);
      return res.status(400).json({ code: -1, msg: 'Caminhos de arquivo inválidos' });
    }

    // 3. Validar se arquivo existe fisicamente
    const fileValidation = await validateFileExists(pathInfo.absolutePath);
    if (!fileValidation.exists) {
      logger.error('❌ [WEBHOOK] Arquivo não encontrado fisicamente:', {
        absolutePath: pathInfo.absolutePath,
        error: fileValidation.error
      });
      
      // Tentar aguardar um pouco e verificar novamente (arquivo pode estar sendo escrito)
      await new Promise(resolve => setTimeout(resolve, 2000));
      const retryValidation = await validateFileExists(pathInfo.absolutePath);
      
      if (!retryValidation.exists) {
        logger.error('❌ [WEBHOOK] Arquivo ainda não encontrado após retry:', {
          absolutePath: pathInfo.absolutePath
        });
        return res.status(404).json({ code: -1, msg: 'Arquivo não encontrado' });
      }
      
      logger.info('✅ [WEBHOOK] Arquivo encontrado após retry');
    }

    logger.info('✅ [WEBHOOK] Arquivo validado:', {
      exists: fileValidation.exists,
      size: fileValidation.size,
      isFile: fileValidation.isFile
    });

    // 4. Verificar se câmera existe, criar se necessário
    let { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('id', cameraId)
      .single();

    if (cameraError || !camera) {
      logger.warn('⚠️ [WEBHOOK] Câmera não encontrada, criando entrada:', { cameraId });
      
      const { data: newCamera, error: createError } = await supabaseAdmin
        .from('cameras')
        .upsert({
          id: cameraId,
          name: `Câmera ${cameraId.substring(0, 8)}`,
          status: 'online',
          rtsp_url: null,
          user_id: null,
          recording_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        logger.error('❌ [WEBHOOK] Erro ao criar câmera:', createError);
        return res.status(500).json({ code: -1, msg: 'Erro ao criar câmera' });
      }
      
      camera = newCamera;
      logger.info('✅ [WEBHOOK] Câmera criada:', { cameraId });
    }

    // 5. Validar e converter start_time
    let startTimeISO;
    if (start_time && !isNaN(start_time) && start_time > 0) {
      try {
        startTimeISO = new Date(start_time * 1000).toISOString();
      } catch (error) {
        logger.error('❌ [WEBHOOK] Erro ao converter start_time:', { start_time, error: error.message });
        startTimeISO = new Date().toISOString();
      }
    } else {
      logger.warn('⚠️ [WEBHOOK] start_time inválido, usando timestamp atual:', { start_time });
      startTimeISO = new Date().toISOString();
    }

    // 6. Verificar duplicação por filename
    const { data: existingRecording } = await supabaseAdmin
      .from('recordings')
      .select('id, status')
      .eq('filename', pathInfo.fileName)
      .eq('camera_id', cameraId)
      .single();

    if (existingRecording) {
      logger.info('⚠️ [WEBHOOK] Gravação já existe, atualizando:', {
        existingId: existingRecording.id,
        filename: pathInfo.fileName
      });
      
      // Atualizar gravação existente
      const { error: updateError } = await supabaseAdmin
        .from('recordings')
        .update({
          file_path: pathInfo.relativePath,
          local_path: pathInfo.relativePath,
          file_size: fileValidation.size || file_size,
          duration: time_len ? Math.round(parseFloat(time_len)) : null,
          status: 'completed',
          end_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            stream_name: stream,
            format: 'mp4',
            processed_by_improved_hook: true,
            processing_time_ms: Date.now() - startTime,
            file_validated: true
          }
        })
        .eq('id', existingRecording.id);
      
      if (updateError) {
        logger.error('❌ [WEBHOOK] Erro ao atualizar gravação:', updateError);
        return res.status(500).json({ code: -1, msg: 'Erro ao atualizar gravação' });
      }
      
      logger.info('✅ [WEBHOOK] Gravação atualizada com sucesso:', {
        recordingId: existingRecording.id,
        processingTime: Date.now() - startTime
      });
      
      return res.json({ code: 0, msg: 'success', action: 'updated' });
    }

    // 7. Criar nova gravação
    const recordingId = uuidv4();
    
    const { data: newRecording, error: insertError } = await supabaseAdmin
      .from('recordings')
      .insert({
        id: recordingId,
        camera_id: cameraId,
        filename: pathInfo.fileName,
        file_path: pathInfo.relativePath,
        local_path: pathInfo.relativePath,
        file_size: fileValidation.size || file_size,
        duration: time_len ? Math.round(parseFloat(time_len)) : null,
        status: 'completed',
        upload_status: null,
        start_time: startTimeISO,
        end_time: new Date().toISOString(),
        created_at: startTimeISO,
        updated_at: new Date().toISOString(),
        metadata: {
          stream_name: stream,
          format: 'mp4',
          processed_by_improved_hook: true,
          processing_time_ms: Date.now() - startTime,
          file_validated: true,
          zlm_data: {
            folder,
            url,
            app
          }
        }
      })
      .select();

    if (insertError) {
      logger.error('❌ [WEBHOOK] Erro ao inserir gravação:', insertError);
      return res.status(500).json({ code: -1, msg: 'Erro ao criar gravação' });
    }

    logger.info('✅ [WEBHOOK] Gravação criada com sucesso:', {
      recordingId,
      filename: pathInfo.fileName,
      fileSize: fileValidation.size || file_size,
      duration: time_len,
      processingTime: Date.now() - startTime
    });

    // 8. Verificar upload automático (opcional)
    const autoUpload = process.env.AUTO_UPLOAD_WASABI === 'true';
    if (autoUpload) {
      logger.info('📤 [WEBHOOK] Iniciando upload automático para S3/Wasabi');
      
      // Fazer upload em background
      setTimeout(async () => {
        try {
          const { default: RecordingService } = await import('../services/RecordingService.js');
          await RecordingService.uploadRecordingToS3(recordingId);
          logger.info('✅ [WEBHOOK] Upload automático concluído:', { recordingId });
        } catch (uploadError) {
          logger.error('❌ [WEBHOOK] Erro no upload automático:', uploadError);
        }
      }, 5000);
    }

    res.json({ 
      code: 0, 
      msg: 'success', 
      action: 'created',
      recordingId,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro crítico no hook on_record_mp4:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_record_ts - VERSÃO MELHORADA
 * Chamado quando uma gravação HLS (TS) é concluída
 */
router.post('/on_record_ts', async (req, res) => {
  try {
    const {
      start_time,
      file_size,
      time_len,
      file_path,
      file_name,
      folder,
      url,
      app,
      stream
    } = req.body;

    logger.info('🎬 [WEBHOOK] Hook on_record_ts recebido:', {
      file_name,
      file_size,
      duration: time_len,
      file_path,
      stream
    });

    // Processar similar ao MP4, mas com formato HLS
    const cameraId = extractCameraId(stream);
    if (!cameraId) {
      return res.status(400).json({ code: -1, msg: 'Camera ID inválido' });
    }

    // Para HLS, apenas logar - não criar registro separado
    logger.info('📺 [WEBHOOK] Segmento HLS processado:', {
      cameraId,
      filename: file_name,
      size: file_size
    });

    res.json({ code: 0, msg: 'success' });

  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_record_ts:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Outros hooks mantidos do arquivo original
 */

// Hook: on_publish
router.post('/on_publish', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('📡 [WEBHOOK] Hook on_publish recebido:', { app, stream, vhost, schema });
    
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      await supabaseAdmin
        .from('cameras')
        .update({
          status: 'online',
          is_streaming: true,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      logger.info('✅ [WEBHOOK] Câmera marcada como streaming ativo:', { cameraId });
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_publish:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

// Hook: on_stream_changed
router.post('/on_stream_changed', async (req, res) => {
  try {
    const { regist, app, stream, vhost, schema } = req.body;
    
    logger.info('🔄 [WEBHOOK] Hook on_stream_changed recebido:', { regist, app, stream });
    
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      if (regist) {
        // Stream criada
        await supabaseAdmin
          .from('cameras')
          .update({
            status: 'online',
            is_streaming: true,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', cameraId);
        
        logger.info('✅ [WEBHOOK] Stream criada para câmera:', { cameraId });
      } else {
        // Stream destruída
        await supabaseAdmin
          .from('cameras')
          .update({
            is_streaming: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', cameraId);
        
        logger.info('⏹️ [WEBHOOK] Stream destruída para câmera:', { cameraId });
      }
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_stream_changed:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Endpoint de status dos hooks melhorados
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    version: 'improved',
    hooks: [
      'on_publish',
      'on_stream_changed',
      'on_record_mp4',
      'on_record_ts'
    ],
    features: [
      'robust_file_validation',
      'path_normalization',
      'duplicate_prevention',
      'camera_auto_creation',
      'enhanced_logging'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;