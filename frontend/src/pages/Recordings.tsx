import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Trash2, HardDrive, Clock, FileVideo, Play } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api, endpoints } from '@/lib/api';

interface RecordingsResponse {
  data: Recording[];
  pagination: PaginationInfo;
}

interface StatsResponse {
  data: RecordingStats;
}

interface CleanupResponse {
  results: CleanupResults;
}

interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
  has_prev: boolean;
  has_next: boolean;
}

interface RecordingStats {
  total: number;
  today: number;
  totalSize: number;
  avgDuration: number;
  activeRecordings: number;
}

interface Recording {
  id: string;
  camera_id: string;
  camera_name: string;
  file_path: string;
  s3_url?: string;
  file_size: number;
  duration: number;
  started_at: string;
  ended_at: string;
  quality: string;
  status: 'recording' | 'completed' | 'uploaded' | 'error';
  created_at: string;
  metadata?: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: string;
  };
}



interface CleanupResults {
  localFiles: { deleted: number; freed: number };
  s3Files: { deleted: number; freed: number };
  errors: string[];
}

const Recordings: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [filters, setFilters] = useState({
    camera_id: '',
    status: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState<PaginationInfo>({
    current_page: 1,
    total_pages: 1,
    total_count: 0,
    per_page: 20,
    has_prev: false,
    has_next: false
  });

  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.current_page.toString(),
        limit: pagination.per_page.toString(),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      });

      const data = await api.get<RecordingsResponse>(`${endpoints.recordings.getAll()}?${params}`);
      setRecordings(data.data);
      setPagination(data.pagination);
    } catch (error) {
      toast.error('Erro ao carregar gravações');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current_page, pagination.per_page]);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<StatsResponse>(endpoints.recordings.getStats());
      setStats(data.data);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
    loadStats();
  }, [filters, pagination.current_page, loadRecordings, loadStats]);

  const runCleanup = async () => {
    try {
      setCleanupLoading(true);
      const data = await api.post<CleanupResponse>(endpoints.recordings.cleanup());
      const results: CleanupResults = data.results;
      
      toast.success(
        `Limpeza concluída: ${results.localFiles.deleted + results.s3Files.deleted} arquivos removidos`
      );
      
      // Recarregar dados
      loadRecordings();
      loadStats();
    } catch (error) {
      toast.error('Erro ao executar limpeza');
      console.error(error);
    } finally {
      setCleanupLoading(false);
    }
  };

  const downloadRecording = async (recordingId: string) => {
    try {
      const response = await api.download(endpoints.recordings.download(recordingId));
      
      // Se for redirecionamento para S3, abrir em nova aba
      if (response.redirected) {
        window.open(response.url, '_blank');
      } else {
        // Download direto
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording_${recordingId}.mp4`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      toast.error('Erro ao baixar gravação');
      console.error(error);
    }
  };

  const deleteRecording = async (recordingId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta gravação?')) return;

    try {
      await api.delete(endpoints.recordings.delete(recordingId));
      toast.success('Gravação deletada com sucesso');
      loadRecordings();
      loadStats();
    } catch (error) {
      toast.error('Erro ao deletar gravação');
      console.error(error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      recording: 'default',
      completed: 'secondary',
      uploaded: 'outline',
      error: 'destructive'
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gravações</h1>
          <p className="text-muted-foreground">Gerencie gravações e armazenamento</p>
        </div>
        <Button 
          onClick={runCleanup} 
          disabled={cleanupLoading}
          variant="outline"
        >
          <HardDrive className="w-4 h-4 mr-2" />
          {cleanupLoading ? 'Executando...' : 'Executar Limpeza'}
        </Button>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Gravações</CardTitle>
              <FileVideo className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Espaço Utilizado</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBytes(stats.totalSize)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Duração Total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
            </CardContent>
          </Card>
          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gravações Ativas</CardTitle>
                <Play className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.activeRecordings}
                </div>
              </CardContent>
            </Card>
        </div>
      )}

      <Tabs defaultValue="recordings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recordings">Gravações</TabsTrigger>
          <TabsTrigger value="filters">Filtros</TabsTrigger>
        </TabsList>

        <TabsContent value="filters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Busca</CardTitle>
              <CardDescription>Configure os filtros para buscar gravações específicas</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="camera_id">ID da Câmera</Label>
                <Input
                  id="camera_id"
                  value={filters.camera_id}
                  onChange={(e) => setFilters(prev => ({ ...prev, camera_id: e.target.value }))}
                  placeholder="UUID da câmera"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="w-full p-2 border rounded-md"
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="recording">Gravando</option>
                  <option value="completed">Concluído</option>
                  <option value="uploaded">Enviado</option>
                  <option value="error">Erro</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_date">Data Início</Label>
                <Input
                  id="start_date"
                  type="datetime-local"
                  value={filters.start_date}
                  onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Data Fim</Label>
                <Input
                  id="end_date"
                  type="datetime-local"
                  value={filters.end_date}
                  onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recordings" className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                {recordings.map((recording) => (
                  <Card key={recording.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{recording.id}</h3>
                            {getStatusBadge(recording.status)}
                          </div>
                          
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p><strong>Câmera:</strong> {recording.camera_name || recording.camera_id}</p>
                            <p><strong>Duração:</strong> {formatDuration(recording.duration)}</p>
                            <p><strong>Tamanho:</strong> {formatBytes(recording.file_size)}</p>
                            <p><strong>Qualidade:</strong> {recording.metadata?.resolution || 'N/A'} @ {recording.metadata?.fps || 'N/A'}fps ({recording.quality})</p>
                            <p><strong>Período:</strong> {format(new Date(recording.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(new Date(recording.ended_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadRecording(recording.id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteRecording(recording.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Paginação */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando {recordings.length} de {pagination.total_count} gravações
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.has_prev}
                    onClick={() => setPagination(prev => ({ ...prev, current_page: prev.current_page - 1 }))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.has_next}
                    onClick={() => setPagination(prev => ({ ...prev, current_page: prev.current_page + 1 }))}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Recordings;