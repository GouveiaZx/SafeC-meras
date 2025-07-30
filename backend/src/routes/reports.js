/**
 * Rotas de Relatórios - Geração de relatórios e dashboards
 */
import express from 'express';
import reportController from '../controllers/reportController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @route   GET /api/reports/dashboard
 * @desc    Dashboard geral do sistema
 * @access  Admin, Operator
 */
router.get('/dashboard', authorize(['admin', 'operator']), reportController.getDashboard);

/**
 * @route   GET /api/reports/activity
 * @desc    Relatório de atividades por período
 * @access  Admin, Operator
 */
router.get('/activity', authorize(['admin', 'operator']), reportController.getActivityReport);

/**
 * @route   GET /api/reports/camera-usage
 * @desc    Relatório de uso de câmeras
 * @access  Admin, Operator
 */
router.get('/camera-usage', authorize(['admin', 'operator']), reportController.getCameraUsageReport);

/**
 * @route   GET /api/reports/export
 * @desc    Exportar relatório em CSV
 * @access  Admin, Operator
 */
router.get('/export', authorize(['admin', 'operator']), reportController.exportReport);

export default router;