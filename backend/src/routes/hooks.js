/**
 * Rotas de hooks MELHORADAS do ZLMediaKit para o sistema NewCAM
 * Versão aprimorada com sincronização robusta e validação completa
 * Gerencia eventos de streaming em tempo real com máxima confiabilidade
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const router = express.Router();
const logger = createModuleLogger('ZLMHooks-Improved');

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache para evitar processamento duplicado
const processedRecordings = new Set();

// Função utilitária para validar UUID
function isValidUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Função utilitária para extrair camera_id do stream
function extractCameraId(stream) {
  if (!stream) return null;
  const streamParts = stream.split('_');
  const cameraId = streamParts[0];
  return isValidUUID(cameraId) ? cameraId : null;
}

// Função utilitária para validar e converter timestamp
function validateTimestamp(timestamp) {
  if (!timestamp || isNaN(timestamp) || timestamp <= 0) {
    logger.warn('Timestamp inválido, usando timestamp atual:', { timestamp });
    return new Date().toISOString();
  }
  
  try {
    // Converter de Unix timestamp para ISO string
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) {
      throw new Error('Data inválida');
    }
    return date.toISOString();
  } catch (error) {
    logger.error('Erro ao converter timestamp:', { timestamp, error: error.message });
    return new Date().toISOString();
  }
}

// Função utilitária para verificar se arquivo existe
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Função utilitária para obter informações do arquivo
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      exists: true,
      modified: stats.mtime.toISOString()
    };
  } catch (error) {
    logger.warn('Erro ao obter informações do arquivo:', { filePath, error: error.message });
    return {
      size: 0,
      exists: false,
      modified: null
    };
  }
}

/**
 * Hook: on_publish (MELHORADO)
 * Chamado quando uma stream é publicada no ZLMediaKit
 * Versão aprimorada com validação robusta e sincronização confiável
 */
router.post('/on_publish', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('🚀 Hook on_publish recebido:', {
      app,
      stream,
      vhost,
      schema,
      params,
      timestamp: new Date().toISOString()
    });
    
    // Validar dados de entrada
    if (!stream) {
      logger.error('Stream não fornecido no hook on_publish');
      return res.status(400).json({ code: -1, msg: 'stream required' });
    }
    
    // Extrair e validar camera_id
    const cameraId = extractCameraId(stream);
    
    if (!cameraId) {
      logger.warn('Camera ID inválido extraído do stream:', { stream });
      return res.json({ code: 0, msg: 'invalid camera id, but allowing stream' });
    }
    
    logger.info(`📹 Processando publicação de stream para câmera: ${cameraId}`);
    
    // Verificar se a câmera existe no banco
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active, recording_enabled')
      .eq('id', cameraId)
      .single();
    
    if (cameraError || !camera) {
      logger.error('Câmera não encontrada no banco:', { cameraId, error: cameraError });
      return res.json({ code: 0, msg: 'camera not found, but allowing stream' });
    }
    
    // Atualizar status da câmera no banco com validação
    const updateData = {
      status: 'online',
      is_streaming: true,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabaseAdmin
      .from('cameras')
      .update(updateData)
      .eq('id', cameraId);
    
    if (updateError) {
      logger.error('Erro ao atualizar status da câmera:', { cameraId, error: updateError });
      // Não falhar o hook por erro de atualização
    } else {
      logger.info(`✅ Câmera ${camera.name} (${cameraId}) marcada como streaming ativo`);
    }
    
    // Retornar sucesso para o ZLMediaKit
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ Erro crítico no hook on_publish:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_play
 * Chamado quando alguém inicia a reprodução de uma stream
 */
router.post('/on_play', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params, ip, port, id } = req.body;
    
    logger.info('Hook on_play recebido:', {
      app,
      stream,
      vhost,
      schema,
      viewer_ip: ip,
      viewer_port: port,
      viewer_id: id
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      // Incrementar contador de visualizadores (opcional)
      logger.info(`Nova visualização da câmera ${cameraId} por ${ip}:${port}`);
    }
    
    // Permitir reprodução
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_play:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_changed (MELHORADO)
 * Chamado quando o status de uma stream muda (criada/destruída)
 * Versão aprimorada com validação robusta e gestão automática de gravação
 */
router.post('/on_stream_changed', async (req, res) => {
  try {
    const { regist, app, stream, vhost, schema, params } = req.body;
    
    logger.info('🔄 Hook on_stream_changed MELHORADO recebido:', {
      regist, // true = stream criada, false = stream destruída
      app,
      stream,
      vhost,
      schema,
      timestamp: new Date().toISOString()
    });
    
    // Validar dados de entrada
    if (!stream || regist === undefined) {
      logger.error('❌ Dados obrigatórios ausentes no on_stream_changed:', { stream, regist });
      return res.status(400).json({ code: -1, msg: 'missing required fields' });
    }
    
    // Extrair e validar camera_id
    const cameraId = extractCameraId(stream);
    
    if (!cameraId) {
      logger.warn('⚠️ Camera ID inválido no on_stream_changed:', { stream });
      return res.json({ code: 0, msg: 'invalid camera id, but allowing' });
    }
    
    // Verificar se a câmera existe
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active, recording_enabled')
      .eq('id', cameraId)
      .single();
    
    if (cameraError || !camera) {
      logger.error('❌ Câmera não encontrada no on_stream_changed:', { cameraId, error: cameraError });
      return res.json({ code: 0, msg: 'camera not found, but allowing' });
    }
    
    if (regist) {
      // Stream foi criada
      logger.info(`🟢 Stream CRIADA para câmera ${camera.name} (${cameraId})`);
      
      const updateData = {
        status: 'online',
        is_streaming: true,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { error: updateError } = await supabaseAdmin
        .from('cameras')
        .update(updateData)
        .eq('id', cameraId);
      
      if (updateError) {
        logger.error('❌ Erro ao atualizar status da câmera (criada):', { cameraId, error: updateError });
      } else {
        logger.info(`✅ Câmera ${camera.name} marcada como online e streaming`);
      }
      
      // Verificar se a câmera tem gravação habilitada e iniciar automaticamente
      if (camera.recording_enabled) {
        logger.info(`🎬 Iniciando gravação automática para câmera ${camera.name}`);
        
        // Aguardar um pouco para garantir que a stream esteja estável
        setTimeout(async () => {
          try {
            // Importar serviço de gravação
            const { default: recordingService } = await import('../services/RecordingService.js');
            
            // Verificar se já não há gravação ativa
            const { data: activeRecordings } = await supabaseAdmin
              .from('recordings')
              .select('id, status')
              .eq('camera_id', cameraId)
              .eq('status', 'recording')
              .limit(1);
            
            if (activeRecordings && activeRecordings.length > 0) {
              logger.info(`⚠️ Gravação já ativa para câmera ${camera.name}, pulando início automático`);
              return;
            }
            
            await recordingService.startRecording(cameraId);
            logger.info(`🎉 Gravação automática iniciada para câmera ${camera.name}`);
          } catch (recordingError) {
            logger.error(`❌ Erro ao iniciar gravação automática para câmera ${cameraId}:`, {
              error: recordingError.message,
              camera: camera.name
            });
          }
        }, 3000); // Aguardar 3 segundos para stream estabilizar
      } else {
        logger.info(`ℹ️ Gravação não habilitada para câmera ${camera.name}`);
      }
    } else {
      // Stream foi destruída
      logger.info(`🔴 Stream DESTRUÍDA para câmera ${camera.name} (${cameraId})`);
      
      const updateData = {
        is_streaming: false,
        updated_at: new Date().toISOString()
      };
      
      const { error: updateError } = await supabaseAdmin
        .from('cameras')
        .update(updateData)
        .eq('id', cameraId);
      
      if (updateError) {
        logger.error('❌ Erro ao atualizar status da câmera (destruída):', { cameraId, error: updateError });
      } else {
        logger.info(`✅ Câmera ${camera.name} marcada como não streaming`);
      }
      
      // Parar gravação se estiver ativa
      try {
        const { data: activeRecordings } = await supabaseAdmin
          .from('recordings')
          .select('id, status')
          .eq('camera_id', cameraId)
          .eq('status', 'recording')
          .limit(1);
        
        if (activeRecordings && activeRecordings.length > 0) {
          logger.info(`🛑 Parando gravação ativa para câmera ${camera.name}`);
          
          const { default: recordingService } = await import('../services/RecordingService.js');
          await recordingService.stopRecording(cameraId, activeRecordings[0].id);
          
          logger.info(`✅ Gravação parada automaticamente para câmera ${camera.name}`);
        } else {
          logger.info(`ℹ️ Nenhuma gravação ativa encontrada para câmera ${camera.name}`);
        }
      } catch (stopRecordError) {
        logger.error(`❌ Erro ao parar gravação para câmera ${cameraId}:`, {
          error: stopRecordError.message,
          camera: camera.name
        });
      }
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ Erro crítico no hook on_stream_changed:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
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
    
    logger.warn('Hook on_stream_not_found recebido:', {
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
      logger.warn(`Stream não encontrada para câmera ${cameraId}`);
      
      // Tentar reativar a câmera automaticamente
      try {
        const { data: camera } = await supabaseAdmin
          .from('cameras')
          .select('*')
          .eq('id', cameraId)
          .single();
        
        if (camera && camera.active) {
          logger.info(`Tentando reativar stream da câmera ${camera.name}`);
          
          // Importar e executar o serviço de streaming
          const { default: streamingService } = await import('../services/StreamingService.js');
          
          // Tentar iniciar stream novamente
          await streamingService.startStream(camera, {
            quality: 'medium',
            format: 'hls',
            audio: true
          });
          
          logger.info(`Stream da câmera ${camera.name} reativada com sucesso`);
        }
      } catch (restartError) {
        logger.error(`Erro ao tentar reativar câmera ${cameraId}:`, restartError);
      }
    }
    
    // Retornar que não foi possível encontrar a stream
    res.json({ code: -1, msg: 'stream not found' });
  } catch (error) {
    logger.error('Erro no hook on_stream_not_found:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_stream_none_reader
 * Chamado quando uma stream não tem mais visualizadores
 */
router.post('/on_stream_none_reader', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('Hook on_stream_none_reader recebido:', {
      app,
      stream,
      vhost,
      schema
    });
    
    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];
    
    if (cameraId) {
      logger.info(`Stream da câmera ${cameraId} não tem mais visualizadores`);
      
      // Opcional: manter stream ativa ou parar para economizar recursos
      // Por enquanto, vamos manter ativa para monitoramento contínuo
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_stream_none_reader:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_server_started
 * Chamado quando o ZLMediaKit inicia
 */
router.post('/on_server_started', async (req, res) => {
  try {
    logger.info('Hook on_server_started recebido - ZLMediaKit iniciado');
    
    // Opcional: executar inicialização de câmeras quando ZLM reinicia
    setTimeout(async () => {
      try {
        const { default: startCameraStreaming } = await import('../scripts/startCameraStreaming.js');
        await startCameraStreaming();
        logger.info('Câmeras reinicializadas após restart do ZLMediaKit');
      } catch (error) {
        logger.error('Erro ao reinicializar câmeras:', error);
      }
    }, 5000); // Aguardar 5 segundos para ZLM estar totalmente pronto
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_server_started:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_record_mp4 (MELHORADO)
 * Chamado quando uma gravação MP4 é concluída
 * Versão aprimorada com validação robusta e prevenção de duplicatas
 */
router.post('/on_record_mp4', async (req, res) => {
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

    const hookId = `${file_name}_${Date.now()}`;
    
    logger.info('🎬 Hook on_record_mp4 MELHORADO recebido:', {
      hookId,
      file_name,
      file_size,
      duration: time_len,
      file_path,
      stream,
      start_time,
      folder,
      url,
      app,
      timestamp: new Date().toISOString()
    });

    // Validação de dados de entrada
    if (!file_name || !stream) {
      logger.error('❌ Dados obrigatórios ausentes:', { file_name, stream });
      return res.status(400).json({ code: -1, msg: 'missing required fields' });
    }

    // Verificar cache de processamento para evitar duplicatas
    const cacheKey = `${stream}_${file_name}`;
    if (processedRecordings.has(cacheKey)) {
      logger.warn('⚠️ Gravação já processada (cache):', { cacheKey });
      return res.json({ code: 0, msg: 'already processed (cache)' });
    }

    // Extrair e validar camera_id
    const cameraId = extractCameraId(stream);
    
    if (!cameraId) {
      logger.error('❌ Camera ID inválido extraído do stream:', { stream });
      return res.status(400).json({ code: -1, msg: 'invalid camera id' });
    }

    logger.info(`📹 Processando gravação MP4 para câmera: ${cameraId}`);

    // Validar timestamp
    const startTimeISO = validateTimestamp(start_time);

    // Validar duração
    const duration = time_len ? Math.round(parseFloat(time_len)) : null;
    if (duration && duration < 5) {
      logger.warn('⚠️ Gravação com duração muito pequena:', {
        duration,
        file_name,
        stream,
        possivel_causa: 'Segmentação incorreta ou configuração ZLM'
      });
    }

    // Verificar se a câmera existe
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active')
      .eq('id', cameraId)
      .single();

    if (cameraError || !camera) {
      logger.error('❌ Câmera não encontrada:', { cameraId, error: cameraError });
      return res.status(404).json({ code: -1, msg: 'camera not found' });
    }

    // Verificar se arquivo já foi processado no banco
    const { data: existingRecording } = await supabaseAdmin
      .from('recordings')
      .select('id, status')
      .eq('filename', file_name)
      .eq('camera_id', cameraId)
      .single();

    if (existingRecording) {
      logger.warn('⚠️ Gravação já existe no banco:', {
        recordingId: existingRecording.id,
        status: existingRecording.status,
        file_name
      });
      processedRecordings.add(cacheKey);
      return res.json({ code: 0, msg: 'already exists in database' });
    }

    // Validar se arquivo físico existe
    const fullFilePath = file_path || join(__dirname, '../../storage/www/record/recordings', file_name);
    const fileInfo = await getFileInfo(fullFilePath);
    
    if (!fileInfo.exists) {
      logger.error('❌ Arquivo físico não encontrado:', { fullFilePath });
      return res.status(404).json({ code: -1, msg: 'file not found' });
    }

    // Usar tamanho real do arquivo se não fornecido
    const actualFileSize = file_size || fileInfo.size;

    logger.info('✅ Validações concluídas, processando gravação:', {
      cameraId,
      camera: camera.name,
      file_name,
      actualFileSize,
      duration,
      fileExists: fileInfo.exists
    });

    // Adicionar ao cache antes do processamento
    processedRecordings.add(cacheKey);

    // Importar serviço de gravação melhorado
    const { default: RecordingService } = await import('../services/RecordingService.js');

    // Processar gravação com dados validados
    const recordingData = {
      cameraId,
      fileName: file_name,
      filePath: fullFilePath,
      fileSize: actualFileSize,
      duration,
      startTime: startTimeISO,
      streamName: stream,
      format: 'mp4',
      hookId
    };

    await RecordingService.processCompletedRecording(recordingData);

    logger.info(`🎉 Gravação MP4 processada com sucesso:`, {
      camera: camera.name,
      file_name,
      duration,
      size: actualFileSize
    });

    // Limpar cache após um tempo (evitar crescimento infinito)
    setTimeout(() => {
      processedRecordings.delete(cacheKey);
    }, 300000); // 5 minutos

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ Erro crítico no hook on_record_mp4:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Hook: on_record_ts
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

    logger.info('Hook on_record_ts recebido:', {
      file_name,
      file_size,
      duration: time_len,
      file_path,
      stream
    });

    // Extrair camera_id do stream
    const streamParts = stream.split('_');
    const cameraId = streamParts[0];

    // CORREÇÃO CRÍTICA: Validar start_time antes de criar Date
    let startTimeISO;
    if (start_time && !isNaN(start_time) && start_time > 0) {
      try {
        startTimeISO = new Date(start_time * 1000).toISOString();
      } catch (error) {
        logger.error('🔍 [DEBUG] Erro ao converter start_time no on_record_ts:', { start_time, error: error.message });
        startTimeISO = new Date().toISOString(); // Usar timestamp atual como fallback
      }
    } else {
      logger.warn('🔍 [DEBUG] start_time inválido no on_record_ts, usando timestamp atual:', { start_time });
      startTimeISO = new Date().toISOString();
    }

    if (cameraId) {
      // Importar serviço de gravação
      const { default: RecordingService } = await import('../services/RecordingService.js');
      
      // Processar gravação HLS concluída
      await RecordingService.processCompletedRecording({
        cameraId,
        fileName: file_name,
        filePath: file_path,
        fileSize: file_size,
        duration: time_len ? Math.round(parseFloat(time_len)) : null, // CORREÇÃO: Converter para integer
        startTime: startTimeISO,
        streamName: stream,
        format: 'hls'
      });

      logger.info(`Gravação HLS processada para câmera ${cameraId}: ${file_name}`);
    }

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('Erro no hook on_record_ts:', error);
    res.status(500).json({ code: -1, msg: error.message });
  }
});

/**
 * Endpoint de status dos hooks (MELHORADO)
 * Fornece informações detalhadas sobre o estado dos hooks
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    version: 'improved',
    features: [
      'Validação robusta de dados',
      'Prevenção de duplicatas',
      'Cache de processamento',
      'Validação de arquivos físicos',
      'Logs estruturados com emojis',
      'Gestão automática de gravação',
      'Tratamento de erros aprimorado'
    ],
    hooks: [
      {
        name: 'on_publish',
        description: 'Stream publicada - validação robusta',
        status: 'improved'
      },
      {
        name: 'on_play',
        description: 'Reprodução iniciada',
        status: 'active'
      },
      {
        name: 'on_stream_changed',
        description: 'Stream criada/destruída - gestão automática',
        status: 'improved'
      },
      {
        name: 'on_stream_not_found',
        description: 'Stream não encontrada',
        status: 'active'
      },
      {
        name: 'on_stream_none_reader',
        description: 'Sem visualizadores',
        status: 'active'
      },
      {
        name: 'on_server_started',
        description: 'ZLMediaKit iniciado',
        status: 'active'
      },
      {
        name: 'on_record_mp4',
        description: 'Gravação MP4 concluída - prevenção duplicatas',
        status: 'improved'
      },
      {
        name: 'on_record_ts',
        description: 'Gravação HLS concluída',
        status: 'active'
      }
    ],
    cache: {
      processed_recordings: processedRecordings.size,
      description: 'Cache para prevenção de duplicatas'
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;