/**
 * Rotas de Métricas do Sistema NewCAM
 * Define os endpoints para monitoramento e métricas
 */

import express from 'express';
import {
  getAllMetrics,
  getMetricsByCategory,
  getMetricsHistory,
  getAlerts,
  startMetricsCollection,
  stopMetricsCollection,
  forceMetricsCollection,
  getMetricsStatus
} from '../controllers/metricsController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';

const router = express.Router();

// Middleware de autenticação para todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: Obtém todas as métricas do sistema
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas obtidas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     system:
 *                       type: object
 *                     cameras:
 *                       type: object
 *                     recordings:
 *                       type: object
 *                     storage:
 *                       type: object
 *                     network:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *                     isCollecting:
 *                       type: boolean
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', getAllMetrics);

/**
 * @swagger
 * /api/metrics/{category}:
 *   get:
 *     summary: Obtém métricas por categoria
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [system, cameras, recordings, storage, network]
 *         description: Categoria das métricas
 *     responses:
 *       200:
 *         description: Métricas da categoria obtidas com sucesso
 *       400:
 *         description: Categoria inválida
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:category', getMetricsByCategory);

/**
 * @swagger
 * /api/metrics/{category}/history:
 *   get:
 *     summary: Obtém histórico de métricas por categoria
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [system, cameras, recordings, storage, network]
 *         description: Categoria das métricas
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [15m, 1h, 6h, 24h, 7d, 30d]
 *           default: 1h
 *         description: Intervalo de tempo para o histórico
 *     responses:
 *       200:
 *         description: Histórico de métricas obtido com sucesso
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:category/history', getMetricsHistory);

/**
 * @swagger
 * /api/metrics/alerts:
 *   get:
 *     summary: Obtém alertas do sistema
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alertas obtidos com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [info, warning, error]
 *                           category:
 *                             type: string
 *                           metric:
 *                             type: string
 *                           value:
 *                             type: number
 *                           threshold:
 *                             type: number
 *                           message:
 *                             type: string
 *                     count:
 *                       type: number
 *                     hasWarnings:
 *                       type: boolean
 *                     hasErrors:
 *                       type: boolean
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/system/alerts', getAlerts);

/**
 * @swagger
 * /api/metrics/collection/start:
 *   post:
 *     summary: Inicia a coleta de métricas
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interval:
 *                 type: number
 *                 minimum: 1000
 *                 maximum: 60000
 *                 default: 5000
 *                 description: Intervalo de coleta em milissegundos
 *     responses:
 *       200:
 *         description: Coleta de métricas iniciada
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Token inválido
 *       403:
 *         description: Permissão insuficiente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/collection/start', requireRole(['ADMIN']), startMetricsCollection);

/**
 * @swagger
 * /api/metrics/collection/stop:
 *   post:
 *     summary: Para a coleta de métricas
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coleta de métricas parada
 *       401:
 *         description: Token inválido
 *       403:
 *         description: Permissão insuficiente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/collection/stop', requireRole(['ADMIN']), stopMetricsCollection);

/**
 * @swagger
 * /api/metrics/collection/force:
 *   post:
 *     summary: Força a coleta imediata de métricas
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas coletadas com sucesso
 *       401:
 *         description: Token inválido
 *       403:
 *         description: Permissão insuficiente
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/collection/force', requireRole(['ADMIN', 'INTEGRATOR']), forceMetricsCollection);

/**
 * @swagger
 * /api/metrics/collection/status:
 *   get:
 *     summary: Obtém status da coleta de métricas
 *     tags: [Métricas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status da coleta obtido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isCollecting:
 *                       type: boolean
 *                     lastUpdate:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     memoryUsage:
 *                       type: object
 *       401:
 *         description: Token inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/collection/status', getMetricsStatus);

export default router;