import express from 'express';
import { body, query } from 'express-validator';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  getLogs,
  getLogServices,
  exportLogs,
  clearOldLogs,
  createLog,
  getLogStats
} from '../controllers/logsController.js';

const router = express.Router();

// Middleware de autenticação para todas as rotas
router.use(authenticateToken);

// Validações para obter logs
const getLogsValidation = [
  query('level')
    .optional()
    .isIn(['error', 'warn', 'info', 'debug'])
    .withMessage('Nível deve ser: error, warn, info ou debug'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro positivo'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limite deve ser entre 1 e 1000'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Data de início deve estar no formato ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Data de fim deve estar no formato ISO 8601')
];

// Validações para exportar logs
const exportLogsValidation = [
  query('format')
    .optional()
    .isIn(['csv', 'json'])
    .withMessage('Formato deve ser csv ou json'),
  ...getLogsValidation.filter(validation => 
    !validation.builder.fields.includes('page') && 
    !validation.builder.fields.includes('limit')
  )
];

// Validações para criar log
const createLogValidation = [
  body('level')
    .isIn(['error', 'warn', 'info', 'debug'])
    .withMessage('Nível deve ser: error, warn, info ou debug'),
  body('message')
    .isString()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Mensagem deve ter entre 1 e 1000 caracteres'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata deve ser um objeto')
];

// Validações para limpar logs
const clearLogsValidation = [
  body('daysToKeep')
    .isInt({ min: 1, max: 365 })
    .withMessage('Dias para manter deve ser entre 1 e 365')
];

// GET /api/logs - Obter logs com filtros
router.get('/', 
  requireRole(['ADMIN', 'INTEGRATOR']),
  getLogsValidation,
  getLogs
);

// GET /api/logs/services - Obter lista de serviços
router.get('/services',
  requireRole(['ADMIN', 'INTEGRATOR']),
  getLogServices
);

// GET /api/logs/stats - Obter estatísticas dos logs
router.get('/stats',
  requireRole(['ADMIN', 'INTEGRATOR']),
  getLogStats
);

// GET /api/logs/export - Exportar logs
router.get('/export',
  requireRole(['ADMIN', 'INTEGRATOR']),
  exportLogsValidation,
  exportLogs
);

// POST /api/logs - Criar log manual
router.post('/',
  requireRole(['ADMIN']),
  createLogValidation,
  createLog
);

// POST /api/logs/clear - Limpar logs antigos
router.post('/clear',
  requireRole(['ADMIN']),
  clearLogsValidation,
  clearOldLogs
);

export default router;