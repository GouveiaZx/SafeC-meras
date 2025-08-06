/**
 * Rotas para gerenciamento de alertas e monitoramento
 * Sistema NewCAM - Gravação Contínua
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import AlertMonitoringService from '../services/AlertMonitoringService.js';
import NotificationService from '../services/NotificationService.js';
import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';

const router = express.Router();

/**
 * @route GET /api/alerts/status
 * @desc Obter status do monitoramento de alertas
 * @access Admin/Operator
 */
router.get('/status', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const status = AlertMonitoringService.getMonitoringStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Erro ao obter status de monitoramento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/alerts/start
 * @desc Iniciar monitoramento de alertas
 * @access Admin
 */
router.post('/start', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await AlertMonitoringService.startMonitoring();
    
    logger.info(`Monitoramento de alertas iniciado por usuário ${req.user.id}`);
    
    res.json({
      success: true,
      message: 'Monitoramento de alertas iniciado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao iniciar monitoramento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/alerts/stop
 * @desc Parar monitoramento de alertas
 * @access Admin
 */
router.post('/stop', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    AlertMonitoringService.stopMonitoring();
    
    logger.info(`Monitoramento de alertas parado por usuário ${req.user.id}`);
    
    res.json({
      success: true,
      message: 'Monitoramento de alertas parado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao parar monitoramento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/alerts/thresholds
 * @desc Obter configurações de thresholds
 * @access Admin/Operator
 */
router.get('/thresholds', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const status = AlertMonitoringService.getMonitoringStatus();
    
    res.json({
      success: true,
      data: status.thresholds
    });
  } catch (error) {
    logger.error('Erro ao obter thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route PUT /api/alerts/thresholds
 * @desc Atualizar configurações de thresholds
 * @access Admin
 */
router.put('/thresholds', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { thresholds } = req.body;
    
    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Thresholds inválidos'
      });
    }
    
    // Validar estrutura dos thresholds
    const validKeys = ['diskSpace', 'cameraOffline', 'recordingFailure', 'streamInterruption'];
    const invalidKeys = Object.keys(thresholds).filter(key => !validKeys.includes(key));
    
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Chaves inválidas nos thresholds: ${invalidKeys.join(', ')}`
      });
    }
    
    AlertMonitoringService.updateThresholds(thresholds);
    
    logger.info(`Thresholds atualizados por usuário ${req.user.id}:`, thresholds);
    
    res.json({
      success: true,
      message: 'Thresholds atualizados com sucesso',
      data: AlertMonitoringService.getMonitoringStatus().thresholds
    });
  } catch (error) {
    logger.error('Erro ao atualizar thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/alerts/history
 * @desc Obter histórico de alertas
 * @access Admin/Operator
 */
router.get('/history', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      type, 
      level, 
      start_date, 
      end_date 
    } = req.query;
    
    let query = supabase
      .from('alert_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    // Filtros opcionais
    if (type) {
      query = query.eq('alert_type', type);
    }
    
    if (level) {
      query = query.eq('level', level);
    }
    
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    
    if (end_date) {
      query = query.lte('created_at', end_date);
    }
    
    const { data: alerts, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: {
        alerts: alerts || [],
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: (parseInt(offset) + parseInt(limit)) < count
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter histórico de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/alerts/recipients
 * @desc Obter destinatários de alertas
 * @access Admin/Operator
 */
router.get('/recipients', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const { data: recipients, error } = await supabase
      .from('alert_recipients')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: recipients || []
    });
  } catch (error) {
    logger.error('Erro ao obter destinatários:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/alerts/recipients
 * @desc Adicionar destinatário de alertas
 * @access Admin
 */
router.post('/recipients', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { email, name, alert_types, levels } = req.body;
    
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email e nome são obrigatórios'
      });
    }
    
    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Email inválido'
      });
    }
    
    const { data: recipient, error } = await supabase
      .from('alert_recipients')
      .insert({
        email,
        name,
        alert_types: alert_types || ['all'],
        levels: levels || ['warning', 'critical', 'error'],
        active: true,
        created_by: req.user.id
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          success: false,
          error: 'Email já cadastrado'
        });
      }
      throw error;
    }
    
    logger.info(`Destinatário de alerta adicionado por usuário ${req.user.id}: ${email}`);
    
    res.status(201).json({
      success: true,
      message: 'Destinatário adicionado com sucesso',
      data: recipient
    });
  } catch (error) {
    logger.error('Erro ao adicionar destinatário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route PUT /api/alerts/recipients/:id
 * @desc Atualizar destinatário de alertas
 * @access Admin
 */
router.put('/recipients/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, alert_types, levels, active } = req.body;
    
    const updateData = {};
    
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Email inválido'
        });
      }
      updateData.email = email;
    }
    
    if (name !== undefined) updateData.name = name;
    if (alert_types !== undefined) updateData.alert_types = alert_types;
    if (levels !== undefined) updateData.levels = levels;
    if (active !== undefined) updateData.active = active;
    
    updateData.updated_at = new Date().toISOString();
    
    const { data: recipient, error } = await supabase
      .from('alert_recipients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Destinatário não encontrado'
        });
      }
      throw error;
    }
    
    logger.info(`Destinatário de alerta atualizado por usuário ${req.user.id}: ${id}`);
    
    res.json({
      success: true,
      message: 'Destinatário atualizado com sucesso',
      data: recipient
    });
  } catch (error) {
    logger.error('Erro ao atualizar destinatário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route DELETE /api/alerts/recipients/:id
 * @desc Remover destinatário de alertas
 * @access Admin
 */
router.delete('/recipients/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('alert_recipients')
      .delete()
      .eq('id', id);
    
    if (error) {
      throw error;
    }
    
    logger.info(`Destinatário de alerta removido por usuário ${req.user.id}: ${id}`);
    
    res.json({
      success: true,
      message: 'Destinatário removido com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao remover destinatário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/alerts/test
 * @desc Enviar alerta de teste
 * @access Admin
 */
router.post('/test', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { type = 'system_error', level = 'warning', message = 'Teste de alerta do sistema NewCAM' } = req.body;
    
    const testDetails = {
      test: true,
      triggered_by: req.user.id,
      triggered_at: new Date().toISOString(),
      message
    };
    
    // Enviar alerta de teste usando o NotificationService
    const instance = new NotificationService();
    const result = await instance.sendCriticalAlert(type, level, message, testDetails);
    
    if (result) {
      logger.info(`Alerta de teste enviado por usuário ${req.user.id}`);
      
      res.json({
        success: true,
        message: 'Alerta de teste enviado com sucesso'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Falha ao enviar alerta de teste (verifique configurações de email)'
      });
    }
  } catch (error) {
    logger.error('Erro ao enviar alerta de teste:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/alerts/metrics
 * @desc Obter métricas de alertas
 * @access Admin/Operator
 */
router.get('/metrics', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calcular data de início baseada no período
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Obter alertas do período
    const { data: alerts, error } = await supabase
      .from('alert_logs')
      .select('alert_type, level, created_at')
      .gte('created_at', startDate.toISOString());
    
    if (error) {
      throw error;
    }
    
    // Processar métricas
    const metrics = {
      total: alerts?.length || 0,
      by_level: {},
      by_type: {},
      timeline: []
    };
    
    // Agrupar por nível e tipo
    for (const alert of alerts || []) {
      metrics.by_level[alert.level] = (metrics.by_level[alert.level] || 0) + 1;
      metrics.by_type[alert.alert_type] = (metrics.by_type[alert.alert_type] || 0) + 1;
    }
    
    res.json({
      success: true,
      data: {
        period,
        start_date: startDate.toISOString(),
        end_date: now.toISOString(),
        metrics
      }
    });
  } catch (error) {
    logger.error('Erro ao obter métricas de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

export default router;