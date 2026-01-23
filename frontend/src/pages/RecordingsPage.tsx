import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Upload,
  Database,
  Play,
  Clock,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Calendar
} from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import LineChart from '@/components/charts/LineChart';
import RecordingPlayer from '@/components/RecordingPlayer';
import { buildAuthenticatedVideoUrl } from '@/utils/videoUrl';
import { useAuth } from '@/contexts/AuthContext';
import useSocket from '@/hooks/useSocket';

interface Camera {
  id: string;
  name: string;
  status: string;
}

interface CamerasResponse {
  data: Camera[];
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

interface RecordingApiResponse {
  id: string;
  camera_id: string;
  camera_name?: string;
  cameras?: {name: string};
  filename: string;
  start_time: string;
  end_time: string;
  duration?: number;
  file_size?: number;
  status: string;
  upload_status?: string;
  upload_progress?: number;
  file_path?: string;
  s3_url?: string;
  s3_key?: string;
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
  start_time?: string;
  end_time?: string;
  duration: number;
  size: number;
  file_size?: number;
  status: string;
  uploadStatus: string;
  uploadProgress?: number;
  localPath?: string;
  s3Url?: string;
  s3Key?: string;
  segments: RecordingSegment[];
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: number;
  };
  displayStatus?: string;
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

interface ZLMActiveRecording {
  camera_id: string;
  camera_name: string;
  camera_location: string;
  is_recording: boolean;
  source?: 'ZLMediaKit' | 'SRS-DVR';
  stream_alive_seconds: number;
  viewers: number;
  current_file_size: number;
  current_file_name: string | null;
  recording_started_at: string;
  segment_elapsed_seconds?: number;
  segment_remaining_seconds?: number;
  segment_duration?: number;
  video_fps?: number;
}

const RecordingsPage: React.FC = () => {

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [zlmActiveRecordings, setZlmActiveRecordings] = useState<ZLMActiveRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Adicionar hook de autenticação para obter token e verificar permissões
  const { token, user } = useAuth();
  const isAdmin = user?.userType === 'ADMIN';

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // ✅ Ref para debouncing de atualizações de status via WebSocket
  const statusUpdateTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Definir funções primeiro para evitar erro de inicialização
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<StatsResponse>(endpoints.recordings.getStats());
      setStats(data.data);
    } catch (err: unknown) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }, []);

  // Buscar datas que têm gravações (para indicadores no calendário)
  const fetchAvailableDates = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (selectedCamera !== 'all') params.camera_id = selectedCamera;

      const data = await api.get<{success: boolean; data: string[]}>('/recordings/available-dates', params);
      if (data.success && Array.isArray(data.data)) {
        setAvailableDates(data.data);
      }
    } catch (err: unknown) {
      console.error('Erro ao buscar datas disponíveis:', err);
    }
  }, [selectedCamera]);

  // Buscar gravações ativas diretamente do ZLMediaKit (fonte da verdade)
  const fetchZlmActiveRecordings = useCallback(async () => {
    try {
      const data = await api.get<{success: boolean; data: ZLMActiveRecording[]; count: number}>('/recordings/zlm-active');
      if (data.success && Array.isArray(data.data)) {
        setZlmActiveRecordings(data.data);
        console.log(`📹 ZLM Active: ${data.count} câmeras gravando`);
      } else {
        setZlmActiveRecordings([]);
      }
    } catch (err: unknown) {
      console.error('Erro ao buscar gravações ativas do ZLM:', err);
      setZlmActiveRecordings([]);
    }
  }, []);

  const fetchRecordingSegments = useCallback(async (recordingId: string): Promise<RecordingSegment[]> => {
    try {
      const data = await api.get<{success: boolean; data: any[]}>(endpoints.recordings.getSegments(recordingId));
      if (data.success && Array.isArray(data.data)) {
        return data.data.map((segment: any) => ({
          id: segment.id,
          filename: segment.filename,
          startTime: segment.start_time,
          endTime: segment.end_time,
          duration: segment.duration || 0,
          size: segment.file_size || 0,
          status: segment.status,
          localPath: segment.file_path,
          s3Url: segment.s3_url,
          uploadAttempts: segment.upload_attempts || 0
        }));
      }
      return [];
    } catch (error) {
      console.error('Erro ao buscar segmentos da gravação:', error);
      return [];
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
        const mappedRecordings = await Promise.all(
          data.data.map(async (recording: RecordingApiResponse) => {
            // Calcular duração se não estiver disponível
            let duration = recording.duration || 0;
            if (!duration && recording.start_time && recording.end_time) {
              const startTime = new Date(recording.start_time);
              const endTime = new Date(recording.end_time);
              duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
            }
            
            // Extrair nome da câmera corretamente
            const cameraName = recording.camera_name ||
                              recording.cameras?.name ||
                              `Câmera ${recording.camera_id?.substring(0, 8) || 'Desconhecida'}`;

            // Segments são carregados sob demanda quando usuário clica na gravação
            // Removido: const segments = await fetchRecordingSegments(recording.id);
            const segments: RecordingSegment[] = [];

            return {
              id: recording.id,
              cameraId: recording.camera_id,
              cameraName: cameraName,
              filename: recording.filename,
              startTime: recording.start_time,
              endTime: recording.end_time,
              duration: duration,
              size: recording.file_size || 0,
              status: recording.status,
              uploadStatus: recording.upload_status || 'pending',
              uploadProgress: recording.upload_progress,
              localPath: recording.file_path,
              s3Url: recording.s3_url,
              s3Key: recording.s3_key,
              segments: segments,
              metadata: {
                resolution: recording.resolution || 'N/A',
                fps: recording.fps || 0,
                codec: recording.codec || 'h264',
                bitrate: recording.bitrate || 0
              }
            };
          })
        );
        
        setRecordings(mappedRecordings);
      } else {
        setRecordings([]);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('Erro ao buscar gravações:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [selectedCamera, selectedStatus, searchTerm, dateRange, fetchRecordingSegments]);
  
  // WebSocket para notificações em tempo real
  const { isConnected } = useSocket({
    recording_status_changed: useCallback((data: any) => {
      console.log('📊 WebSocket - Status da gravação alterado:', data);

      // ✅ DEBOUNCING: Cancelar timeout anterior para este recording_id
      const recordingId = data.recording_id;
      if (statusUpdateTimeoutsRef.current[recordingId]) {
        clearTimeout(statusUpdateTimeoutsRef.current[recordingId]);
      }

      // ✅ Criar novo timeout de 300ms antes de atualizar
      statusUpdateTimeoutsRef.current[recordingId] = setTimeout(() => {
        // Atualizar a gravação específica na lista
        setRecordings(prev =>
          prev.map(recording =>
            recording.id === recordingId
              ? {
                  ...recording,
                  status: data.status,
                  uploadStatus: data.upload_status,
                  uploadProgress: data.upload_progress || 0,
                  s3Key: data.s3_key,
                  s3Url: data.s3_url,
                  displayStatus: data.display_status
                }
              : recording
          )
        );

        // Atualizar estatísticas
        fetchStats();

        setLastUpdate(new Date());

        // Limpar timeout do ref após execução
        delete statusUpdateTimeoutsRef.current[recordingId];
      }, 300); // 300ms de debounce para evitar flickering
    }, [fetchStats]),

    upload_progress: useCallback((data: any) => {
      console.log('📤 WebSocket - Progresso do upload:', data);
      
      // Atualizar progresso da gravação específica
      setRecordings(prev => 
        prev.map(recording => 
          recording.id === data.recording_id 
            ? {
                ...recording,
                uploadProgress: data.progress,
                uploadStatus: 'uploading',
                displayStatus: `Enviando... (${data.progress}%)`
              }
            : recording
        )
      );
    }, []),

    upload_error: useCallback((data: any) => {
      console.error('❌ WebSocket - Erro no upload:', data);
      
      // Atualizar status da gravação para erro
      setRecordings(prev => 
        prev.map(recording => 
          recording.id === data.recording_id 
            ? {
                ...recording,
                uploadStatus: 'failed',
                displayStatus: 'Erro no upload'
              }
            : recording
        )
      );
      
      // Atualizar estatísticas
      fetchStats();
    }, [fetchStats]),

    new_recording: useCallback((data: any) => {
      console.log('🎥 WebSocket - Nova gravação:', data);
      
      // Recarregar dados para mostrar nova gravação
      fetchRecordings();
      fetchStats();
    }, [fetchRecordings, fetchStats]),

    recordings_refresh: useCallback((data: any) => {
      console.log('🔄 WebSocket - Refresh forçado:', data);
      
      // Forçar recarregamento completo dos dados
      fetchRecordings();
      fetchStats();
    }, [fetchRecordings, fetchStats]),

    connection_established: useCallback((data: any) => {
      console.log('✅ WebSocket - Conexão estabelecida:', data);
    }, []),

    error: useCallback((error: any) => {
      console.error('❌ WebSocket - Erro:', error);
    }, [])
  });

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
      console.log('🔄 Fetching upload trends...');
      const data = await api.get<TrendsResponse>(endpoints.recordings.getTrends());
      
      console.log('📊 Upload trends response:', {
        hasData: !!data.data,
        hasHourly: !!(data.data && data.data.hourly),
        hourlyLength: data.data?.hourly?.length || 0,
        sampleItem: data.data?.hourly?.[0]
      });
      
      if (data.data && data.data.hourly && Array.isArray(data.data.hourly)) {
        console.log('✅ Setting upload trend data:', data.data.hourly.length, 'items');
        setUploadTrendData(data.data.hourly);
      } else {
        console.warn('⚠️ Invalid upload trends data structure');
      }
    } catch (err: unknown) {
      console.error('❌ Erro ao buscar tendências de upload:', err);
      // Manter dados padrão em caso de erro
    }
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const response = await api.get<CamerasResponse>(endpoints.cameras.getAll(), { limit: '100' });
      const camerasData = response.data || [];
      setCameras(camerasData);
    } catch (err) {
      console.error('Erro ao carregar câmeras:', err);
      setCameras([]);
    }
  }, []);


  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRecordings(), fetchStats(), fetchUploadTrends(), fetchZlmActiveRecordings()]);
    setLoading(false);
    setLastUpdate(new Date());
  }, [fetchRecordings, fetchStats, fetchUploadTrends, fetchZlmActiveRecordings]);



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
        ? endpoints.recordings.retrySegmentUpload(recordingId, segmentId)
        : endpoints.recordings.retryUpload(recordingId);
      
      const response = await api.post<{ success: boolean; message?: string }>(endpoint);
      
      if (response.success) {
        await handleRefresh();
      } else {
        console.error('Erro ao tentar novamente o upload:', response.message);
      }
    } catch (error: unknown) {
      const errorMessage = (error as any)?.message || 'Erro ao tentar novamente o upload';
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

  // Auto-refresh effect - ajustado dinamicamente baseado na conexão WebSocket
  useEffect(() => {
    // Se WebSocket não estiver conectado, usar refresh mais frequente para compensar
    const refreshInterval = isConnected ? 60000 : 10000; // 60s se conectado (WebSocket compensa), 10s se não conectado
    
    const autoRefreshInterval = setInterval(() => {
      // Apenas atualizar se não estivermos carregando para evitar spam
      if (!loading) {
        fetchRecordings();
        fetchStats();
        fetchZlmActiveRecordings();
      }
    }, refreshInterval);

    return () => clearInterval(autoRefreshInterval);
  }, [fetchRecordings, fetchStats, fetchZlmActiveRecordings, isConnected, loading]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  // Buscar datas disponíveis quando componente monta ou câmera muda
  useEffect(() => {
    fetchAvailableDates();
  }, [fetchAvailableDates]);

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

  const getStatusBadge = (status: string, uploadStatus?: string, uploadProgress?: number) => {
    // ✅ CORREÇÃO: Priorizar status de gravação ativa sobre upload_status
    let currentStatus = status;
    let label = '';

    // PRIORIDADE 1: Se está gravando ativamente, sempre mostrar "Gravando"
    if (status === 'recording') {
      currentStatus = 'recording';
      label = 'Gravando';
    }
    // PRIORIDADE 2: Se gravação falhou, mostrar erro
    else if (status === 'failed') {
      currentStatus = 'failed';
      label = 'Falhou';
    }
    // PRIORIDADE 3: Se gravação completa, verificar status de upload
    else if (status === 'completed' && uploadStatus) {
      switch (uploadStatus) {
        case 'pending':
          currentStatus = 'pending';
          label = 'Aguardando';
          break;
        case 'queued':
          currentStatus = 'queued';
          label = 'Na fila';
          break;
        case 'uploading':
          currentStatus = 'uploading';
          label = uploadProgress ? `Enviando ${uploadProgress}%` : 'Enviando...';
          break;
        case 'uploaded':
          currentStatus = 'uploaded';
          label = 'Na nuvem';
          break;
        case 'failed':
          currentStatus = 'upload_failed';
          label = 'Erro no upload';
          break;
        default:
          currentStatus = uploadStatus;
          label = uploadStatus;
      }
    }
    // PRIORIDADE 4: Se gravação completa sem upload_status, mostrar "Local"
    else if (status === 'completed') {
      currentStatus = 'completed';
      label = 'Local';
    }
    // FALLBACK: Status desconhecido
    else {
      currentStatus = status;
      label = status;
    }
    
    const statusConfig = {
      recording: { color: 'bg-red-100 text-red-800', icon: Video },
      completed: { color: 'bg-blue-100 text-blue-800', icon: HardDrive },
      pending: { color: 'bg-gray-100 text-gray-800', icon: Clock },
      queued: { color: 'bg-purple-100 text-purple-800', icon: Clock },
      uploading: { color: 'bg-yellow-100 text-yellow-800', icon: Upload },
      uploaded: { color: 'bg-green-100 text-green-800', icon: Cloud },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle },
      upload_failed: { color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
    };

    const config = statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.completed;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const getStorageIcon = (recording: {s3Url?: string; localPath?: string}) => {
    if (recording.s3Url) {
      return <span title="Armazenado no Wasabi S3"><Cloud className="h-4 w-4 text-green-600" /></span>;
    } else if (recording.localPath) {
      return <span title="Armazenado localmente"><Database className="h-4 w-4 text-blue-600" /></span>;
    }
    return <span title="Local de armazenamento desconhecido"><AlertCircle className="h-4 w-4 text-red-600" /></span>;
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
          {/* Indicador de conexão WebSocket - apenas quando conectado */}
          {isConnected && (
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-600">
                Tempo real ativo
              </span>
            </div>
          )}
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
          value={zlmActiveRecordings.length}
          icon={Video}
          color={zlmActiveRecordings.length > 0 ? "red" : "gray"}
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

      {/* Resumo Compacto de Gravações em Andamento */}
      {zlmActiveRecordings.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-red-500 animate-pulse" />
            <span className="font-medium text-red-600 dark:text-red-400">
              {zlmActiveRecordings.length} {zlmActiveRecordings.length === 1 ? 'câmera gravando' : 'câmeras gravando'}
            </span>
          </div>
          <div className="flex-1 flex flex-wrap gap-2">
            {zlmActiveRecordings.map((rec) => (
              <Badge
                key={rec.camera_id}
                variant="outline"
                className="bg-white dark:bg-gray-800 border-red-300 text-xs"
              >
                <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5 animate-pulse"></span>
                {rec.camera_name}
              </Badge>
            ))}
          </div>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Clique na câmera para ver detalhes
          </span>
        </div>
      )}

      {/* Gráfico de Tendência de Uploads - Apenas Admin */}
      {isAdmin && (
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
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
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
          
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            placeholder="Data inicial"
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            placeholder="Data final"
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Atalhos rápidos e calendário com indicadores */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          {/* Atalhos rápidos */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm text-gray-600 font-medium">Filtros rápidos:</span>
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setDateRange({ start: today, end: today });
              }}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                dateRange.start === new Date().toISOString().split('T')[0] && dateRange.end === new Date().toISOString().split('T')[0]
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(today.getDate() - 7);
                setDateRange({
                  start: weekAgo.toISOString().split('T')[0],
                  end: today.toISOString().split('T')[0]
                });
              }}
              className="px-3 py-1 text-xs rounded-full border bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 transition-colors"
            >
              7 dias
            </button>
            <button
              onClick={() => {
                const today = new Date();
                const monthAgo = new Date(today);
                monthAgo.setDate(today.getDate() - 30);
                setDateRange({
                  start: monthAgo.toISOString().split('T')[0],
                  end: today.toISOString().split('T')[0]
                });
              }}
              className="px-3 py-1 text-xs rounded-full border bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 transition-colors"
            >
              30 dias
            </button>
            {dateRange.start && (
              <button
                onClick={() => setDateRange({ start: '', end: '' })}
                className="px-3 py-1 text-xs rounded-full border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition-colors"
              >
                Limpar
              </button>
            )}
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`ml-auto px-3 py-1 text-xs rounded-full border flex items-center gap-1 transition-colors ${
                showCalendar
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {availableDates.length} dias com gravações
            </button>
          </div>

          {/* Mini-calendário expansível */}
          {showCalendar && availableDates.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 mt-2">
              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const newDate = new Date(prev);
                    newDate.setMonth(prev.getMonth() - 1);
                    return newDate;
                  })}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const newDate = new Date(prev);
                    newDate.setMonth(prev.getMonth() + 1);
                    return newDate;
                  })}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Grid do calendário */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {/* Cabeçalho dias da semana */}
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                  <div key={i} className="text-xs font-medium text-gray-500 py-1">{day}</div>
                ))}

                {/* Dias do mês */}
                {(() => {
                  const year = calendarMonth.getFullYear();
                  const month = calendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const days = [];

                  // Dias vazios antes do primeiro dia
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} className="py-1"></div>);
                  }

                  // Dias do mês
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const hasRecording = availableDates.includes(dateStr);
                    const isSelected = dateRange.start === dateStr || dateRange.end === dateStr;
                    const isInRange = dateRange.start && dateRange.end && dateStr >= dateRange.start && dateStr <= dateRange.end;
                    const isToday = dateStr === new Date().toISOString().split('T')[0];

                    days.push(
                      <button
                        key={day}
                        onClick={() => hasRecording && setDateRange({ start: dateStr, end: dateStr })}
                        disabled={!hasRecording}
                        className={`
                          py-1 text-xs rounded transition-colors relative
                          ${isSelected ? 'bg-primary-500 text-white' : ''}
                          ${isInRange && !isSelected ? 'bg-primary-100 text-primary-700' : ''}
                          ${hasRecording && !isSelected && !isInRange ? 'hover:bg-green-100 text-gray-700 font-medium' : ''}
                          ${!hasRecording ? 'text-gray-300 cursor-default' : 'cursor-pointer'}
                          ${isToday && !isSelected ? 'ring-1 ring-primary-400' : ''}
                        `}
                        title={hasRecording ? `Clique para filtrar ${dateStr}` : 'Sem gravações'}
                      >
                        {day}
                        {hasRecording && !isSelected && (
                          <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-green-500 rounded-full"></span>
                        )}
                      </button>
                    );
                  }

                  return days;
                })()}
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Com gravações
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 bg-primary-500 rounded text-white text-[10px] flex items-center justify-center">1</span>
                  Selecionado
                </span>
              </div>
            </div>
          )}
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
                <div key={recording.id} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div
                      className="flex items-center space-x-3 cursor-pointer min-w-0"
                      onClick={() => handlePlayRecording(recording)}
                    >
                      <div className="relative">
                        <Video className="w-5 h-5 text-primary-500" />
                        <Play className="w-3 h-3 absolute bottom-0 right-0 bg-white rounded-full p-0.5 text-primary-600" />
                      </div>
                      <div>
                        <h4 className="font-medium hover:text-primary-600 transition-colors">{recording.filename}</h4>
                        <p className="text-sm text-gray-600">{recording.cameraName}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(recording.startTime).toLocaleDateString('pt-BR')} | Início: {new Date(recording.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - Fim: {recording.endTime ? new Date(recording.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-start">
                      {/* Ícone de armazenamento */}
                      <div className="flex items-center space-x-1">
                        {getStorageIcon(recording)}
                        {getStatusBadge(recording.status, recording.uploadStatus, recording.uploadProgress)}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {/* Botão de reprodução destacado */}
                        {(recording.localPath || recording.s3Url || (recording.status === 'completed' && recording.size > 0)) && (
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
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteRecording(recording.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Duração:</span>
                      <p className="font-medium">
                        {recording.duration && recording.duration > 0 ? 
                          formatDuration(recording.duration) :
                          recording.end_time && recording.start_time ? 
                            formatDuration(Math.floor((new Date(recording.end_time).getTime() - new Date(recording.start_time).getTime()) / 1000)) :
                            '--'
                        }
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Tamanho:</span>
                      <p className="font-medium">
                        {recording.file_size && recording.file_size > 0 ? formatBytes(recording.file_size) : 
                         recording.size && recording.size > 0 ? formatBytes(recording.size) : '--'}
                      </p>
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
