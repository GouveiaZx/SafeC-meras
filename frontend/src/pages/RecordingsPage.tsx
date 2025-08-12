import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Database,
  Play
} from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import LineChart from '@/components/charts/LineChart';
import RecordingPlayer from '@/components/RecordingPlayer';
import { buildAuthenticatedVideoUrl } from '@/utils/videoUrl';
import { useAuth } from '@/contexts/AuthContext';



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

interface RecordingApiResponse {
  id: string;
  camera_id: string;
  cameras?: {name: string};
  filename: string;
  start_time: string;
  end_time: string;
  duration?: number;
  file_size?: number;
  status: string;
  file_path?: string;
  s3_url?: string;
  resolution?: string;
  fps?: number;
  codec?: string;
  bitrate?: number;
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

  // Adicionar hook de autenticação para obter token
  const { token } = useAuth();

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  


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
    } catch (err: unknown) {
      console.error('Erro ao buscar tendências de upload:', err);
      // Manter dados padrão em caso de erro
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      // Montar parâmetros como objeto para usar com api.get
      const params: Record<string, string> = {};
      if (selectedCamera !== 'all') params.camera_id = selectedCamera;
      if (selectedStatus !== 'all') {
        if (['recording', 'completed', 'failed'].includes(selectedStatus)) {
          params.status = selectedStatus;
        } else if (['uploading', 'uploaded', 'pending'].includes(selectedStatus)) {
          params.upload_status = selectedStatus;
        }
      }
      if (searchTerm) params.search = searchTerm;
      if (dateRange.start) params.start_date = dateRange.start;
      if (dateRange.end) params.end_date = dateRange.end;

      const data = await api.get<{success: boolean; data: RecordingApiResponse[]; pagination: {page: number; limit: number; total: number; pages: number}}>(endpoints.recordings.getAll(), params);
      
      // A API retorna { success: true, data: [...], pagination: {...} }
      if (data.success && Array.isArray(data.data)) {
        // Mapear os dados da API para o formato esperado pelo frontend
        const mappedRecordings = data.data.map((recording: RecordingApiResponse) => ({
          id: recording.id,
          cameraId: recording.camera_id,
          cameraName: recording.cameras?.name || 'Câmera desconhecida',
          filename: recording.filename,
          startTime: recording.start_time,
          endTime: recording.end_time,
          duration: recording.duration || 0,
          size: recording.file_size || 0,
          status: recording.status,
          localPath: recording.file_path,
          s3Url: recording.s3_url,
          segments: [], // Por enquanto vazio, pode ser implementado depois
          metadata: {
            resolution: recording.resolution || 'N/A',
            fps: recording.fps || 0,
            codec: recording.codec || 'N/A',
            bitrate: recording.bitrate || 0
          }
        }));
        
        setRecordings(mappedRecordings);
      } else {
        setRecordings([]);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('Erro ao buscar gravações:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [selectedCamera, selectedStatus, searchTerm, dateRange]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<StatsResponse>(endpoints.recordings.getStats());
      setStats(data.data);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      console.error('Erro ao parar gravação:', err);
    }
  };

  const handleRetryUpload = async (recordingId: string, segmentId?: string) => {
    try {
      const endpoint = segmentId 
        ? `/api/recordings/${recordingId}/segments/${segmentId}/retry-upload`
        : `/api/recordings/${recordingId}/retry-upload`;
      
      const response = await api.post(endpoint);
      
      if (response.data.success) {
        // Atualizar lista de gravações
        handleRefresh();
      } else {
        console.error('Erro ao tentar novamente o upload:', response.data.message);
      }
    } catch (error: unknown) {
      console.error('Erro ao tentar novamente o upload:', error);
      const errorMessage = (error as any)?.response?.data?.message || 'Erro ao tentar novamente o upload';
      console.error(errorMessage);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta gravação?')) return;

    try {
      await api.delete(endpoints.recordings.delete(recordingId));
      await handleRefresh();
    } catch (err: unknown) {
      console.error('Erro ao excluir gravação:', err);
    }
  };

  const handlePlayRecording = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsPlayerOpen(true);
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedRecording(null);
  };

  useEffect(() => {
    handleRefresh();
  }, [selectedCamera, selectedStatus, searchTerm, dateRange, handleRefresh]);



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

  const getStatusBadge = (status: string, uploadStatus?: string) => {
    // Priorizar upload_status se disponível
    const currentStatus = uploadStatus || status;
    
    const statusConfig = {
      recording: { color: 'bg-red-100 text-red-800', icon: Video, label: 'Gravando' },
      completed: { color: 'bg-primary-100 text-primary-800', icon: CheckCircle, label: 'Concluída' },
      uploading: { color: 'bg-yellow-100 text-yellow-800', icon: Upload, label: 'Enviando' },
      uploaded: { color: 'bg-green-100 text-green-800', icon: Cloud, label: 'Enviada' },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Falhou' }
    };

    const config = statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.completed;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getStorageIcon = (recording: {s3Url?: string; localPath?: string}) => {
    if (recording.s3Url) {
      return <Cloud className="h-4 w-4 text-green-600" title="Armazenado no Wasabi S3" />;
    } else if (recording.localPath) {
      return <Database className="h-4 w-4 text-blue-600" title="Armazenado localmente" />;
    }
    return <AlertCircle className="h-4 w-4 text-red-600" title="Local de armazenamento desconhecido" />;
  };

  const filteredRecordings = useMemo(() => {
    return recordings.filter((recording) => {
      // Camera filter
      if (selectedCamera !== 'all' && recording.cameraId !== selectedCamera) {
        return false;
      }
      
      // Status filter
      if (selectedStatus !== 'all' && recording.status !== selectedStatus) {
        return false;
      }
      
      // Search term filter
      if (searchTerm && !recording.filename.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !recording.cameraName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [recordings, selectedCamera, selectedStatus, searchTerm, dateRange]);
  
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
          value={formatBytes(stats?.storageUsed?.s3 || 0)}
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
              <span className="font-medium text-yellow-600">{stats?.uploadQueue?.pending || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Processando</span>
              <span className="font-medium text-primary-600">{stats?.uploadQueue?.processing || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Falharam</span>
              <span className="font-medium text-red-600">{stats?.uploadQueue?.failed || 0}</span>
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
                <div key={recording.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div 
                      className="flex items-center space-x-3 cursor-pointer flex-1"
                      onClick={() => handlePlayRecording(recording)}
                    >
                      <div className="relative">
                        <Video className="w-5 h-5 text-primary-500" />
                        <Play className="w-3 h-3 absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 text-primary-600" />
                      </div>
                      <div>
                        <h4 className="font-medium hover:text-primary-600 transition-colors">{recording.filename}</h4>
                        <p className="text-sm text-gray-600">{recording.cameraName}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(recording.startTime).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Ícone de armazenamento */}
                      <div className="flex items-center space-x-1">
                        {getStorageIcon(recording)}
                        {getStatusBadge(recording.status, recording.uploadStatus)}
                      </div>
                      <div className="flex space-x-1">
                        {/* Botão de reprodução destacado */}
                        {(recording.status === 'completed' || recording.status === 'uploaded') && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handlePlayRecording(recording)}
                            className="bg-primary-600 hover:bg-primary-700"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
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
                        {(recording.s3Url || recording.localPath) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const baseDownload = recording.s3Url || `/api/recordings/${recording.id}/download`;
                              const downloadUrl = buildAuthenticatedVideoUrl(baseDownload, { token: token || undefined, includeTokenInQuery: true });
                              window.open(downloadUrl, '_blank');
                            }}
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
                      <p className="font-medium">{recording.metadata?.resolution || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Segmentos:</span>
                      <p className="font-medium">{recording.segments?.length || 0}</p>
                    </div>
                  </div>
                  
                  {recording.segments?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-sm font-medium mb-2">Segmentos:</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {recording.segments?.map((segment: {id: string; filename: string; size: number; duration: number; status: string; uploadStatus?: string}) => (
                          <div key={segment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex-1">
                              <p className="text-xs font-medium">{segment.filename}</p>
                              <p className="text-xs text-gray-600">
                                {formatBytes(segment.size)} • {formatDuration(segment.duration)}
                              </p>
                            </div>
                            <div className="flex items-center space-x-1">
                              {getStorageIcon(segment)}
                              {getStatusBadge(segment.status, segment.uploadStatus)}
                              {(segment.status === 'failed' || segment.uploadStatus === 'failed') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRetryUpload(recording.id, segment.id)}
                                  title="Tentar novamente o upload"
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
          </p>
        )}
      </div>

      {/* Modal de Reprodução */}
      {selectedRecording && (
        <RecordingPlayer
          recording={selectedRecording}
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
};

export default RecordingsPage;