/**
 * Rotas de monitoramento e status do sistema NewCAM
 * Fornece informações sobre saúde dos serviços e métricas
 */

import express from 'express';
import axios from 'axios';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { createModuleLogger } from '../config/logger.js';
import { supabase } from '../config/database.js';
import streamingService from '../services/StreamingService.js';

const router = express.Router();
const logger = createModuleLogger('Monitoring');

/**
 * @route GET /api/monitoring/system
 * @desc Obter status geral do sistema
 * @access Private
 */
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const systemStatus = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {},
      metrics: {},
      alerts: []
    };

    // 1. Status dos serviços principais
    logger.info('Verificando status dos serviços...');
    
    // Backend Health
    systemStatus.services.backend = {
      status: 'online',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };

    // Database (Supabase)
    try {
      const { data, error } = await supabase
        .from('cameras')
        .select('id', { count: 'exact', head: true });
      
      systemStatus.services.database = {
        status: error ? 'error' : 'online',
        connection: !error,
        error: error?.message
      };
    } catch (dbError) {
      systemStatus.services.database = {
        status: 'error',
        connection: false,
        error: dbError.message
      };
    }

    // ZLMediaKit
    try {
      const zlmResponse = await axios.post('http://localhost:8000/index/api/getServerConfig', {
        secret: process.env.ZLM_SECRET
      }, { timeout: 5000 });
      
      systemStatus.services.zlmediakit = {
        status: zlmResponse.data.code === 0 ? 'online' : 'error',
        response: zlmResponse.data.code === 0
      };
    } catch (zlmError) {
      systemStatus.services.zlmediakit = {
        status: 'offline',
        response: false,
        error: 'Não foi possível conectar'
      };
    }

    // SRS (fallback)
    try {
      const srsResponse = await axios.get('http://localhost:1985/api/v1/summaries', { 
        timeout: 5000 
      });
      
      systemStatus.services.srs = {
        status: srsResponse.status === 200 ? 'online' : 'error',
        response: srsResponse.status === 200
      };
    } catch (srsError) {
      systemStatus.services.srs = {
        status: 'offline',
        response: false,
        error: 'Não foi possível conectar'
      };
    }

    // Redis
    systemStatus.services.redis = {
      status: 'unknown', // TODO: Implementar verificação Redis
      response: false
    };

    // 2. Métricas das câmeras
    try {
      const { data: cameras, error: cameraError } = await supabase
        .from('cameras')
        .select('status, is_streaming, active');

      if (!cameraError && cameras) {
        systemStatus.metrics.cameras = {
          total: cameras.length,
          active: cameras.filter(c => c.active).length,
          online: cameras.filter(c => c.status === 'online').length,
          offline: cameras.filter(c => c.status === 'offline').length,
          streaming: cameras.filter(c => c.is_streaming).length
        };
      }
    } catch (error) {
      logger.error('Erro ao obter métricas de câmeras:', error);
      systemStatus.metrics.cameras = { error: error.message };
    }

    // 3. Métricas de gravações (últimas 24h)
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: recordings, error: recordError } = await supabase
        .from('recordings')
        .select('status, file_size')
        .gte('created_at', last24h);

      if (!recordError && recordings) {
        systemStatus.metrics.recordings = {
          last24h: recordings.length,
          totalSize: recordings.reduce((sum, r) => sum + (r.file_size || 0), 0),
          byStatus: {
            recording: recordings.filter(r => r.status === 'recording').length,
            completed: recordings.filter(r => r.status === 'completed').length,
            uploaded: recordings.filter(r => r.status === 'uploaded').length,
            error: recordings.filter(r => r.status === 'error').length
          }
        };
      }
    } catch (error) {
      logger.error('Erro ao obter métricas de gravações:', error);
      systemStatus.metrics.recordings = { error: error.message };
    }

    // 4. Alertas baseados no status
    const alerts = [];

    // Verificar serviços offline
    Object.entries(systemStatus.services).forEach(([service, info]) => {
      if (info.status === 'offline' || info.status === 'error') {
        alerts.push({
          level: service === 'zlmediakit' ? 'warning' : 'error',
          service,
          message: `Serviço ${service} está ${info.status}`,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Verificar uso de memória
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.rss / 1024 / 1024;
    if (memoryUsageMB > 512) { // Mais de 512MB
      alerts.push({
        level: 'warning',
        service: 'backend',
        message: `Alto uso de memória: ${memoryUsageMB.toFixed(2)}MB`,
        timestamp: new Date().toISOString()
      });
    }

    systemStatus.alerts = alerts;
    systemStatus.health = alerts.some(a => a.level === 'error') ? 'unhealthy' : 
                          alerts.some(a => a.level === 'warning') ? 'degraded' : 'healthy';

    res.json({
      success: true,
      data: systemStatus
    });

  } catch (error) {
    logger.error('Erro ao obter status do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/monitoring/services
 * @desc Status detalhado dos serviços
 * @access Private
 */
router.get('/services', authenticateToken, async (req, res) => {
  try {
    const services = [];

    // Verificar cada serviço com mais detalhes
    const serviceChecks = [
      {
        name: 'ZLMediaKit',
        url: 'http://localhost:8000/index/api/getServerConfig',
        method: 'POST',
        data: { secret: process.env.ZLM_SECRET },
        port: 8000
      },
      {
        name: 'SRS',
        url: 'http://localhost:1985/api/v1/summaries',
        method: 'GET',
        port: 1985
      },
      {
        name: 'PostgreSQL',
        url: null, // Verificado via Supabase
        port: 5432
      },
      {
        name: 'Redis',
        url: null, // TODO: Implementar
        port: 6379
      }
    ];

    for (const service of serviceChecks) {
      const serviceStatus = {
        name: service.name,
        port: service.port,
        status: 'unknown',
        responseTime: null,
        lastCheck: new Date().toISOString(),
        details: {}
      };

      if (service.url) {
        const startTime = Date.now();
        try {
          const response = service.method === 'POST' 
            ? await axios.post(service.url, service.data, { timeout: 5000 })
            : await axios.get(service.url, { timeout: 5000 });
          
          serviceStatus.status = 'online';
          serviceStatus.responseTime = Date.now() - startTime;
          serviceStatus.details = {
            httpStatus: response.status,
            dataReceived: !!response.data
          };
        } catch (error) {
          serviceStatus.status = 'offline';
          serviceStatus.responseTime = Date.now() - startTime;
          serviceStatus.details = {
            error: error.message,
            code: error.code
          };
        }
      } else if (service.name === 'PostgreSQL') {
        // Teste específico para Supabase
        const startTime = Date.now();
        try {
          await supabase.from('cameras').select('id', { head: true, count: 'exact' });
          serviceStatus.status = 'online';
          serviceStatus.responseTime = Date.now() - startTime;
        } catch (error) {
          serviceStatus.status = 'offline';
          serviceStatus.responseTime = Date.now() - startTime;
          serviceStatus.details = { error: error.message };
        }
      }

      services.push(serviceStatus);
    }

    res.json({
      success: true,
      data: {
        services,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Erro ao verificar serviços:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;