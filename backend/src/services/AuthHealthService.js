/**
 * Serviço de monitoramento de saúde da autenticação
 * Monitora métricas de autenticação e detecta problemas
 */

import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('AuthHealth');

class AuthHealthService {
  constructor() {
    this.metrics = {
      loginAttempts: 0,
      loginSuccesses: 0,
      loginFailures: 0,
      tokenRefreshAttempts: 0,
      tokenRefreshSuccesses: 0,
      tokenRefreshFailures: 0,
      authErrors: 0,
      blockedUsers: 0,
      activeUsers: 0,
      lastReset: new Date()
    };
    
    this.alerts = [];
    this.thresholds = {
      maxFailureRate: 0.3, // 30% de falhas
      maxErrorRate: 0.1,   // 10% de erros
      minSuccessRate: 0.7, // 70% de sucessos
      alertCooldown: 5 * 60 * 1000 // 5 minutos entre alertas
    };
    
    this.lastAlerts = new Map();
    
    // Reset métricas a cada hora
    setInterval(() => this.resetMetrics(), 60 * 60 * 1000);
    
    // Verificar saúde a cada 5 minutos
    setInterval(() => this.checkHealth(), 5 * 60 * 1000);
    
    logger.info('🏥 AuthHealthService iniciado');
  }
  
  // Registrar tentativa de login
  recordLoginAttempt(success, error = null) {
    this.metrics.loginAttempts++;
    
    if (success) {
      this.metrics.loginSuccesses++;
    } else {
      this.metrics.loginFailures++;
      if (error) {
        this.metrics.authErrors++;
      }
    }
    
    this.checkLoginHealth();
  }
  
  // Registrar tentativa de refresh de token
  recordTokenRefresh(success, error = null) {
    this.metrics.tokenRefreshAttempts++;
    
    if (success) {
      this.metrics.tokenRefreshSuccesses++;
    } else {
      this.metrics.tokenRefreshFailures++;
      if (error) {
        this.metrics.authErrors++;
      }
    }
    
    this.checkTokenRefreshHealth();
  }
  
  // Registrar erro de autenticação
  recordAuthError(errorType, details = {}) {
    this.metrics.authErrors++;
    
    logger.warn('🚨 Auth Error recorded', {
      errorType,
      details,
      totalErrors: this.metrics.authErrors
    });
    
    this.checkErrorRate();
  }
  
  // Verificar saúde do login
  checkLoginHealth() {
    if (this.metrics.loginAttempts < 10) return; // Aguardar dados suficientes
    
    const failureRate = this.metrics.loginFailures / this.metrics.loginAttempts;
    const successRate = this.metrics.loginSuccesses / this.metrics.loginAttempts;
    
    if (failureRate > this.thresholds.maxFailureRate) {
      this.createAlert('HIGH_LOGIN_FAILURE_RATE', {
        failureRate: (failureRate * 100).toFixed(1),
        threshold: (this.thresholds.maxFailureRate * 100).toFixed(1),
        attempts: this.metrics.loginAttempts,
        failures: this.metrics.loginFailures
      });
    }
    
    if (successRate < this.thresholds.minSuccessRate) {
      this.createAlert('LOW_LOGIN_SUCCESS_RATE', {
        successRate: (successRate * 100).toFixed(1),
        threshold: (this.thresholds.minSuccessRate * 100).toFixed(1),
        attempts: this.metrics.loginAttempts,
        successes: this.metrics.loginSuccesses
      });
    }
  }
  
  // Verificar saúde do refresh de token
  checkTokenRefreshHealth() {
    if (this.metrics.tokenRefreshAttempts < 5) return;
    
    const failureRate = this.metrics.tokenRefreshFailures / this.metrics.tokenRefreshAttempts;
    
    if (failureRate > this.thresholds.maxFailureRate) {
      this.createAlert('HIGH_TOKEN_REFRESH_FAILURE_RATE', {
        failureRate: (failureRate * 100).toFixed(1),
        threshold: (this.thresholds.maxFailureRate * 100).toFixed(1),
        attempts: this.metrics.tokenRefreshAttempts,
        failures: this.metrics.tokenRefreshFailures
      });
    }
  }
  
  // Verificar taxa de erros
  checkErrorRate() {
    const totalOperations = this.metrics.loginAttempts + this.metrics.tokenRefreshAttempts;
    if (totalOperations < 10) return;
    
    const errorRate = this.metrics.authErrors / totalOperations;
    
    if (errorRate > this.thresholds.maxErrorRate) {
      this.createAlert('HIGH_AUTH_ERROR_RATE', {
        errorRate: (errorRate * 100).toFixed(1),
        threshold: (this.thresholds.maxErrorRate * 100).toFixed(1),
        totalOperations,
        errors: this.metrics.authErrors
      });
    }
  }
  
  // Criar alerta
  createAlert(type, data) {
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(type);
    
    // Verificar cooldown
    if (lastAlert && (now - lastAlert) < this.thresholds.alertCooldown) {
      return;
    }
    
    const alert = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      severity: this.getAlertSeverity(type),
      message: this.getAlertMessage(type, data),
      data,
      timestamp: new Date().toISOString(),
      resolved: false
    };
    
    this.alerts.push(alert);
    this.lastAlerts.set(type, now);
    
    logger.error(`🚨 Auth Health Alert: ${alert.message}`, alert);
    
    // Manter apenas os últimos 50 alertas
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
  }
  
  // Obter severidade do alerta
  getAlertSeverity(type) {
    const severityMap = {
      'HIGH_LOGIN_FAILURE_RATE': 'high',
      'LOW_LOGIN_SUCCESS_RATE': 'high',
      'HIGH_TOKEN_REFRESH_FAILURE_RATE': 'medium',
      'HIGH_AUTH_ERROR_RATE': 'high',
      'DATABASE_CONNECTION_ERROR': 'critical',
      'JWT_SECRET_ISSUE': 'critical'
    };
    
    return severityMap[type] || 'medium';
  }
  
  // Obter mensagem do alerta
  getAlertMessage(type, data) {
    const messages = {
      'HIGH_LOGIN_FAILURE_RATE': `Alta taxa de falhas no login: ${data.failureRate}% (limite: ${data.threshold}%)`,
      'LOW_LOGIN_SUCCESS_RATE': `Baixa taxa de sucesso no login: ${data.successRate}% (mínimo: ${data.threshold}%)`,
      'HIGH_TOKEN_REFRESH_FAILURE_RATE': `Alta taxa de falhas no refresh de token: ${data.failureRate}% (limite: ${data.threshold}%)`,
      'HIGH_AUTH_ERROR_RATE': `Alta taxa de erros de autenticação: ${data.errorRate}% (limite: ${data.threshold}%)`,
      'DATABASE_CONNECTION_ERROR': 'Erro de conexão com o banco de dados',
      'JWT_SECRET_ISSUE': 'Problema com JWT_SECRET'
    };
    
    return messages[type] || `Alerta de autenticação: ${type}`;
  }
  
  // Verificar saúde geral
  async checkHealth() {
    try {
      // Verificar conexão com banco
      await this.checkDatabaseHealth();
      
      // Verificar usuários ativos/bloqueados
      await this.updateUserStats();
      
      // Verificar configuração JWT
      this.checkJWTHealth();
      
      logger.debug('🏥 Auth health check completed', this.getHealthSummary());
    } catch (error) {
      logger.error('❌ Auth health check failed:', error);
      this.createAlert('HEALTH_CHECK_FAILED', { error: error.message });
    }
  }
  
  // Verificar saúde do banco de dados
  async checkDatabaseHealth() {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);
        
      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }
    } catch (error) {
      this.createAlert('DATABASE_CONNECTION_ERROR', { error: error.message });
      throw error;
    }
  }
  
  // Atualizar estatísticas de usuários
  async updateUserStats() {
    try {
      const { data: activeUsers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('active', true);
        
      const { data: blockedUsers } = await supabaseAdmin
        .from('users')
        .select('id')
        .not('blocked_at', 'is', null);
        
      this.metrics.activeUsers = activeUsers?.length || 0;
      this.metrics.blockedUsers = blockedUsers?.length || 0;
    } catch (error) {
      logger.error('❌ Failed to update user stats:', error);
    }
  }
  
  // Verificar saúde do JWT
  checkJWTHealth() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      this.createAlert('JWT_SECRET_ISSUE', {
        hasSecret: !!process.env.JWT_SECRET,
        secretLength: process.env.JWT_SECRET?.length || 0
      });
    }
  }
  
  // Reset métricas
  resetMetrics() {
    const oldMetrics = { ...this.metrics };
    
    this.metrics = {
      loginAttempts: 0,
      loginSuccesses: 0,
      loginFailures: 0,
      tokenRefreshAttempts: 0,
      tokenRefreshSuccesses: 0,
      tokenRefreshFailures: 0,
      authErrors: 0,
      blockedUsers: this.metrics.blockedUsers,
      activeUsers: this.metrics.activeUsers,
      lastReset: new Date()
    };
    
    logger.info('📊 Auth metrics reset', {
      previousPeriod: oldMetrics,
      resetTime: this.metrics.lastReset
    });
  }
  
  // Obter resumo da saúde
  getHealthSummary() {
    const totalOperations = this.metrics.loginAttempts + this.metrics.tokenRefreshAttempts;
    const successRate = totalOperations > 0 ? 
      ((this.metrics.loginSuccesses + this.metrics.tokenRefreshSuccesses) / totalOperations) : 1;
    const errorRate = totalOperations > 0 ? (this.metrics.authErrors / totalOperations) : 0;
    
    return {
      status: this.getOverallStatus(),
      metrics: this.metrics,
      rates: {
        successRate: (successRate * 100).toFixed(1),
        errorRate: (errorRate * 100).toFixed(1)
      },
      activeAlerts: this.alerts.filter(a => !a.resolved).length,
      lastReset: this.metrics.lastReset
    };
  }
  
  // Obter status geral
  getOverallStatus() {
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const highAlerts = activeAlerts.filter(a => a.severity === 'high');
    
    if (criticalAlerts.length > 0) return 'critical';
    if (highAlerts.length > 0) return 'warning';
    if (activeAlerts.length > 0) return 'degraded';
    
    return 'healthy';
  }
  
  // Obter métricas
  getMetrics() {
    return this.getHealthSummary();
  }
  
  // Obter alertas
  getAlerts(limit = 20) {
    return this.alerts
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }
  
  // Resolver alerta
  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      logger.info(`✅ Auth alert resolved: ${alert.type}`, { alertId });
    }
  }
}

// Instância singleton
const authHealthService = new AuthHealthService();

export default authHealthService;
export { AuthHealthService };