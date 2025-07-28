import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { api, endpoints } from '@/lib/api';
import {
  Video,
  Pause,
  Download,
  Trash2,
  Search,
  Cloud,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Upload,
  Database
} from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import LineChart from '@/components/charts/LineChart';

interface RecordingsResponse {
  data: {
    recordings: Recording[];
  };
}

interface StatsResponse {
  data: RecordingStats;
}

interface TrendsResponse {
  data: {
    hourly: Array<{
      time: string;
      uploads: number;
      failures: number;
      size: number;
    }>;
  };
}

interface Recording {
  id: string;
  cameraId: string;
  cameraName: string;
  filename: string;
  startTime: string;
  endTime: string;
  duration: number;
  size: number;
  status: 'recording' | 'completed' | 'uploading' | 'uploaded' | 'failed';
  localPath?: string;
  s3Url?: string;
  segments: RecordingSegment[];
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: number;
  };
}

interface RecordingSegment {
  id: string;
  filename: string;
  startTime: string;
  endTime: string;
  duration: number;
  size: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  localPath?: string;
  s3Url?: string;
  uploadAttempts: number;
}

interface RecordingStats {
  totalRecordings: number;
  activeRecordings: number;
  totalSegments: number;
  totalSize: number;
  uploadedSize: number;
  pendingUploads: number;
  failedUploads: number;
  storageUsed: {
    local: number;
    s3: number;
  };
  uploadQueue: {
    pending: number;
    processing: number;
    failed: number;
  };
}

const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Dados de tendência de upload carregados da API
  const [uploadTrendData, setUploadTrendData] = useState([
    { time: '00:00', uploads: 0, failures: 0, size: 0 },
    { time: '04:00', uploads: 0, failures: 0, size: 0 },
    { time: '08:00', uploads: 0, failures: 0, size: 0 },
    { time: '12:00', uploads: 0, failures: 0, size: 0 },
    { time: '16:00', uploads: 0, failures: 0, size: 0 },
    { time: '20:00', uploads: 0, failures: 0, size: 0 }
  ]);

  const fetchUploadTrends = useCallback(async () => {
    try {
      const data = await api.get<TrendsResponse>(endpoints.recordings.getTrends());
      if (data.data && data.data.hourly) {
        setUploadTrendData(data.data.hourly);
      }
    } catch (err) {
      console.error('Erro ao buscar tendências de upload:', err);
      // Manter dados padrão em caso de erro
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCamera !== 'all') params.append('camera', selectedCamera);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (searchTerm) params.append('search', searchTerm);
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);

      const data = await api.get<RecordingsResponse>(`${endpoints.recordings.getAll()}?${params}`);
      setRecordings(data.data.recordings || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [selectedCamera, selectedStatus, searchTerm, dateRange]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<StatsResponse>(endpoints.recordings.getStats());
      setStats(data.data);
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRecordings(), fetchStats(), fetchUploadTrends()]);
    setLoading(false);
    setLastUpdate(new Date());
  }, [fetchRecordings, fetchStats, fetchUploadTrends]);



  const handleStopRecording = async (recordingId: string) => {
    try {
      await api.post(endpoints.recordings.stop(recordingId));
      await handleRefresh();
    } catch (err) {
      console.error('Erro ao parar gravação:', err);
    }
  };

  const handleRetryUpload = async (recordingId: string, segmentId?: string) => {
    try {
      const endpoint = segmentId 
        ? `/recordings/${recordingId}/segments/${segmentId}/retry`
        : `/recordings/${recordingId}/retry`;
      
      await api.post(endpoint);
      await handleRefresh();
    } catch (err) {
      console.error('Erro ao tentar novamente o upload:', err);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta gravação?')) return;

    try {
      await api.delete(endpoints.recordings.delete(recordingId));
      await handleRefresh();
    } catch (err) {
      console.error('Erro ao excluir gravação:', err);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, [selectedCamera, selectedStatus, searchTerm, dateRange, handleRefresh]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchRecordings();
      fetchStats();
      fetchUploadTrends();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedCamera, selectedStatus, searchTerm, dateRange, fetchRecordings, fetchStats, fetchUploadTrends]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      recording: { color: 'bg-red-100 text-red-800', icon: Video, label: 'Gravando' },
      completed: { color: 'bg-primary-100 text-primary-800', icon: CheckCircle, label: 'Concluída' },
      uploading: { color: 'bg-yellow-100 text-yellow-800', icon: Upload, label: 'Enviando' },
      uploaded: { color: 'bg-green-100 text-green-800', icon: Cloud, label: 'Enviada' },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Falhou' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.completed;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredRecordings = recordings.filter(recording => {
    if (selectedCamera !== 'all' && recording.cameraId !== selectedCamera) return false;
    if (selectedStatus !== 'all' && recording.status !== selectedStatus) return false;
    if (searchTerm && !recording.filename.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !recording.cameraName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading && !recordings.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
          <p className="text-gray-600">Carregando gravações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gravações</h1>
          <p className="text-gray-600 mt-1">
            Gerenciamento de gravações e uploads para S3
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
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Métricas de Gravação */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Gravações Ativas"
          value={stats?.activeRecordings || 0}
          icon={Video}
          color="red"
        />
        
        <MetricCard
          title="Total de Gravações"
          value={stats?.totalRecordings || 0}
          icon={Database}
          color="blue"
        />
        
        <MetricCard
          title="Uploads Pendentes"
          value={stats?.pendingUploads || 0}
          icon={Upload}
          color="yellow"
        />
        
        <MetricCard
          title="Armazenamento S3"
          value={formatBytes(stats?.storageUsed.s3 || 0)}
          icon={Cloud}
          color="green"
        />
      </div>

      {/* Gráfico de Tendência de Uploads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LineChart
            data={uploadTrendData}
            height={300}
            title="Tendência de Uploads (Últimas 24h)"
            lines={[
              { dataKey: 'uploads', name: 'Uploads', color: '#3b82f6', unit: '' },
              { dataKey: 'failures', name: 'Falhas', color: '#ef4444', unit: '' }
            ]}
          />
        </div>
        
        {/* Estatísticas da Fila de Upload */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Upload className="w-5 h-5 mr-2 text-primary-500" />
            Fila de Upload
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Pendentes</span>
              <span className="font-medium text-yellow-600">{stats?.uploadQueue.pending || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Processando</span>
              <span className="font-medium text-primary-600">{stats?.uploadQueue.processing || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Falharam</span>
              <span className="font-medium text-red-600">{stats?.uploadQueue.failed || 0}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total de Segmentos</span>
                <span className="font-medium">{stats?.totalSegments || 0}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar gravações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">Todas as câmeras</option>
            <option value="cam-001">CAM-001</option>
            <option value="cam-002">CAM-002</option>
            <option value="cam-003">CAM-003</option>
          </select>
          
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">Todos os status</option>
            <option value="recording">Gravando</option>
            <option value="completed">Concluída</option>
            <option value="uploading">Enviando</option>
            <option value="uploaded">Enviada</option>
            <option value="failed">Falhou</option>
          </select>
          
          <div className="flex space-x-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      {/* Lista de Gravações */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Gravações ({filteredRecordings.length})</h3>
          
          {filteredRecordings.length === 0 ? (
            <div className="text-center py-8">
              <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">Nenhuma gravação encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecordings.map((recording) => (
                <div key={recording.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Video className="w-5 h-5 text-primary-500" />
                      <div>
                        <h4 className="font-medium">{recording.filename}</h4>
                        <p className="text-sm text-gray-600">{recording.cameraName}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(recording.status)}
                      <div className="flex space-x-1">
                        {recording.status === 'recording' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStopRecording(recording.id)}
                          >
                            <Pause className="w-4 h-4" />
                          </Button>
                        )}
                        {recording.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryUpload(recording.id)}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        {recording.s3Url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(recording.s3Url, '_blank')}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteRecording(recording.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Duração:</span>
                      <p className="font-medium">{formatDuration(recording.duration)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Tamanho:</span>
                      <p className="font-medium">{formatBytes(recording.size)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Resolução:</span>
                      <p className="font-medium">{recording.metadata.resolution}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Segmentos:</span>
                      <p className="font-medium">{recording.segments.length}</p>
                    </div>
                  </div>
                  
                  {recording.segments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-sm font-medium mb-2">Segmentos:</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {recording.segments.map((segment) => (
                          <div key={segment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex-1">
                              <p className="text-xs font-medium">{segment.filename}</p>
                              <p className="text-xs text-gray-600">
                                {formatBytes(segment.size)} • {formatDuration(segment.duration)}
                              </p>
                            </div>
                            <div className="flex items-center space-x-1">
                              {getStatusBadge(segment.status)}
                              {segment.status === 'failed' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRetryUpload(recording.id, segment.id)}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

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

export default RecordingsPage;