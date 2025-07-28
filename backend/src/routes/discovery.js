/**
 * Rotas para descoberta automática de câmeras IP na rede
 * Implementa varredura de rede e detecção de dispositivos ONVIF
 */

import express from 'express';
import { createModuleLogger } from '../config/logger.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateParams, createValidationSchema } from '../middleware/validation.js';
import { DiscoveryService } from '../services/DiscoveryService.js';

const router = express.Router();
const logger = createModuleLogger('DiscoveryRoutes');
const discoveryService = new DiscoveryService();

/**
 * @route POST /api/discovery/scan
 * @desc Iniciar varredura de rede para descobrir câmeras IP
 * @access Private (Admin/Operator)
 */
router.post('/scan',
  authenticateToken,
  requirePermission('cameras.create'),
  createValidationSchema({
    network_range: {
      required: false,
      type: 'string',
      pattern: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/,
      message: 'Formato de rede deve ser CIDR (ex: 192.168.1.0/24)'
    },
    port_range: {
      required: false,
      type: 'string',
      pattern: /^\d{1,5}-\d{1,5}$/,
      message: 'Formato de porta deve ser início-fim (ex: 554-8554)'
    },
    timeout: {
      required: false,
      type: 'positiveNumber',
      min: 1000,
      max: 30000,
      message: 'Timeout deve ser entre 1000ms e 30000ms'
    },
    protocols: {
      required: false,
      type: 'array',
      items: {
        enum: ['rtsp', 'onvif', 'http']
      },
      message: 'Protocolos devem ser rtsp, onvif ou http'
    }
  }),
  asyncHandler(async (req, res) => {
    const {
      network_range = '192.168.1.0/24',
      port_range = '554-8554',
      timeout = 5000,
      protocols = ['rtsp', 'onvif']
    } = req.validatedData;

    logger.info(`Iniciando varredura de rede: ${network_range} por ${req.user.email}`);

    // Iniciar varredura assíncrona
    const scanId = await discoveryService.startNetworkScan({
      networkRange: network_range,
      portRange: port_range,
      timeout,
      protocols,
      userId: req.user.id
    });

    res.json({
      message: 'Varredura de rede iniciada',
      data: {
        scan_id: scanId,
        status: 'scanning',
        network_range,
        port_range,
        protocols,
        estimated_duration: '30-120 segundos'
      }
    });
  })
);

/**
 * @route GET /api/discovery/scan/:scanId
 * @desc Obter status e resultados de uma varredura
 * @access Private
 */
router.get('/scan/:scanId',
  authenticateToken,
  validateParams({
    scanId: {
      required: true,
      type: 'uuid',
      message: 'ID da varredura deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const scanResult = await discoveryService.getScanResult(scanId);
    
    if (!scanResult) {
      return res.status(404).json({
        message: 'Varredura não encontrada'
      });
    }

    res.json({
      message: 'Status da varredura obtido',
      data: scanResult
    });
  })
);

/**
 * @route GET /api/discovery/scans
 * @desc Listar todas as varreduras do usuário
 * @access Private
 */
router.get('/scans',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      status = null
    } = req.query;

    const scans = await discoveryService.getUserScans(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    });

    res.json({
      message: 'Varreduras listadas com sucesso',
      data: scans
    });
  })
);

/**
 * @route POST /api/discovery/test-device
 * @desc Testar conectividade com um dispositivo específico
 * @access Private (Admin/Operator)
 */
router.post('/test-device',
  authenticateToken,
  requirePermission('cameras.create'),
  createValidationSchema({
    ip_address: {
      required: true,
      type: 'ip',
      message: 'Endereço IP válido é obrigatório'
    },
    port: {
      required: false,
      type: 'port',
      default: 554
    },
    username: {
      required: false,
      type: 'string',
      maxLength: 50
    },
    password: {
      required: false,
      type: 'string',
      maxLength: 100
    },
    protocols: {
      required: false,
      type: 'array',
      items: {
        enum: ['rtsp', 'onvif', 'http']
      },
      default: ['rtsp', 'onvif']
    }
  }),
  asyncHandler(async (req, res) => {
    const {
      ip_address,
      port = 554,
      username,
      password,
      protocols = ['rtsp', 'onvif']
    } = req.validatedData;

    logger.info(`Testando dispositivo ${ip_address}:${port} por ${req.user.email}`);

    const testResult = await discoveryService.testDevice({
      ipAddress: ip_address,
      port,
      username,
      password,
      protocols
    });

    res.json({
      message: 'Teste de dispositivo concluído',
      data: testResult
    });
  })
);

/**
 * @route POST /api/discovery/add-camera
 * @desc Adicionar câmera descoberta ao sistema
 * @access Private (Admin/Operator)
 */
router.post('/add-camera',
  authenticateToken,
  requirePermission('cameras.create'),
  createValidationSchema({
    discovered_device: {
      required: true,
      type: 'object',
      properties: {
        ip_address: { type: 'ip', required: true },
        port: { type: 'port', required: true },
        manufacturer: { type: 'string', required: false },
        model: { type: 'string', required: false },
        rtsp_urls: { type: 'array', required: false },
        onvif_url: { type: 'string', required: false }
      }
    },
    camera_config: {
      required: true,
      type: 'object',
      properties: {
        name: { type: 'nonEmptyString', required: true, minLength: 2, maxLength: 100 },
        description: { type: 'string', required: false, maxLength: 500 },
        username: { type: 'string', required: false, maxLength: 50 },
        password: { type: 'string', required: false, maxLength: 100 },
        location: { type: 'string', required: false, maxLength: 100 },
        zone: { type: 'string', required: false, maxLength: 50 }
      }
    }
  }),
  asyncHandler(async (req, res) => {
    const { discovered_device, camera_config } = req.validatedData;

    logger.info(`Adicionando câmera descoberta ${discovered_device.ip_address} por ${req.user.email}`);

    const camera = await discoveryService.addDiscoveredCamera(
      discovered_device,
      camera_config,
      req.user.id
    );

    res.status(201).json({
      message: 'Câmera adicionada com sucesso',
      data: camera.toJSON()
    });
  })
);

/**
 * @route DELETE /api/discovery/scan/:scanId
 * @desc Cancelar varredura em andamento
 * @access Private
 */
router.delete('/scan/:scanId',
  authenticateToken,
  validateParams({
    scanId: {
      required: true,
      type: 'uuid',
      message: 'ID da varredura deve ser um UUID válido'
    }
  }),
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const cancelled = await discoveryService.cancelScan(scanId, req.user.id);
    
    if (!cancelled) {
      return res.status(404).json({
        message: 'Varredura não encontrada ou já finalizada'
      });
    }

    res.json({
      message: 'Varredura cancelada com sucesso'
    });
  })
);

export default router;