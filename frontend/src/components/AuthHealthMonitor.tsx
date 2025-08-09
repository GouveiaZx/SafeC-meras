import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Users,
  RefreshCw,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { authHealthService } from '../services/authHealthService';
import { toast } from 'sonner';
import type { AuthHealthSummary, AuthHealthAlert } from '../types/health';

// Tipos importados do arquivo de tipos

const AuthHealthMonitor: React.FC = () => {
  const [healthData, setHealthData] = useState<AuthHealthSummary | null>(null);
  const [alerts, setAlerts] = useState<AuthHealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = async () => {
    try {
      setRefreshing(true);
      const data = await authHealthService.getAuthHealth();
      setHealthData(data);
      setError(null);
    } catch (err: any) {
      console.error('Erro ao carregar saúde da autenticação:', err);
      setError(err.message || 'Erro ao carregar dados');
      toast.error('Erro ao carregar métricas de saúde');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const alertsData = await authHealthService.getAlerts();
      setAlerts(alertsData);
    } catch (err: any) {
      console.error('Erro ao carregar alertas:', err);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      await authHealthService.resolveAlert(alertId);
      toast.success('Alerta resolvido com sucesso');
      await fetchAlerts();
      await fetchHealthData();
    } catch (err: any) {
      console.error('Erro ao resolver alerta:', err);
      toast.error('Erro ao resolver alerta');
    }
  };

  useEffect(() => {
    fetchHealthData();
    fetchAlerts();

    // Atualizar a cada 30 segundos
    const interval = setInterval(() => {
      fetchHealthData();
      fetchAlerts();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };



  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          Carregando métricas de saúde...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2"
            onClick={fetchHealthData}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!healthData) {
    return null;
  }

  const { metrics, status } = healthData;
  const activeAlertsList = alerts.filter(alert => !alert.resolved);
  const resolvedAlertsList = alerts.filter(alert => alert.resolved);
  const activeAlerts = activeAlertsList.length;

  return (
    <div className="space-y-6">
      {/* Status Geral */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6" />
              <div>
                <CardTitle>Saúde da Autenticação</CardTitle>
                <CardDescription>
                  Monitoramento em tempo real do sistema de autenticação
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusIcon(status.isHealthy ? 'healthy' : 'unhealthy')}
              <span className={`font-semibold ${getStatusColor(status.isHealthy ? 'healthy' : 'unhealthy')}`}>
                {status.isHealthy ? 'SAUDÁVEL' : 'PROBLEMÁTICO'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealthData}
                disabled={refreshing}
              >
                {refreshing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {authHealthService.formatRate(authHealthService.calculateSuccessRate(metrics.loginSuccesses, metrics.loginAttempts))}
              </div>
              <div className="text-sm text-gray-600">Taxa de Sucesso</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {authHealthService.formatRate(authHealthService.calculateFailureRate(metrics.loginFailures, metrics.loginAttempts))}
              </div>
              <div className="text-sm text-gray-600">Taxa de Erro</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {metrics.activeUsers}
              </div>
              <div className="text-sm text-gray-600">Usuários Ativos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {activeAlerts}
              </div>
              <div className="text-sm text-gray-600">Alertas Ativos</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs para Métricas e Alertas */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="metrics">Métricas Detalhadas</TabsTrigger>
          <TabsTrigger value="alerts">
            Alertas {activeAlerts > 0 && `(${activeAlerts})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Status Geral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Status Geral da Autenticação</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg ${authHealthService.getHealthStatusBgColor(healthData.status.score)}`}>
                <div className="flex items-center gap-2 mb-2">
                  {healthData.status.isHealthy ? 
                    <CheckCircle className="h-5 w-5 text-green-600" /> : 
                    <XCircle className="h-5 w-5 text-red-600" />
                  }
                  <span className={`font-semibold ${authHealthService.getHealthStatusColor(healthData.status.score)}`}>
                    {authHealthService.getHealthStatusText(healthData.status.score)} ({healthData.status.score}%)
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Taxa de Sucesso Login: {authHealthService.formatRate(authHealthService.calculateSuccessRate(healthData.metrics.loginSuccesses, healthData.metrics.loginAttempts))}
                </div>
                <div className="text-sm text-gray-600">
                  Taxa de Sucesso Refresh: {authHealthService.formatRate(authHealthService.calculateSuccessRate(healthData.metrics.tokenRefreshSuccesses, healthData.metrics.tokenRefreshAttempts))}
                </div>
                <div className="text-sm text-gray-600">
                  Alertas Ativos: {healthData.alerts.filter(alert => !alert.resolved).length}
                </div>
                
                {/* Issues e Recomendações */}
                {healthData.status.issues.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-red-600 mb-2">Problemas Identificados:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {healthData.status.issues.map((issue, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {healthData.status.recommendations.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-blue-600 mb-2">Recomendações:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {healthData.status.recommendations.map((recommendation, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-blue-500 mt-0.5">•</span>
                          {recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Tentativas de Login</p>
                    <p className="text-2xl font-bold">{metrics.loginAttempts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Logins Bem-sucedidos</p>
                    <p className="text-2xl font-bold">{metrics.loginSuccesses}</p>
                    <p className="text-xs text-gray-500">
                      Taxa: {authHealthService.formatRate(authHealthService.calculateSuccessRate(metrics.loginSuccesses, metrics.loginAttempts))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm text-gray-600">Falhas de Login</p>
                    <p className="text-2xl font-bold">{metrics.loginFailures}</p>
                    <p className="text-xs text-gray-500">
                      Taxa: {authHealthService.formatRate(authHealthService.calculateFailureRate(metrics.loginFailures, metrics.loginAttempts))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600">Refresh de Token</p>
                    <p className="text-2xl font-bold">{metrics.tokenRefreshAttempts}</p>
                    <p className="text-xs text-gray-500">
                      Sucessos: {metrics.tokenRefreshSuccesses}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Usuários Ativos</p>
                    <p className="text-2xl font-bold">{metrics.activeUsers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm text-gray-600">Usuários Bloqueados</p>
                    <p className="text-2xl font-bold">{metrics.blockedUsers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-gray-600">Erros de Auth</p>
                    <p className="text-2xl font-bold">{metrics.authErrors}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-gray-600" />
                  <div>
                    <p className="text-sm text-gray-600">Último Reset</p>
                    <p className="text-sm font-medium">
                      {authHealthService.formatTimestamp(metrics.lastResetTime)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Métricas de Token Refresh */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <RefreshCw className="h-5 w-5" />
                  <span>Refresh de Token</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Tentativas:</span>
                  <span className="font-semibold">{metrics.tokenRefreshAttempts}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sucessos:</span>
                  <span className="font-semibold text-green-600">
                    {metrics.tokenRefreshSuccesses}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Falhas:</span>
                  <span className="font-semibold text-red-600">
                    {metrics.tokenRefreshFailures}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa de Sucesso:</span>
                  <span className="font-semibold">
                    {metrics.tokenRefreshAttempts > 0 
                      ? ((metrics.tokenRefreshSuccesses / metrics.tokenRefreshAttempts) * 100).toFixed(1)
                      : '0'
                    }%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Métricas Gerais */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Geral</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Erros de Auth:</span>
                  <span className="font-semibold text-red-600">
                    {metrics.authErrors}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Usuários Bloqueados:</span>
                  <span className="font-semibold text-orange-600">
                    {metrics.blockedUsers}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Último Reset:</span>
                  <span className="font-semibold text-sm">
                    {new Date(metrics.lastResetTime).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Status dos Usuários */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Usuários</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Ativos:</span>
                  <span className="font-semibold text-green-600">
                    {metrics.activeUsers}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Bloqueados:</span>
                  <span className="font-semibold text-red-600">
                    {metrics.blockedUsers}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-semibold">
                    {metrics.activeUsers + metrics.blockedUsers}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {/* Alertas Ativos */}
          {activeAlertsList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <span>Alertas Ativos ({activeAlertsList.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeAlertsList.map((alert) => (
                  <div key={alert.id} className={`border rounded-lg p-3 ${authHealthService.getAlertSeverityBgColor(alert.severity)}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-lg">{authHealthService.getAlertIcon(alert.type)}</span>
                          <Badge className={authHealthService.getAlertSeverityColor(alert.severity)}>
                            {authHealthService.getAlertSeverityText(alert.severity)}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {authHealthService.formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          Tipo: {authHealthService.getAlertTypeDescription(alert.type)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolver
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Alertas Resolvidos */}
          {resolvedAlertsList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Alertas Resolvidos ({resolvedAlertsList.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {resolvedAlertsList.slice(0, 10).map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-3 opacity-60">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-lg">{authHealthService.getAlertIcon(alert.type)}</span>
                      <Badge className={authHealthService.getAlertSeverityColor(alert.severity)}>
                        {authHealthService.getAlertSeverityText(alert.severity)}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        {authHealthService.formatTimestamp(alert.timestamp)}
                      </span>
                      {alert.resolvedAt && (
                        <span className="text-sm text-green-600">
                          • Resolvido em {authHealthService.formatTimestamp(alert.resolvedAt)}
                          {alert.resolvedBy && ` por ${alert.resolvedBy}`}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Tipo: {authHealthService.getAlertTypeDescription(alert.type)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Nenhum alerta */}
          {activeAlertsList.length === 0 && resolvedAlertsList.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <p className="text-lg font-medium">Nenhum alerta encontrado</p>
                <p className="text-gray-600">O sistema de autenticação está funcionando normalmente.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuthHealthMonitor;