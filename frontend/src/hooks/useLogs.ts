import { useState, useEffect, useCallback } from 'react';
import { api, ApiResponse } from '@/lib/api';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  service: string;
  metadata?: Record<string, any>;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

interface LogFilters {
  level?: string;
  service?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const useLogs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LogFilters>({
    page: 1,
    limit: 50
  });
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async (newFilters?: LogFilters) => {
    try {
      setLoading(true);
      const currentFilters = { ...filters, ...newFilters };
      
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const response = await api.get<ApiResponse<LogsResponse>>(`/logs?${params.toString()}`);
      const data: LogsResponse = response.data;
      
      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setHasNext(data.hasNext);
      setHasPrev(data.hasPrev);
      setError(null);
      
      if (newFilters) {
        setFilters(currentFilters);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<LogFilters>) => {
    const updatedFilters = { ...filters, ...newFilters, page: 1 };
    fetchLogs(updatedFilters);
  }, [filters, fetchLogs]);

  const changePage = useCallback((newPage: number) => {
    const updatedFilters = { ...filters, page: newPage };
    fetchLogs(updatedFilters);
  }, [filters, fetchLogs]);

  const clearFilters = useCallback(() => {
    const clearedFilters = { page: 1, limit: 50 };
    setFilters(clearedFilters);
    fetchLogs(clearedFilters);
  }, [fetchLogs]);

  const exportLogs = useCallback(async (format: 'csv' | 'json' = 'csv') => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && key !== 'page' && key !== 'limit') {
          params.append(key, value.toString());
        }
      });
      params.append('format', format);

      const response = await api.download(`/logs/export?${params.toString()}`);
      const blob = await response.blob();
      
      const finalBlob = new Blob([blob], {
        type: format === 'csv' ? 'text/csv' : 'application/json'
      });
      
      const url = window.URL.createObjectURL(finalBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `logs_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Erro ao exportar logs');
    }
  }, [filters]);

  const getLogServices = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<string[]>>('/logs/services');
      return response.data;
    } catch (err: any) {
      console.error('Erro ao carregar serviços:', err);
      return [];
    }
  }, []);

  const getLogLevels = useCallback(() => {
    return [
      { value: 'error', label: 'Error', color: 'text-red-600' },
      { value: 'warn', label: 'Warning', color: 'text-yellow-600' },
      { value: 'info', label: 'Info', color: 'text-primary-600' },
      { value: 'debug', label: 'Debug', color: 'text-gray-600' }
    ];
  }, []);

  const refreshLogs = useCallback(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs();
  }, []);

  // Auto-refresh logs every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  return {
    logs,
    total,
    page,
    totalPages,
    hasNext,
    hasPrev,
    loading,
    error,
    filters,
    autoRefresh,
    fetchLogs,
    updateFilters,
    changePage,
    clearFilters,
    exportLogs,
    getLogServices,
    getLogLevels,
    refreshLogs,
    toggleAutoRefresh
  };
};

export default useLogs;