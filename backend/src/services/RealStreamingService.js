const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const Camera = require('../models/Camera');

class RealStreamingService {
  constructor() {
    this.activeStreams = new Map();
    this.viewers = new Map();
    this.wsServer = null;
    this.hlsSegments = new Map();
    
    // Configurações de streaming
    this.config = {
      webrtc: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },
      hls: {
        segmentDuration: 6,
        playlistSize: 5,
        deleteThreshold: 10
      },
      rtsp: {
        timeout: 10000,
        reconnectInterval: 5000,
        maxReconnectAttempts: 3
      }
    };
    
    this.initializeWebSocketServer();
  }
  
  /**
   * Inicializar servidor WebSocket
   */
  initializeWebSocketServer() {
    const port = process.env.WS_PORT || 8080;
    
    this.wsServer = new WebSocket.Server({ 
      port,
      verifyClient: (info) => {
        // Implementar verificação de autenticação se necessário
        return true;
      }
    });
    
    this.wsServer.on('connection', (ws, req) => {
      const clientId = uuidv4();
      ws.clientId = clientId;
      
      logger.info(`Cliente WebSocket conectado: ${clientId}`);
      
      ws.on('message', (message) => {
        this.handleWebSocketMessage(ws, message);
      });
      
      ws.on('close', () => {
        this.handleClientDisconnect(clientId);
      });
      
      ws.on('error', (error) => {
        logger.error(`Erro WebSocket cliente ${clientId}:`, error);
      });
    });
    
    logger.info(`Servidor WebSocket iniciado na porta ${port}`);
  }
  
  /**
   * Processar mensagens WebSocket
   */
  async handleWebSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_stream':
          await this.handleJoinStream(ws, data);
          break;
          
        case 'leave_stream':
          await this.handleLeaveStream(ws, data);
          break;
          
        case 'webrtc_offer':
          await this.handleWebRTCOffer(ws, data);
          break;
          
        case 'webrtc_answer':
          await this.handleWebRTCAnswer(ws, data);
          break;
          
        case 'webrtc_ice_candidate':
          await this.handleICECandidate(ws, data);
          break;
          
        case 'request_hls_playlist':
          await this.handleHLSPlaylistRequest(ws, data);
          break;
          
        default:
          logger.warn(`Tipo de mensagem desconhecido: ${data.type}`);
      }
      
    } catch (error) {
      logger.error('Erro ao processar mensagem WebSocket:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Erro ao processar mensagem'
      }));
    }
  }
  
  /**
   * Iniciar stream de câmera
   */
  async startCameraStream(cameraId, userId, streamType = 'webrtc') {
    try {
      const camera = await Camera.findById(cameraId);
      
      if (!camera) {
        throw new Error('Câmera não encontrada');
      }
      
      // Verificar permissões do usuário
      const userCameras = await Camera.findByUserId(userId);
      const hasAccess = userCameras.some(cam => cam.id === cameraId);
      
      if (!hasAccess) {
        throw new Error('Acesso negado à câmera');
      }
      
      const streamId = `${cameraId}_${streamType}_${Date.now()}`;
      
      const streamConfig = {
        id: streamId,
        cameraId,
        userId,
        type: streamType,
        status: 'starting',
        startedAt: new Date(),
        viewers: new Set(),
        rtspUrl: this.buildRTSPUrl(camera),
        camera
      };
      
      this.activeStreams.set(streamId, streamConfig);
      
      // Iniciar stream baseado no tipo
      switch (streamType) {
        case 'webrtc':
          await this.startWebRTCStream(streamConfig);
          break;
          
        case 'hls':
          await this.startHLSStream(streamConfig);
          break;
          
        case 'rtsp':
          await this.startRTSPProxy(streamConfig);
          break;
          
        default:
          throw new Error(`Tipo de stream não suportado: ${streamType}`);
      }
      
      streamConfig.status = 'active';
      
      logger.info(`Stream iniciado: ${streamId} para câmera ${cameraId}`);
      
      return {
        streamId,
        type: streamType,
        status: 'active',
        urls: this.getStreamUrls(streamConfig)
      };
      
    } catch (error) {
      logger.error('Erro ao iniciar stream:', error);
      throw error;
    }
  }
  
  /**
   * Iniciar stream WebRTC
   */
  async startWebRTCStream(streamConfig) {
    try {
      // Implementar captura RTSP para WebRTC
      const rtspCapture = await this.createRTSPCapture(streamConfig.rtspUrl);
      
      streamConfig.rtspCapture = rtspCapture;
      streamConfig.webrtcPeers = new Map();
      
      // Configurar pipeline de vídeo
      rtspCapture.on('frame', (frame) => {
        this.broadcastFrameToWebRTCPeers(streamConfig, frame);
      });
      
      rtspCapture.on('error', (error) => {
        logger.error(`Erro na captura RTSP para stream ${streamConfig.id}:`, error);
        this.handleStreamError(streamConfig, error);
      });
      
      await rtspCapture.start();
      
    } catch (error) {
      logger.error('Erro ao iniciar stream WebRTC:', error);
      throw error;
    }
  }
  
  /**
   * Iniciar stream HLS
   */
  async startHLSStream(streamConfig) {
    try {
      const hlsPath = `./storage/hls/${streamConfig.id}`;
      const fs = require('fs').promises;
      
      // Criar diretório HLS
      await fs.mkdir(hlsPath, { recursive: true });
      
      // Configurar segmentação HLS
      const hlsSegmenter = await this.createHLSSegmenter({
        input: streamConfig.rtspUrl,
        output: hlsPath,
        segmentDuration: this.config.hls.segmentDuration,
        playlistSize: this.config.hls.playlistSize
      });
      
      streamConfig.hlsSegmenter = hlsSegmenter;
      streamConfig.hlsPath = hlsPath;
      
      hlsSegmenter.on('segment', (segment) => {
        this.handleNewHLSSegment(streamConfig, segment);
      });
      
      hlsSegmenter.on('error', (error) => {
        logger.error(`Erro no segmentador HLS para stream ${streamConfig.id}:`, error);
        this.handleStreamError(streamConfig, error);
      });
      
      await hlsSegmenter.start();
      
    } catch (error) {
      logger.error('Erro ao iniciar stream HLS:', error);
      throw error;
    }
  }
  
  /**
   * Criar captura RTSP
   */
  async createRTSPCapture(rtspUrl) {
    const { RTSPClient } = require('node-rtsp-stream');
    
    return new RTSPClient({
      url: rtspUrl,
      timeout: this.config.rtsp.timeout,
      reconnectInterval: this.config.rtsp.reconnectInterval,
      maxReconnectAttempts: this.config.rtsp.maxReconnectAttempts
    });
  }
  
  /**
   * Criar segmentador HLS
   */
  async createHLSSegmenter(options) {
    const { HLSSegmenter } = require('./utils/HLSSegmenter');
    
    return new HLSSegmenter(options);
  }
  
  /**
   * Processar entrada em stream
   */
  async handleJoinStream(ws, data) {
    try {
      const { cameraId, streamType = 'webrtc', userId } = data;
      
      // Verificar se stream já existe
      let stream = Array.from(this.activeStreams.values())
        .find(s => s.cameraId === cameraId && s.type === streamType);
      
      if (!stream) {
        // Criar novo stream
        const streamResult = await this.startCameraStream(cameraId, userId, streamType);
        stream = this.activeStreams.get(streamResult.streamId);
      }
      
      // Adicionar viewer
      stream.viewers.add(ws.clientId);
      
      if (!this.viewers.has(ws.clientId)) {
        this.viewers.set(ws.clientId, {
          streamId: stream.id,
          cameraId,
          joinedAt: new Date(),
          ws
        });
      }
      
      // Enviar configuração do stream
      ws.send(JSON.stringify({
        type: 'stream_joined',
        streamId: stream.id,
        cameraId,
        streamType,
        urls: this.getStreamUrls(stream),
        config: streamType === 'webrtc' ? this.config.webrtc : null
      }));
      
      logger.info(`Cliente ${ws.clientId} entrou no stream ${stream.id}`);
      
    } catch (error) {
      logger.error('Erro ao entrar no stream:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  }
  
  /**
   * Processar saída de stream
   */
  async handleLeaveStream(ws, data) {
    try {
      const viewer = this.viewers.get(ws.clientId);
      
      if (viewer) {
        const stream = this.activeStreams.get(viewer.streamId);
        
        if (stream) {
          stream.viewers.delete(ws.clientId);
          
          // Se não há mais viewers, parar o stream
          if (stream.viewers.size === 0) {
            await this.stopStream(stream.id);
          }
        }
        
        this.viewers.delete(ws.clientId);
      }
      
      ws.send(JSON.stringify({
        type: 'stream_left'
      }));
      
    } catch (error) {
      logger.error('Erro ao sair do stream:', error);
    }
  }
  
  /**
   * Processar oferta WebRTC
   */
  async handleWebRTCOffer(ws, data) {
    try {
      const { streamId, offer } = data;
      const stream = this.activeStreams.get(streamId);
      
      if (!stream || stream.type !== 'webrtc') {
        throw new Error('Stream WebRTC não encontrado');
      }
      
      // Criar peer connection
      const { RTCPeerConnection } = require('wrtc');
      const peerConnection = new RTCPeerConnection(this.config.webrtc);
      
      // Configurar peer connection
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            candidate: event.candidate
          }));
        }
      };
      
      // Adicionar stream de vídeo
      if (stream.mediaStream) {
        stream.mediaStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream.mediaStream);
        });
      }
      
      // Processar oferta
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Armazenar peer connection
      stream.webrtcPeers.set(ws.clientId, peerConnection);
      
      // Enviar resposta
      ws.send(JSON.stringify({
        type: 'webrtc_answer',
        answer
      }));
      
    } catch (error) {
      logger.error('Erro ao processar oferta WebRTC:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Erro ao estabelecer conexão WebRTC'
      }));
    }
  }
  
  /**
   * Processar candidato ICE
   */
  async handleICECandidate(ws, data) {
    try {
      const viewer = this.viewers.get(ws.clientId);
      
      if (viewer) {
        const stream = this.activeStreams.get(viewer.streamId);
        const peerConnection = stream?.webrtcPeers?.get(ws.clientId);
        
        if (peerConnection) {
          await peerConnection.addIceCandidate(data.candidate);
        }
      }
      
    } catch (error) {
      logger.error('Erro ao processar candidato ICE:', error);
    }
  }
  
  /**
   * Processar solicitação de playlist HLS
   */
  async handleHLSPlaylistRequest(ws, data) {
    try {
      const { streamId } = data;
      const stream = this.activeStreams.get(streamId);
      
      if (!stream || stream.type !== 'hls') {
        throw new Error('Stream HLS não encontrado');
      }
      
      const playlistPath = `${stream.hlsPath}/playlist.m3u8`;
      const fs = require('fs').promises;
      
      try {
        const playlist = await fs.readFile(playlistPath, 'utf8');
        
        ws.send(JSON.stringify({
          type: 'hls_playlist',
          playlist,
          baseUrl: `/api/streams/${streamId}/hls/`
        }));
        
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Playlist HLS não disponível'
        }));
      }
      
    } catch (error) {
      logger.error('Erro ao processar solicitação HLS:', error);
    }
  }
  
  /**
   * Parar stream
   */
  async stopStream(streamId) {
    try {
      const stream = this.activeStreams.get(streamId);
      
      if (!stream) {
        return;
      }
      
      // Parar captura RTSP
      if (stream.rtspCapture) {
        await stream.rtspCapture.stop();
      }
      
      // Parar segmentador HLS
      if (stream.hlsSegmenter) {
        await stream.hlsSegmenter.stop();
      }
      
      // Fechar conexões WebRTC
      if (stream.webrtcPeers) {
        stream.webrtcPeers.forEach(peer => {
          peer.close();
        });
      }
      
      // Notificar viewers
      stream.viewers.forEach(clientId => {
        const viewer = this.viewers.get(clientId);
        if (viewer && viewer.ws.readyState === WebSocket.OPEN) {
          viewer.ws.send(JSON.stringify({
            type: 'stream_ended',
            streamId
          }));
        }
      });
      
      // Remover stream
      this.activeStreams.delete(streamId);
      
      logger.info(`Stream parado: ${streamId}`);
      
    } catch (error) {
      logger.error('Erro ao parar stream:', error);
    }
  }
  
  /**
   * Processar desconexão de cliente
   */
  handleClientDisconnect(clientId) {
    const viewer = this.viewers.get(clientId);
    
    if (viewer) {
      const stream = this.activeStreams.get(viewer.streamId);
      
      if (stream) {
        stream.viewers.delete(clientId);
        
        // Fechar conexão WebRTC se existir
        if (stream.webrtcPeers) {
          const peerConnection = stream.webrtcPeers.get(clientId);
          if (peerConnection) {
            peerConnection.close();
            stream.webrtcPeers.delete(clientId);
          }
        }
        
        // Se não há mais viewers, parar o stream
        if (stream.viewers.size === 0) {
          this.stopStream(stream.id);
        }
      }
      
      this.viewers.delete(clientId);
    }
    
    logger.info(`Cliente WebSocket desconectado: ${clientId}`);
  }
  
  /**
   * Obter URLs de stream
   */
  getStreamUrls(stream) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    
    switch (stream.type) {
      case 'webrtc':
        return {
          websocket: `ws://localhost:${process.env.WS_PORT || 8080}`
        };
        
      case 'hls':
        return {
          hls: `${baseUrl}/api/streams/${stream.id}/hls/playlist.m3u8`
        };
        
      case 'rtsp':
        return {
          rtsp: stream.rtspUrl
        };
        
      default:
        return {};
    }
  }
  
  /**
   * Construir URL RTSP
   */
  buildRTSPUrl(camera) {
    const auth = camera.username && camera.password ? 
      `${camera.username}:${camera.password}@` : '';
    
    return `rtsp://${auth}${camera.ip}:${camera.port}${camera.rtsp_path || '/stream1'}`;
  }
  
  /**
   * Obter estatísticas de streaming
   */
  getStreamingStats() {
    const stats = {
      active_streams: this.activeStreams.size,
      total_viewers: this.viewers.size,
      streams_by_type: {},
      viewers_by_stream: {}
    };
    
    // Estatísticas por tipo
    this.activeStreams.forEach(stream => {
      stats.streams_by_type[stream.type] = 
        (stats.streams_by_type[stream.type] || 0) + 1;
      
      stats.viewers_by_stream[stream.id] = stream.viewers.size;
    });
    
    return stats;
  }
}

module.exports = new RealStreamingService();