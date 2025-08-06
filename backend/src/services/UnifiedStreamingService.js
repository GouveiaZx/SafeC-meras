/**
 * Serviço Unificado de Streaming para NewCAM
 * Consolida StreamingService.js, RealStreamingService.js e StreamAutoRecoveryService.js
 * Suporte para SRS, ZLMediaKit, WebRTC, WebSocket e recuperação automática
 */

import axios from 'axios';
import { spawn } from 'child_process';
import net from 'net';
import { URL } from 'url';
import WebSocket from 'ws';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError } from '../middleware/errorHandler.js';
import { Camera } from '../models/Camera.js';
import { Stream } from '../models/Stream.js';
import { redisClient } from '../config/redis.js';

const logger = createModuleLogger('UnifiedStreamingService');

class UnifiedStreamingService {
  constructor() {
    // Configurações de servidores
    this.srsApiUrl = process.env.SRS_API_URL || 'http://localhost:1985/api/v1';
    this.zlmApiUrl = (process.env.ZLM_BASE_URL || process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8000') + '/index/api';
    this.zlmSecret = process.env.ZLM_SECRET || process.env.ZLMEDIAKIT_SECRET || '035c73f7-bb6b-4889-a715-d9eb2d1925cc';
    
    // Configurações WebSocket
    this.wsPort = process.env.WS_PORT || 8080;
    this.wss = null;
    this.clients = new Map();
    this.rooms = new Map();
    
    // Gerenciamento de streams
    this.activeStreams = new Map();
    this.streamViewers = new Map();
    this.recoveryAttempts = new Map();
    this.preferredServer = process.env.STREAMING_SERVER || 'zlm';
    
    // Configurações de recuperação automática
    this.recoveryConfig = {
      maxAttempts: 3,
      retryDelay: 5000,
      healthCheckInterval: 30000,
      autoRecovery: process.env.AUTO_RECOVERY !== 'false'
    };
    
    this.isInitialized = false;
    this.healthCheckInterval = null;
  }

  /**
   * Inicializar serviço unificado
   */
  async init() {
    if (this.isInitialized) {
      logger.info('UnifiedStreamingService já foi inicializado');
      return;
    }
    
    try {
      logger.info('Inicializando UnifiedStreamingService...');
      
      await this.testConnectivity();
      await this.initWebSocketServer();
      
      if (this.recoveryConfig.autoRecovery) {
        this.startHealthCheck();
      }
      
      this.isInitialized = true;
      logger.info('UnifiedStreamingService inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar UnifiedStreamingService:', error);
      throw error;
    }
  }

  /**
   * Testar conectividade com servidores de streaming
   */
  async testConnectivity() {
    const tests = [];
    
    // Testar SRS
    try {
      const srsResponse = await axios.get(`${this.srsApiUrl}/summaries`, { timeout: 5000 });
      if (srsResponse.status === 200) {
        tests.push({ server: 'srs', status: 'online', response: srsResponse.data });
        logger.info('SRS server está online');
      }
    } catch (error) {
      tests.push({ server: 'srs', status: 'offline', error: error.message });
      logger.warn('SRS server não está disponível:', error.message);
    }

    // Testar ZLMediaKit
    try {
      const zlmResponse = await axios.post(`${this.zlmApiUrl}/getServerConfig`, 
        new URLSearchParams({ secret: this.zlmSecret }), {
        timeout: 5000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (zlmResponse.status === 200 && zlmResponse.data.code === 0) {
        tests.push({ server: 'zlm', status: 'online', response: zlmResponse.data });
        logger.info('ZLMediaKit server está online');
      }
    } catch (error) {
      tests.push({ server: 'zlm', status: 'offline', error: error.message });
      logger.warn('ZLMediaKit server não está disponível:', error.message);
    }

    const onlineServers = tests.filter(test => test.status === 'online');
    if (onlineServers.length === 0) {
      throw new AppError('Nenhum servidor de streaming está disponível');
    }

    return tests;
  }

  /**
   * Inicializar servidor WebSocket para WebRTC
   */
  async initWebSocketServer() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({ port: this.wsPort });
        
        this.wss.on('connection', (ws, req) => {
          const clientId = this.generateClientId();
          this.clients.set(clientId, { ws, room: null, userId: null });
          
          logger.info(`Cliente WebSocket conectado: ${clientId}`);
          
          ws.on('message', async (data) => {
            try {
              const message = JSON.parse(data.toString());
              await this.handleWebSocketMessage(clientId, message);
            } catch (error) {
              logger.error('Erro ao processar mensagem WebSocket:', error);
            }
          });
          
          ws.on('close', () => {
            this.handleWebSocketDisconnect(clientId);
          });
          
          ws.on('error', (error) => {
            logger.error('Erro WebSocket:', error);
          });
        });
        
        logger.info(`Servidor WebSocket iniciado na porta ${this.wsPort}`);
        resolve();
      } catch (error) {
        logger.error('Erro ao iniciar servidor WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Processar mensagens WebSocket
   */
  async handleWebSocketMessage(clientId, message) {
    const { type, data } = message;
    const client = this.clients.get(clientId);
    
    if (!client) return;
    
    switch (type) {
      case 'join_stream':
        await this.handleJoinStream(clientId, data);
        break;
      case 'leave_stream':
        await this.handleLeaveStream(clientId, data);
        break;
      case 'webrtc_offer':
        await this.handleWebRTCOffer(clientId, data);
        break;
      case 'webrtc_answer':
        await this.handleWebRTCAnswer(clientId, data);
        break;
      case 'ice_candidate':
        await this.handleIceCandidate(clientId, data);
        break;
      case 'get_playlist':
        await this.handleGetPlaylist(clientId, data);
        break;
      default:
        logger.warn(`Tipo de mensagem desconhecido: ${type}`);
    }
  }

  /**
   * Iniciar stream de câmera
   */
  async startStream(cameraId, options = {}) {
    console.log('🔧 [UNIFIED STREAMING] === INICIANDO startStream ===');
    console.log('🔧 [UNIFIED STREAMING] Parâmetros:', { cameraId, quality: options.quality });
    console.log('[DEBUG] UnifiedStreamingService.startStream chamado com:', {
      cameraId,
      options,
      preferredServer: this.preferredServer
    });
    
    try {
      console.log('[DEBUG] Buscando câmera com ID:', cameraId);
      const camera = await Camera.findByPk(cameraId);
      console.log('[DEBUG] Resultado da busca da câmera:', camera ? 'ENCONTRADA' : 'NÃO ENCONTRADA');
      
      if (!camera) {
        console.log('[DEBUG] Câmera não encontrada, lançando ValidationError');
        throw new ValidationError('Câmera não encontrada');
      }
      
      console.log('[DEBUG] Câmera encontrada:', {
        id: camera.id,
        name: camera.name,
        stream_type: camera.stream_type,
        rtmp_url: camera.rtmp_url ? 'CONFIGURADO' : 'NÃO CONFIGURADO',
        rtsp_url: camera.rtsp_url ? 'CONFIGURADO' : 'NÃO CONFIGURADO'
      });

      const streamId = cameraId;
      const {
        quality = 'medium',
        format = 'hls',
        audio = true,
        userId,
        userToken
      } = options;

      // Verificar e limpar streams existentes com a mesma stream_key
      const existingStreamByKey = await Stream.findByStreamKey(streamId);
      if (existingStreamByKey) {
        console.log('[DEBUG] Stream existente encontrado, removendo:', existingStreamByKey.id);
        await existingStreamByKey.delete();
      }
      
      // Verificar se stream já existe e está ativo
      const existingStream = await this.getStreamStatus(streamId);
      if (existingStream && existingStream.status === 'active') {
        throw new ValidationError('Stream já está ativo para esta câmera');
      }

      // Criar stream no servidor preferido
      const streamUrls = await this.createStream(camera, {
        streamId,
        quality,
        format,
        audio
      });

      // Salvar stream no banco
      const streamData = {
        id: streamId,
        camera_id: cameraId,
        stream_key: streamId,
        status: 'active',
        server_type: this.preferredServer,
        quality,
        rtsp_url: camera.rtsp_url || camera.rtmp_url || 'rtsp://placeholder',
        hls_url: streamUrls.hls,
        rtmp_url: streamUrls.rtmp,
        started_at: new Date()
      };
      
      console.log('🔍 [STREAM DATA] Dados que serão passados para o construtor Stream:', JSON.stringify(streamData, null, 2));
      console.log('🔍 [STREAM DATA] Camera data:', JSON.stringify({
        rtsp_url: camera.rtsp_url,
        rtmp_url: camera.rtmp_url,
        stream_type: camera.stream_type
      }, null, 2));
      
      console.log('🔍 [STREAM CREATION DEBUG] Dados para criar Stream:', JSON.stringify(streamData, null, 2));
      console.log('🔍 [STREAM CREATION DEBUG] Propriedades de streamData:', Object.keys(streamData));
      
      const stream = new Stream(streamData);
      
      console.log('🔍 [STREAM CREATION DEBUG] Stream criado:', stream);
      console.log('🔍 [STREAM CREATION DEBUG] Propriedades do stream criado:', Object.keys(stream));
      
      console.log('[DEBUG] Criando Stream com dados:', {
        id: streamId,
        camera_id: cameraId,
        stream_key: streamId,
        status: 'active',
        server_type: this.preferredServer,
        quality,
        rtsp_url: camera.rtsp_url || camera.rtmp_url,
        hls_url: streamUrls.hls,
        rtmp_url: streamUrls.rtmp
      });
      
      console.log('🚀 [ANTES DO SAVE] Prestes a chamar stream.save()');      console.log('🚀 [ANTES DO SAVE] Objeto stream:', stream);      console.log('🚀 [ANTES DO SAVE] Propriedades do stream:', Object.keys(stream));      
      try {
        console.log('🔄 [SAVE DEBUG] Iniciando stream.save()...');
        const savedStream = await stream.save();
        console.log('✅ [SAVE DEBUG] Stream salvo com sucesso:', savedStream.id);
      } catch (saveError) {
        console.log('❌ [SAVE DEBUG] Erro ao salvar stream:', saveError);
        console.log('❌ [SAVE DEBUG] Detalhes do erro:', {
          message: saveError.message,
          code: saveError.code,
          stack: saveError.stack
        });
        throw saveError;
      }

      // Atualizar cache
      this.activeStreams.set(streamId, {
        camera,
        status: 'active',
        urls: streamUrls,
        quality,
        format,
        viewers: 0,
        startTime: new Date()
      });

      // Limpar tentativas de recuperação
      this.recoveryAttempts.delete(streamId);

      logger.info(`Stream iniciado: ${streamId} para câmera ${camera.name}`);
      
      return {
        stream,
        urls: streamUrls,
        status: 'active'
      };
    } catch (error) {
      logger.error('Erro ao iniciar stream:', error);
      throw error;
    }
  }

  /**
   * Parar stream de câmera
   */
  async stopStream(cameraId) {
    try {
      const streamId = cameraId;
      
      // Parar no servidor de streaming
      await this.stopStreamOnServer(streamId);
      
      // Atualizar banco
      const stream = await Stream.findByPk(streamId);
      if (stream) {
        stream.status = 'inactive';
        stream.ended_at = new Date();
        await stream.save();
      }
      
      // Limpar cache
      this.activeStreams.delete(streamId);
      this.recoveryAttempts.delete(streamId);
      
      logger.info(`Stream parado: ${streamId}`);
      
      return { success: true, message: 'Stream parado com sucesso' };
    } catch (error) {
      logger.error('Erro ao parar stream:', error);
      throw error;
    }
  }

  /**
   * Criar stream no servidor de streaming
   */
  async createStream(camera, options) {
    const { streamId, quality, format, audio } = options;
    const streamUrl = camera.stream_type === 'rtmp' ? camera.rtmp_url : camera.rtsp_url;
    
    if (!streamUrl) {
      throw new ValidationError('URL de stream não configurada');
    }

    const urls = {};
    
    if (this.preferredServer === 'zlm') {
      // Criar stream no ZLMediaKit
      const zlmResult = await this.createZLMStream(streamUrl, streamId, quality, format, audio);
      Object.assign(urls, zlmResult);
    } else {
      // Criar stream no SRS
      const srsResult = await this.createSRSStream(streamUrl, streamId, quality, format, audio);
      Object.assign(urls, srsResult);
    }

    return urls;
  }

  /**
   * Criar stream no ZLMediaKit
   */
  async createZLMStream(streamUrl, streamId, quality, format, audio) {
    try {
      const addStreamUrl = `${this.zlmApiUrl}/addStreamProxy`;
      const params = new URLSearchParams({
        secret: this.zlmSecret,
        vhost: '__defaultVhost__',
        app: 'live',
        stream: streamId,
        url: streamUrl,
        retry_count: '3',
        rtp_type: '0'
      });

      const response = await axios.post(addStreamUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data.code !== 0) {
        throw new Error(`ZLMediaKit erro: ${response.data.msg}`);
      }

      const hlsUrl = `${this.zlmApiUrl.replace('/index/api', '')}/live/${streamId}/live.m3u8`;
      
      return {
        hls: hlsUrl,
        flv: `${this.zlmApiUrl.replace('/index/api', '')}/live/${streamId}.live.flv`,
        rtsp: `rtsp://${this.zlmApiUrl.replace('http://', '').split('/')[0]}/live/${streamId}`,
        rtmp: `rtmp://${this.zlmApiUrl.replace('http://', '').split('/')[0]}/live/${streamId}`
      };
    } catch (error) {
      logger.error('Erro ao criar stream no ZLMediaKit:', error);
      throw error;
    }
  }

  /**
   * Criar stream no SRS
   */
  async createSRSStream(streamUrl, streamId, quality, format, audio) {
    try {
      const srsResponse = await axios.post(`${this.srsApiUrl}/streams`, {
        stream: {
          id: streamId,
          url: streamUrl,
          vhost: '__defaultVhost__',
          app: 'live'
        }
      });

      if (srsResponse.data.code !== 0) {
        throw new Error(`SRS erro: ${srsResponse.data.msg}`);
      }

      return {
        hls: `${this.srsApiUrl.replace('/api/v1', '')}/live/${streamId}.m3u8`,
        flv: `${this.srsApiUrl.replace('/api/v1', '')}/live/${streamId}.flv`,
        rtmp: `${this.srsApiUrl.replace('/api/v1', '').replace('http', 'rtmp')}/live/${streamId}`
      };
    } catch (error) {
      logger.error('Erro ao criar stream no SRS:', error);
      throw error;
    }
  }

  /**
   * Verificar status de stream
   */
  async getStreamStatus(streamId) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return null;
      }

      // Verificar no servidor de streaming
      const isActive = await this.checkStreamExists(streamId);
      
      if (isActive && stream.status !== 'active') {
        // Atualizar status se houver inconsistência
        stream.status = 'active';
        await stream.save();
      }

      return {
        id: stream.id,
        camera_id: stream.camera_id,
        status: stream.status,
        quality: stream.quality,
        format: stream.format,
        urls: stream.urls,
        viewers: this.streamViewers.get(streamId) || 0,
        started_at: stream.started_at,
        ended_at: stream.ended_at
      };
    } catch (error) {
      logger.error('Erro ao verificar status do stream:', error);
      throw error;
    }
  }

  /**
   * Verificar se stream existe no servidor
   */
  async checkStreamExists(streamId) {
    try {
      if (this.preferredServer === 'zlm') {
        const response = await axios.post(`${this.zlmApiUrl}/getMediaList`, 
          new URLSearchParams({ secret: this.zlmSecret }));
        
        if (response.data.code === 0 && response.data.data) {
          return response.data.data.some(media => 
            media.app === 'live' && media.stream === streamId
          );
        }
      } else {
        const response = await axios.get(`${this.srsApiUrl}/streams/${streamId}`);
        return response.data && response.data.stream;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parar stream no servidor
   */
  async stopStreamOnServer(streamId) {
    try {
      if (this.preferredServer === 'zlm') {
        await axios.post(`${this.zlmApiUrl}/closeStreams`, 
          new URLSearchParams({
            secret: this.zlmSecret,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: streamId
          }));
      } else {
        await axios.delete(`${this.srsApiUrl}/streams/${streamId}`);
      }
    } catch (error) {
      logger.error('Erro ao parar stream no servidor:', error);
      throw error;
    }
  }

  /**
   * Recuperação automática de streams
   */
  async startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkAndRecoverStreams();
      } catch (error) {
        logger.error('Erro no health check:', error);
      }
    }, this.recoveryConfig.healthCheckInterval);
  }

  /**
   * Verificar e recuperar streams com problemas
   */
  async checkAndRecoverStreams() {
    try {
      const activeStreams = await Stream.findAll({
        status: 'active'
      });

      for (const stream of activeStreams) {
        const isHealthy = await this.checkStreamHealth(stream.id);
        
        if (!isHealthy) {
          await this.attemptStreamRecovery(stream);
        }
      }
    } catch (error) {
      logger.error('Erro ao verificar streams:', error);
    }
  }

  /**
   * Verificar saúde de um stream
   */
  async checkStreamHealth(streamId) {
    try {
      const exists = await this.checkStreamExists(streamId);
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Tentar recuperar stream
   */
  async attemptStreamRecovery(stream) {
    const streamId = stream.id;
    const attempts = this.recoveryAttempts.get(streamId) || 0;
    
    if (attempts >= this.recoveryConfig.maxAttempts) {
      logger.warn(`Máximo de tentativas de recuperação atingido para stream ${streamId}`);
      try {
        const streamInstance = await Stream.findByPk(streamId);
        if (streamInstance) {
          streamInstance.status = 'error';
          await streamInstance.save();
        }
      } catch (error) {
        logger.error(`Erro ao atualizar status do stream ${streamId}:`, error);
      }
      return;
    }

    logger.info(`Tentando recuperar stream ${streamId} (tentativa ${attempts + 1})`);
    
    try {
      // Parar stream existente
      await this.stopStreamOnServer(streamId);
      
      // Aguardar antes de recriar
      await new Promise(resolve => setTimeout(resolve, this.recoveryConfig.retryDelay));
      
      // Recriar stream
      const camera = await Camera.findByPk(stream.camera_id);
      if (camera) {
        await this.createStream(camera, {
          streamId,
          quality: stream.quality,
          format: stream.format,
          audio: true
        });
        
        logger.info(`Stream ${streamId} recuperado com sucesso`);
        this.recoveryAttempts.delete(streamId);
      }
    } catch (error) {
      logger.error(`Erro ao recuperar stream ${streamId}:`, error);
      this.recoveryAttempts.set(streamId, attempts + 1);
    }
  }

  /**
   * WebSocket: Entrar em um stream
   */
  async handleJoinStream(clientId, data) {
    const { streamId, userId } = data;
    const client = this.clients.get(clientId);
    
    if (!client) return;
    
    client.room = streamId;
    client.userId = userId;
    
    if (!this.rooms.has(streamId)) {
      this.rooms.set(streamId, new Set());
    }
    
    this.rooms.get(streamId).add(clientId);
    
    // Incrementar contador de viewers
    const currentViewers = this.streamViewers.get(streamId) || 0;
    this.streamViewers.set(streamId, currentViewers + 1);
    
    logger.info(`Cliente ${clientId} entrou no stream ${streamId}`);
    
    // Notificar outros clientes
    this.broadcastToRoom(streamId, {
      type: 'user_joined',
      data: { userId, viewers: currentViewers + 1 }
    }, clientId);
  }

  /**
   * WebSocket: Sair de um stream
   */
  async handleLeaveStream(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.room) return;
    
    const streamId = client.room;
    
    // Remover da sala
    if (this.rooms.has(streamId)) {
      this.rooms.get(streamId).delete(clientId);
    }
    
    // Decrementar contador de viewers
    const currentViewers = this.streamViewers.get(streamId) || 0;
    this.streamViewers.set(streamId, Math.max(0, currentViewers - 1));
    
    logger.info(`Cliente ${clientId} saiu do stream ${streamId}`);
    
    // Notificar outros clientes
    this.broadcastToRoom(streamId, {
      type: 'user_left',
      data: { userId: client.userId, viewers: Math.max(0, currentViewers - 1) }
    }, clientId);
    
    client.room = null;
  }

  /**
   * WebSocket: Processar WebRTC offer
   */
  async handleWebRTCOffer(clientId, data) {
    const { targetId, offer } = data;
    
    this.sendToClient(targetId, {
      type: 'webrtc_offer',
      data: { offer, from: clientId }
    });
  }

  /**
   * WebSocket: Processar WebRTC answer
   */
  async handleWebRTCAnswer(clientId, data) {
    const { targetId, answer } = data;
    
    this.sendToClient(targetId, {
      type: 'webrtc_answer',
      data: { answer, from: clientId }
    });
  }

  /**
   * WebSocket: Processar ICE candidate
   */
  async handleIceCandidate(clientId, data) {
    const { targetId, candidate } = data;
    
    this.sendToClient(targetId, {
      type: 'ice_candidate',
      data: { candidate, from: clientId }
    });
  }

  /**
   * WebSocket: Obter playlist HLS
   */
  async handleGetPlaylist(clientId, data) {
    const { streamId } = data;
    const status = await this.getStreamStatus(streamId);
    
    if (status && status.status === 'active') {
      this.sendToClient(clientId, {
        type: 'playlist',
        data: { urls: status.urls }
      });
    }
  }

  /**
   * WebSocket: Desconectar cliente
   */
  handleWebSocketDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.room) {
        this.handleLeaveStream(clientId, {});
      }
      this.clients.delete(clientId);
      logger.info(`Cliente WebSocket desconectado: ${clientId}`);
    }
  }

  /**
   * Enviar mensagem para cliente específico
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast para todos na sala
   */
  broadcastToRoom(streamId, message, excludeClientId = null) {
    const room = this.rooms.get(streamId);
    if (!room) return;
    
    room.forEach(clientId => {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    });
  }

  /**
   * Obter informações de um stream específico
   */
  getStream(streamId) {
    logger.debug(`getStream - Buscando stream: ${streamId}`);
    logger.debug(`getStream - Total de streams ativos: ${this.activeStreams.size}`);
    logger.debug(`getStream - Streams ativos:`, Array.from(this.activeStreams.keys()));
    
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      logger.debug(`getStream - Stream não encontrado: ${streamId}`);
      logger.debug(`getStream - Verificando se é um UUID válido: ${this.isValidUUID(streamId)}`);
      return null;
    }

    // Atualizar contador de viewers
    const viewers = this.streamViewers.get(streamId);
    stream.viewers = viewers ? viewers.size || viewers : 0;

    logger.debug(`getStream - Stream encontrado:`, {
      id: stream.id,
      status: stream.status,
      camera_id: stream.camera_id,
      server: stream.server,
      viewers: stream.viewers
    });
    return stream;
  }

  /**
   * Listar todos os streams ativos
   */
  getActiveStreams() {
    try {
      logger.debug('getActiveStreams - Obtendo streams ativos');
      
      // Converter Map para Array
      const streams = Array.from(this.activeStreams.values());
      
      // Atualizar contadores de viewers
      streams.forEach(stream => {
        const viewers = this.streamViewers.get(stream.id);
        stream.viewers = viewers ? viewers.size || viewers : 0;
      });
      
      logger.debug(`getActiveStreams - Retornando ${streams.length} streams`);
      return streams;
    } catch (error) {
      logger.error('Erro ao obter streams ativos:', error);
      return [];
    }
  }

  /**
   * Obter estatísticas de streaming
   */
  async getStreamingStats() {
    try {
      const streams = this.getActiveStreams();
      const totalViewers = Array.from(this.streamViewers.values())
        .reduce((sum, viewers) => sum + (viewers.size || viewers || 0), 0);

      return {
        total_streams: streams.length,
        active_streams: streams.filter(s => s.status === 'active').length,
        total_viewers: totalViewers,
        by_quality: {
          low: streams.filter(s => s.quality === 'low').length,
          medium: streams.filter(s => s.quality === 'medium').length,
          high: streams.filter(s => s.quality === 'high').length,
          ultra: streams.filter(s => s.quality === 'ultra').length
        },
        by_format: {
          hls: streams.filter(s => s.format === 'hls').length,
          rtmp: streams.filter(s => s.format === 'rtmp').length,
          webrtc: streams.filter(s => s.format === 'webrtc').length
        },
        streams: streams.map(stream => ({
          id: stream.id,
          camera_id: stream.camera_id,
          quality: stream.quality,
          format: stream.format,
          status: stream.status,
          viewers: stream.viewers || 0,
          started_at: stream.started_at,
          urls: stream.urls
        }))
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas de streaming:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de streams (método legado)
   */
  async getStreamStats() {
    try {
      const activeStreams = await Stream.findAll({
        where: { status: 'active' },
        include: [{ model: Camera, attributes: ['name', 'status'] }]
      });

      const stats = {
        total: activeStreams.length,
        viewers: 0,
        byQuality: {},
        byFormat: {},
        streams: []
      };

      for (const stream of activeStreams) {
        const viewers = this.streamViewers.get(stream.id) || 0;
        stats.viewers += viewers;
        
        stats.byQuality[stream.quality] = (stats.byQuality[stream.quality] || 0) + 1;
        stats.byFormat[stream.format] = (stats.byFormat[stream.format] || 0) + 1;
        
        stats.streams.push({
          id: stream.id,
          cameraName: stream.Camera.name,
          quality: stream.quality,
          format: stream.format,
          viewers,
          started_at: stream.started_at
        });
      }

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Limpar recursos ao desligar
   */
  async cleanup() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.wss) {
      this.wss.close();
    }
    
    // Parar todos os streams ativos
    for (const [streamId] of this.activeStreams) {
      try {
        await this.stopStream(streamId);
      } catch (error) {
        logger.error(`Erro ao parar stream ${streamId} durante cleanup:`, error);
      }
    }
    
    logger.info('UnifiedStreamingService limpo com sucesso');
  }

  /**
   * Gerar ID de cliente único
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Verificar se string é UUID válido
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

export default new UnifiedStreamingService();