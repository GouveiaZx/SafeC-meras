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
import crypto from 'crypto';
import RecordingService from '../services/RecordingService.js';

const router = express.Router();
const logger = createModuleLogger('ZLMHooks-Improved');

// Configuração de caminhos
const RECORDINGS_BASE_PATH = process.env.RECORDINGS_PATH || path.join(process.cwd(), '..', 'storage', 'www', 'record');

/**
 * Função utilitária para validar e normalizar caminhos de arquivo
 */
function normalizeFilePath(filePath, fileName) {
  logger.info('🔍 [normalizeFilePath] Iniciando normalização:', {
    inputFilePath: filePath,
    inputFileName: fileName,
    RECORDINGS_BASE_PATH: RECORDINGS_BASE_PATH
  });
  
  if (!filePath && !fileName) {
    throw new Error('Caminho do arquivo ou nome do arquivo é obrigatório');
  }
  
  let normalizedPath = filePath;
  
  // Se não há filePath, construir a partir do fileName
  if (!normalizedPath && fileName) {
    normalizedPath = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
    logger.info('🔍 [normalizeFilePath] Construído a partir do fileName:', { normalizedPath });
  }
  
  // Mapear caminho do contêiner para caminho do host - remover prefixos conhecidos
  if (normalizedPath.startsWith('/opt/media/bin/www/')) {
    normalizedPath = normalizedPath.replace('/opt/media/bin/www/', '');
    logger.info('🔍 [normalizeFilePath] Removido prefixo /opt/media/bin/www/');
  }
  
  // Remover prefixo ./www/ que vem do ZLMediaKit
  if (normalizedPath.startsWith('./www/')) {
    normalizedPath = normalizedPath.replace('./www/', '');
    logger.info('🔍 [normalizeFilePath] Removido prefixo ./www/');
  }
  
  // Remover prefixo www/ que pode vir sem o ./
  if (normalizedPath.startsWith('www/')) {
    normalizedPath = normalizedPath.replace('www/', '');
    logger.info('🔍 [normalizeFilePath] Removido prefixo www/');
  }
  
  // Corrigir duplicação de "record/live" - tratar múltiplos padrões
  const duplicatePatterns = [
    /\/record\/live\/record\/live\//g,
    /\/record\/live\/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\/record\/live\/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd\//g
  ];
  
  duplicatePatterns.forEach(pattern => {
    if (pattern.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(pattern, '/record/live/');
      logger.info('🔍 [normalizeFilePath] Corrigida duplicação record/live:', { normalizedPath });
    }
  });
  
  // Remover apenas barras iniciais, preservar a estrutura completa
  normalizedPath = normalizedPath.replace(/^\/+/, ''); // Remover barras iniciais
  normalizedPath = normalizedPath.replace(/\/+/g, '/'); // Normalizar barras duplas
  logger.info('🔍 [normalizeFilePath] Após normalização:', { normalizedPath });
  
  // Corrigir duplicação de caminho quando o arquivo já está em 'record/live'
  if (normalizedPath.includes('record/live/') && normalizedPath.split('record/live/').length > 2) {
    const parts = normalizedPath.split('record/live/');
    normalizedPath = 'record/live/' + parts[parts.length - 1];
    logger.info('🔍 [normalizeFilePath] Corrigida duplicação de caminho:', { normalizedPath });
  }
  
  // CORREÇÃO CRÍTICA: Mapear para o diretório correto do ZLMediaKit
  // O ZLMediaKit salva em ./www/record/ que corresponde a ../storage/www/record/
  let finalPath;
  
  // Se o caminho começa com 'record/', mapear para o diretório storage/www do projeto raiz
  if (normalizedPath.startsWith('record/')) {
    // Mapear para o diretório storage/www do projeto raiz (subir de backend para raiz)
    const projectRoot = path.resolve(process.cwd(), '..'); // Subir de backend para raiz
    finalPath = path.resolve(projectRoot, 'storage', 'www', normalizedPath);
    logger.info('🔍 [normalizeFilePath] Mapeado para diretório storage/www do projeto:', { finalPath });
  } else {
    // Fallback para o diretório recordings do backend
    finalPath = path.isAbsolute(normalizedPath) 
      ? normalizedPath 
      : path.join(RECORDINGS_BASE_PATH, normalizedPath);
    logger.info('🔍 [normalizeFilePath] Usando diretório recordings do backend:', { finalPath });
  }
  
  const result = {
    relativePath: normalizedPath,
    absolutePath: finalPath,
    fileName: path.basename(finalPath)
  };
  
  logger.info('🔍 [normalizeFilePath] Caminho final:', result);
  return result;
}

/**
 * Função utilitária para verificar se arquivo existe fisicamente
 */
async function validateFileExists(filePath) {
  logger.debug('🔍 [validateFileExists] Verificando arquivo:', { filePath });
  
  try {
    const stats = await fs.stat(filePath);
    const result = {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size
    };
    logger.debug('🔍 [validateFileExists] Arquivo encontrado:', result);
    return result;
  } catch (error) {
    const result = {
      exists: false,
      error: error.message
    };
    logger.debug('🔍 [validateFileExists] Arquivo não encontrado:', result);
    return result;
  }
}

/**
 * Função auxiliar simples para verificar existência de arquivo
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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
  
  if (uuidRegex.test(cameraId)) {
    return cameraId;
  }
  
  // Se não é um UUID válido, gerar um UUID baseado no stream name
  const hash = crypto.createHash('md5').update(stream).digest('hex');
  
  // Converter hash MD5 para formato UUID v4
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16), // versão 4
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // variant
    hash.substring(20, 32)
  ].join('-');
  
  return uuid;
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
    logger.info('🔍 [WEBHOOK] Verificando existência do arquivo:', {
      absolutePath: pathInfo.absolutePath,
      recordPathBase: RECORDINGS_BASE_PATH,
      originalFilePath: file_path,
      originalFileName: file_name,
      normalizedPath: pathInfo.relativePath,
      cwd: process.cwd(),
      fullPath: pathInfo.absolutePath,
      pathExists: await fileExists(pathInfo.absolutePath)
    });
    
    // DEBUG: Log detalhado dos caminhos
    logger.info('🔍 [DEBUG] Detalhes completos dos caminhos:', {
      inputFilePath: file_path,
      inputFileName: file_name,
      normalizedRelativePath: pathInfo.relativePath,
      absolutePathConstructed: pathInfo.absolutePath,
      RECORDINGS_BASE_PATH: RECORDINGS_BASE_PATH,
      processWorkingDirectory: process.cwd()
    });

    // Log adicional para debug do caminho exato
    logger.info('🔍 [DEBUG] Caminho exato sendo verificado:', {
      exactPath: pathInfo.absolutePath,
      pathExists: await fileExists(pathInfo.absolutePath)
    });
    
    const fileValidation = await validateFileExists(pathInfo.absolutePath);
    if (!fileValidation.exists) {
      logger.error('❌ [WEBHOOK] Arquivo não encontrado fisicamente:', {
        absolutePath: pathInfo.absolutePath,
        error: fileValidation.error,
        cwd: process.cwd(),
        recordPathBase: RECORDINGS_BASE_PATH,
        filePath: file_path,
        fileName: file_name
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
          local_path: pathInfo.absolutePath,
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
      
      // Atualização imediata de metadados (resolução, codecs, etc.) em background
      setTimeout(async () => {
        try {
          await RecordingService.updateSingleRecordingStatistics(existingRecording.id);
          logger.info('✅ [WEBHOOK] Metadados atualizados imediatamente para gravação existente:', { recordingId: existingRecording.id });
        } catch (e) {
          logger.error('❌ [WEBHOOK] Erro ao atualizar metadados imediatamente (existente):', e);
        }
      }, 1000);
      
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
        local_path: pathInfo.absolutePath,
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

    // Atualização imediata de metadados (resolução, codecs, etc.) em background
    setTimeout(async () => {
      try {
        await RecordingService.updateSingleRecordingStatistics(recordingId);
        logger.info('✅ [WEBHOOK] Metadados atualizados imediatamente para nova gravação:', { recordingId });
      } catch (e) {
        logger.error('❌ [WEBHOOK] Erro ao atualizar metadados imediatamente (novo):', e);
      }
    }, 1000);

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

// Hook: on_play
router.post('/on_play', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    logger.info('📺 [WEBHOOK] Hook on_play recebido:', {
      app,
      stream,
      vhost,
      schema,
      viewer_ip: ip,
      viewer_port: port,
      viewer_id: id
    });
    
    // Extrair camera_id do stream
    const cameraId = extractCameraId(stream);
    
    if (cameraId) {
      // Incrementar contador de visualizadores (opcional)
      logger.info(`✅ [WEBHOOK] Nova visualização da câmera ${cameraId} por ${ip}:${port}`);
    }
    
    // Permitir reprodução
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_play:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

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

      // Iniciar gravação automática se habilitada e não houver gravação ativa
      try {
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('id, name, recording_enabled')
          .eq('id', cameraId)
          .single();

        if (camera && camera.recording_enabled) {
          logger.info(`🎬 [WEBHOOK] Gravação habilitada para ${camera.name}. Verificando gravações ativas...`);
          setTimeout(async () => {
            try {
              const { data: activeRecordings } = await supabaseAdmin
                .from('recordings')
                .select('id, status')
                .eq('camera_id', cameraId)
                .eq('status', 'recording')
                .limit(1);

              if (!activeRecordings || activeRecordings.length === 0) {
                await RecordingService.startRecording(cameraId);
                logger.info(`🎉 [WEBHOOK] Gravação automática iniciada (on_publish) para ${camera.name}`);
              } else {
                logger.info(`ℹ️ [WEBHOOK] Já existe gravação ativa (on_publish) para ${camera.name}`);
              }
            } catch (recordingErr) {
              logger.error(`❌ [WEBHOOK] Falha ao iniciar gravação automática (on_publish) para câmera ${cameraId}:`, recordingErr);
            }
          }, 3000);
        }
      } catch (camFetchErr) {
        logger.warn('⚠️ [WEBHOOK] Não foi possível verificar flag recording_enabled em on_publish:', camFetchErr);
      }
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

        // Iniciar gravação automática se habilitada e não houver gravação ativa
        try {
          const { data: camera } = await supabaseAdmin
            .from('cameras')
            .select('id, name, recording_enabled')
            .eq('id', cameraId)
            .single();

          if (camera && camera.recording_enabled) {
            logger.info(`🎬 [WEBHOOK] Gravação habilitada para ${camera.name}. Verificando gravações ativas...`);
            setTimeout(async () => {
              try {
                const { data: activeRecordings } = await supabaseAdmin
                  .from('recordings')
                  .select('id, status')
                  .eq('camera_id', cameraId)
                  .eq('status', 'recording')
                  .limit(1);

                if (!activeRecordings || activeRecordings.length === 0) {
                  await RecordingService.startRecording(cameraId);
                  logger.info(`🎉 [WEBHOOK] Gravação automática iniciada (on_stream_changed) para ${camera.name}`);
                } else {
                  logger.info(`ℹ️ [WEBHOOK] Já existe gravação ativa (on_stream_changed) para ${camera.name}`);
                }
              } catch (recordingErr) {
                logger.error(`❌ [WEBHOOK] Falha ao iniciar gravação automática (on_stream_changed) para câmera ${cameraId}:`, recordingErr);
              }
            }, 3000);
          }
        } catch (camFetchErr) {
          logger.warn('⚠️ [WEBHOOK] Não foi possível verificar flag recording_enabled em on_stream_changed:', camFetchErr);
        }
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
 * Hook: on_stream_not_found
 * Chamado quando uma stream solicitada não é encontrada
 */
router.post('/on_stream_not_found', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    logger.warn('⚠️ [WEBHOOK] Stream não encontrada:', {
      app,
      stream,
      vhost,
      schema,
      requester_ip: ip,
      requester_port: port,
      requester_id: id
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      logger.warn(`⚠️ [WEBHOOK] Stream não encontrada para câmera ${cameraId}`);
      
      // Tentar reativar a câmera automaticamente
      try {
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('*')
          .eq('id', cameraId)
          .single();
        
        if (camera && camera.active) {
          logger.info(`🔄 [WEBHOOK] Verificando stream da câmera ${camera.name}`);
          
          // Importar e executar o serviço de streaming
          const { default: streamingService } = await import('../services/StreamingService.js');
          
          // Verificar se o stream já está ativo antes de tentar reativar
          const existingStream = await streamingService.getStream(cameraId);
          
          if (!existingStream) {
            logger.info(`🔄 [WEBHOOK] Tentando reativar stream da câmera ${camera.name}`);
            
            // Tentar iniciar stream novamente
            await streamingService.startStream(camera, {
              quality: 'medium',
              format: 'hls',
              audio: true
            });
            
            logger.info(`✅ [WEBHOOK] Stream da câmera ${camera.name} reativada com sucesso`);
          } else {
            logger.info(`ℹ️ [WEBHOOK] Stream da câmera ${camera.name} já está ativo`);
          }
        }
      } catch (restartError) {
        logger.error(`❌ [WEBHOOK] Erro ao tentar reativar câmera ${cameraId}:`, restartError);
      }
    }
    
    // Retornar que não foi possível encontrar a stream
    res.json({ code: -1, msg: 'stream not found' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_stream_not_found:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_none_reader
 * Chamado quando uma stream não tem mais visualizadores
 */
router.post('/on_stream_none_reader', async (req, res) => {
  try {
    const { app, stream, vhost, schema } = req.body;
    
    logger.info('👥 [WEBHOOK] Stream sem visualizadores:', {
      app,
      stream,
      vhost,
      schema
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      logger.info(`👥 [WEBHOOK] Stream da câmera ${cameraId} sem visualizadores`);
      
      // Atualizar status no banco de dados
      await supabaseAdmin
        .from('cameras')
        .update({ 
          viewers_count: 0,
          last_viewer_disconnect: new Date().toISOString()
        })
        .eq('id', cameraId);
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_stream_none_reader:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_server_started
 * Chamado quando o ZLMediaKit é iniciado
 */
router.post('/on_server_started', async (req, res) => {
  try {
    logger.info('🚀 [WEBHOOK] ZLMediaKit iniciado - reinicializando câmeras ativas');
    
    // Importar e executar script de reinicialização
    const { default: startCameraStreaming } = await import('../scripts/startCameraStreaming.js');
    
    // Executar em background para não bloquear o webhook
    setImmediate(async () => {
      try {
        await startCameraStreaming();
        logger.info('✅ [WEBHOOK] Câmeras reinicializadas com sucesso');
      } catch (error) {
        logger.error('❌ [WEBHOOK] Erro ao reinicializar câmeras:', error);
      }
    });
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ [WEBHOOK] Erro no hook on_server_started:', error);
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
      'on_play',
      'on_publish',
      'on_stream_changed',
      'on_record_mp4',
      'on_record_ts',
      'on_stream_not_found',
      'on_stream_none_reader',
      'on_server_started'
    ],
    features: [
      'robust_file_validation',
      'path_normalization',
      'duplicate_prevention',
      'camera_auto_creation',
      'enhanced_logging',
      'auto_stream_recovery',
      'viewer_tracking',
      'auto_camera_restart'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;