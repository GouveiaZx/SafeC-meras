/**
 * Serviço de Descoberta de Câmeras IP
 * Implementa varredura de rede, detecção ONVIF e teste de conectividade
 */

import { v4 as uuidv4 } from 'uuid';
import net from 'net';
import dgram from 'dgram';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError } from '../middleware/errorHandler.js';
import { Camera } from '../models/Camera.js';
import streamingService from './StreamingService.js';

const logger = createModuleLogger('DiscoveryService');

class DiscoveryService {
  constructor() {
    this.activeScans = new Map();
    this.scanResults = new Map();
    this.onvifMulticastAddress = '239.255.255.250';
    this.onvifMulticastPort = 3702;
    this.commonRtspPorts = [554, 8554, 80, 8080, 88, 8000, 8888];
    this.commonHttpPorts = [80, 8080, 8000, 8888, 9000];
  }

  /**
   * Iniciar varredura de rede
   */
  async startNetworkScan(options) {
    const {
      networkRange,
      portRange,
      timeout,
      protocols,
      userId
    } = options;

    const scanId = uuidv4();
    const scanData = {
      id: scanId,
      userId,
      status: 'scanning',
      networkRange,
      portRange,
      protocols,
      timeout,
      startTime: new Date().toISOString(),
      progress: 0,
      devicesFound: [],
      totalHosts: 0,
      scannedHosts: 0
    };

    this.activeScans.set(scanId, scanData);
    this.scanResults.set(scanId, scanData);

    // Iniciar varredura assíncrona
    this.performNetworkScan(scanId, options).catch(error => {
      logger.error(`Erro na varredura ${scanId}:`, error);
      const scan = this.scanResults.get(scanId);
      if (scan) {
        scan.status = 'error';
        scan.error = error.message;
        scan.endTime = new Date().toISOString();
      }
    });

    logger.info(`Varredura ${scanId} iniciada para rede ${networkRange}`);
    return scanId;
  }

  /**
   * Executar varredura de rede
   */
  async performNetworkScan(scanId, options) {
    const scan = this.scanResults.get(scanId);
    if (!scan) return;

    try {
      const { networkRange, portRange, timeout, protocols } = options;
      
      // Gerar lista de IPs para varrer
      const ipList = this.generateIpList(networkRange);
      scan.totalHosts = ipList.length;
      
      // Gerar lista de portas
      const portList = this.generatePortList(portRange, protocols);
      
      logger.info(`Varrendo ${ipList.length} IPs em ${portList.length} portas`);
      
      // Varrer IPs em paralelo (limitado)
      const batchSize = 20; // Limitar paralelismo
      const batches = this.chunkArray(ipList, batchSize);
      
      for (const batch of batches) {
        if (scan.status === 'cancelled') break;
        
        const promises = batch.map(ip => 
          this.scanHost(ip, portList, timeout, protocols)
        );
        
        const results = await Promise.allSettled(promises);
        
        // Processar resultados
        results.forEach((result, index) => {
          scan.scannedHosts++;
          scan.progress = Math.round((scan.scannedHosts / scan.totalHosts) * 100);
          
          if (result.status === 'fulfilled' && result.value) {
            scan.devicesFound.push(result.value);
            logger.info(`Dispositivo encontrado: ${result.value.ip_address}:${result.value.port}`);
          }
        });
        
        // Pequena pausa entre batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Descoberta ONVIF adicional
      if (protocols.includes('onvif') && scan.status !== 'cancelled') {
        await this.performOnvifDiscovery(scan);
      }
      
      scan.status = scan.status === 'cancelled' ? 'cancelled' : 'completed';
      scan.endTime = new Date().toISOString();
      scan.duration = new Date(scan.endTime) - new Date(scan.startTime);
      
      logger.info(`Varredura ${scanId} concluída: ${scan.devicesFound.length} dispositivos encontrados`);
      
    } catch (error) {
      scan.status = 'error';
      scan.error = error.message;
      scan.endTime = new Date().toISOString();
      throw error;
    } finally {
      this.activeScans.delete(scanId);
    }
  }

  /**
   * Varrer um host específico
   */
  async scanHost(ip, portList, timeout, protocols) {
    const deviceInfo = {
      ip_address: ip,
      ports_open: [],
      services: [],
      manufacturer: null,
      model: null,
      rtsp_urls: [],
      onvif_url: null,
      http_urls: []
    };

    // Testar portas
    for (const port of portList) {
      try {
        const isOpen = await this.testPort(ip, port, timeout);
        if (isOpen) {
          deviceInfo.ports_open.push(port);
          
          // Identificar serviços
          if (protocols.includes('rtsp') && this.commonRtspPorts.includes(port)) {
            const rtspUrl = `rtsp://${ip}:${port}/`;
            deviceInfo.rtsp_urls.push(rtspUrl);
            deviceInfo.services.push('rtsp');
          }
          
          if (protocols.includes('http') && this.commonHttpPorts.includes(port)) {
            const httpUrl = `http://${ip}:${port}/`;
            deviceInfo.http_urls.push(httpUrl);
            deviceInfo.services.push('http');
          }
        }
      } catch (error) {
        // Ignorar erros de porta individual
      }
    }

    // Se encontrou portas abertas, tentar identificar o dispositivo
    if (deviceInfo.ports_open.length > 0) {
      await this.identifyDevice(deviceInfo);
      return deviceInfo;
    }

    return null;
  }

  /**
   * Testar se uma porta está aberta
   */
  async testPort(ip, port, timeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);
      
      socket.connect(port, ip, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  /**
   * Identificar dispositivo através de fingerprinting
   */
  async identifyDevice(deviceInfo) {
    try {
      // Tentar identificar via HTTP
      for (const httpUrl of deviceInfo.http_urls) {
        try {
          const response = await fetch(httpUrl, {
            method: 'GET',
            timeout: 3000,
            headers: {
              'User-Agent': 'NewCAM-Discovery/1.0'
            }
          });
          
          const headers = response.headers;
          const server = headers.get('server') || '';
          
          // Identificar fabricantes comuns
          if (server.toLowerCase().includes('hikvision')) {
            deviceInfo.manufacturer = 'Hikvision';
          } else if (server.toLowerCase().includes('dahua')) {
            deviceInfo.manufacturer = 'Dahua';
          } else if (server.toLowerCase().includes('axis')) {
            deviceInfo.manufacturer = 'Axis';
          } else if (server.toLowerCase().includes('vivotek')) {
            deviceInfo.manufacturer = 'Vivotek';
          }
          
          break;
        } catch (error) {
          // Continuar tentando outras URLs
        }
      }
      
      // Gerar URLs RTSP comuns baseado no fabricante
      this.generateCommonRtspUrls(deviceInfo);
      
    } catch (error) {
      logger.debug(`Erro ao identificar dispositivo ${deviceInfo.ip_address}:`, error.message);
    }
  }

  /**
   * Gerar URLs RTSP comuns baseado no fabricante
   */
  generateCommonRtspUrls(deviceInfo) {
    const ip = deviceInfo.ip_address;
    const commonPaths = {
      'Hikvision': ['/Streaming/Channels/101', '/h264/ch1/main/av_stream'],
      'Dahua': ['/cam/realmonitor?channel=1&subtype=0', '/live'],
      'Axis': ['/axis-media/media.amp', '/mjpg/video.mjpg'],
      'Vivotek': ['/live.sdp', '/video.mjpg'],
      'default': ['/stream1', '/live', '/video', '/cam1', '/channel1']
    };
    
    const paths = commonPaths[deviceInfo.manufacturer] || commonPaths.default;
    
    for (const port of deviceInfo.ports_open) {
      if (this.commonRtspPorts.includes(port)) {
        for (const path of paths) {
          const rtspUrl = `rtsp://${ip}:${port}${path}`;
          if (!deviceInfo.rtsp_urls.includes(rtspUrl)) {
            deviceInfo.rtsp_urls.push(rtspUrl);
          }
        }
      }
    }
  }

  /**
   * Descoberta ONVIF via multicast
   */
  async performOnvifDiscovery(scan) {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const discoveredDevices = new Set();
      
      // Mensagem ONVIF WS-Discovery
      const probeMessage = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>uuid:${uuidv4()}</wsa:MessageID>
    <wsa:ReplyTo>
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <Probe>
      <Types>tds:Device</Types>
    </Probe>
  </soap:Body>
</soap:Envelope>`;
      
      socket.on('message', (msg, rinfo) => {
        const response = msg.toString();
        if (response.includes('onvif') && !discoveredDevices.has(rinfo.address)) {
          discoveredDevices.add(rinfo.address);
          
          // Adicionar dispositivo ONVIF encontrado
          const existingDevice = scan.devicesFound.find(d => d.ip_address === rinfo.address);
          if (existingDevice) {
            existingDevice.onvif_url = `http://${rinfo.address}/onvif/device_service`;
            existingDevice.services.push('onvif');
          } else {
            scan.devicesFound.push({
              ip_address: rinfo.address,
              ports_open: [80],
              services: ['onvif'],
              manufacturer: null,
              model: null,
              rtsp_urls: [],
              onvif_url: `http://${rinfo.address}/onvif/device_service`,
              http_urls: [`http://${rinfo.address}`]
            });
          }
          
          logger.info(`Dispositivo ONVIF encontrado: ${rinfo.address}`);
        }
      });
      
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.setMulticastTTL(128);
        
        // Enviar probe ONVIF
        socket.send(probeMessage, this.onvifMulticastPort, this.onvifMulticastAddress, (err) => {
          if (err) {
            logger.error('Erro ao enviar probe ONVIF:', err);
          }
        });
        
        // Aguardar respostas por 5 segundos
        setTimeout(() => {
          socket.close();
          resolve();
        }, 5000);
      });
    });
  }

  /**
   * Testar dispositivo específico
   */
  async testDevice(options) {
    const { ipAddress, port, username, password, protocols } = options;
    
    logger.info(`Testando dispositivo ${ipAddress}:${port}`);
    
    const result = {
      ip_address: ipAddress,
      port,
      timestamp: new Date().toISOString(),
      tests: {},
      overall_status: 'unknown',
      recommended_config: null
    };
    
    // Teste de conectividade básica
    result.tests.connectivity = await this.testPort(ipAddress, port, 5000);
    
    if (!result.tests.connectivity) {
      result.overall_status = 'unreachable';
      return result;
    }
    
    // Teste RTSP
    if (protocols.includes('rtsp')) {
      result.tests.rtsp = await this.testRtspConnection(ipAddress, port, username, password);
    }
    
    // Teste HTTP
    if (protocols.includes('http')) {
      result.tests.http = await this.testHttpConnection(ipAddress, port, username, password);
    }
    
    // Teste ONVIF
    if (protocols.includes('onvif')) {
      result.tests.onvif = await this.testOnvifConnection(ipAddress, username, password);
    }
    
    // Determinar status geral
    const hasWorkingProtocol = Object.values(result.tests).some(test => test && test.success);
    result.overall_status = hasWorkingProtocol ? 'compatible' : 'incompatible';
    
    // Gerar configuração recomendada
    if (result.overall_status === 'compatible') {
      result.recommended_config = this.generateRecommendedConfig(result, ipAddress, port, username, password);
    }
    
    return result;
  }

  /**
   * Testar conexão RTSP
   */
  async testRtspConnection(ip, port, username, password) {
    try {
      const auth = username && password ? `${username}:${password}@` : '';
      const rtspUrl = `rtsp://${auth}${ip}:${port}/`;
      
      // Usar StreamingService para testar
      const testCamera = {
        ip_address: ip,
        port,
        username,
        password,
        rtsp_url: rtspUrl
      };
      
      const testResult = await streamingService.testCameraConnection(testCamera);
      
      return {
        success: testResult.success,
        url: rtspUrl,
        latency: testResult.latency,
        message: testResult.message
      };
    } catch (error) {
      return {
        success: false,
        url: null,
        latency: 0,
        message: `Erro RTSP: ${error.message}`
      };
    }
  }

  /**
   * Testar conexão HTTP
   */
  async testHttpConnection(ip, port, username, password) {
    try {
      const httpUrl = `http://${ip}:${port}/`;
      const startTime = Date.now();
      
      const headers = {};
      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers.Authorization = `Basic ${auth}`;
      }
      
      const response = await fetch(httpUrl, {
        method: 'GET',
        headers,
        timeout: 5000
      });
      
      const latency = Date.now() - startTime;
      
      return {
        success: response.ok,
        url: httpUrl,
        latency,
        status_code: response.status,
        server: response.headers.get('server') || 'unknown'
      };
    } catch (error) {
      return {
        success: false,
        url: null,
        latency: 0,
        message: `Erro HTTP: ${error.message}`
      };
    }
  }

  /**
   * Testar conexão ONVIF
   */
  async testOnvifConnection(ip, username, password) {
    try {
      const onvifUrl = `http://${ip}/onvif/device_service`;
      
      // Implementação básica de teste ONVIF
      // Em produção, usar biblioteca específica como node-onvif
      
      return {
        success: false,
        url: onvifUrl,
        message: 'Teste ONVIF não implementado completamente'
      };
    } catch (error) {
      return {
        success: false,
        url: null,
        message: `Erro ONVIF: ${error.message}`
      };
    }
  }

  /**
   * Gerar configuração recomendada
   */
  generateRecommendedConfig(testResult, ip, port, username, password) {
    const config = {
      ip_address: ip,
      port,
      username,
      password,
      type: 'ip',
      rtsp_url: null,
      recommended_settings: {}
    };
    
    // Configurar URL RTSP se disponível
    if (testResult.tests.rtsp && testResult.tests.rtsp.success) {
      config.rtsp_url = testResult.tests.rtsp.url;
      config.recommended_settings.primary_protocol = 'rtsp';
    }
    
    // Detectar fabricante baseado em testes HTTP
    if (testResult.tests.http && testResult.tests.http.server) {
      const server = testResult.tests.http.server.toLowerCase();
      if (server.includes('hikvision')) {
        config.brand = 'Hikvision';
        config.recommended_settings.rtsp_path = '/Streaming/Channels/101';
      } else if (server.includes('dahua')) {
        config.brand = 'Dahua';
        config.recommended_settings.rtsp_path = '/cam/realmonitor?channel=1&subtype=0';
      }
    }
    
    return config;
  }

  /**
   * Adicionar câmera descoberta ao sistema
   */
  async addDiscoveredCamera(discoveredDevice, cameraConfig, userId) {
    try {
      // Criar nova câmera com dados descobertos
      const cameraData = {
        ...cameraConfig,
        ip_address: discoveredDevice.ip_address,
        port: discoveredDevice.port,
        type: 'ip',
        brand: discoveredDevice.manufacturer || 'Unknown',
        model: discoveredDevice.model || 'Unknown',
        created_by: userId
      };
      
      // Usar primeira URL RTSP disponível
      if (discoveredDevice.rtsp_urls && discoveredDevice.rtsp_urls.length > 0) {
        cameraData.rtsp_url = discoveredDevice.rtsp_urls[0];
      }
      
      const camera = new Camera(cameraData);
      await camera.save();
      
      logger.info(`Câmera descoberta adicionada: ${camera.name} (${camera.ip_address})`);
      return camera;
    } catch (error) {
      logger.error('Erro ao adicionar câmera descoberta:', error);
      throw error;
    }
  }

  /**
   * Obter resultado de varredura
   */
  async getScanResult(scanId) {
    return this.scanResults.get(scanId) || null;
  }

  /**
   * Obter varreduras do usuário
   */
  async getUserScans(userId, options = {}) {
    const { page = 1, limit = 10, status = null } = options;
    
    let userScans = Array.from(this.scanResults.values())
      .filter(scan => scan.userId === userId);
    
    if (status) {
      userScans = userScans.filter(scan => scan.status === status);
    }
    
    // Ordenar por data (mais recente primeiro)
    userScans.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Paginação
    const offset = (page - 1) * limit;
    const paginatedScans = userScans.slice(offset, offset + limit);
    
    return {
      scans: paginatedScans,
      pagination: {
        page,
        limit,
        total: userScans.length,
        pages: Math.ceil(userScans.length / limit)
      }
    };
  }

  /**
   * Cancelar varredura
   */
  async cancelScan(scanId, userId) {
    const scan = this.scanResults.get(scanId);
    
    if (!scan || scan.userId !== userId) {
      return false;
    }
    
    if (scan.status === 'scanning') {
      scan.status = 'cancelled';
      scan.endTime = new Date().toISOString();
      this.activeScans.delete(scanId);
      
      logger.info(`Varredura ${scanId} cancelada pelo usuário ${userId}`);
      return true;
    }
    
    return false;
  }

  // Métodos utilitários
  
  generateIpList(networkRange) {
    const [network, cidr] = networkRange.split('/');
    const [a, b, c, d] = network.split('.').map(Number);
    const mask = parseInt(cidr);
    
    if (mask < 24) {
      throw new ValidationError('Rede muito grande. Use CIDR >= 24');
    }
    
    const ips = [];
    const hostBits = 32 - mask;
    const numHosts = Math.pow(2, hostBits) - 2; // Excluir network e broadcast
    
    for (let i = 1; i <= numHosts && i <= 254; i++) {
      ips.push(`${a}.${b}.${c}.${i}`);
    }
    
    return ips;
  }
  
  generatePortList(portRange, protocols) {
    const [start, end] = portRange.split('-').map(Number);
    const ports = new Set();
    
    // Adicionar portas do range
    for (let port = start; port <= end && port <= 65535; port++) {
      ports.add(port);
    }
    
    // Adicionar portas comuns baseado nos protocolos
    if (protocols.includes('rtsp')) {
      this.commonRtspPorts.forEach(port => ports.add(port));
    }
    
    if (protocols.includes('http')) {
      this.commonHttpPorts.forEach(port => ports.add(port));
    }
    
    return Array.from(ports).sort((a, b) => a - b);
  }
  
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export { DiscoveryService };