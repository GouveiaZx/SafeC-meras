/**
 * Rotas principais da API NewCAM
 * Importa e organiza todas as rotas do sistema
 */
import express from 'express';
import cameraRoutes from './cameras.js';
import userRoutes from './users.js';
import recordingRoutes from './recordings.js';
import reportRoutes from './reports.js';
import fileRoutes from './files.js';
import logRoutes from './logs.js';
import metricsRoutes from './metrics.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Rotas da API
 */
router.use('/cameras', cameraRoutes);
router.use('/users', userRoutes);
router.use('/recordings', recordingRoutes);
router.use('/reports', reportRoutes);
router.use('/files', fileRoutes);
router.use('/logs', logRoutes);
router.use('/metrics', metricsRoutes);

export default router;