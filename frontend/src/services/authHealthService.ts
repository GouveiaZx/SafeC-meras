import { api, endpoints } from '../lib/api';
import type {
  AuthHealthResponse,
  AuthAlertsResponse,
  SystemHealthResponse,
  ResolveAlertResponse,
  AuthHealthSummary,
  AuthHealthAlert,
  SystemHealthStatus
} from '../types/health';

/**
 * Serviço para gerenciar as operações de saúde da autenticação
 */
export class AuthHealthService {
  /**
   * Obtém o resumo completo da saúde da autenticação
   */
  async getAuthHealth(): Promise<AuthHealthSummary> {
    const response = await api.get<AuthHealthResponse>(endpoints.health.auth());
    return response.data;
  }

  /**
   * Obtém a lista de alertas ativos
   */
  async getAlerts(): Promise<AuthHealthAlert[]> {
    const response = await api.get<AuthAlertsResponse>(endpoints.health.alerts());
    return response.data;
  }

  /**
   * Resolve um alerta específico
   */
  async resolveAlert(alertId: string): Promise<void> {
    await api.post<ResolveAlertResponse>(endpoints.health.resolveAlert(alertId));
  }

  /**
   * Obtém o status básico do sistema
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    const response = await api.get<SystemHealthResponse>(endpoints.health.system());
    return response.data;
  }

  /**
   * Calcula a cor do status baseado na pontuação de saúde
   */
  getHealthStatusColor(score: number): string {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  }

  /**
   * Calcula a cor do status baseado na pontuação de saúde (para backgrounds)
   */
  getHealthStatusBgColor(score: number): string {
    if (score >= 90) return 'bg-green-100';
    if (score >= 70) return 'bg-yellow-100';
    if (score >= 50) return 'bg-orange-100';
    return 'bg-red-100';
  }

  /**
   * Obtém o texto descritivo do status de saúde
   */
  getHealthStatusText(score: number): string {
    if (score >= 90) return 'Excelente';
    if (score >= 70) return 'Bom';
    if (score >= 50) return 'Regular';
    return 'Crítico';
  }

  /**
   * Obtém a cor do alerta baseado na severidade
   */
  getAlertSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  }

  /**
   * Obtém a cor de fundo do alerta baseado na severidade
   */
  getAlertSeverityBgColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'bg-red-100';
      case 'high': return 'bg-orange-100';
      case 'medium': return 'bg-yellow-100';
      case 'low': return 'bg-blue-100';
      default: return 'bg-gray-100';
    }
  }

  /**
   * Obtém o texto descritivo da severidade do alerta
   */
  getAlertSeverityText(severity: string): string {
    switch (severity) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return 'Desconhecido';
    }
  }

  /**
   * Formata uma taxa de sucesso/falha como porcentagem
   */
  formatRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  }

  /**
   * Formata um timestamp para exibição
   */
  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Calcula a taxa de sucesso
   */
  calculateSuccessRate(successes: number, total: number): number {
    if (total === 0) return 0;
    return successes / total;
  }

  /**
   * Calcula a taxa de falha
   */
  calculateFailureRate(failures: number, total: number): number {
    if (total === 0) return 0;
    return failures / total;
  }

  /**
   * Verifica se um alerta é crítico
   */
  isCriticalAlert(alert: AuthHealthAlert): boolean {
    return alert.severity === 'critical' || alert.severity === 'high';
  }

  /**
   * Obtém o ícone apropriado para o tipo de alerta
   */
  getAlertIcon(type: string): string {
    switch (type) {
      case 'HIGH_FAILURE_RATE': return '⚠️';
      case 'HIGH_ERROR_RATE': return '🚨';
      case 'DATABASE_ERROR': return '💾';
      case 'JWT_CONFIG_ERROR': return '🔐';
      default: return '❗';
    }
  }

  /**
   * Obtém uma descrição amigável do tipo de alerta
   */
  getAlertTypeDescription(type: string): string {
    switch (type) {
      case 'HIGH_FAILURE_RATE': return 'Alta Taxa de Falhas';
      case 'HIGH_ERROR_RATE': return 'Alta Taxa de Erros';
      case 'DATABASE_ERROR': return 'Erro de Banco de Dados';
      case 'JWT_CONFIG_ERROR': return 'Erro de Configuração JWT';
      default: return 'Alerta Desconhecido';
    }
  }
}

// Instância singleton do serviço
export const authHealthService = new AuthHealthService();