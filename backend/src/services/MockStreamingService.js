/**
 * Mock Streaming Service para quando Docker não estiver disponível
 * Simula operações de streaming para evitar erros 500
 */

import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('MockStreamingService');

class MockStreamingService {
  constructor() {
    this.isInitialized = false;
    this.activeStreams = new Map();
    this.streamViewers = new Map();
  }

  async init() {
    if (this.isInitialized) {
      logger.info('MockStreamingService já foi inicializado');
      return;
    }

    logger.info('🎭 Inicializando MockStreamingService (Docker não disponível)');
    this.isInitialized = true;
  }

  async startStream(camera, options = {}) {
    logger.info(`🎭 [MOCK] Simulando início de stream para câmera ${camera.id}`);
    
    const mockConfig = {
      streamId: camera.id,
      cameraId: camera.id,
      rtspUrl: camera.rtsp_url,
      hlsUrl: `http://localhost:8000/live/${camera.id}.m3u8`,
      status: 'simulated',
      quality: options.quality || '720p',
      format: options.format || 'hls',
      audio: options.audio || false,
      startTime: new Date().toISOString(),
      message: 'Stream simulado - Docker não disponível'
    };

    this.activeStreams.set(camera.id, mockConfig);
    
    return mockConfig;
  }

  async stopStream(cameraId) {
    logger.info(`🎭 [MOCK] Simulando parada de stream para câmera ${cameraId}`);
    
    if (this.activeStreams.has(cameraId)) {
      this.activeStreams.delete(cameraId);
      return { success: true, message: 'Stream simulado parado' };
    }
    
    return { success: false, message: 'Stream não estava ativo' };
  }

  async getStreamStatus(cameraId) {
    logger.info(`🎭 [MOCK] Verificando status de stream para câmera ${cameraId}`);
    
    if (this.activeStreams.has(cameraId)) {
      return {
        active: true,
        ...this.activeStreams.get(cameraId)
      };
    }
    
    return {
      active: false,
      message: 'Stream não ativo'
    };
  }

  async getAllStreams() {
    logger.info('🎭 [MOCK] Listando todos os streams ativos');
    
    const streams = Array.from(this.activeStreams.values());
    return {
      total: streams.length,
      streams
    };
  }

  async healthCheck() {
    return {
      status: 'mock',
      message: 'MockStreamingService ativo - Docker não disponível',
      timestamp: new Date().toISOString()
    };
  }
}

export default MockStreamingService;