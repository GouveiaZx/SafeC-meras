/**
 * Serviço de Notificações para o sistema NewCAM
 * Gerencia alertas críticos e notificações do sistema de gravação contínua
 */

import EmailService from './EmailService.js';
import { logger } from '../config/logger.js';
import { supabase } from '../config/database.js';
import { redisClient } from '../config/redis.js';

class NotificationService {
  constructor() {
    this.alertTypes = {
      RECORDING_FAILURE: 'Falha na Gravação',
      CAMERA_OFFLINE: 'Câmera Offline',
      DISK_SPACE_LOW: 'Espaço em Disco Baixo',
      DISK_SPACE_CRITICAL: 'Espaço em Disco Crítico',
      STREAM_INTERRUPTED: 'Stream Interrompido',
      SYSTEM_ERROR: 'Erro do Sistema',
      RETENTION_CLEANUP_FAILED: 'Falha na Limpeza de Retenção',
      UPLOAD_FAILED: 'Falha no Upload',
      DATABASE_ERROR: 'Erro no Banco de Dados',
      REDIS_ERROR: 'Erro no Redis'
    };
    
    this.alertLevels = {
      INFO: 'info',
      WARNING: 'warning',
      ERROR: 'error',
      CRITICAL: 'critical'
    };
    
    // Cache para evitar spam de notificações
    this.notificationCache = new Map();
    this.cacheTTL = 300000; // 5 minutos
  }

  /**
   * Enviar alerta crítico
   */
  async sendCriticalAlert(alertType, message, details = {}) {
    try {
      const alertKey = this.generateAlertKey(alertType, details);
      
      // Verificar se já foi enviado recentemente (anti-spam)
      if (await this.isAlertRecentlySent(alertKey)) {
        logger.debug(`Alerta ${alertType} ignorado - enviado recentemente`);
        return { success: true, skipped: true, reason: 'Recently sent' };
      }
      
      // Obter usuários que devem receber alertas críticos
      const recipients = await this.getCriticalAlertRecipients();
      
      if (recipients.length === 0) {
        logger.warn('Nenhum destinatário configurado para alertas críticos');
        return { success: false, error: 'No recipients configured' };
      }
      
      // Registrar alerta no banco de dados
      const alertId = await this.logAlert(alertType, message, details, this.alertLevels.CRITICAL);
      
      // Enviar e-mails
      const emailResults = [];
      for (const recipient of recipients) {
        const result = await this.sendAlertEmail(
          recipient.email,
          alertType,
          message,
          details,
          this.alertLevels.CRITICAL
        );
        emailResults.push({ email: recipient.email, ...result });
      }
      
      // Marcar como enviado no cache
      await this.markAlertAsSent(alertKey);
      
      logger.info(`Alerta crítico ${alertType} enviado para ${recipients.length} destinatários`);
      
      return {
        success: true,
        alertId,
        recipients: recipients.length,
        emailResults
      };
      
    } catch (error) {
      logger.error('Erro ao enviar alerta crítico:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar alerta de espaço em disco
   */
  static async sendDiskSpaceAlert(diskInfo, level = 'warning') {
    const instance = new NotificationService();
    
    const freePercentage = ((diskInfo.free / diskInfo.total) * 100).toFixed(1);
    const freeGB = (diskInfo.free / (1024 * 1024 * 1024)).toFixed(2);
    
    const alertType = level === 'critical' 
      ? instance.alertTypes.DISK_SPACE_CRITICAL 
      : instance.alertTypes.DISK_SPACE_LOW;
    
    const message = level === 'critical'
      ? `Espaço em disco criticamente baixo: ${freePercentage}% livre`
      : `Espaço em disco baixo: ${freePercentage}% livre`;
    
    const details = {
      free_space: diskInfo.free,
      total_space: diskInfo.total,
      used_space: diskInfo.used,
      free_percentage: parseFloat(freePercentage),
      path: diskInfo.path || '/recordings',
      timestamp: new Date().toISOString()
    };
    
    return await instance.sendCriticalAlert(alertType, level, message, details);
  }

  /**
   * Enviar alerta de câmera offline
   */
  static async sendCameraOfflineAlert(cameraId, cameraName, lastSeen) {
    const instance = new NotificationService();
    
    const lastSeenDate = new Date(lastSeen);
    const offlineMinutes = Math.floor((Date.now() - lastSeenDate.getTime()) / (1000 * 60));
    
    const message = `Câmera ${cameraName || cameraId} está offline há ${offlineMinutes} minutos`;
    const details = {
      camera_id: cameraId,
      camera_name: cameraName,
      last_seen: lastSeen,
      offline_minutes: offlineMinutes,
      timestamp: new Date().toISOString()
    };
    
    const level = offlineMinutes >= 15 ? 'critical' : 'warning';
    
    return await instance.sendCriticalAlert(
      instance.alertTypes.CAMERA_OFFLINE,
      level,
      message,
      details
    );
  }

  /**
   * Enviar alerta de falha de gravação
   */
  static async sendRecordingFailureAlert(cameraId, cameraName, failureDetails) {
    const instance = new NotificationService();
    
    const message = `Falha na gravação da câmera ${cameraName || cameraId}: ${failureDetails}`;
    const details = {
      camera_id: cameraId,
      camera_name: cameraName,
      failure_details: failureDetails,
      timestamp: new Date().toISOString()
    };
    
    return await instance.sendCriticalAlert(
      instance.alertTypes.RECORDING_FAILURE,
      'critical',
      message,
      details
    );
  }

  /**
   * Enviar alerta de stream interrompido
   */
  static async sendStreamInterruptedAlert(cameraId, cameraName, interruptionMinutes) {
    const instance = new NotificationService();
    
    const message = `Stream da câmera ${cameraName || cameraId} interrompido há ${interruptionMinutes} minutos`;
    const details = {
      camera_id: cameraId,
      camera_name: cameraName,
      interruption_minutes: interruptionMinutes,
      timestamp: new Date().toISOString()
    };
    
    return await instance.sendCriticalAlert(
      instance.alertTypes.STREAM_INTERRUPTED,
      'warning',
      message,
      details
    );
  }

  /**
   * Enviar alerta de erro do sistema
   */
  static async sendSystemErrorAlert(component, errorMessage, extraDetails = {}) {
    const instance = new NotificationService();
    
    const message = `Erro no componente ${component}: ${errorMessage}`;
    const details = {
      component,
      error_message: errorMessage,
      ...extraDetails,
      timestamp: new Date().toISOString()
    };
    
    return await instance.sendCriticalAlert(
      instance.alertTypes.SYSTEM_ERROR,
      'error',
      message,
      details
    );
  }

  /**
   * Calcular duração offline
   */
  calculateOfflineDuration(lastSeen) {
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - lastSeenDate;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutos`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}h ${minutes}m`;
    } else {
      const days = Math.floor(diffMinutes / 1440);
      const hours = Math.floor((diffMinutes % 1440) / 60);
      return `${days}d ${hours}h`;
    }
  }

  /**
   * Enviar alerta de câmera offline
   */
  async sendCameraOfflineAlert(cameraId, cameraName, lastSeen) {
    const message = `Câmera ${cameraName || cameraId} está offline`;
    const details = {
      camera_id: cameraId,
      camera_name: cameraName,
      last_seen: lastSeen,
      offline_duration: this.calculateOfflineDuration(lastSeen),
      timestamp: new Date().toISOString()
    };
    
    return await this.sendCriticalAlert(
      this.alertTypes.CAMERA_OFFLINE,
      message,
      details
    );
  }

  /**
   * Enviar alerta de espaço em disco baixo
   */
  async sendDiskSpaceAlert(diskInfo, level = 'warning') {
    const freePercentage = (diskInfo.free / diskInfo.total) * 100;
    const alertType = level === 'critical' 
      ? this.alertTypes.DISK_SPACE_CRITICAL 
      : this.alertTypes.DISK_SPACE_LOW;
    
    const message = level === 'critical'
      ? `Espaço em disco criticamente baixo: ${freePercentage.toFixed(1)}% livre`
      : `Espaço em disco baixo: ${freePercentage.toFixed(1)}% livre`;
    
    const details = {
      free_space: diskInfo.free,
      total_space: diskInfo.total,
      used_space: diskInfo.used,
      free_percentage: freePercentage,
      path: diskInfo.path || '/recordings',
      timestamp: new Date().toISOString()
    };
    
    return await this.sendCriticalAlert(alertType, message, details);
  }

  /**
   * Enviar alerta de stream interrompido
   */
  async sendStreamInterruptedAlert(cameraId, cameraName, duration) {
    const message = `Stream da câmera ${cameraName || cameraId} interrompido há ${duration} minutos`;
    const details = {
      camera_id: cameraId,
      camera_name: cameraName,
      interruption_duration: duration,
      timestamp: new Date().toISOString()
    };
    
    return await this.sendCriticalAlert(
      this.alertTypes.STREAM_INTERRUPTED,
      message,
      details
    );
  }

  /**
   * Enviar alerta de erro do sistema
   */
  async sendSystemErrorAlert(component, error, details = {}) {
    const message = `Erro no componente ${component}: ${error}`;
    const alertDetails = {
      component,
      error_message: error,
      ...details,
      timestamp: new Date().toISOString()
    };
    
    return await this.sendCriticalAlert(
      this.alertTypes.SYSTEM_ERROR,
      message,
      alertDetails
    );
  }

  /**
   * Obter destinatários de alertas críticos
   */
  async getCriticalAlertRecipients() {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('email, name, notification_preferences')
        .eq('active', true)
        .or('role.eq.admin,notification_preferences->>critical_alerts.eq.true');
      
      if (error) {
        throw error;
      }
      
      return users || [];
      
    } catch (error) {
      logger.error('Erro ao obter destinatários de alertas:', error);
      
      // Fallback para variável de ambiente
      const fallbackEmail = process.env.ADMIN_EMAIL;
      if (fallbackEmail) {
        return [{ email: fallbackEmail, name: 'Admin' }];
      }
      
      return [];
    }
  }

  /**
   * Registrar alerta no banco de dados
   */
  async logAlert(alertType, message, details, level) {
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .insert({
          alert_type: alertType,
          message,
          details,
          level,
          status: 'sent',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      
      if (error) {
        throw error;
      }
      
      return data.id;
      
    } catch (error) {
      logger.error('Erro ao registrar alerta no banco:', error);
      return null;
    }
  }

  /**
   * Enviar e-mail de alerta
   */
  async sendAlertEmail(email, alertType, message, details, level) {
    try {
      const subject = `[${level.toUpperCase()}] NewCAM - ${alertType}`;
      const htmlContent = this.getAlertEmailTemplate(alertType, message, details, level);
      
      return await EmailService.sendEmail(email, subject, htmlContent);
      
    } catch (error) {
      logger.error('Erro ao enviar e-mail de alerta:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Template de e-mail de alerta
   */
  getAlertEmailTemplate(alertType, message, details, level) {
    const levelColors = {
      info: '#3b82f6',
      warning: '#f59e0b',
      error: '#ef4444',
      critical: '#dc2626'
    };
    
    const levelEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    
    const color = levelColors[level] || '#6b7280';
    const emoji = levelEmojis[level] || '📢';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Alerta NewCAM</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
          .alert-box { background: white; padding: 15px; border-left: 4px solid ${color}; margin: 15px 0; }
          .details { background: #f3f4f6; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .details-title { font-weight: bold; margin-bottom: 10px; }
          .detail-item { margin: 5px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .timestamp { color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${emoji} Alerta NewCAM</h1>
            <p>Nível: ${level.toUpperCase()}</p>
          </div>
          <div class="content">
            <div class="alert-box">
              <h2>${alertType}</h2>
              <p><strong>Mensagem:</strong> ${message}</p>
              <p class="timestamp"><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>
            
            ${this.renderAlertDetails(details)}
            
            <div class="details">
              <div class="details-title">Ações Recomendadas:</div>
              ${this.getRecommendedActions(alertType)}
            </div>
          </div>
          <div class="footer">
            <p>© 2024 NewCAM. Sistema de Monitoramento de Câmeras.</p>
            <p>Este é um alerta automático. Não responda a este e-mail.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Renderizar detalhes do alerta
   */
  renderAlertDetails(details) {
    if (!details || Object.keys(details).length === 0) {
      return '';
    }
    
    let html = '<div class="details"><div class="details-title">Detalhes:</div>';
    
    for (const [key, value] of Object.entries(details)) {
      if (key !== 'timestamp') {
        const label = this.formatDetailLabel(key);
        const formattedValue = this.formatDetailValue(key, value);
        html += `<div class="detail-item"><strong>${label}:</strong> ${formattedValue}</div>`;
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Formatar label do detalhe
   */
  formatDetailLabel(key) {
    const labels = {
      camera_id: 'ID da Câmera',
      camera_name: 'Nome da Câmera',
      error_message: 'Erro',
      last_seen: 'Última Visualização',
      offline_duration: 'Tempo Offline',
      free_space: 'Espaço Livre',
      total_space: 'Espaço Total',
      free_percentage: 'Percentual Livre',
      interruption_duration: 'Duração da Interrupção',
      component: 'Componente',
      path: 'Caminho'
    };
    
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Formatar valor do detalhe
   */
  formatDetailValue(key, value) {
    if (key.includes('space') && typeof value === 'number') {
      return this.formatBytes(value);
    }
    
    if (key.includes('percentage') && typeof value === 'number') {
      return `${value.toFixed(1)}%`;
    }
    
    if (key.includes('duration') && typeof value === 'number') {
      return `${value} minutos`;
    }
    
    if (key.includes('time') || key.includes('seen')) {
      return new Date(value).toLocaleString('pt-BR');
    }
    
    return value;
  }

  /**
   * Obter ações recomendadas por tipo de alerta
   */
  getRecommendedActions(alertType) {
    const actions = {
      [this.alertTypes.RECORDING_FAILURE]: [
        'Verificar conectividade da câmera',
        'Verificar espaço em disco',
        'Reiniciar serviço de gravação',
        'Verificar logs do sistema'
      ],
      [this.alertTypes.CAMERA_OFFLINE]: [
        'Verificar conexão de rede da câmera',
        'Verificar alimentação da câmera',
        'Testar conectividade RTSP',
        'Verificar configurações de rede'
      ],
      [this.alertTypes.DISK_SPACE_LOW]: [
        'Executar limpeza de arquivos antigos',
        'Verificar configurações de retenção',
        'Considerar aumentar espaço de armazenamento'
      ],
      [this.alertTypes.DISK_SPACE_CRITICAL]: [
        'URGENTE: Liberar espaço em disco imediatamente',
        'Parar gravações temporariamente se necessário',
        'Executar limpeza de emergência',
        'Verificar sistema de retenção'
      ],
      [this.alertTypes.STREAM_INTERRUPTED]: [
        'Verificar conectividade da câmera',
        'Reiniciar stream da câmera',
        'Verificar configurações do ZLMediaKit',
        'Verificar logs de streaming'
      ]
    };
    
    const actionList = actions[alertType] || ['Verificar logs do sistema', 'Contatar suporte técnico'];
    
    return actionList.map(action => `<div class="detail-item">• ${action}</div>`).join('');
  }

  /**
   * Gerar chave única para o alerta
   */
  generateAlertKey(alertType, details) {
    const keyParts = [alertType];
    
    if (details.camera_id) {
      keyParts.push(details.camera_id);
    }
    
    if (details.component) {
      keyParts.push(details.component);
    }
    
    return keyParts.join(':');
  }

  /**
   * Verificar se alerta foi enviado recentemente
   */
  async isAlertRecentlySent(alertKey) {
    try {
      const cacheKey = `alert:sent:${alertKey}`;
      const exists = await redisClient.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error('Erro ao verificar cache de alertas:', error);
      return false;
    }
  }

  /**
   * Marcar alerta como enviado
   */
  async markAlertAsSent(alertKey) {
    try {
      const cacheKey = `alert:sent:${alertKey}`;
      await redisClient.setex(cacheKey, Math.floor(this.cacheTTL / 1000), '1');
    } catch (error) {
      logger.error('Erro ao marcar alerta como enviado:', error);
    }
  }

  /**
   * Calcular duração offline
   */
  calculateOfflineDuration(lastSeen) {
    if (!lastSeen) return 'Desconhecido';
    
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now - lastSeenDate;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutos`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours} horas`;
    } else {
      const days = Math.floor(diffMinutes / 1440);
      return `${days} dias`;
    }
  }

  /**
   * Formatar bytes em formato legível
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Obter estatísticas de alertas
   */
  async getAlertStatistics(timeframe = '24h') {
    try {
      const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 1;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const { data: alerts, error } = await supabase
        .from('system_alerts')
        .select('alert_type, level, created_at')
        .gte('created_at', since.toISOString());
      
      if (error) {
        throw error;
      }
      
      const stats = {
        total: alerts.length,
        by_level: {},
        by_type: {},
        recent: alerts.slice(-10)
      };
      
      alerts.forEach(alert => {
        stats.by_level[alert.level] = (stats.by_level[alert.level] || 0) + 1;
        stats.by_type[alert.alert_type] = (stats.by_type[alert.alert_type] || 0) + 1;
      });
      
      return stats;
      
    } catch (error) {
      logger.error('Erro ao obter estatísticas de alertas:', error);
      return null;
    }
  }
}

export default new NotificationService();