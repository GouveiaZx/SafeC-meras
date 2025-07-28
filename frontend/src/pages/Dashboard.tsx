import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Activity,
  Camera,
  Cpu,
  MemoryStick,
  XCircle,
  RefreshCw,
  Video
} from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import AlertCard from '@/components/dashboard/AlertCard';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import { api, endpoints } from '@/lib/api';

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
}

interface CameraMetrics {
  total: number;
  online: number;
  offline: number;
  streaming: number;
  recording: number;
}

interface RecordingMetrics {
  total: number;
  today: number;
  totalSize: number;
  avgDuration: number;
}

interface StorageMetrics {
  local: {
    used: number;
    total: number;
    percentage: number;
  };
  s3: {
    used: number;
    files: number;
  };
}

interface NetworkMetrics {
  bandwidth: number;
  connections: number;
}

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error';
  category: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: string;
  details?: string;
}

interface Metrics {
  system: SystemMetrics;
  cameras: CameraMetrics;
  recordings: RecordingMetrics;
  storage: StorageMetrics;
  network: NetworkMetrics;
  timestamp: string;
  isCollecting: boolean;
}

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [cpuHistoryData, setCpuHistoryData] = useState([]);

  const [storageDistribution, setStorageDistribution] = useState([]);

  const [cameraStats, setCameraStats] = useState([]);



  const fetchMetrics = useCallback(async () => {
    try {
      const response = await api.get<{ success: boolean, data: any }>('/dashboard/stats');
      const data = response;
      
      if (data.success && data.data) {
        setMetrics(data.data.metrics);
        
        // Atualizar dados dos gráficos se disponíveis
        if (data.data.charts) {
          if (data.data.charts.cpu_history) {
            setCpuHistoryData(data.data.charts.cpu_history);
          }
          
          if (data.data.charts.storage_distribution) {
            setStorageDistribution(data.data.charts.storage_distribution);
          }
          
          if (data.data.charts.camera_stats) {
            setCameraStats(data.data.charts.camera_stats);
          }
        }
        
        setLastUpdate(new Date());
        setError(null);
      } else {
        // Se não há dados, usar valores padrão
        setMetrics({
          system: {
            cpu: 0,
            memory: { percentage: 0, used: 0, total: 0 },
            disk: { percentage: 0, used: 0, total: 0 },
            uptime: 0
          },
          cameras: { online: 0, total: 0, offline: 0, streaming: 0, recording: 0 },
          recordings: { today: 0, total: 0, totalSize: 0, avgDuration: 0 },
          network: { connections: 0, bandwidth: 0 },
        storage: {
          local: { used: 0, total: 0, percentage: 0 },
          s3: { files: 0, used: 0 }
        },
        timestamp: new Date().toISOString(),
        isCollecting: false
      });
        setCpuHistoryData([]);
        setStorageDistribution([]);
        setCameraStats([]);
        setLastUpdate(new Date());
        setError(null);
      }
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
      // Em caso de erro, usar valores padrão ao invés de mostrar erro
      setMetrics({
        system: {
          cpu: 0,
          memory: { percentage: 0, used: 0, total: 0 },
          disk: { percentage: 0, used: 0, total: 0 },
          uptime: 0
        },
        cameras: { online: 0, total: 0, offline: 0, streaming: 0, recording: 0 },
        recordings: { today: 0, total: 0, totalSize: 0, avgDuration: 0 },
        network: { connections: 0, bandwidth: 0 },
        storage: {
          local: { used: 0, total: 0, percentage: 0 },
          s3: { files: 0, used: 0 }
        },
        timestamp: new Date().toISOString(),
        isCollecting: false
      });
      setCpuHistoryData([]);
      setStorageDistribution([]);
      setCameraStats([]);
      setLastUpdate(new Date());
      setError(null);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await api.get<{ success: boolean, data: any }>('/dashboard/alerts');
      const data = response;
      if (data.success && data.data) {
        setAlerts(data.data.alerts || []);
      } else {
        setAlerts([]);
      }
    } catch (err) {
      console.error('Erro ao buscar alertas:', err);
      setAlerts([]);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMetrics(), fetchAlerts()]);
    setLoading(false);
  }, [fetchMetrics, fetchAlerts]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
      fetchAlerts();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics, fetchAlerts]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };





  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
          <p className="text-gray-600">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <XCircle className="w-8 h-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitoramento em tempo real do sistema Safe Câmeras
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              metrics?.isCollecting ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm text-gray-600">
              {metrics?.isCollecting ? 'Coletando' : 'Parado'}
            </span>
          </div>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto-refresh
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card className="p-4 border-l-4 border-l-yellow-500 bg-yellow-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-yellow-800">Alertas do Sistema</h3>
            <Badge variant="secondary">{alerts.length}</Badge>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 3).map((alert, index) => (
              <AlertCard
                key={alert.id || index}
                alert={alert}
                onDismiss={() => setAlerts(prev => prev.filter((_, i) => i !== index))}
              />
            ))}
            {alerts.length > 3 && (
              <p className="text-sm text-gray-600">+{alerts.length - 3} alertas adicionais</p>
            )}
          </div>
        </Card>
      )}

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="CPU"
          value={metrics?.system.cpu || 0}
          unit="%"
          icon={Cpu}
          color="primary"
          trend={{
            value: 2.5,
            isPositive: false,
            period: 'última hora'
          }}
        />
        
        <MetricCard
          title="Memória"
          value={metrics?.system.memory.percentage || 0}
          unit="%"
          icon={MemoryStick}
          color="green"
          trend={{
            value: 1.2,
            isPositive: true,
            period: 'última hora'
          }}
        />
        
        <MetricCard
          title="Câmeras Ativas"
          value={`${metrics?.cameras.online || 0}/${metrics?.cameras.total || 0}`}
          icon={Camera}
          color="purple"
        />
        
        <MetricCard
          title="Gravações Hoje"
          value={metrics?.recordings.today || 0}
          icon={Video}
          color="yellow"
        />
      </div>

      {/* Gráficos e Métricas Detalhadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Gráfico de CPU e Memória */}
        <div className="xl:col-span-2">
          <LineChart
            data={cpuHistoryData}
            height={300}
            title="Uso de CPU e Memória (Última Hora)"
            lines={[
              { dataKey: 'cpu', name: 'CPU', color: '#3b82f6', unit: '%' },
              { dataKey: 'memory', name: 'Memória', color: '#10b981', unit: '%' }
            ]}
          />
        </div>
        
        {/* Distribuição de Armazenamento */}
        <PieChart
          data={storageDistribution}
          height={300}
          title="Distribuição de Armazenamento"
          unit="GB"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status das Câmeras */}
        <BarChart
          data={cameraStats}
          height={250}
          title="Status das Câmeras"
          bars={[{ dataKey: 'value', name: 'Quantidade', color: '#8b5cf6' }]}
        />
        
        {/* Métricas de Sistema */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-primary-500" />
            Sistema
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Uptime</span>
              <span className="font-medium">{formatUptime(metrics?.system.uptime || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Conexões de Rede</span>
              <span className="font-medium">{metrics?.network.connections || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Arquivos S3</span>
              <span className="font-medium">{metrics?.storage.s3.files || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Tamanho S3</span>
              <span className="font-medium">
                {formatBytes(metrics?.storage.s3.used || 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Informações de Atualização */}
      <div className="text-center text-sm text-gray-500">
        {lastUpdate && (
          <p>
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
            {autoRefresh && ' • Atualizando automaticamente a cada 5 segundos'}
          </p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;