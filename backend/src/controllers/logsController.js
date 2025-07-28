import LogService from '../services/LogService.js';
import { validationResult } from 'express-validator';

// Obter logs com filtros
export const getLogs = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const filters = {
      level: req.query.level,
      service: req.query.service,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    // Limitar o limite máximo para evitar sobrecarga
    if (filters.limit > 1000) {
      filters.limit = 1000;
    }

    const result = await LogService.getLogs(filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro ao obter logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Obter lista de serviços disponíveis nos logs
export const getLogServices = async (req, res) => {
  try {
    const services = await LogService.getLogServices();

    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error('Erro ao obter serviços dos logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Exportar logs
export const exportLogs = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const filters = {
      level: req.query.level,
      service: req.query.service,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search
    };

    const format = req.query.format || 'csv';
    
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de exportação inválido. Use csv ou json.'
      });
    }

    const exportData = await LogService.exportLogs(filters, format);

    const filename = `logs_${new Date().toISOString().split('T')[0]}.${format}`;
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(exportData);
  } catch (error) {
    console.error('Erro ao exportar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Limpar logs antigos
export const clearOldLogs = async (req, res) => {
  try {
    const daysToKeep = parseInt(req.body.daysToKeep) || 30;
    
    if (daysToKeep < 1 || daysToKeep > 365) {
      return res.status(400).json({
        success: false,
        message: 'Dias para manter deve estar entre 1 e 365'
      });
    }

    await LogService.clearOldLogs(daysToKeep);

    // Log da operação de limpeza
    await LogService.writeLog('info', 'Limpeza de logs executada', {
      operation: 'manual_cleanup',
      daysToKeep,
      userId: req.user?.id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: `Logs antigos removidos (mantendo últimos ${daysToKeep} dias)`
    });
  } catch (error) {
    console.error('Erro ao limpar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Criar log manual (para testes ou logs específicos)
export const createLog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { level, message, metadata = {} } = req.body;
    
    const logMetadata = {
      ...metadata,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      operation: 'manual_log'
    };

    await LogService.writeLog(level, message, logMetadata);

    res.json({
      success: true,
      message: 'Log criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar log:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Obter estatísticas dos logs
export const getLogStats = async (req, res) => {
  try {
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    
    const last7d = new Date();
    last7d.setDate(last7d.getDate() - 7);

    const [logs24h, logs7d, allServices] = await Promise.all([
      LogService.getLogs({ 
        startDate: last24h.toISOString(),
        page: 1,
        limit: 10000
      }),
      LogService.getLogs({ 
        startDate: last7d.toISOString(),
        page: 1,
        limit: 10000
      }),
      LogService.getLogServices()
    ]);

    // Contar logs por nível nas últimas 24h
    const levelCounts24h = logs24h.logs.reduce((acc, log) => {
      acc[log.level.toLowerCase()] = (acc[log.level.toLowerCase()] || 0) + 1;
      return acc;
    }, {});

    // Contar logs por serviço nas últimas 24h
    const serviceCounts24h = logs24h.logs.reduce((acc, log) => {
      acc[log.service] = (acc[log.service] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalLogs24h: logs24h.total,
        totalLogs7d: logs7d.total,
        levelCounts24h,
        serviceCounts24h,
        totalServices: allServices.length,
        services: allServices
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas dos logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};