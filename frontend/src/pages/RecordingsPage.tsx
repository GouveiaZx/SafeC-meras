import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { api, endpoints } from '@/lib/api';
import VideoPlayer from '../components/VideoPlayer';
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
  Play,
  X
} from 'lucide-react';
import { getAPIBaseURL } from '../lib/api';
import MetricCard from '@/components/dashboard/MetricCard';
import LineChart from '@/components/charts/LineChart';

interface RecordingsResponse {
  success: boolean;
  data: Recording[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface StatsResponse {
  success: boolean;
  data: RecordingStats;
}

interface TrendsResponse {
  success: boolean;
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
  metadata: {
    fps: number;
    codec: string;
    bitrate: number;
  };
}



interface RecordingStats {
  totalRecordings: number;
  totalSize: number;
  totalDuration: number;
  successRate: number;
  averageFileSize: number;
  recordingsByStatus: {
    completed: number;
    recording: number;
    failed: number;
    processing: number;
  };
  // Campos opcionais para compatibilidade
  total?: number;
  today?: number;
  avgDuration?: number;
  activeRecordings?: number;

  uploadedSize?: number;
  pendingUploads?: number;
  failedUploads?: number;
  storageUsed?: {
    local: number;
    s3: number;
  };
  uploadQueue?: {
    pending: number;
    processing: number;
    failed: number;
  };
}

const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecordings, setActiveRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [viewingRecording, setViewingRecording] = useState<Recording | null>(null);

  // Dados de tendência de upload carregados da API
  const [uploadTrendData, setUploadTrendData] = useState<Array<{
    time: string;
    uploads: number;
    failures: number;
    size: number;
  }>>([
    { time: '00:00', uploads: 0, failures: 0, size: 0 },
    { time: '04:00', uploads: 0, failures: 0, size: 0 },
    { time: '08:00', uploads: 0, failures: 0, size: 0 },
    { time: '12:00', uploads: 0, failures: 0, size: 0 },
    { time: '16:00', uploads: 0, failures: 0, size: 0 },
    { time: '20:00', uploads: 0, failures: 0, size: 0 }
  ]);

  const fetchUploadTrends = useCallback(async () => {
    try {
      const response = await api.get<TrendsResponse>(endpoints.recordings.getTrends());
      if (response.success && response.data && response.data.hourly) {
        setUploadTrendData(response.data.hourly);
      }
    } catch (err: unknown) {
      console.error('Erro ao buscar tendências de upload:', err);
      // Manter dados padrão em caso de erro
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      console.log('🔍 [DEBUG] Iniciando busca de gravações...');
      
      const params = new URLSearchParams();
      if (selectedCamera !== 'all') params.append('camera', selectedCamera);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (searchTerm) params.append('search', searchTerm);
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);

      const url = `${endpoints.recordings.getAll()}?${params}`;
      console.log('🔍 [DEBUG] URL da requisição:', url);
      console.log('🔍 [DEBUG] Parâmetros:', Object.fromEntries(params));
      
      const response = await api.get<RecordingsResponse>(url);
      console.log('🔍 [DEBUG] Resposta da API:', response);
      
      if (response.success && response.data) {
        console.log('🔍 [DEBUG] Gravações encontradas:', response.data.length);
        setRecordings(response.data);
      } else {
        console.log('🔍 [DEBUG] Nenhuma gravação encontrada ou estrutura de resposta inválida');
        setRecordings([]);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('❌ [DEBUG] Erro ao buscar gravações:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [selectedCamera, selectedStatus, searchTerm, dateRange]);

  const fetchStats = useCallback(async () => {
    try {
      console.log('📊 [DEBUG] Buscando estatísticas de gravações...');
      const response = await api.get<StatsResponse>(endpoints.recordings.getStats());
      console.log('📊 [DEBUG] Resposta das estatísticas:', response);
      
      if (response.success && response.data) {
        console.log('📊 [DEBUG] Dados das estatísticas:', response.data);
        setStats(response.data);
      } else {
        console.log('📊 [DEBUG] Nenhuma estatística encontrada ou estrutura inválida');
      }
    } catch (err: unknown) {
      console.error('❌ [DEBUG] Erro ao buscar estatísticas:', err);
    }
  }, []);

  const fetchActiveRecordings = useCallback(async () => {
    try {
      console.log('🔴 [DEBUG] Buscando gravações ativas...');
      const response = await api.get<{success: boolean; data: Recording[]; count: number}>(endpoints.recordings.getActive());
      console.log('🔴 [DEBUG] Resposta gravações ativas:', response);
      
      if (response.success && response.data) {
        console.log('🔴 [DEBUG] Gravações ativas encontradas:', response.data.length);
        setActiveRecordings(response.data);
      } else {
        console.log('🔴 [DEBUG] Nenhuma gravação ativa encontrada');
        setActiveRecordings([]);
      }
    } catch (err: unknown) {
      console.error('❌ [DEBUG] Erro ao buscar gravações ativas:', err);
      setActiveRecordings([]);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRecordings(), fetchStats(), fetchUploadTrends(), fetchActiveRecordings()]);
    setLoading(false);
    setLastUpdate(new Date());
  }, [fetchRecordings, fetchStats, fetchUploadTrends, fetchActiveRecordings]);



  const handleStopRecording = async (recordingId: string) => {
    try {
      console.log('🛑 [DEBUG] Parando gravação:', recordingId);
      const response = await api.post<{success: boolean; message?: string; data?: any}>(endpoints.recordings.stop(recordingId));
      console.log('✅ [DEBUG] Resposta do stop:', response);
      
      if (response && typeof response === 'object' && 'success' in response) {
        const typedResponse = response as {success: boolean; message?: string; data?: any};
        if (typedResponse.success) {
          toast.success('Gravação parada com sucesso!');
          await handleRefresh();
        } else {
          throw new Error(typedResponse.message || 'Erro ao parar gravação');
        }
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (err: unknown) {
      console.error('❌ [DEBUG] Erro ao parar gravação:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao parar gravação';
      toast.error(`Erro ao parar gravação: ${errorMessage}`);
    }
  };

  const handleRetryUpload = async (recordingId: string) => {
    try {
      const endpoint = `/recordings/${recordingId}/retry`;
      
      await api.post(endpoint);
      await handleRefresh();
    } catch (err: unknown) {
      console.error('Erro ao tentar novamente o upload:', err);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta gravação?')) return;

    try {
      console.log('🗑️ [DEBUG] Excluindo gravação:', recordingId);
      const response = await api.delete<{success: boolean; message?: string; freed_space?: number}>(endpoints.recordings.delete(recordingId));
      console.log('✅ [DEBUG] Resposta do delete:', response);
      
      if (response && typeof response === 'object' && 'success' in response) {
        const typedResponse = response as {success: boolean; message?: string; freed_space?: number};
        if (typedResponse.success) {
          toast.success('Gravação excluída com sucesso!');
          await handleRefresh();
        } else {
          throw new Error(typedResponse.message || 'Erro ao excluir gravação');
        }
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (err: unknown) {
      console.error('❌ [DEBUG] Erro ao excluir gravação:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao excluir gravação';
      toast.error(`Erro ao excluir gravação: ${errorMessage}`);
    }
  };

  const handleViewRecording = (recording: Recording) => {
    setViewingRecording(recording);
  };

  const getRecordingUrl = (recording: Recording) => {
    // Se tem URL do S3, usar ela diretamente
    if (recording.s3Url) {
      return recording.s3Url;
    }
    
    // Para gravações locais, usar o endpoint de vídeo direto
    if (recording.localPath || recording.id) {
      const apiBaseUrl = getAPIBaseURL();
      // Usar a nova rota /video que serve arquivos MP4 diretamente
      return `${apiBaseUrl}/recordings/${recording.id}/video`;
    }
    
    return null;
  };

  useEffect(() => {
    // Adicionar token de desenvolvimento temporário para testes
    if (!localStorage.getItem('token')) {
      console.log('🔧 [DEBUG] Adicionando token de desenvolvimento para testes');
      localStorage.setItem('token', 'dev-token-for-testing');
      localStorage.setItem('user', JSON.stringify({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // UUID válido para desenvolvimento
        name: 'Usuário de Desenvolvimento',
        email: 'dev@test.com',
        userType: 'ADMIN',
        isActive: true,
        createdAt: new Date().toISOString()
      }));
    }
    
    handleRefresh();
  }, [selectedCamera, selectedStatus, searchTerm, dateRange, handleRefresh]);

  // Atualização automática das gravações ativas a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 [DEBUG] Atualizando gravações ativas automaticamente...');
      fetchActiveRecordings();
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, [fetchActiveRecordings]);



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

  const filteredRecordings = (recordings || []).filter(recording => {
    if (selectedCamera !== 'all' && recording.cameraId !== selectedCamera) return false;
    if (selectedStatus !== 'all' && recording.status !== selectedStatus) return false;
    if (searchTerm && !recording.filename.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !recording.cameraName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading && (!recordings || !recordings.length)) {
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
          value={stats?.recordingsByStatus?.recording || stats?.activeRecordings || 0}
          icon={Video}
          color="red"
        />
        
        <MetricCard
          title="Total de Gravações"
          value={stats?.totalRecordings || stats?.total || 0}
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
          </div>
        </Card>
      </div>

      {/* Gravações Ativas */}
      {activeRecordings.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Video className="w-5 h-5 mr-2 text-red-500" />
              Gravações Ativas ({activeRecordings.length})
            </h3>
            <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              Ao Vivo
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRecordings.map((recording) => (
              <div key={recording.id} className="border border-red-200 bg-red-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Video className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-sm">{recording.cameraName}</span>
                  </div>
                  <Badge className="bg-red-100 text-red-800 text-xs">
                    Gravando
                  </Badge>
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Arquivo: {recording.filename}</div>
                  <div>Iniciado: {new Date(recording.startTime).toLocaleString('pt-BR')}</div>
                  <div>Duração: {formatDuration(recording.duration || 0)}</div>
                </div>
                <div className="mt-3 flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStopRecording(recording.id)}
                    className="text-red-600 border-red-300 hover:bg-red-100"
                  >
                    <Pause className="w-3 h-3 mr-1" />
                    Parar
                  </Button>
                  {getRecordingUrl(recording) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewRecording(recording)}
                      className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Assistir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                        {(recording.status === 'completed' || recording.status === 'uploaded') && getRecordingUrl(recording) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewRecording(recording)}
                            title="Assistir gravação"
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Duração:</span>
                      <p className="font-medium">{formatDuration(recording.duration)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <p className="font-medium">{getStatusBadge(recording.status)}</p>
                    </div>
                  </div>
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

      {/* Modal de Visualização de Gravação */}
      {viewingRecording && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">{viewingRecording.filename}</h3>
                <p className="text-sm text-gray-600">{viewingRecording.cameraName}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingRecording(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <VideoPlayer
                  src={getRecordingUrl(viewingRecording) || undefined}
                  controls={true}
                  autoPlay={false}
                  className="w-full h-full"
                  onError={(error) => {
                    console.error('Erro ao reproduzir gravação:', error);
                    alert('Erro ao reproduzir gravação: ' + error);
                  }}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Duração:</span>
                  <p className="font-medium">{formatDuration(viewingRecording.duration)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <p className="font-medium">{getStatusBadge(viewingRecording.status)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Data:</span>
                  <p className="font-medium">{new Date(viewingRecording.startTime).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingsPage;