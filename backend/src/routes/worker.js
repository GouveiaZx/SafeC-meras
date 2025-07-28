/**
 * Rotas para comunicação com o Worker
 * Permite que o worker notifique o backend sobre eventos das câmeras
 */

import express from 'express';
import { Camera } from '../models/Camera.js';
import { createModuleLogger } from '../config/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';

const router = express.Router();
const logger = createModuleLogger('WorkerRoutes');

// Middleware para validar token do worker
const validateWorkerToken = (req, res, next) => {
  const token = req.headers['x-worker-token'];
  const expectedToken = process.env.WORKER_TOKEN;
  
  if (!token || !expectedToken) {
    return res.status(401).json({
      success: false,
      message: 'Token do worker não fornecido ou não configurado'
    });
  }
  
  if (token !== expectedToken) {
    return res.status(403).json({
      success: false,
      message: 'Token do worker inválido'
    });
  }
  
  next();
};

/**
 * @route POST /api/worker/events
 * @desc Receber eventos do worker sobre câmeras
 * @access Worker only
 */
router.post('/events',
  validateWorkerToken,
  asyncHandler(async (req, res) => {
    const { event, data, timestamp, source } = req.body;
    
    if (!event || !data) {
      throw new ValidationError('Evento e dados são obrigatórios');
    }
    
    logger.info(`Evento recebido do worker: ${event}`, {
      event,
      source,
      timestamp,
      cameraId: data.id
    });
    
    try {
      switch (event) {
        case 'camera_online':
          await handleCameraOnline(data);
          break;
          
        case 'camera_offline':
          await handleCameraOffline(data);
          break;
          
        case 'camera_added':
          await handleCameraAdded(data);
          break;
          
        case 'camera_removed':
          await handleCameraRemoved(data);
          break;
          
        case 'camera_error':
          await handleCameraError(data);
          break;
          
        default:
          logger.warn(`Evento desconhecido recebido: ${event}`);
      }
      
      res.json({
        success: true,
        message: 'Evento processado com sucesso',
        event,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`Erro ao processar evento ${event}:`, error);
      throw error;
    }
  })
);

/**
 * @route GET /api/worker/cameras
 * @desc Obter lista de câmeras para o worker
 * @access Worker only
 */
router.get('/cameras',
  validateWorkerToken,
  asyncHandler(async (req, res) => {
    const result = await Camera.findAll({
      active: true,
      limit: 100 // Buscar até 100 câmeras para o worker
    });
    
    const cameras = result.cameras || [];
    
    const camerasData = cameras.map(camera => ({
      id: camera.id,
      name: camera.name,
      rtspUrl: camera.rtsp_url,
      location: camera.location,
      enabled: camera.enabled,
      status: camera.status
    }));
    
    logger.info(`Lista de câmeras enviada para worker: ${cameras.length} câmeras`);
    
    res.json({
      success: true,
      cameras: camerasData,
      count: cameras.length,
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route POST /api/worker/camera/:id/status
 * @desc Atualizar status de uma câmera específica
 * @access Worker only
 */
router.post('/camera/:id/status',
  validateWorkerToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, testResult } = req.body;
    
    if (!status) {
      throw new ValidationError('Status é obrigatório');
    }
    
    const validStatuses = ['online', 'offline', 'error', 'maintenance'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Status deve ser um dos: ${validStatuses.join(', ')}`);
    }
    
    const camera = await Camera.findById(id);
    if (!camera) {
      throw new NotFoundError('Câmera não encontrada');
    }
    
    const previousStatus = camera.status;
    await camera.updateStatus(status);
    
    // Log da mudança de status
    if (previousStatus !== status) {
      logger.info(`Status da câmera ${camera.name} alterado de ${previousStatus} para ${status}`);
      
      // Emitir evento via Socket.IO se disponível
      const io = req.app.get('io');
      if (io) {
        io.emit('camera_status_changed', {
          cameraId: id,
          name: camera.name,
          previousStatus,
          newStatus: status,
          testResult,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Status atualizado com sucesso',
      data: {
        id: camera.id,
        name: camera.name,
        previousStatus,
        newStatus: status,
        testResult
      },
      timestamp: new Date().toISOString()
    });
  })
);

// Funções auxiliares para processar eventos
async function handleCameraOnline(data) {
  const { id, status, testResult } = data;
  
  if (!id) {
    throw new ValidationError('ID da câmera é obrigatório');
  }
  
  const camera = await Camera.findById(id);
  if (camera) {
    await camera.updateStatus('online');
    logger.info(`Câmera ${camera.name} marcada como online`);
  }
}

async function handleCameraOffline(data) {
  const { id, status, testResult } = data;
  
  if (!id) {
    throw new ValidationError('ID da câmera é obrigatório');
  }
  
  const camera = await Camera.findById(id);
  if (camera) {
    await camera.updateStatus('offline');
    logger.warn(`Câmera ${camera.name} marcada como offline`);
  }
}

async function handleCameraAdded(data) {
  const { id, name, status } = data;
  logger.info(`Worker adicionou câmera: ${name} (${id}) - Status: ${status}`);
}

async function handleCameraRemoved(data) {
  const { id } = data;
  logger.info(`Worker removeu câmera: ${id}`);
}

async function handleCameraError(data) {
  const { id, error, testResult } = data;
  
  if (!id) {
    throw new ValidationError('ID da câmera é obrigatório');
  }
  
  const camera = await Camera.findById(id);
  if (camera) {
    await camera.updateStatus('error');
    logger.error(`Erro na câmera ${camera.name}: ${error}`);
  }
}

export default router;