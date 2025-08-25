/**
 * Rotas de hooks MELHORADAS do ZLMediaKit para o sistema NewCAM
 * Versão aprimorada com sincronização robusta e validação completa
 * Gerencia eventos de streaming em tempo real com máxima confiabilidade
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';
import { join, dirname } from 'path';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import FeatureFlagService from '../services/FeatureFlagService.js';
import PathResolver from '../utils/PathResolver.js';

const router = express.Router();
const logger = createModuleLogger('ZLMHooks-Improved');

// Configurações do ZLMediaKit
const ZLM_API_URL = process.env.ZLM_API_URL || 'http://localhost:8000/index/api';
const ZLM_SECRET = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

/**
 * Processar arquivos temporários para uma câmera específica
 */
async function processTemporaryFilesForCamera(cameraId) {
  try {
    logger.info(`🔍 Processando arquivos temporários para câmera ${cameraId}`);
    
    // Buscar arquivos temporários na estrutura de diretórios - USANDO PathResolver
    const searchPaths = [
      PathResolver.resolveToAbsolute(`storage/www/record/live/${cameraId}`),
      PathResolver.resolveToAbsolute(`storage/live/${cameraId}`),
      PathResolver.resolveToAbsolute(`storage/www/record/${cameraId}`)
    ].filter(Boolean);
    
    const today = new Date().toISOString().split('T')[0];
    let processedFiles = 0;
    
    for (const basePath of searchPaths) {
      const dailyPath = path.join(basePath, today);
      
      try {
        const files = await fs.readdir(dailyPath);
        
        for (const file of files) {
          // Arquivos temporários começam com ponto
          if (file.startsWith('.') && file.endsWith('.mp4')) {
            const tempFilePath = path.join(dailyPath, file);
            const finalFilePath = path.join(dailyPath, file.substring(1));
            
            try {
              // Verificar se arquivo final já existe
              await fs.access(finalFilePath);
              logger.warn(`⚠️ Arquivo final já existe: ${finalFilePath}, removendo temporário`);
              await fs.unlink(tempFilePath);
            } catch {
              // Arquivo final não existe, pode renomear
              await fs.rename(tempFilePath, finalFilePath);
              logger.info(`✅ Arquivo temporário finalizado: ${file} → ${file.substring(1)}`);
              processedFiles++;
              
              // Tentar associar ao banco se possível
              await tryLinkFileToDatabase(cameraId, finalFilePath);
            }
          }
        }
      } catch (error) {
        logger.debug(`Diretório não encontrado: ${dailyPath}`);
      }
    }
    
    if (processedFiles > 0) {
      logger.info(`✅ Processados ${processedFiles} arquivos temporários para câmera ${cameraId}`);
    }
    
  } catch (error) {
    logger.error(`❌ Erro ao processar arquivos temporários para ${cameraId}:`, error);
  }
}

/**
 * Tentar associar arquivo ao banco de dados
 */
async function tryLinkFileToDatabase(cameraId, filePath) {
  try {
    // Buscar gravação órfã sem arquivo
    const { data: orphanRecording } = await supabaseAdmin
      .from('recordings')
      .select('id, camera_id, status, file_path, local_path')
      .eq('camera_id', cameraId)
      .in('status', ['recording', 'completed'])
      .or('file_path.is.null,local_path.is.null')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (orphanRecording) {
      const stats = await fs.stat(filePath);
      const relativePath = PathResolver.normalizeToRelative(filePath);
      
      const { error } = await supabaseAdmin
        .from('recordings')
        .update({
          file_path: relativePath,
          local_path: relativePath,
          file_size: stats.size,
          status: 'completed',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orphanRecording.id);
      
      if (!error) {
        logger.info(`✅ Arquivo associado à gravação órfã: ${orphanRecording.id}`);
      }
    }
  } catch (error) {
    logger.debug(`Não foi possível associar arquivo ao banco: ${error.message}`);
  }
}

/**
 * Força o início da gravação MP4 para uma stream específica
 * VERSÃO MELHORADA COM LOGS DETALHADOS
 */
async function forceStartRecording(streamId) {
  try {
    logger.info(`🎬 FORÇANDO INÍCIO DE GRAVAÇÃO MP4 para stream ${streamId}`, {
      'Stream ID': streamId,
      'ZLM API URL': ZLM_API_URL,
      'Timeout': '10 segundos',
      'Timestamp': new Date().toISOString()
    });

    // Log dos parâmetros da requisição
    const requestParams = {
      secret: ZLM_SECRET,
      type: 1, // MP4
      vhost: '__defaultVhost__',
      app: 'live',
      stream: streamId
    };

    logger.info(`📡 ENVIANDO REQUISIÇÃO STARTRECORD:`, {
      'URL': `${ZLM_API_URL}/startRecord`,
      'Params': { ...requestParams, secret: '[PROTECTED]' },
      'Method': 'POST'
    });
    
    const startTime = Date.now();
    const response = await axios.post(`${ZLM_API_URL}/startRecord`, null, {
      params: requestParams,
      timeout: 10000
    });
    const endTime = Date.now();

    logger.info(`📊 RESPOSTA RECEBIDA (${endTime - startTime}ms):`, {
      'Status': response.status,
      'Code': response.data?.code,
      'Data': response.data,
      'Headers': Object.keys(response.headers || {})
    });

    if (response.data && response.data.code === 0) {
      logger.info(`✅ GRAVAÇÃO MP4 INICIADA COM SUCESSO para ${streamId}`, {
        'Response code': response.data.code,
        'Message': response.data.msg || 'success',
        'Duration': `${endTime - startTime}ms`,
        'Result': 'SUCCESS'
      });
      return true;
    } else {
      logger.error(`❌ FALHA AO INICIAR GRAVAÇÃO MP4 para ${streamId}`, {
        'Response code': response.data?.code || 'unknown',
        'Response message': response.data?.msg || 'no message',
        'Full response': response.data,
        'Duration': `${endTime - startTime}ms`,
        'Result': 'FAILURE'
      });
      return false;
    }

  } catch (error) {
    logger.error(`❌ EXCEÇÃO AO FORÇAR GRAVAÇÃO MP4 para ${streamId}`, {
      'Error message': error.message,
      'Error code': error.code,
      'Error response': error.response?.data,
      'Error status': error.response?.status,
      'Stack': error.stack,
      'Result': 'ERROR'
    });
    return false;
  }
}

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache para evitar processamento duplicado
const processedRecordings = new Set();

// Cache para evitar múltiplas inicializações de gravação para mesma câmera
const activeRecordingStarts = new Map();

// Map para controlar debouncing de webhooks
const webhookDebounce = new Map();
const DEBOUNCE_TIME = 1000; // 1 segundo de debounce (REDUZIDO para melhor responsividade)

// CORREÇÃO: Sistema de locks melhorado com timeout automático
const recordingCreationLock = new Map();
const LOCK_TIMEOUT = 30000; // 30 segundos
const DEBOUNCE_WEBHOOK_TIME = 2000; // 2 segundos para ignorar webhooks duplicados (REDUZIDO)

// Cache para webhooks recentes (debouncing)
const recentWebhooks = new Map();

// Função para limpar locks expirados
function cleanupExpiredLocks() {
  const now = Date.now();
  for (const [key, timestamp] of recordingCreationLock.entries()) {
    if (now - timestamp > LOCK_TIMEOUT) {
      recordingCreationLock.delete(key);
      logger.info(`🔓 Lock expirado removido: ${key}`);
    }
  }
}

// Limpar locks expirados a cada 10 segundos
setInterval(cleanupExpiredLocks, 10000);

// Função para normalizar paths (consistente com RecordingService)
/**
 * Converte caminhos do container Docker para caminhos Windows
 * /opt/media/bin/www/ → storage/www/
 * /opt/media/www/ → storage/www/
 */
function dockerPathToWindows(dockerPath) {
  if (!dockerPath || typeof dockerPath !== 'string') return null;
  
  const mappings = [
    { docker: '/opt/media/bin/www/', windows: 'storage/www/' },
    { docker: '/opt/media/www/', windows: 'storage/www/' },
    { docker: '/opt/media/bin/', windows: 'storage/' },
    { docker: '/opt/media/', windows: 'storage/' }
  ];
  
  for (const map of mappings) {
    if (dockerPath.startsWith(map.docker)) {
      const converted = dockerPath.replace(map.docker, map.windows);
      logger.debug(`🔄 Path Docker convertido: ${dockerPath} → ${converted}`);
      return converted;
    }
  }
  
  logger.debug(`🔄 Path Docker não convertido: ${dockerPath}`);
  return dockerPath;
}

function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  
  // Primeiro converter caminhos Docker para Windows
  let normalized = dockerPathToWindows(filePath);
  
  // Converter separadores para Unix
  normalized = normalized.replace(/\\/g, '/');
  
  // NOVA FUNCIONALIDADE: Remover ponto do início do filename se existir
  const pathParts = normalized.split('/');
  const filename = pathParts[pathParts.length - 1];
  if (filename && filename.startsWith('.') && filename.endsWith('.mp4')) {
    pathParts[pathParts.length - 1] = filename.substring(1); // Remove o ponto
    normalized = pathParts.join('/');
  }
  
  // Remover prefixos absolutos e manter apenas relativo
  if (normalized.includes('storage/www/record/live')) {
    const index = normalized.indexOf('storage/www/record/live');
    return normalized.substring(index);
  }
  
  // Se já é relativo, manter
  if (normalized.startsWith('storage/') || normalized.startsWith('www/')) {
    return normalized;
  }
  
  // Remover drive letters do Windows
  if (normalized.match(/^[A-Z]:/i)) {
    const parts = normalized.split('/');
    const storageIndex = parts.findIndex(p => p === 'storage');
    if (storageIndex > 0) {
      return parts.slice(storageIndex).join('/');
    }
  }
  
  return normalized;
}

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
    
    // Implementar debouncing para evitar múltiplas chamadas
    const debounceKey = `stream_changed_${cameraId}_${regist}`;
    const lastCall = webhookDebounce.get(debounceKey);
    const now = Date.now();
    
    if (lastCall && (now - lastCall) < DEBOUNCE_TIME) {
      logger.info(`⏳ Webhook on_stream_changed ignorado por debouncing (${cameraId}, regist=${regist})`);
      return res.json({ code: 0, msg: 'debounced' });
    }
    
    webhookDebounce.set(debounceKey, now);
    
    // Limpar debounce após algum tempo
    setTimeout(() => {
      webhookDebounce.delete(debounceKey);
    }, DEBOUNCE_TIME * 2);
    
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
      
      // 🎬 FORÇAR GRAVAÇÃO MP4 AUTOMATICAMENTE (MELHORADO COM LOCK)
      if (camera.recording_enabled) {
        logger.info(`🎯 Iniciando sistema de gravação automática para câmera ${camera.name} (${cameraId})`);
        
        // CORREÇÃO: Sistema de lock melhorado com verificação de expiração
        const lockKey = `recording_${cameraId}`;
        const now = Date.now();
        
        // Verificar se lock existe e se não expirou
        if (recordingCreationLock.has(lockKey)) {
          const lockTime = recordingCreationLock.get(lockKey);
          if (now - lockTime < LOCK_TIMEOUT) {
            logger.warn(`⚠️ Criação de gravação já em andamento para ${camera.name}, ignorando (lock válido por ${Math.round((LOCK_TIMEOUT - (now - lockTime)) / 1000)}s)`);
            return res.json({ code: 0, msg: 'recording creation in progress' });
          } else {
            // Lock expirado, remover
            recordingCreationLock.delete(lockKey);
            logger.info(`🔓 Lock expirado removido para ${camera.name}`);
          }
        }
        
        // Definir novo lock
        recordingCreationLock.set(lockKey, now);
        logger.info(`🔒 Lock criado para ${camera.name} (válido por ${LOCK_TIMEOUT / 1000}s)`);
        
        // Verificar novamente se já existe gravação ativa
        const { data: existingRecording } = await supabaseAdmin
          .from('recordings')
          .select('id, status')
          .eq('camera_id', cameraId)
          .eq('status', 'recording')
          .single();

        if (existingRecording) {
          logger.warn(`⚠️ Gravação ativa já existe para ${camera.name}: ${existingRecording.id}`);
          recordingCreationLock.delete(lockKey);
          return res.json({ code: 0, msg: 'recording already exists' });
        }
        
        // Tentar iniciar gravação (apenas 1 tentativa para evitar spam)
        let attempts = 0;
        const maxAttempts = 1; // Apenas 1 tentativa para evitar bloqueios
        
        const tryForceRecording = async () => {
          attempts++;
          try {
            logger.info(`📝 Tentativa ${attempts}/${maxAttempts} - Forçando gravação MP4 para ${camera.name}`);
            
            const result = await forceStartRecording(cameraId);
            
            if (result) {
              logger.info(`✅ Gravação MP4 iniciada com sucesso para ${camera.name} na tentativa ${attempts}`);
              
              // Criar entrada no banco de dados com verificação adicional
              try {
                const { data: doubleCheck } = await supabaseAdmin
                  .from('recordings')
                  .select('id')
                  .eq('camera_id', cameraId)
                  .eq('status', 'recording')
                  .single();

                if (!doubleCheck) {
                  const now = new Date().toISOString();
                  const { data: recording, error } = await supabaseAdmin
                    .from('recordings')
                    .insert([{
                      camera_id: cameraId,
                      status: 'recording',
                      start_time: now,
                      started_at: now,
                      created_at: now,
                      updated_at: now,
                      metadata: {
                        started_by: 'on_stream_changed_auto',
                        zlm_forced: true,
                        lock_key: lockKey
                      }
                    }])
                    .select()
                    .single();

                  if (!error) {
                    logger.info(`✅ Entrada de gravação criada no banco: ${recording.id}`);
                  }
                } else {
                  logger.warn(`⚠️ Gravação já existia durante criação: ${doubleCheck.id}`);
                }
              } catch (dbError) {
                logger.error(`⚠️ Erro ao criar entrada no banco (não crítico):`, dbError);
              }
              
            } else if (attempts < maxAttempts) {
              logger.warn(`⚠️ Falha na tentativa ${attempts}, reagendando em 3 segundos...`);
              setTimeout(tryForceRecording, 3000);
            } else {
              logger.error(`❌ Falha ao iniciar gravação MP4 após ${maxAttempts} tentativas para ${camera.name}`);
              recordingCreationLock.delete(lockKey);
            }
          } catch (error) {
            logger.error(`❌ Erro na tentativa ${attempts} de forçar gravação:`, error);
            if (attempts < maxAttempts) {
              setTimeout(tryForceRecording, 3000);
            } else {
              recordingCreationLock.delete(lockKey);
            }
          }
        };
        
        // Iniciar primeira tentativa após 1 segundo (reduzido)
        setTimeout(tryForceRecording, 1000);
      } else {
        logger.info(`⏸️ Gravação desabilitada para câmera ${camera.name} (${cameraId})`);
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
 * Hook: on_stream_none_reader (MELHORADO)
 * Chamado quando uma stream não tem mais visualizadores
 * Processa arquivos temporários e finaliza gravações ativas
 */
router.post('/on_stream_none_reader', async (req, res) => {
  try {
    const { app, stream, vhost, schema, params } = req.body;
    
    logger.info('🔄 Hook on_stream_none_reader MELHORADO recebido:', {
      app,
      stream,
      vhost,
      schema,
      timestamp: new Date().toISOString()
    });
    
    // Extrair e validar camera_id
    const cameraId = extractCameraId(stream);
    
    if (!cameraId) {
      logger.warn('⚠️ Camera ID inválido no on_stream_none_reader:', { stream });
      return res.json({ code: 0, msg: 'invalid camera id, but allowing' });
    }

    logger.info(`📹 Stream da câmera ${cameraId} não tem mais visualizadores - processando finalização`);
    
    // 1. Processar arquivos temporários para esta câmera
    logger.info(`🔍 Processando arquivos temporários para câmera ${cameraId}`);
    await processTemporaryFilesForCamera(cameraId);
    
    // 2. CORREÇÃO: NÃO finalizar gravações ativas aqui - deixar para on_record_mp4
    // O status deve permanecer 'recording' até que o arquivo MP4 seja processado
    try {
      const { data: activeRecordings, error } = await supabaseAdmin
        .from('recordings')
        .select('id, camera_id, status, created_at')
        .eq('camera_id', cameraId)
        .eq('status', 'recording');

      if (error) {
        logger.error(`❌ Erro ao buscar gravações ativas para ${cameraId}:`, error);
      } else if (activeRecordings && activeRecordings.length > 0) {
        logger.info(`🎬 Encontradas ${activeRecordings.length} gravações ativas para câmera ${cameraId} - mantendo status 'recording' até arquivo MP4 ser processado`);
        
        // CORREÇÃO: Apenas logar, NÃO alterar status aqui
        for (const recording of activeRecordings) {
          logger.info(`📝 Gravação ${recording.id} permanece em 'recording' - aguardando webhook on_record_mp4`);
        }
      }
    } catch (dbError) {
      logger.error(`❌ Erro ao processar gravações do banco para ${cameraId}:`, dbError);
    }

    // 3. Atualizar status da câmera
    try {
      await supabaseAdmin
        .from('cameras')
        .update({
          is_streaming: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', cameraId);
      
      logger.info(`📹 Status de streaming atualizado para câmera ${cameraId}`);
    } catch (updateError) {
      logger.error(`❌ Erro ao atualizar status da câmera ${cameraId}:`, updateError);
    }
    
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('❌ Erro crítico no hook on_stream_none_reader:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
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
 * Hook: on_record_mp4 (SUPER MELHORADO COM LOGS EXTREMOS)
 * Chamado quando uma gravação MP4 é concluída
 * Versão com logs ultra-detalhados para debug completo
 */
router.post('/on_record_mp4', async (req, res) => {
  const startProcessTime = Date.now();
  const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // LOG INICIAL COM MÁXIMO DETALHE
  logger.info('🚨 =============== WEBHOOK ON_RECORD_MP4 INICIADO ===============', {
    webhookId,
    timestamp: new Date().toISOString(),
    headers: req.headers,
    ip: req.ip,
    method: req.method,
    url: req.url,
    user_agent: req.get('user-agent')
  });

  try {
    const {
      start_time,
      file_size,
      time_len,
      duration, // ZLMediaKit may send 'duration' instead of 'time_len'
      file_path,
      file_name,
      folder,
      url,
      app,
      stream
    } = req.body;

    // LOG DOS DADOS BRUTOS RECEBIDOS
    logger.info('📨 DADOS BRUTOS RECEBIDOS NO WEBHOOK:', {
      webhookId,
      'RAW BODY': JSON.stringify(req.body, null, 2),
      'BODY KEYS': Object.keys(req.body || {}),
      'BODY VALUES': Object.values(req.body || {}),
      'BODY TYPE': typeof req.body,
      'BODY LENGTH': JSON.stringify(req.body).length
    });

    // LOG DETALHADO DE CADA CAMPO
    logger.info('🔍 ANÁLISE CAMPO POR CAMPO:', {
      webhookId,
      'start_time': { value: start_time, type: typeof start_time, valid: !!(start_time && !isNaN(start_time)) },
      'file_size': { value: file_size, type: typeof file_size, valid: !!(file_size && file_size > 0) },
      'time_len': { value: time_len, type: typeof time_len, valid: !!(time_len && time_len > 0) },
      'duration': { value: duration, type: typeof duration, valid: !!(duration && duration > 0) },
      'file_path': { value: file_path, type: typeof file_path, length: file_path?.length || 0 },
      'file_name': { value: file_name, type: typeof file_name, length: file_name?.length || 0 },
      'folder': { value: folder, type: typeof folder, length: folder?.length || 0 },
      'url': { value: url, type: typeof url, length: url?.length || 0 },
      'app': { value: app, type: typeof app, valid: app === 'live' },
      'stream': { value: stream, type: typeof stream, length: stream?.length || 0 }
    });

    const hookId = `${file_name}_${Date.now()}`;
    
    logger.info('🎬 Hook on_record_mp4 SUPER MELHORADO recebido:', {
      webhookId,
      hookId,
      file_name,
      file_size,
      duration: duration || time_len,
      file_path,
      stream,
      start_time,
      folder,
      url,
      app,
      timestamp: new Date().toISOString(),
      raw_body: req.body
    });

    // LOGS DETALHADOS PARA DEBUG
    logger.info('📂 ANÁLISE DETALHADA DO ARQUIVO:', {
      'Arquivo recebido': file_name,
      'Caminho bruto': file_path,
      'Pasta': folder,
      'Stream ID': stream,
      'Tamanho (bytes)': file_size,
      'Duração (segundos)': duration || time_len,
      'Início gravação': start_time,
      'URL de origem': url,
      'App': app
    });

    // Verificar se arquivo é temporário
    const isTemporary = file_name && file_name.startsWith('.');
    logger.info(`🔍 Tipo de arquivo: ${isTemporary ? 'TEMPORÁRIO (com ponto)' : 'FINAL'}`);

    // Log dos paths que vamos testar
    const basePath = PathResolver.getProjectRoot();
    logger.info('🗂️ PATHS DE BUSCA:', {
      'Base path': basePath,
      'Path 1': PathResolver.resolveToAbsolute(`storage/www/record/live/${stream}`),
      'Path 2': PathResolver.resolveToAbsolute(`storage/www/${folder || ''}/${file_name}`),
      'Path 3': file_path ? path.resolve(file_path) : null
    });

    // PASSO 1: DEBOUNCING DE WEBHOOKS DUPLICADOS
    logger.info('🔍 PASSO 1: Verificando debouncing de webhooks...', { webhookId });
    const webhookKey = `${stream}_${file_name}_${Date.now()}`;
    const now = Date.now();
    
    // Limpar webhooks antigos
    for (const [key, timestamp] of recentWebhooks.entries()) {
      if (now - timestamp > DEBOUNCE_WEBHOOK_TIME) {
        recentWebhooks.delete(key);
      }
    }
    
    // Verificar se webhook é duplicado (mesmo stream e arquivo nos últimos 5 segundos)
    const duplicateKey = Array.from(recentWebhooks.keys())
      .find(key => key.startsWith(`${stream}_${file_name}_`));
    
    if (duplicateKey) {
      logger.warn('⚠️ PASSO 1 INTERROMPIDO: Webhook duplicado ignorado:', {
        webhookId,
        duplicate_key: duplicateKey,
        time_diff: now - recentWebhooks.get(duplicateKey)
      });
      return res.json({ code: 0, msg: 'duplicate webhook ignored' });
    }
    
    // Adicionar ao cache de webhooks recentes
    recentWebhooks.set(webhookKey, now);
    logger.info('✅ PASSO 1 CONCLUÍDO: Webhook não duplicado', { webhookId });

    // PASSO 2: VALIDAÇÃO DE DADOS DE ENTRADA
    logger.info('🔍 PASSO 2: Validando dados de entrada...', { webhookId });
    
    if (!file_name || !stream) {
      logger.error('❌ FALHA NO PASSO 2: Dados obrigatórios ausentes:', { 
        webhookId,
        file_name_exists: !!file_name, 
        stream_exists: !!stream,
        file_name, 
        stream 
      });
      return res.status(400).json({ code: -1, msg: 'missing required fields' });
    }
    logger.info('✅ PASSO 2 CONCLUÍDO: Dados obrigatórios presentes', { webhookId });

    // PASSO 3: VERIFICAR CACHE DE PROCESSAMENTO
    logger.info('🔍 PASSO 3: Verificando cache de processamento...', { webhookId });
    const cacheKey = `${stream}_${file_name}`;
    
    if (processedRecordings.has(cacheKey)) {
      logger.warn('⚠️ PASSO 2 INTERROMPIDO: Gravação já processada (cache):', { 
        webhookId,
        cacheKey,
        cache_size: processedRecordings.size
      });
      return res.json({ code: 0, msg: 'already processed (cache)' });
    }
    logger.info('✅ PASSO 2 CONCLUÍDO: Não encontrado no cache', { webhookId, cacheKey });

    // PASSO 3: EXTRAIR E VALIDAR CAMERA_ID
    logger.info('🔍 PASSO 3: Extraindo camera_id...', { webhookId });
    const cameraId = extractCameraId(stream);
    
    logger.info('🎯 RESULTADO DA EXTRAÇÃO DE CAMERA_ID:', {
      webhookId,
      stream_original: stream,
      stream_split: stream.split('_'),
      camera_id_extracted: cameraId,
      is_valid_uuid: cameraId ? isValidUUID(cameraId) : false
    });
    
    if (!cameraId) {
      logger.error('❌ FALHA NO PASSO 3: Camera ID inválido extraído do stream:', { 
        webhookId,
        stream,
        extraction_result: cameraId,
        stream_parts: stream.split('_')
      });
      return res.status(400).json({ code: -1, msg: 'invalid camera id' });
    }
    logger.info('✅ PASSO 3 CONCLUÍDO: Camera ID válido extraído', { webhookId, cameraId });

    logger.info(`📹 INICIANDO processamento de gravação MP4 para câmera: ${cameraId}`, { webhookId });

    // Validar timestamp
    const startTimeISO = validateTimestamp(start_time);

    // Validar duração - ZLMediaKit pode enviar como 'duration' ou 'time_len'
    let actualDuration = (duration || time_len) ? Math.round(parseFloat(duration || time_len)) : null;
    
    // Se duração não veio do ZLMediaKit, tentar extrair via ffprobe
    if (!actualDuration && file_path) {
      try {
        logger.info('📏 Duração não fornecida pelo ZLM, extraindo via ffprobe...', { webhookId, file_path });
        
        // Convert Windows path to Unix format for Docker
        let dockerPath = file_path.replace(/.*www[\\/]record[\\/]live/, 'www/record/live');
        // Replace all backslashes with forward slashes for Unix compatibility
        dockerPath = dockerPath.replace(/\\/g, '/');
        
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const ffprobeCmd = `docker exec newcam-zlmediakit ffprobe -v quiet -show_entries format=duration -of csv=p=0 "/opt/media/bin/${dockerPath}"`;
        
        logger.debug('🔍 Executando comando ffprobe:', { ffprobeCmd });
        
        const { stdout } = await execAsync(ffprobeCmd);
        const extractedDuration = parseFloat(stdout.trim());
        
        if (extractedDuration && extractedDuration > 0) {
          actualDuration = Math.round(extractedDuration);
          logger.info(`✅ Duração extraída via ffprobe: ${actualDuration}s`, { webhookId, file_path });
        } else {
          logger.warn('⚠️ Não foi possível extrair duração válida', { webhookId, stdout: stdout.trim() });
        }
        
      } catch (ffprobeError) {
        logger.warn('⚠️ Erro ao extrair duração via ffprobe:', { 
          webhookId, 
          error: ffprobeError.message,
          file_path 
        });
      }
    }
    
    if (actualDuration && actualDuration < 5) {
      logger.warn('⚠️ Gravação com duração muito pequena:', {
        duration: actualDuration,
        file_name,
        stream,
        possivel_causa: 'Segmentação incorreta ou configuração ZLM'
      });
    }

    // PASSO 4: VERIFICAR SE A CÂMERA EXISTE
    logger.info('🔍 PASSO 4: Verificando se câmera existe no banco...', { webhookId, cameraId });
    
    const { data: camera, error: cameraError } = await supabaseAdmin
      .from('cameras')
      .select('id, name, active')
      .eq('id', cameraId)
      .single();

    logger.info('📊 RESULTADO DA CONSULTA DE CÂMERA:', {
      webhookId,
      camera_found: !!camera,
      camera_data: camera,
      error_details: cameraError,
      query: { table: 'cameras', id: cameraId }
    });

    if (cameraError || !camera) {
      logger.error('❌ FALHA NO PASSO 4: Câmera não encontrada:', { 
        webhookId,
        cameraId, 
        error: cameraError,
        error_code: cameraError?.code,
        error_message: cameraError?.message
      });
      return res.status(404).json({ code: -1, msg: 'camera not found' });
    }
    logger.info('✅ PASSO 4 CONCLUÍDO: Câmera encontrada', { 
      webhookId, 
      camera_name: camera.name,
      camera_active: camera.active
    });

    // PASSO 5: BUSCAR GRAVAÇÃO PARA ATUALIZAR (CORREÇÃO MELHORADA)
    logger.info('🔍 PASSO 5: Buscando gravação para atualizar...', { webhookId });
    
    // CORREÇÃO MELHORADA: Buscar gravação em QUALQUER status sem file_path para esta câmera
    let activeRecording = null;
    let activeQueryError = null;
    
    // Primeira tentativa: buscar gravação com status 'recording' (mais provável)
    const { data: recordingActiveData, error: recordingActiveError } = await supabaseAdmin
      .from('recordings')
      .select('id, status, filename, file_path, local_path, created_at, metadata')
      .eq('camera_id', cameraId)
      .eq('status', 'recording')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recordingActiveData) {
      activeRecording = recordingActiveData;
      logger.info('✅ Encontrada gravação com status "recording":', { id: activeRecording.id });
    } else {
      // Segunda tentativa: buscar GRAVAÇÃO sem file_path das últimas 2 horas
      // CORREÇÃO: Reduzir janela de tempo para 2h para evitar links incorretos
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      const { data: orphanData, error: orphanError } = await supabaseAdmin
        .from('recordings')
        .select('id, status, filename, file_path, local_path, created_at, start_time, metadata')
        .eq('camera_id', cameraId)
        .eq('status', 'recording') // APENAS status recording para evitar links incorretos
        .is('file_path', null)
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1) // Pegar apenas o mais recente
        .maybeSingle();

      if (orphanData) {
        activeRecording = orphanData;
        logger.info('✅ Encontrada gravação órfã (sem file_path) recente:', { 
          id: activeRecording.id, 
          status: activeRecording.status,
          created_at: activeRecording.created_at 
        });
      } else {
        activeQueryError = orphanError || recordingActiveError;
        logger.info('ℹ️ Nenhuma gravação sem file_path encontrada para câmera', camera.name);
      }
    }

    logger.info('📊 RESULTADO DA BUSCA POR GRAVAÇÃO ATIVA/ÓRFÃ:', {
      webhookId,
      active_found: !!activeRecording,
      active_data: activeRecording ? {
        id: activeRecording.id,
        status: activeRecording.status,
        file_path: activeRecording.file_path,
        created_at: activeRecording.created_at
      } : null,
      query_error: activeQueryError,
      search_strategy: activeRecording ? (activeRecording.status === 'recording' ? 'active_recording' : `orphan_recording_${activeRecording.status}`) : 'none_found',
      camera_name: camera.name,
      file_to_process: file_name
    });

    // CORREÇÃO SIMPLIFICADA: Usar filename original do ZLMediaKit sem modificações
    let cleanFileName = file_name || '';
    
    // IMPORTANTE: NÃO remover mais o ponto inicial - preservar filename original
    // O PathResolver já lida com variantes de filename internamente
    
    // Apenas garantir extensão .mp4 se necessário
    if (!cleanFileName.endsWith('.mp4') && cleanFileName.length > 0) {
      cleanFileName = cleanFileName.replace(/\.[^/.]+$/, '') + '.mp4';
    }
    
    logger.info('🔧 FILENAME PROCESSADO:', {
      'Original': file_name,
      'Limpo': cleanFileName,
      'Precisa Renomear': needsFileRename
    });

    // Verificar duplicatas por filename
    const { data: existingRecording, error: queryError } = await supabaseAdmin
      .from('recordings')
      .select('id, status')
      .eq('filename', cleanFileName)
      .eq('camera_id', cameraId)
      .single();

    if (existingRecording) {
      logger.warn('⚠️ Gravação já existe no banco:', {
        webhookId,
        recordingId: existingRecording.id,
        status: existingRecording.status,
        filename: cleanFileName
      });
      processedRecordings.add(cacheKey);
      return res.json({ code: 0, msg: 'already exists in database' });
    }
    
    // BUSCA SIMPLIFICADA: Usar PathResolver com objeto simulado
    // CORREÇÃO: Construir file_path usando cleanFileName ao invés do file_path original
    const cleanFilePath = file_path ? file_path.replace(file_name, cleanFileName) : null;
    
    const mockRecording = {
      id: 'temp',
      camera_id: cameraId,
      filename: cleanFileName,
      file_path: cleanFilePath,
      local_path: cleanFilePath,
      created_at: new Date().toISOString()
    };
    
    logger.info('🔍 Buscando arquivo usando PathResolver...');
    const fileResult = await PathResolver.findRecordingFile(mockRecording);
    
    let fullFilePath = null;
    let fileInfo = null;
    
    if (fileResult && fileResult.exists) {
      fullFilePath = fileResult.absolutePath;
      fileInfo = {
        exists: true,
        size: fileResult.size,
        mtime: fileResult.mtime
      };
      logger.info(`✅ ARQUIVO ENCONTRADO: ${fullFilePath}`);
      
      // Renomear arquivo físico se necessário (remover ponto inicial)
      if (needsFileRename && path.basename(fullFilePath).startsWith('.')) {
        try {
          const { rename } = await import('fs/promises');
          const dir = path.dirname(fullFilePath);
          const oldName = path.basename(fullFilePath);
          const newName = oldName.substring(1); // Remove ponto inicial
          const newPath = path.join(dir, newName);
          
          await rename(fullFilePath, newPath);
          fullFilePath = newPath;
          
          logger.info(`✅ ARQUIVO RENOMEADO: ${oldName} → ${newName}`);
        } catch (renameError) {
          logger.warn('⚠️ Falha ao renomear arquivo físico:', {
            error: renameError.message,
            oldPath: fullFilePath
          });
          // Continuar com o arquivo original se renomeação falhar
        }
      }
    } else {
      // Fallback: tentar file_path fornecido se PathResolver falhar
      if (file_path) {
        const absolutePath = path.isAbsolute(file_path) ? 
          file_path : 
          PathResolver.resolveToAbsolute(file_path);
        
        if (absolutePath) {
          const fallbackResult = await PathResolver.validatePath(absolutePath);
          if (fallbackResult.exists) {
            fullFilePath = fallbackResult.absolutePath;
            fileInfo = fallbackResult;
            logger.info(`✅ ARQUIVO ENCONTRADO via fallback: ${fullFilePath}`);
          }
        }
      }
    }
    
    if (!fileInfo || !fileInfo.exists) {
      logger.error('❌ Arquivo físico não encontrado:', { 
        file_name, 
        file_path,
        cameraId,
        cleanFileName
      });
      return res.status(404).json({ code: -1, msg: 'file not found' });
    }

    // Usar tamanho real do arquivo se não fornecido
    const actualFileSize = file_size || fileInfo.size;

    // CORREÇÃO: Calcular duração e metadados usando ffprobe se não fornecida
    // actualDuration já foi definida anteriormente no código
    let videoMetadata = {
      resolution: null,
      fps: null,
      codec: 'h264',
      bitrate: null,
      width: null,
      height: null
    };

    if (!actualDuration || actualDuration === 0) {
      try {
        const { spawn } = await import('child_process');
        
        // Tentar ffprobe via Docker primeiro (mais confiável)
        // CORREÇÃO CRÍTICA: Mapear corretamente path do host para Docker container
        const relativePath = PathResolver.normalizeToRelative(fullFilePath);
        
        // Docker container mapeia storage/www para /opt/media/bin/www
        // Exemplo: storage/www/record/live/camera/date/file.mp4 → /opt/media/bin/www/record/live/camera/date/file.mp4
        let dockerPath;
        if (relativePath && relativePath.startsWith('storage/www/')) {
          // Remove 'storage/www/' e adiciona o prefixo do container
          dockerPath = `/opt/media/bin/www/${relativePath.replace('storage/www/', '')}`;
        } else if (relativePath && relativePath.startsWith('storage/')) {
          // Se só tem 'storage/', mapear para /opt/media/bin/www diretamente
          dockerPath = `/opt/media/bin/www/${relativePath.replace('storage/', '')}`;
        } else {
          // Fallback: usar path relativo direto
          dockerPath = `/opt/media/bin/www/record/live/${relativePath || file_name}`;
        }
        
        logger.debug('Path mapping para FFprobe:', {
          originalPath: fullFilePath,
          relativePath,
          dockerPath,
          fileName: file_name
        });
        
        const ffprobeResult = await new Promise((resolve, reject) => {
          const ffprobe = spawn('docker', [
            'exec', 'newcam-zlmediakit', 'ffprobe',
            '-v', 'quiet',
            '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_name,bit_rate',
            '-of', 'json',
            dockerPath
          ]);
          
          let output = '';
          ffprobe.stdout.on('data', (data) => output += data);
          ffprobe.on('close', (code) => {
            if (code === 0 && output.trim()) {
              try {
                resolve(JSON.parse(output.trim()));
              } catch (e) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
          ffprobe.on('error', () => resolve(null));
        });
        
        if (ffprobeResult) {
          // Extrair duração
          if (ffprobeResult.format?.duration) {
            actualDuration = Math.round(parseFloat(ffprobeResult.format.duration));
          }
          
          // Extrair metadados do stream de vídeo
          const videoStream = ffprobeResult.streams?.find(s => s.codec_type === 'video');
          if (videoStream) {
            videoMetadata.width = videoStream.width;
            videoMetadata.height = videoStream.height;
            videoMetadata.resolution = `${videoStream.width}x${videoStream.height}`;
            
            // Mapear codec para valores permitidos
            const codecName = videoStream.codec_name?.toLowerCase();
            if (codecName === 'hevc' || codecName === 'h265') {
              videoMetadata.codec = 'h265';
            } else if (codecName === 'mjpeg') {
              videoMetadata.codec = 'mjpeg';
            } else {
              videoMetadata.codec = 'h264'; // Default
            }
            
            // Calcular FPS
            if (videoStream.r_frame_rate) {
              const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
              if (den && den !== 0) {
                videoMetadata.fps = Math.round(num / den);
              }
            }
            
            // Bitrate
            if (videoStream.bit_rate) {
              videoMetadata.bitrate = Math.round(parseInt(videoStream.bit_rate) / 1000); // kbps
            }
          }
          
          logger.info('✅ Metadados calculados via ffprobe:', { 
            duration: actualDuration,
            resolution: videoMetadata.resolution,
            fps: videoMetadata.fps,
            codec: videoMetadata.codec,
            bitrate: videoMetadata.bitrate
          });
        }
      } catch (error) {
        logger.warn('⚠️ Erro ao calcular metadados via ffprobe:', error.message);
      }
    }

    logger.info('✅ Validações concluídas, processando gravação:', {
      cameraId,
      camera: camera.name,
      file_name,
      actualFileSize,
      duration: actualDuration,
      fileExists: fileInfo.exists
    });

    // Adicionar ao cache antes do processamento
    processedRecordings.add(cacheKey);

    // Importar serviços necessários
    const { default: RecordingService } = await import('../services/RecordingService.js');
    const { default: UploadQueueService } = await import('../services/UploadQueueService.js');

    // Normalizar paths antes de salvar - USANDO FILENAME LIMPO
    let normalizedPath = normalizePath(fullFilePath);
    
    // CORREÇÃO CRÍTICA: Substituir filename no path pelo filename limpo (sem ponto)
    if (normalizedPath && cleanFileName) {
      const pathParts = normalizedPath.split('/');
      pathParts[pathParts.length - 1] = cleanFileName; // Substituir último elemento (filename)
      normalizedPath = pathParts.join('/');
    }
    
    logger.info('🔧 Path normalizado:', {
      original: fullFilePath,
      cleanFilename: cleanFileName,
      normalized: normalizedPath,
      pathFixed: 'filename substituído por versão limpa'
    });

    // PASSO 6: ATUALIZAR REGISTRO ATIVO OU CRIAR NOVO (CORREÇÃO PRINCIPAL)
    logger.info('🔍 PASSO 6: Atualizando registro existente ou criando novo...', { webhookId });
    
    let recording;
    let operationType = 'INSERT';

    if (activeRecording) {
      // ATUALIZAR registro existente com status='recording'
      logger.info('🔄 ATUALIZANDO registro ativo existente:', {
        webhookId,
        existingId: activeRecording.id,
        existingStatus: activeRecording.status
      });

      operationType = 'UPDATE';
      const updateData = {
        filename: cleanFileName,
        file_path: normalizedPath,
        local_path: normalizedPath,
        file_size: actualFileSize,
        duration: actualDuration,
        end_time: actualDuration ? new Date(new Date(startTimeISO).getTime() + (actualDuration * 1000)).toISOString() : null,
        // Marcar como completa quando arquivo MP4 é gerado
        ended_at: new Date().toISOString(),
        status: 'completed', // Arquivo MP4 pronto = gravação completa
        quality: videoMetadata.bitrate > 2000 ? 'high' : videoMetadata.bitrate > 1000 ? 'medium' : 'low',
        codec: videoMetadata.codec || 'h264',
        resolution: videoMetadata.resolution,
        width: videoMetadata.width,
        height: videoMetadata.height,
        fps: videoMetadata.fps,
        bitrate: videoMetadata.bitrate,
        metadata: {
          ...activeRecording.metadata,
          stream_name: stream,
          hook_id: hookId,
          processed_by: 'on_record_mp4',
          processed_at: new Date().toISOString(),
          file_found_at: fullFilePath,
          updated_from_webhook: true,
          previous_status: activeRecording.status
        },
        updated_at: new Date().toISOString()
      };

      const { data: updatedRecording, error: updateError } = await supabaseAdmin
        .from('recordings')
        .update(updateData)
        .eq('id', activeRecording.id)
        .select()
        .single();

      if (updateError) {
        logger.error('❌ Erro ao atualizar gravação ativa:', updateError);
        throw updateError;
      }

      recording = updatedRecording;
      logger.info('✅ Gravação ativa ATUALIZADA com sucesso:', {
        webhookId,
        recordingId: recording.id,
        normalized_path: normalizedPath,
        operation: 'UPDATE',
        previous_status: activeRecording.status,
        new_status: 'completed',
        camera_name: camera.name,
        duration_seconds: duration,
        file_size_bytes: actualFileSize
      });

    } else {
      // CRIAR novo registro (comportamento original para casos sem gravação ativa)
      logger.info('➕ CRIANDO novo registro (nenhuma gravação ativa encontrada):', { webhookId });

      const recordingData = {
        camera_id: cameraId,
        filename: cleanFileName,
        file_path: normalizedPath,
        local_path: normalizedPath,
        file_size: actualFileSize,
        duration: actualDuration,
        start_time: startTimeISO,
        started_at: startTimeISO,
        end_time: actualDuration ? new Date(new Date(startTimeISO).getTime() + (actualDuration * 1000)).toISOString() : null,
        // Marcar como completa quando arquivo MP4 é gerado
        ended_at: new Date().toISOString(),
        status: 'completed', // Arquivo MP4 pronto = gravação completa
        quality: videoMetadata.bitrate > 2000 ? 'high' : videoMetadata.bitrate > 1000 ? 'medium' : 'low',
        codec: videoMetadata.codec || 'h264',
        resolution: videoMetadata.resolution,
        width: videoMetadata.width,
        height: videoMetadata.height,
        fps: videoMetadata.fps,
        bitrate: videoMetadata.bitrate,
        metadata: {
          stream_name: stream,
          hook_id: hookId,
          processed_by: 'on_record_mp4',
          processed_at: new Date().toISOString(),
          file_found_at: fullFilePath,
          created_as_new: true
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newRecording, error: insertError } = await supabaseAdmin
        .from('recordings')
        .insert(recordingData)
        .select()
        .single();

      if (insertError) {
        logger.error('❌ Erro ao inserir nova gravação:', insertError);
        throw insertError;
      }

      recording = newRecording;
      logger.info('✅ Nova gravação CRIADA com sucesso:', {
        webhookId,
        recordingId: recording.id,
        normalized_path: normalizedPath,
        operation: 'INSERT'
      });
    }

    logger.info(`✅ PASSO 6 CONCLUÍDO: Registro ${operationType === 'UPDATE' ? 'atualizado' : 'criado'}:`, {
      webhookId,
      operation: operationType,
      recordingId: recording.id,
      normalized_path: normalizedPath
    });

    // CORREÇÃO: Atualizar status da câmera (gravação completada)
    const { error: updateCameraError } = await supabaseAdmin
      .from('cameras')
      .update({
        is_recording: false, // Gravação foi completada
        status: 'online',
        is_streaming: true,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', cameraId);

    if (updateCameraError) {
      logger.error('❌ Erro ao atualizar status da câmera após completar gravação:', { cameraId, error: updateCameraError });
    } else {
      logger.info(`✅ Câmera ${camera.name} (${cameraId}) atualizada - gravação completada`);
    }

    logger.info(`🎉 Gravação MP4 processada com sucesso:`, {
      camera: camera.name,
      file_name,
      duration,
      size: actualFileSize
    });

    // Enfileirar gravação para upload S3 se habilitado
    const uploadEnabled = FeatureFlagService.isEnabled('s3_upload_enabled');
    if (uploadEnabled) {
      try {
        logger.info(`📤 Enfileirando gravação para upload S3: ${recording.id}`);
        
        const enqueueResult = await UploadQueueService.enqueue(recording.id);
        
        if (enqueueResult.success) {
          logger.info(`✅ Gravação enfileirada para upload: ${recording.id}`, {
            reason: enqueueResult.reason,
            file_size: enqueueResult.file_size
          });
        } else {
          logger.warn(`⚠️ Não foi possível enfileirar gravação: ${recording.id}`, {
            reason: enqueueResult.reason
          });
        }
        
      } catch (enqueueError) {
        logger.error(`❌ Erro ao enfileirar gravação para upload: ${recording.id}`, {
          error: enqueueError.message
        });
        // Não falhar o webhook por erro de enfileiramento
      }
    } else {
      logger.debug(`ℹ️ Upload S3 desabilitado - gravação não enfileirada: ${recording.id}`);
    }

    // Limpar cache após um tempo (evitar crescimento infinito)
    setTimeout(() => {
      processedRecordings.delete(cacheKey);
    }, 120000); // 2 minutos (REDUZIDO)

    // LOG DE SUCESSO FINAL COM MÉTRICAS
    const endProcessTime = Date.now();
    const processingDuration = endProcessTime - startProcessTime;
    
    logger.info('🎉 =============== WEBHOOK ON_RECORD_MP4 CONCLUÍDO COM SUCESSO ===============', {
      webhookId,
      hookId,
      result: 'SUCCESS',
      recording_id: recording.id,
      camera_id: cameraId,
      file_name: cleanFileName,
      file_path: normalizedPath,
      processing_duration_ms: processingDuration,
      total_steps: 'Todos os passos executados com sucesso',
      timestamp: new Date().toISOString()
    });

    res.json({ 
      code: 0, 
      msg: 'success',
      webhook_id: webhookId,
      recording_id: recording.id,
      processing_time_ms: processingDuration
    });

  } catch (error) {
    const endProcessTime = Date.now();
    const processingDuration = endProcessTime - startProcessTime;
    
    logger.error('🚨 =============== WEBHOOK ON_RECORD_MP4 FALHOU ===============', {
      webhookId,
      result: 'FAILURE',
      error_message: error.message,
      error_code: error.code,
      error_stack: error.stack,
      processing_duration_ms: processingDuration,
      input_data: {
        file_name: req.body?.file_name,
        stream: req.body?.stream,
        file_path: req.body?.file_path,
        file_size: req.body?.file_size
      },
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      code: -1, 
      msg: error.message,
      webhook_id: webhookId,
      processing_time_ms: processingDuration
    });
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