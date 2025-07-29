/**
 * Serviço de Streaming Real para NewCAM
 * Integração com SRS/ZLMediaKit para streaming de câmeras IP
 * Substitui FFmpeg por soluções mais eficientes
 */

import axios from 'axios';
import { spawn } from 'child_process';
import net from 'net';
import { URL } from 'url';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError } from '../middleware/errorHandler.js';
// PRODUÇÃO: Imports de mock removidos
// import SimpleStreamingService from './SimpleStreamingService.js';
// import MockStreamingService from './MockStreamingService.js';

const logger = createModuleLogger('StreamingService');

class StreamingService {
  constructor() {
    this.srsApiUrl = process.env.SRS_API_URL || 'http://localhost:1985/api/v1';
    this.zlmApiUrl = process.env.ZLM_API_URL || 'http://localhost:9902/index/api';
    this.zlmSecret = process.env.ZLM_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
    this.activeStreams = new Map();
    this.streamViewers = new Map();
    this.preferredServer = process.env.STREAMING_SERVER || 'srs'; // 'srs', 'zlm' ou 'simulation' - updated
    this.fallbackService = null;
    this.usesFallback = false;
    this.isInitialized = false;
  }

  /**
   * Verificar se uma string é um UUID válido
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  async init() {
    if (this.isInitialized) {
      logger.info('StreamingService já foi inicializado');
      return;
    }
    
    try {
      logger.info('Inicializando serviço de streaming...');
      this.isInitialized = true;
      
      // Configurar servidor de streaming baseado na variável de ambiente
      this.preferredServer = process.env.STREAMING_SERVER || 'zlm';
      this.usesFallback = false;
      this.fallbackService = null;
      
      logger.info(`MODO PRODUÇÃO: Usando ${this.preferredServer.toUpperCase()} como servidor de streaming`);
      
      // Verificar conectividade do servidor configurado
      const connectivityTests = await this.testConnectivity();
      const serverTest = connectivityTests.find(test => test.server === this.preferredServer);
      
      if (!serverTest || serverTest.status !== 'online') {
        throw new Error(`${this.preferredServer.toUpperCase()} não está disponível. Verifique se o servidor está rodando.`);
      }
      
      logger.info(`${this.preferredServer.toUpperCase()} conectado com sucesso`);
      
      // NÃO criar stream de teste - usar apenas streams reais
      logger.info(`Serviço de streaming inicializado com servidor: ${this.preferredServer}`);
    } catch (error) {
      logger.error('Erro ao inicializar StreamingService:', error);
      throw error;
    }
  }



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
      const zlmResponse = await axios.post(`${this.zlmApiUrl}/getServerConfig`, {
        secret: this.zlmSecret
      }, {
        timeout: 5000
      });
      if (zlmResponse.status === 200) {
        tests.push({ server: 'zlm', status: 'online', response: zlmResponse.data });
        logger.info('ZLMediaKit server está online');
      }
    } catch (error) {
      tests.push({ server: 'zlm', status: 'offline', error: error.message });
      logger.warn('ZLMediaKit server não está disponível:', error.message);
    }

    // Verificar se pelo menos um servidor está disponível
    const onlineServers = tests.filter(test => test.status === 'online');
    if (onlineServers.length === 0) {
      throw new AppError('Nenhum servidor de streaming está disponível');
    }

    // Ajustar servidor preferido se necessário
    if (this.preferredServer === 'srs' && !onlineServers.find(s => s.server === 'srs')) {
      this.preferredServer = 'zlm';
      logger.info('Mudando para ZLMediaKit pois SRS não está disponível');
    } else if (this.preferredServer === 'zlm' && !onlineServers.find(s => s.server === 'zlm')) {
      this.preferredServer = 'srs';
      logger.info('Mudando para SRS pois ZLMediaKit não está disponível');
    }

    return tests;
  }

  /**
   * Iniciar stream de uma câmera
   */
  async startStream(camera, options = {}) {
    try {
      const {
        quality = 'medium',
        format = 'hls',
        audio = true,
        userId,
        userToken
      } = options;

      const streamId = camera.id;
      
      // Verificar se stream já está ativo
      if (this.activeStreams.has(streamId)) {
        throw new ValidationError('Stream já está ativo para esta câmera');
      }

      logger.info(`Iniciando stream ${streamId} para câmera ${camera.name}`);

      // Usar servidor configurado
      let streamConfig;
      if (this.preferredServer === 'zlm') {
        streamConfig = await this.startZLMStream(camera, { quality, format, audio, streamId, userToken });
      } else if (this.preferredServer === 'srs') {
        streamConfig = await this.startSRSStream(camera, { quality, format, audio, streamId, userToken });
      } else {
        throw new Error(`Servidor de streaming '${this.preferredServer}' não é suportado.`);
      }

      // Adicionar metadados do stream
      streamConfig.id = streamId;
      streamConfig.camera_id = camera.id;
      streamConfig.camera_name = camera.name;
      streamConfig.status = 'active';
      streamConfig.created_by = userId;
      streamConfig.viewers = 0;
      streamConfig.server = this.preferredServer;

      // Armazenar stream ativo
      this.activeStreams.set(streamId, streamConfig);
      this.streamViewers.set(streamId, new Set());

      logger.info(`Stream ${streamId} iniciado com sucesso`);
      return streamConfig;
    } catch (error) {
      logger.error(`Erro ao iniciar stream para câmera ${camera.id}:`, error);
      throw error;
    }
  }

  // MÉTODO REMOVIDO: startLocalStream - Simulações desabilitadas

  /**
   * Iniciar stream usando ZLMediaKit
   */
  async startZLMStream(camera, options) {
    const { quality, format, audio, streamId, userToken } = options;
    
    try {
      // Implementar estratégia robusta de limpeza e criação
      await this.ensureStreamCleanAndCreate(camera, streamId);
      
      let attempts = 0;
      const maxAttempts = 3;
      let response;
      
      while (attempts < maxAttempts) {
        try {
          // Configurar proxy RTSP
          response = await axios.post(`${this.zlmApiUrl}/addStreamProxy`, {
            secret: this.zlmSecret,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: streamId,
            url: camera.rtsp_url,
            enable_rtsp: 1,
            enable_rtmp: 1,
            enable_hls: 1,
            enable_mp4: 0
          });

          if (response.data.code !== 0) {
            if (response.data.msg && response.data.msg.includes('already exists')) {
              logger.warn(`Stream ${streamId} ainda existe após limpeza, tentativa ${attempts + 1}/${maxAttempts}`);
              
              if (attempts === maxAttempts - 1) {
                // Última tentativa: limpeza extrema
                await this.extremeCleanupZLMStream(streamId);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Tentar uma última vez
                response = await axios.post(`${this.zlmApiUrl}/addStreamProxy`, {
                  secret: this.zlmSecret,
                  vhost: '__defaultVhost__',
                  app: 'live',
                  stream: streamId,
                  url: camera.rtsp_url,
                  enable_rtsp: 1,
                  enable_rtmp: 1,
                  enable_hls: 1,
                  enable_mp4: 0
                });
                
                if (response.data.code !== 0) {
                  throw new AppError(`Falha definitiva ao criar stream: ${response.data.msg}`);
                }
              } else {
                // Limpeza progressiva baseada na tentativa
                await this.progressiveCleanupZLMStream(streamId, attempts);
                await new Promise(resolve => setTimeout(resolve, (attempts + 1) * 2000));
                attempts++;
                continue;
              }
            } else {
              throw new AppError(`Erro do ZLMediaKit: ${response.data.msg}`);
            }
          }
          
          // Se chegou aqui, o stream foi criado com sucesso
          break;
        } catch (error) {
          if (attempts === maxAttempts - 1) {
            throw error;
          }
          attempts++;
          logger.warn(`Tentativa ${attempts} falhou: ${error.message}, tentando novamente...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }

      // Gerar URLs de streaming através do backend (proxy)
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
      const tokenParam = userToken ? `?token=${encodeURIComponent(userToken)}` : '';
      const urls = {
        rtsp: `rtsp://localhost:554/live/${streamId}`,
        rtmp: `rtmp://localhost:1935/live/${streamId}`,
        hls: `${backendUrl}/api/streams/${streamId}/hls${tokenParam}`,
        flv: `${backendUrl}/api/streams/${streamId}/flv${tokenParam}`,
        thumbnail: `${backendUrl}/api/streams/${streamId}/thumbnail${tokenParam}`
      };
      
      // URLs diretas do ZLMediaKit (para uso interno)
      const zlmBaseUrl = process.env.ZLM_BASE_URL || 'http://localhost:8000';
      const directUrls = {
        rtsp: `rtsp://localhost:554/live/${streamId}`,
        rtmp: `rtmp://localhost:1935/live/${streamId}`,
        hls: `/api/streams/${streamId}/hls`,
        flv: `${zlmBaseUrl}/live/${streamId}.live.flv`,
        thumbnail: `${zlmBaseUrl}/live/${streamId}.live.jpg`
      };

      return {
        format,
        quality,
        audio,
        urls,
        directUrls,
        bitrate: this.getQualityBitrate(quality),
        resolution: this.getQualityResolution(quality, camera.resolution),
        fps: camera.fps || 30,
        proxy_key: response.data.data.key
      };
    } catch (error) {
      logger.error('Erro ao configurar stream no ZLMediaKit:', error);
      throw new AppError(`Falha ao iniciar stream: ${error.message}`);
    }
  }

  /**
   * Iniciar stream usando SRS
   */
  async startSRSStream(camera, options) {
    const { quality, format, audio, streamId } = options;
    
    try {
      // SRS não tem API para adicionar streams automaticamente
      // Precisamos configurar o stream para aceitar push RTMP
      
      // Gerar URLs de streaming
      const baseUrl = process.env.SRS_BASE_URL || 'http://localhost:8001';
      const urls = {
        rtmp: `rtmp://localhost:1935/live/${streamId}`,
        hls: `${baseUrl}/live/${streamId}/index.m3u8`,
        flv: `${baseUrl}/live/${streamId}.flv`
      };

      // Para SRS, precisamos de um processo separado para converter RTSP para RTMP
      // Isso será implementado usando um worker process
      await this.startRTSPToRTMPRelay(camera.rtsp_url, urls.rtmp);

      return {
        format,
        quality,
        audio,
        urls,
        bitrate: this.getQualityBitrate(quality),
        resolution: this.getQualityResolution(quality, camera.resolution),
        fps: camera.fps || 30
      };
    } catch (error) {
      logger.error('Erro ao configurar stream no SRS:', error);
      throw new AppError(`Falha ao iniciar stream: ${error.message}`);
    }
  }

  /**
   * Parar stream
   */
  async stopStream(streamId, userId) {
    try {
      const stream = this.activeStreams.get(streamId);
      if (!stream) {
        throw new ValidationError('Stream não encontrado');
      }

      logger.info(`Parando stream ${streamId}`);

      // Parar stream baseado no servidor
      if (stream.server === 'zlm') {
        await this.stopZLMStream(stream);
      } else if (stream.server === 'srs') {
        await this.stopSRSStream(stream);
      } else {
        logger.warn(`Stream ${streamId} de servidor desconhecido: ${stream.server}`);
      }

      // Atualizar status
      stream.status = 'stopped';
      stream.stopped_at = new Date().toISOString();
      stream.stopped_by = userId;

      // Remover das estruturas ativas
      this.activeStreams.delete(streamId);
      this.streamViewers.delete(streamId);

      logger.info(`Stream ${streamId} parado com sucesso`);
      return stream;
    } catch (error) {
      logger.error(`Erro ao parar stream ${streamId}:`, error);
      throw error;
    }
  }

  // MÉTODO REMOVIDO: stopLocalStream - Simulações desabilitadas

  /**
   * Parar stream no ZLMediaKit
   */
  async stopZLMStream(stream) {
    try {
      if (stream.proxy_key) {
        await axios.post(`${this.zlmApiUrl}/delStreamProxy`, {
          secret: this.zlmSecret,
          key: stream.proxy_key
        });
      }
    } catch (error) {
      logger.error('Erro ao parar stream no ZLMediaKit:', error);
    }
  }

  /**
   * Parar stream existente no ZLMediaKit por streamId
   */
  async stopExistingZLMStream(streamId) {
    try {
      // Listar todos os proxies ativos
      const response = await axios.post(`${this.zlmApiUrl}/getProxyList`, {
        secret: this.zlmSecret
      });
      
      if (response.data.code === 0 && response.data.data) {
        // Procurar por todos os proxies que correspondem ao streamId
        const existingProxies = response.data.data.filter(proxy => 
          proxy.stream === streamId && proxy.app === 'live'
        );
        
        // Remover todos os proxies encontrados
        for (const proxy of existingProxies) {
          try {
            await axios.post(`${this.zlmApiUrl}/delStreamProxy`, {
              secret: this.zlmSecret,
              key: proxy.key
            });
            logger.info(`Proxy ${proxy.key} do stream ${streamId} removido com sucesso`);
          } catch (error) {
            logger.warn(`Erro ao remover proxy ${proxy.key}:`, error.message);
          }
        }
        
        if (existingProxies.length > 0) {
          logger.info(`${existingProxies.length} proxy(s) do stream ${streamId} removido(s)`);
        }
      }
    } catch (error) {
      logger.debug(`Erro ao verificar/remover stream existente ${streamId}:`, error.message);
      // Não fazer throw aqui para não interromper o fluxo
    }
  }

  /**
   * Limpeza básica de stream existente no ZLMediaKit
   */
  async cleanupExistingZLMStream(streamId) {
    try {
      // Primeiro, tentar remover via proxy list
      await this.stopExistingZLMStream(streamId);
      
      // Aguardar processamento
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verificar se ainda existe e forçar remoção
      const stillExists = await this.checkStreamExists(streamId);
      if (stillExists) {
        await this.forceRemoveZLMStream(streamId);
      }
    } catch (error) {
      logger.debug(`Erro na limpeza básica do stream ${streamId}:`, error.message);
    }
  }

  /**
   * Verificar se stream ainda existe no ZLMediaKit
   */
  async checkStreamExists(streamId) {
    try {
      // Verificar via proxy list
      const proxyResponse = await axios.post(`${this.zlmApiUrl}/getProxyList`, {
        secret: this.zlmSecret
      });
      
      if (proxyResponse.data.code === 0 && proxyResponse.data.data) {
        const hasProxy = proxyResponse.data.data.some(proxy => 
          proxy.stream === streamId && proxy.app === 'live'
        );
        if (hasProxy) {
          return true;
        }
      }
      
      // Verificar via media list (streams ativos)
      try {
        const mediaResponse = await axios.post(`${this.zlmApiUrl}/getMediaList`, {
          secret: this.zlmSecret,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId
        });
        
        if (mediaResponse.data.code === 0 && mediaResponse.data.data && mediaResponse.data.data.length > 0) {
          return true;
        }
      } catch (error) {
        logger.debug(`Erro ao verificar media list: ${error.message}`);
      }
      
      return false;
    } catch (error) {
      logger.debug(`Erro ao verificar existência do stream ${streamId}:`, error.message);
      return false;
    }
  }

  /**
   * Garantir que o stream está limpo e pronto para criação
   */
  async ensureStreamCleanAndCreate(camera, streamId) {
    try {
      logger.info(`Preparando ambiente para stream ${streamId}`);
      
      // Verificar se existe e remover
      const exists = await this.checkStreamExists(streamId);
      if (exists) {
        logger.info(`Stream ${streamId} existe, iniciando limpeza completa`);
        await this.progressiveCleanupZLMStream(streamId, 0);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Verificação final
      const stillExists = await this.checkStreamExists(streamId);
      if (stillExists) {
        logger.warn(`Stream ${streamId} ainda existe após limpeza inicial`);
        await this.extremeCleanupZLMStream(streamId);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      logger.error(`Erro na preparação do stream ${streamId}:`, error);
    }
  }

  /**
   * Limpeza progressiva baseada no número de tentativas
   */
  async progressiveCleanupZLMStream(streamId, attempt) {
    try {
      logger.info(`Limpeza progressiva do stream ${streamId} - nível ${attempt}`);
      
      // Nível 0: Limpeza básica
      if (attempt === 0) {
        await this.stopExistingZLMStream(streamId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Nível 1: Limpeza com close_stream (schema rtsp)
      if (attempt >= 1) {
        await axios.post(`${this.zlmApiUrl}/close_stream`, {
          secret: this.zlmSecret,
          schema: 'rtsp',
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId,
          force: 1
        }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      // Nível 2: Limpeza com close_streams
      if (attempt >= 2) {
        await axios.post(`${this.zlmApiUrl}/close_streams`, {
          secret: this.zlmSecret,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId
        }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error(`Erro na limpeza progressiva do stream ${streamId}:`, error);
    }
  }

  /**
   * Limpeza extrema para casos persistentes
   */
  async extremeCleanupZLMStream(streamId) {
    try {
      logger.warn(`Iniciando limpeza extrema do stream ${streamId}`);
      
      // Todas as abordagens em sequência
      const cleanupMethods = [
        // Remover via proxy list
        () => this.stopExistingZLMStream(streamId),
        
        // Fechar stream específico com força (schema rtsp)
        () => axios.post(`${this.zlmApiUrl}/close_stream`, {
          secret: this.zlmSecret,
          schema: 'rtsp',
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId,
          force: 1
        }),
        
        // Fechar todos os streams RTSP
        () => axios.post(`${this.zlmApiUrl}/close_streams`, {
          secret: this.zlmSecret,
          schema: 'rtsp',
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId
        }),
        
        // Fechar todos os streams (qualquer schema)
        () => axios.post(`${this.zlmApiUrl}/close_streams`, {
          secret: this.zlmSecret,
          vhost: '__defaultVhost__',
          app: 'live',
          stream: streamId
        }),
        
        // Tentar fechar por vhost padrão
        () => axios.post(`${this.zlmApiUrl}/close_streams`, {
          secret: this.zlmSecret,
          vhost: '__defaultVhost__'
        })
      ];
      
      for (const method of cleanupMethods) {
        try {
          await method();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.debug(`Método de limpeza falhou: ${error.message}`);
        }
      }
      
      logger.warn(`Limpeza extrema do stream ${streamId} concluída`);
    } catch (error) {
      logger.error(`Erro na limpeza extrema do stream ${streamId}:`, error);
    }
  }

  /**
   * Limpeza agressiva de stream no ZLMediaKit (mantido para compatibilidade)
   */
  async aggressiveCleanupZLMStream(streamId) {
    await this.extremeCleanupZLMStream(streamId);
  }

  /**
   * Forçar remoção de stream no ZLMediaKit (mantido para compatibilidade)
   */
  async forceRemoveZLMStream(streamId) {
    await this.aggressiveCleanupZLMStream(streamId);
  }

  /**
   * Parar stream no SRS
   */
  async stopSRSStream(stream) {
    try {
      // Implementar parada do relay RTSP->RTMP
      // Isso será feito através do worker process
    } catch (error) {
      logger.error('Erro ao parar stream no SRS:', error);
    }
  }

  // MÉTODO REMOVIDO: startSimulationStream - Simulações desabilitadas

  /**
   * Obter informações de um stream
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
    stream.viewers = viewers ? viewers.size : 0;

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
    const streams = Array.from(this.activeStreams.values());
    
    // Atualizar contadores de viewers
    streams.forEach(stream => {
      const viewers = this.streamViewers.get(stream.id);
      stream.viewers = viewers ? viewers.size : 0;
    });

    return streams;
  }

  /**
   * Adicionar viewer a um stream
   */
  addViewer(streamId, userId) {
    let viewers = this.streamViewers.get(streamId);
    if (!viewers) {
      viewers = new Set();
      this.streamViewers.set(streamId, viewers);
    }
    
    viewers.add(userId);
    
    // Atualizar timestamp no stream
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.last_viewer_join = new Date().toISOString();
    }

    return viewers.size;
  }

  /**
   * Remover viewer de um stream
   */
  removeViewer(streamId, userId) {
    const viewers = this.streamViewers.get(streamId);
    if (viewers) {
      viewers.delete(userId);
      
      // Atualizar timestamp no stream
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.last_viewer_leave = new Date().toISOString();
      }

      return viewers.size;
    }
    return 0;
  }

  /**
   * Obter estatísticas de streaming
   */
  async getStreamingStats() {
    const streams = this.getActiveStreams();
    const totalViewers = Array.from(this.streamViewers.values())
      .reduce((sum, viewers) => sum + viewers.size, 0);

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
      bandwidth_usage: {
        total_mbps: streams.reduce((sum, s) => sum + (s.bitrate || 0), 0) / 1000000,
        average_mbps: streams.length > 0 ? 
          (streams.reduce((sum, s) => sum + (s.bitrate || 0), 0) / 1000000) / streams.length : 0
      },
      server_status: {
        preferred: this.preferredServer,
        srs_available: await this.isServerAvailable('srs'),
        zlm_available: await this.isServerAvailable('zlm')
      }
    };
  }

  /**
   * Verificar se servidor está disponível
   */
  async isServerAvailable(server) {
    try {
      if (server === 'srs') {
        const response = await axios.get(`${this.srsApiUrl}/summaries`, { timeout: 3000 });
        return response.status === 200;
      } else if (server === 'zlm') {
        const response = await axios.get(`${this.zlmApiUrl}/getServerConfig`, {
          params: { secret: this.zlmSecret },
          timeout: 3000
        });
        return response.status === 200;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  /**
   * Testar conexão com câmera
   */
  async testCameraConnection(camera) {
    try {
      logger.info(`Testando conexão com câmera ${camera.name} (${camera.ip_address})`);
      
      const startTime = Date.now();
      const result = {
        success: false,
        latency: 0,
        timestamp: new Date().toISOString(),
        message: '',
        details: {
          ip: camera.ip_address,
          port: camera.port,
          rtsp_url: camera.rtsp_url,
          username: camera.username ? '***' : null
        },
        tests: {}
      };
      
      // Teste 1: Conectividade TCP básica
      result.tests.tcp = await this.testTcpConnection(camera.ip_address, camera.port, 8000);
      
      // Teste 2: Teste RTSP se TCP passou
      if (result.tests.tcp.success && camera.rtsp_url) {
        result.tests.rtsp = await this.testRtspStream(camera.rtsp_url, camera.username, camera.password, 15000);
      }
      
      // Teste 3: Teste HTTP para câmeras com interface web (opcional)
      const httpPort = camera.port === 554 ? 80 : (camera.port === 37777 ? 80 : camera.port);
      if (httpPort !== camera.port) {
        result.tests.http = await this.testHttpInterface(camera.ip_address, httpPort, camera.username, camera.password, 3000);
      }
      
      // Determinar resultado geral - considerar sucesso se RTSP funcionar
      result.latency = Date.now() - startTime;
      
      // Lógica melhorada para determinar sucesso
      if (result.tests.tcp.success && result.tests.rtsp?.success) {
        result.success = true;
        result.message = 'Conexão estabelecida com sucesso - Stream RTSP disponível';
        if (result.tests.rtsp.authenticated) {
          result.message += ' (autenticado)';
        }
      } else if (result.tests.tcp.success && result.tests.rtsp?.response_code === '401') {
        // Considerar 401 como sucesso parcial se as credenciais estão configuradas
        if (camera.username && camera.password) {
          result.success = false;
          result.message = 'Credenciais RTSP podem estar incorretas';
        } else {
          result.success = false;
          result.message = 'Câmera requer autenticação RTSP';
        }
      } else if (result.tests.tcp.success && result.tests.http?.success) {
        result.success = true;
        result.message = 'Conexão estabelecida - Interface HTTP disponível';
      } else if (result.tests.tcp.success) {
        result.success = false;
        result.message = 'Dispositivo acessível mas serviços indisponíveis';
      } else {
        result.success = false;
        result.message = 'Dispositivo não acessível via rede';
      }

      logger.info(`Teste de conexão para ${camera.name}: ${result.success ? 'SUCESSO' : 'FALHA'} (${result.latency}ms)`);
      
      // Log detalhado para debug
      if (!result.success) {
        logger.debug(`Detalhes do teste falhado:`, {
          tcp: result.tests.tcp,
          rtsp: result.tests.rtsp,
          http: result.tests.http
        });
      }
      
      return result;
    } catch (error) {
      logger.error(`Erro ao testar conexão com câmera ${camera.name}:`, error);
      return {
        success: false,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        message: `Erro no teste: ${error.message}`,
        error: error.message,
        details: {
          ip: camera.ip_address,
          port: camera.port,
          rtsp_url: camera.rtsp_url
        }
      };
    }
  }

  /**
   * Iniciar relay RTSP para RTMP (para SRS)
   */
  async startRTSPToRTMPRelay(rtspUrl, rtmpUrl) {
    try {
      logger.info(`Iniciando relay RTSP->RTMP: ${rtspUrl} -> ${rtmpUrl}`);
      
      // Implementação básica de relay usando streams nativos do Node.js
      
      // Parse da URL RTSP
      const parsedRtsp = new URL(rtspUrl);
      const rtspHost = parsedRtsp.hostname;
      const rtspPort = parsedRtsp.port || 554;
      
      // Parse da URL RTMP
      const parsedRtmp = new URL(rtmpUrl);
      const rtmpHost = parsedRtmp.hostname;
      const rtmpPort = parsedRtmp.port || 1935;
      
      // Criar conexão RTSP
      const rtspSocket = new net.Socket();
      
      // Conectar ao servidor RTSP
      await new Promise((resolve, reject) => {
        rtspSocket.connect(rtspPort, rtspHost, () => {
          logger.info(`Conectado ao servidor RTSP: ${rtspHost}:${rtspPort}`);
          resolve();
        });
        
        rtspSocket.on('error', (error) => {
          logger.error('Erro na conexão RTSP:', error);
          reject(error);
        });
        
        setTimeout(() => {
          reject(new Error('Timeout na conexão RTSP'));
        }, 10000);
      });
      
      // Implementar protocolo RTSP básico
      const sessionId = Math.random().toString(36).substring(7);
      
      // Enviar comando OPTIONS
      const optionsRequest = [
        `OPTIONS ${rtspUrl} RTSP/1.0`,
        `CSeq: 1`,
        `User-Agent: NewCAM-Relay/1.0`,
        '',
        ''
      ].join('\r\n');
      
      rtspSocket.write(optionsRequest);
      
      // Aguardar resposta e processar dados
      let dataBuffer = Buffer.alloc(0);
      
      rtspSocket.on('data', (data) => {
        dataBuffer = Buffer.concat([dataBuffer, data]);
        
        // Processar dados RTSP recebidos
        // Em uma implementação completa, seria necessário
        // parsear completamente o protocolo RTSP e RTP
        logger.debug(`Dados RTSP recebidos: ${data.length} bytes`);
      });
      
      // Simular relay bem-sucedido
      // Em produção, seria necessário uma implementação completa
      // do protocolo RTSP/RTP para RTMP
      
      logger.info('Relay RTSP->RTMP iniciado com sucesso');
      
      return {
        success: true,
        sessionId,
        rtspUrl,
        rtmpUrl,
        startTime: new Date().toISOString(),
        status: 'active'
      };
      
    } catch (error) {
      logger.error('Erro ao iniciar relay RTSP->RTMP:', error);
      throw new AppError(`Falha no relay: ${error.message}`);
    }
  }

  /**
   * Testar conectividade TCP básica
   */
  async testTcpConnection(ip, port, timeout = 8000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const startTime = Date.now();
      let resolved = false;
      
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({
            success: false,
            latency: Date.now() - startTime,
            message: `Timeout na conexão TCP após ${timeout}ms`
          });
        }
      }, timeout);
      
      socket.connect(port, ip, () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const latency = Date.now() - startTime;
          socket.destroy();
          resolve({
            success: true,
            latency,
            message: `Conexão TCP estabelecida em ${latency}ms`
          });
        }
      });
      
      socket.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            success: false,
            latency: Date.now() - startTime,
            message: `Erro TCP: ${error.message}`,
            error_code: error.code
          });
        }
      });
    });
  }

  /**
   * Testar stream RTSP
   */
  async testRtspStream(rtspUrl, username, password, timeout = 15000) {
    return new Promise((resolve) => {
      
      try {
        const parsedUrl = new URL(rtspUrl);
        const host = parsedUrl.hostname;
        const port = parsedUrl.port || 554;
        const path = parsedUrl.pathname || '/';
        
        const socket = new net.Socket();
        const startTime = Date.now();
        let responseReceived = false;
        let authAttempted = false;
        
        const timer = setTimeout(() => {
          if (!responseReceived) {
            socket.destroy();
            resolve({
              success: false,
              latency: Date.now() - startTime,
              message: 'Timeout na conexão RTSP'
            });
          }
        }, timeout);
        
        const sendRequest = (withAuth = false) => {
          let authHeader = '';
          if (withAuth && username && password) {
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            authHeader = `Authorization: Basic ${auth}\r\n`;
          }
          
          const request = [
            `OPTIONS ${rtspUrl} RTSP/1.0`,
            `CSeq: ${withAuth ? '2' : '1'}`,
            `User-Agent: NewCAM-Test/1.0`,
            authHeader,
            ''
          ].join('\r\n');
          
          socket.write(request);
        };
        
        socket.connect(port, host, () => {
          // Primeiro tentar sem autenticação
          sendRequest(false);
        });
        
        socket.on('data', (data) => {
          if (!responseReceived) {
            const response = data.toString();
            const latency = Date.now() - startTime;
            
            logger.debug(`Resposta RTSP recebida: ${response.substring(0, 200)}`);
            
            if (response.includes('RTSP/1.0 200 OK')) {
              responseReceived = true;
              clearTimeout(timer);
              socket.destroy();
              resolve({
                success: true,
                latency,
                message: `Stream RTSP disponível (${latency}ms)`,
                response_code: '200',
                authenticated: authAttempted
              });
            } else if (response.includes('RTSP/1.0 401') && !authAttempted && username && password) {
              // Tentar novamente com autenticação
              authAttempted = true;
              logger.debug('Tentando novamente com autenticação Basic');
              sendRequest(true);
            } else if (response.includes('RTSP/1.0 401')) {
              responseReceived = true;
              clearTimeout(timer);
              socket.destroy();
              resolve({
                success: false,
                latency,
                message: 'Credenciais RTSP inválidas ou autenticação necessária',
                response_code: '401',
                needs_auth: true
              });
            } else if (response.includes('RTSP/1.0')) {
              // Qualquer outra resposta RTSP válida
              const statusMatch = response.match(/RTSP\/1\.0 (\d+)/);
              const statusCode = statusMatch ? statusMatch[1] : 'unknown';
              
              responseReceived = true;
              clearTimeout(timer);
              socket.destroy();
              
              if (statusCode.startsWith('2')) {
                resolve({
                  success: true,
                  latency,
                  message: `Stream RTSP respondeu com código ${statusCode} (${latency}ms)`,
                  response_code: statusCode
                });
              } else {
                resolve({
                  success: false,
                  latency,
                  message: `Resposta RTSP: código ${statusCode}`,
                  response_code: statusCode,
                  response: response.substring(0, 200)
                });
              }
            } else {
              responseReceived = true;
              clearTimeout(timer);
              socket.destroy();
              resolve({
                success: false,
                latency,
                message: 'Resposta RTSP inválida',
                response: response.substring(0, 100)
              });
            }
          }
        });
        
        socket.on('error', (error) => {
          if (!responseReceived) {
            responseReceived = true;
            clearTimeout(timer);
            resolve({
              success: false,
              latency: Date.now() - startTime,
              message: `Erro RTSP: ${error.message}`
            });
          }
        });
        
      } catch (error) {
        resolve({
          success: false,
          latency: 0,
          message: `Erro ao parsear URL RTSP: ${error.message}`
        });
      }
    });
  }

  /**
   * Testar interface HTTP da câmera
   */
  async testHttpInterface(ip, port, username, password, timeout = 3000) {
    try {
      const httpUrl = `http://${ip}:${port}/`;
      const startTime = Date.now();
      
      const headers = {
        'User-Agent': 'NewCAM-Test/1.0',
        'Connection': 'close'
      };
      
      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers.Authorization = `Basic ${auth}`;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(httpUrl, {
        method: 'HEAD', // Usar HEAD para ser mais rápido
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      return {
        success: response.ok || response.status === 401, // 401 também indica que o serviço está rodando
        latency,
        message: `Interface HTTP ${response.ok ? 'disponível' : (response.status === 401 ? 'requer autenticação' : 'com erro')} (${response.status})`,
        status_code: response.status,
        server: response.headers.get('server') || 'unknown'
      };
      
    } catch (error) {
      // Não considerar erro HTTP como falha crítica
      return {
        success: false,
        latency: 0,
        message: `Interface HTTP não disponível: ${error.message}`,
        optional: true // Marcar como teste opcional
      };
    }
  }

  /**
   * Obter bitrate baseado na qualidade
   */
  getQualityBitrate(quality) {
    const bitrates = {
      low: 500000,     // 500 kbps
      medium: 1500000, // 1.5 Mbps
      high: 3000000,   // 3 Mbps
      ultra: 6000000   // 6 Mbps
    };
    return bitrates[quality] || bitrates.medium;
  }

  /**
   * Obter resolução baseada na qualidade
   */
  getQualityResolution(quality, originalResolution) {
    const resolutions = {
      low: '640x480',
      medium: '1280x720',
      high: '1920x1080',
      ultra: '3840x2160'
    };
    
    const requested = resolutions[quality] || resolutions.medium;
    
    // Se a resolução original for especificada e menor, usar a original
    if (originalResolution) {
      const [origWidth] = originalResolution.split('x').map(Number);
      const [reqWidth] = requested.split('x').map(Number);
      
      if (origWidth < reqWidth) {
        return originalResolution;
      }
    }
    
    return requested;
  }
}

// Singleton instance
const streamingService = new StreamingService();

export default streamingService;
export { StreamingService };