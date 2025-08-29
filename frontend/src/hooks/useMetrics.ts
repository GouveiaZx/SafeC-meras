import { useState, useEffect, useCallback } from 'react';
import { api, ApiResponse } from '@/lib/api';

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  cameras: {
    total: number;
    online: number;
    offline: number;
    streaming: number;
    recording: number;
  };
  recordings: {
    total: number;
    today: number;
    totalSize: number;
    averageDuration: number;
  };
  storage: {
    local: {
      total: number;
      used: number;
      free: number;
    };
    s3: {
      totalObjects: number;
      totalSize: number;
    };
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  category: string;
}

interface MetricsHistory {
  timestamp: string;
  metrics: SystemMetrics;
}

export const useMetrics = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<MetricsHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<SystemMetrics>>('/metrics');
      setMetrics(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar métricas');
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<{ alerts: Alert[] }>>('/metrics/alerts');
      setAlerts(response.data.alerts);
    } catch (err: any) {
      console.error('Erro ao carregar alertas:', err);
    }
  }, []);

  const fetchHistory = useCallback(async (hours: number = 24) => {
    try {
      const response = await api.get<ApiResponse<MetricsHistory[]>>(`/metrics/history?hours=${hours}`);
      setHistory(response.data);
    } catch (err: any) {
      console.error('Erro ao carregar histórico:', err);
    }
  }, []);

  const fetchMetricsByCategory = useCallback(async (category: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/metrics/${category}`);
      return response.data;
    } catch (err: any) {
      throw new Error(err.message || `Erro ao carregar métricas de ${category}`);
    }
  }, []);

  const startCollection = useCallback(async () => {
    try {
      await api.post('/metrics/start');
      setIsCollecting(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar coleta');
    }
  }, []);

  const stopCollection = useCallback(async () => {
    try {
      await api.post('/metrics/stop');
      setIsCollecting(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao parar coleta');
    }
  }, []);

  const forceCollection = useCallback(async () => {
    try {
      await api.post('/metrics/force');
      await fetchMetrics();
    } catch (err: any) {
      setError(err.message || 'Erro ao forçar coleta');
    }
  }, [fetchMetrics]);

  const checkCollectionStatus = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<{ isCollecting: boolean }>>('/metrics/status');
      setIsCollecting(response.data.isCollecting);
    } catch (err: any) {
      console.error('Erro ao verificar status da coleta:', err);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchMetrics(),
          fetchAlerts(),
          checkCollectionStatus()
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [fetchMetrics, fetchAlerts, checkCollectionStatus]);

  // Auto-refresh metrics every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isCollecting) {
        fetchMetrics();
        fetchAlerts();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchMetrics, fetchAlerts, isCollecting]);

  return {
    metrics,
    alerts,
    history,
    loading,
    error,
    isCollecting,
    fetchMetrics,
    fetchAlerts,
    fetchHistory,
    fetchMetricsByCategory,
    startCollection,
    stopCollection,
    forceCollection,
    checkCollectionStatus
  };
};

export default useMetrics;