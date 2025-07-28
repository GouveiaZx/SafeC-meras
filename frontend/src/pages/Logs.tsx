import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { api, endpoints } from '@/lib/api';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  Server,
  Camera,
  Database,
  Wifi,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface LogsResponse {
  success: boolean;
  data: {
    logs: Array<Record<string, string | number | boolean>>;
  };
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
  metadata?: Record<string, string | number | boolean>;
  source?: string;
}

interface LogFilters {
  level: string;
  service: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LogFilters>({
    level: '',
    service: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      
      // Construir parâmetros da query
      const params = new URLSearchParams({
        page: '1',
        limit: '100'
      });
      
      if (filters.level) params.append('level', filters.level);
      if (filters.service) params.append('service', filters.service);
      if (filters.search) params.append('search', filters.search);
      if (filters.dateFrom) params.append('start_date', filters.dateFrom);
      if (filters.dateTo) params.append('end_date', filters.dateTo);
      
      const data = await api.get<LogsResponse>(`${endpoints.logs.getAll()}?${params}`);
      
      if (data.success && data.data) {
        // Transformar dados para o formato esperado pelo frontend
        const transformedLogs = data.data.logs.map((log: Record<string, string | number | boolean>) => ({
          id: String(log.id),
          timestamp: String(log.created_at),
          level: String(log.level) as 'info' | 'warn' | 'error' | 'debug',
          service: String(log.service || 'system'),
          message: String(log.message),
          source: log.source ? String(log.source) : (log.module ? String(log.module) : undefined),
          metadata: typeof log.metadata === 'object' ? log.metadata as Record<string, string | number | boolean> : undefined
        }));
        
        setLogs(transformedLogs);
      } else {
        setLogs([]);
      }
      
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar logs:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar logs');
      // Em caso de erro, manter logs vazios
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const applyFilters = useCallback(() => {
    let filtered = [...logs];

    // Filtro por nível
    if (filters.level) {
      filtered = filtered.filter(log => log.level === filters.level);
    }

    // Filtro por serviço
    if (filters.service) {
      filtered = filtered.filter(log => log.service === filters.service);
    }

    // Filtro por busca
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(log => 
        String(log.message).toLowerCase().includes(searchLower) ||
        String(log.service).toLowerCase().includes(searchLower) ||
        (log.source && String(log.source).toLowerCase().includes(searchLower))
      );
    }

    // Filtro por data
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(log => new Date(log.timestamp) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999); // Fim do dia
      filtered = filtered.filter(log => new Date(log.timestamp) <= toDate);
    }

    setFilteredLogs(filtered);
  }, [logs, filters]);

  const clearFilters = () => {
    setFilters({
      level: '',
      service: '',
      search: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  const exportLogs = () => {
    const csvContent = [
      'Timestamp,Level,Service,Message,Source',
      ...filteredLogs.map(log => 
        `"${log.timestamp}","${log.level}","${log.service}","${log.message.replace(/"/g, '""')}","${log.source || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newcam-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'info':
        return <Info className="w-4 h-4 text-primary-500" />;
      case 'debug':
        return <CheckCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case 'error':
        return 'destructive';
      case 'warn':
        return 'secondary';
      case 'info':
        return 'default';
      case 'debug':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'backend':
        return <Server className="w-4 h-4" />;
      case 'worker':
        return <Wifi className="w-4 h-4" />;
      case 'camera':
        return <Camera className="w-4 h-4" />;
      case 'database':
        return <Database className="w-4 h-4" />;
      default:
        return <Server className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, 10000); // Atualiza a cada 10 segundos
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const services = [...new Set(logs.map(log => log.service))];
  const levels = ['info', 'warn', 'error', 'debug'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Logs do Sistema</h1>
          <p className="text-gray-600 mt-1">
            Visualização e monitoramento de logs em tempo real
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Auto-refresh
          </Button>
          <Button onClick={fetchLogs} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={exportLogs} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center">
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </h3>
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="ghost"
            size="sm"
          >
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Buscar logs..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="level">Nível</Label>
              <select
                id="level"
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos os níveis</option>
                {levels.map(level => (
                  <option key={level} value={level}>
                    {level.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="service">Serviço</Label>
              <select
                id="service"
                value={filters.service}
                onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos os serviços</option>
                {services.map(service => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="dateFrom">Data Inicial</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="dateTo">Data Final</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
          </div>
        )}

        {showFilters && (
          <div className="flex justify-end mt-4">
            <Button onClick={clearFilters} variant="outline" size="sm">
              Limpar Filtros
            </Button>
          </div>
        )}
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Logs</p>
              <p className="text-2xl font-bold">{filteredLogs.length}</p>
            </div>
            <Info className="w-8 h-8 text-primary-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Erros</p>
              <p className="text-2xl font-bold text-red-600">
                {filteredLogs.filter(log => log.level === 'error').length}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avisos</p>
              <p className="text-2xl font-bold text-yellow-600">
                {filteredLogs.filter(log => log.level === 'warn').length}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Informações</p>
              <p className="text-2xl font-bold text-primary-600">
                {filteredLogs.filter(log => log.level === 'info').length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-primary-500" />
          </div>
        </Card>
      </div>

      {/* Lista de Logs */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Logs Recentes</h3>
        
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
            <p className="text-gray-600">Carregando logs...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <XCircle className="w-8 h-8 mx-auto mb-4 text-red-500" />
            <p className="text-red-600">{error}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <Info className="w-8 h-8 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Nenhum log encontrado com os filtros aplicados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {getLevelIcon(log.level)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant={getLevelBadgeVariant(log.level)}>
                          {log.level.toUpperCase()}
                        </Badge>
                        <div className="flex items-center space-x-1 text-sm text-gray-600">
                          {getServiceIcon(log.service)}
                          <span>{log.service}</span>
                        </div>
                        {log.source && (
                          <span className="text-xs text-gray-500">({log.source})</span>
                        )}
                      </div>
                      <p className="text-gray-900 break-words">{log.message}</p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {log.metadata && (
                    <Button
                      onClick={() => toggleLogExpansion(log.id)}
                      variant="ghost"
                      size="sm"
                    >
                      {expandedLogs.has(log.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
                
                {log.metadata && expandedLogs.has(log.id) && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Metadados:</h4>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Logs;