/**
 * Serviço de Alertas do Sistema NewCAM
 * Monitora o sistema e envia alertas em tempo real
 */

import EventEmitter from 'events';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/email.js';
import { sendWebhook } from '../utils/webhook.js';

class AlertService extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.alertThresholds = {
      cameraOfflineTime: 5 * 60 * 1000, // 5 minutos
      recordingFailureCount: 3,
      uploadFailureCount: 5,
      diskSpaceThreshold: 85, // 85%
      memoryThreshold: 90, // 90%
    };
    this.alertCooldown = 15 * 60 * 1000; // 15 minutos cooldown
    this.isEnabled = process.env.ALERTS_ENABLED === 'true';
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Escuta eventos do sistema
    this.on('camera.offline', this.handleCameraOffline.bind(this));
    this.on('camera.online', this.handleCameraOnline.bind(this));
    this.on('recording.failed', this.handleRecordingFailed.bind(this));
    this.on('recording.success', this.handleRecordingSuccess.bind(this));
    this.on('upload.failed', this.handleUploadFailed.bind(this));
    this.on('upload.success', this.handleUploadSuccess.bind(this));
    this.on('system.resource', this.handleSystemResource.bind(this));
  }

  async handleCameraOffline(cameraData) {
    const alertKey = `camera_offline_${cameraData.id}`;
    
    if (this.shouldSendAlert(alertKey)) {
      const alert = {
        type: 'camera_offline',
        severity: 'high',
        title: 'Câmera Offline',
        message: `A câmera ${cameraData.name} (${cameraData.ip}) está offline há mais de ${this.alertThresholds.cameraOfflineTime / 60000} minutos`,
        camera: cameraData,
        timestamp: new Date(),
      };

      await this.sendAlert(alert);
      this.setAlertCooldown(alertKey);
    }
  }

  async handleCameraOnline(cameraData) {
    const alertKey = `camera_offline_${cameraData.id}`;
    this.clearAlert(alertKey);

    const alert = {
      type: 'camera_online',
      severity: 'info',
      title: 'Câmera Online',
      message: `A câmera ${cameraData.name} (${cameraData.ip}) voltou a ficar online`,
      camera: cameraData,
      timestamp: new Date(),
    };

    await this.sendAlert(alert);
  }

  async handleRecordingFailed(recordingData) {
    const alertKey = `recording_failed_${recordingData.cameraId}`;
    const failureCount = this.incrementFailureCount(alertKey);

    if (failureCount >= this.alertThresholds.recordingFailureCount && this.shouldSendAlert(alertKey)) {
      const alert = {
        type: 'recording_failed',
        severity: 'high',
        title: 'Falha na Gravação',
        message: `Falha na gravação da câmera ${recordingData.cameraName}. ${failureCount} falhas consecutivas detectadas`,
        recording: recordingData,
        failureCount,
        timestamp: new Date(),
      };

      await this.sendAlert(alert);
      this.setAlertCooldown(alertKey);
    }
  }

  async handleRecordingSuccess(recordingData) {
    const alertKey = `recording_failed_${recordingData.cameraId}`;
    this.clearFailureCount(alertKey);
    this.clearAlert(alertKey);
  }

  async handleUploadFailed(uploadData) {
    const alertKey = `upload_failed_${uploadData.recordingId}`;
    const failureCount = this.incrementFailureCount(alertKey);

    if (failureCount >= this.alertThresholds.uploadFailureCount && this.shouldSendAlert(alertKey)) {
      const alert = {
        type: 'upload_failed',
        severity: 'medium',
        title: 'Falha no Upload S3',
        message: `Falha no upload da gravação ${uploadData.filename} para o S3. ${failureCount} tentativas falharam`,
        upload: uploadData,
        failureCount,
        timestamp: new Date(),
      };

      await this.sendAlert(alert);
      this.setAlertCooldown(alertKey);
    }
  }

  async handleUploadSuccess(uploadData) {
    const alertKey = `upload_failed_${uploadData.recordingId}`;
    this.clearFailureCount(alertKey);
    this.clearAlert(alertKey);
  }

  async handleSystemResource(resourceData) {
    const { diskUsage, memoryUsage } = resourceData;

    // Verificar uso de disco
    if (diskUsage > this.alertThresholds.diskSpaceThreshold) {
      const alertKey = 'disk_space_high';
      if (this.shouldSendAlert(alertKey)) {
        const alert = {
          type: 'disk_space_high',
          severity: 'high',
          title: 'Espaço em Disco Baixo',
          message: `Uso de disco em ${diskUsage.toFixed(1)}%. Limpeza automática pode ser necessária`,
          diskUsage,
          timestamp: new Date(),
        };

        await this.sendAlert(alert);
        this.setAlertCooldown(alertKey);
      }
    }

    // Verificar uso de memória
    if (memoryUsage > this.alertThresholds.memoryThreshold) {
      const alertKey = 'memory_usage_high';
      if (this.shouldSendAlert(alertKey)) {
        const alert = {
          type: 'memory_usage_high',
          severity: 'medium',
          title: 'Uso de Memória Alto',
          message: `Uso de memória em ${memoryUsage.toFixed(1)}%. Sistema pode precisar de reinicialização`,
          memoryUsage,
          timestamp: new Date(),
        };

        await this.sendAlert(alert);
        this.setAlertCooldown(alertKey);
      }
    }
  }

  async sendAlert(alert) {
    if (!this.isEnabled) {
      logger.info('Alertas desabilitados, pulando envio:', alert.title);
      return;
    }

    try {
      logger.warn(`ALERTA [${alert.severity.toUpperCase()}]: ${alert.title} - ${alert.message}`);

      // Emitir evento para WebSocket (tempo real)
      this.emit('alert.new', alert);

      // Enviar email se configurado
      if (process.env.EMAIL_ALERTS_ENABLED === 'true') {
        await this.sendEmailAlert(alert);
      }

      // Enviar webhook se configurado
      if (process.env.WEBHOOK_ALERTS_ENABLED === 'true') {
        await this.sendWebhookAlert(alert);
      }

      // Salvar alerta no banco de dados
      await this.saveAlertToDatabase(alert);

    } catch (error) {
      logger.error('Erro ao enviar alerta:', error);
    }
  }

  async sendEmailAlert(alert) {
    try {
      const emailConfig = {
        to: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
        subject: `[NewCAM] ${alert.title}`,
        html: this.generateEmailTemplate(alert),
      };

      await sendEmail(emailConfig);
      logger.info(`Email de alerta enviado: ${alert.title}`);
    } catch (error) {
      logger.error('Erro ao enviar email de alerta:', error);
    }
  }

  async sendWebhookAlert(alert) {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (webhookUrl) {
        await sendWebhook(webhookUrl, alert);
        logger.info(`Webhook de alerta enviado: ${alert.title}`);
      }
    } catch (error) {
      logger.error('Erro ao enviar webhook de alerta:', error);
    }
  }

  async saveAlertToDatabase(alert) {
    try {
      // Implementar salvamento no banco de dados
      // Por enquanto, apenas log
      logger.info('Alerta salvo no sistema:', {
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        timestamp: alert.timestamp,
      });
    } catch (error) {
      logger.error('Erro ao salvar alerta no banco:', error);
    }
  }

  generateEmailTemplate(alert) {
    return `
      <html>
        <body>
          <h2 style="color: ${this.getSeverityColor(alert.severity)}">${alert.title}</h2>
          <p><strong>Severidade:</strong> ${alert.severity.toUpperCase()}</p>
          <p><strong>Mensagem:</strong> ${alert.message}</p>
          <p><strong>Timestamp:</strong> ${alert.timestamp.toLocaleString('pt-BR')}</p>
          ${alert.camera ? `<p><strong>Câmera:</strong> ${alert.camera.name} (${alert.camera.ip})</p>` : ''}
          ${alert.failureCount ? `<p><strong>Falhas:</strong> ${alert.failureCount}</p>` : ''}
          <hr>
          <p><small>Sistema de Monitoramento NewCAM</small></p>
        </body>
      </html>
    `;
  }

  getSeverityColor(severity) {
    const colors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#dc3545',
      info: '#17a2b8',
    };
    return colors[severity] || '#6c757d';
  }

  shouldSendAlert(alertKey) {
    const lastSent = this.alerts.get(alertKey);
    if (!lastSent) return true;
    
    return Date.now() - lastSent > this.alertCooldown;
  }

  setAlertCooldown(alertKey) {
    this.alerts.set(alertKey, Date.now());
  }

  clearAlert(alertKey) {
    this.alerts.delete(alertKey);
  }

  incrementFailureCount(alertKey) {
    const countKey = `${alertKey}_count`;
    const current = this.alerts.get(countKey) || 0;
    const newCount = current + 1;
    this.alerts.set(countKey, newCount);
    return newCount;
  }

  clearFailureCount(alertKey) {
    const countKey = `${alertKey}_count`;
    this.alerts.delete(countKey);
  }

  // Métodos públicos para integração
  triggerCameraOffline(cameraData) {
    this.emit('camera.offline', cameraData);
  }

  triggerCameraOnline(cameraData) {
    this.emit('camera.online', cameraData);
  }

  triggerRecordingFailed(recordingData) {
    this.emit('recording.failed', recordingData);
  }

  triggerRecordingSuccess(recordingData) {
    this.emit('recording.success', recordingData);
  }

  triggerUploadFailed(uploadData) {
    this.emit('upload.failed', uploadData);
  }

  triggerUploadSuccess(uploadData) {
    this.emit('upload.success', uploadData);
  }

  triggerSystemResource(resourceData) {
    this.emit('system.resource', resourceData);
  }

  getActiveAlerts() {
    return Array.from(this.alerts.entries()).map(([key, timestamp]) => ({
      key,
      timestamp,
      age: Date.now() - timestamp,
    }));
  }

  getAlertStats() {
    return {
      totalAlerts: this.alerts.size,
      thresholds: this.alertThresholds,
      cooldown: this.alertCooldown,
      enabled: this.isEnabled,
    };
  }
}

// Singleton instance
const alertService = new AlertService();

export default alertService;