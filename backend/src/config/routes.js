/**
 * @deprecated Este arquivo não está sendo usado - rotas são configuradas diretamente em server.js
 * TODO: Decidir se vamos usar este arquivo ou remover completamente
 * As rotas aqui DUPLICAM as de server.js causando conflitos
 */

import { authenticateToken } from '../middleware/auth.js';
import { createModuleLogger } from './logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Importar todas as rotas
import authRoutes from '../routes/auth.js';
import userRoutes from '../routes/users.js';
import cameraRoutes from '../routes/cameras.js';
import streamRoutes from '../routes/streams.js';
import recordingRoutes from '../routes/recordings.js';
import dashboardRoutes from '../routes/dashboard.js';
import metricsRoutes from '../routes/metrics.js';
import logsRoutes from '../routes/logs.js';
import discoveryRoutes from '../routes/discovery.js';
import workerRoutes from '../routes/worker.js';
import hookRoutes from '../routes/hooks_improved.js';
import healthRoutes from '../routes/health.js';
import segmentationRoutes from '../routes/segmentation.js';
import filesRoutes from '../routes/files.js';
import reportsRoutes from '../routes/reports.js';
import srsRoutes from '../routes/srs.js';

const logger = createModuleLogger('routes');

/**
 * Configura autenticação para rotas protegidas
 */
export function setupAuthentication(app) {
  // Rotas que precisam de autenticação
  const protectedRoutes = [
    '/api/users',
    '/api/cameras',
    '/api/dashboard',
    '/api/metrics',
    '/api/logs',
    '/api/discovery',
    '/api/worker',
    '/api/segmentation',
    '/api/files',
    '/api/reports'
  ];
  
  protectedRoutes.forEach(route => {
    app.use(route, authenticateToken);
  });
  
  // Middleware especial para recordings (autenticação condicional)
  app.use('/api/recordings', (req, res, next) => {
    console.log('=== RECORDING MIDDLEWARE CALLED ===');
    logger.info('[RecordingAuth] Checking path:', req.path);
    logger.info('[RecordingAuth] Full URL:', req.url);
    logger.info('[RecordingAuth] Original URL:', req.originalUrl);
    
    if (req.path.includes('/stream') || req.path.includes('/download') || req.path.includes('/video')) {
      logger.debug('[RecordingAuth] Bypassing auth for streaming/download/video');
      return next(); // Permitir acesso direto para streaming, download e video
    } else {
      logger.debug('[RecordingAuth] Applying authenticateToken');
      return authenticateToken(req, res, next);
    }
  });
  
  logger.info('Autenticação configurada para rotas protegidas');
}

/**
 * Registra todas as rotas da API
 */
export function setupApiRoutes(app) {
  // Rotas públicas
  app.use('/api/auth', authRoutes);
  app.use('/api/srs', srsRoutes); // Callbacks do SRS (Simple Realtime Server)
  app.use('/api/webhooks', hookRoutes);
  app.use('/api/health', healthRoutes);
  
  // Rotas protegidas
  app.use('/api/users', userRoutes);
  app.use('/api/recordings', recordingRoutes); // Movido para antes de cameras para evitar conflito de rotas
  app.use('/api/cameras', cameraRoutes);
  app.use('/api/streams', streamRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/discovery', discoveryRoutes);
  app.use('/api/worker', workerRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/reports', reportsRoutes);
  
  logger.info('Rotas da API registradas com sucesso');
}

/**
 * Registra rota de segmentação (precisa ser chamada após inicialização dos serviços)
 */
export function setupSegmentationRoute(app) {
  app.use('/api/segmentation', segmentationRoutes);
  logger.info('Rota de segmentação registrada');
}

/**
 * Configura rotas estáticas
 */
export function setupStaticRoutes(app, express, cors, corsConfig) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  // Rota estática para streams
  const streamStoragePath = join(__dirname, '../../../worker/storage/streams');
  app.use('/streams', express.static(streamStoragePath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
      } else if (path.endsWith('.ts')) {
        res.set('Content-Type', 'video/mp2t');
        res.set('Cache-Control', 'public, max-age=3600');
      }
    }
  }));
  
  // Rota estática para recordings removida - usar /api/recordings/:id/video com autenticação
  
  logger.info('Rotas estáticas configuradas');
}