// Tipos para o sistema de saúde da autenticação

export interface AuthHealthMetrics {
  loginAttempts: number;
  loginSuccesses: number;
  loginFailures: number;
  tokenRefreshAttempts: number;
  tokenRefreshSuccesses: number;
  tokenRefreshFailures: number;
  authErrors: number;
  activeUsers: number;
  blockedUsers: number;
  lastResetTime: string;
}

export interface AuthHealthStatus {
  isHealthy: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface AuthHealthAlert {
  id: string;
  type: 'HIGH_FAILURE_RATE' | 'HIGH_ERROR_RATE' | 'DATABASE_ERROR' | 'JWT_CONFIG_ERROR';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AuthHealthSummary {
  status: AuthHealthStatus;
  metrics: AuthHealthMetrics;
  alerts: AuthHealthAlert[];
  lastUpdated: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

// Tipos para as respostas da API
export interface AuthHealthResponse {
  success: boolean;
  data: AuthHealthSummary;
  timestamp: string;
}

export interface AuthAlertsResponse {
  success: boolean;
  data: AuthHealthAlert[];
  timestamp: string;
}

export interface SystemHealthResponse {
  success: boolean;
  data: SystemHealthStatus;
  timestamp: string;
}

export interface ResolveAlertResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

// Tipos para configuração de alertas
export interface AlertThresholds {
  failureRateThreshold: number;
  errorRateThreshold: number;
  alertCooldownMinutes: number;
}

// Tipos para estatísticas de período
export interface PeriodStats {
  period: string;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  failureRate: number;
}

// Tipos para detalhes de erro
export interface ErrorDetails {
  type: string;
  count: number;
  lastOccurrence: string;
  examples: string[];
}

// Tipos para métricas detalhadas
export interface DetailedAuthMetrics extends AuthHealthMetrics {
  hourlyStats: PeriodStats[];
  dailyStats: PeriodStats[];
  errorBreakdown: ErrorDetails[];
  topFailureReasons: { reason: string; count: number }[];
  averageResponseTime: number;
  peakUsageHours: { hour: number; requests: number }[];
}