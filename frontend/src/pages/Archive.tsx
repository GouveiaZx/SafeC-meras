import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, Trash2, Filter, Camera, Play, FileVideo, Clock, HardDrive, Eye, Settings } from 'lucide-react';
import { toast } from 'sonner';
import VideoPlayer from '../components/VideoPlayer';
import { api, endpoints } from '@/lib/api';

interface RecordingsResponse {
  data: Recording[];
  pagination: {
    pages: number;
    total: number;
  };
}

interface StatsResponse {
  data: Record<string, unknown>;
}

interface ExportResponse {
  export_id: string;
}

interface ExportJobResponse {
  data: ExportJob;
}

interface DeleteResponse {
  deleted_count: number;
}

interface CamerasResponse {
  cameras: Camera[];
}

interface Recording {
  id: string;
  camera_id: string;
  camera_name: string;
  camera_location: string;
  created_at: string;
  duration: number;
  duration_formatted: string;
  file_size: number;
  file_size_formatted: string;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  event_type: 'motion' | 'scheduled' | 'manual' | 'alert';
  thumbnail_url?: string;
  download_url: string;
  stream_url: string;
  file_exists: boolean;
}

interface Filters {
  camera_id?: string;
  start_date?: string;
  end_date?: string;
  duration_min?: number;
  duration_max?: number;
  file_size_min?: number;
  file_size_max?: number;
  quality?: string;
  event_type?: string;
  search?: string;
}

interface Camera {
  id: string;
  name: string;
  location: string;
}

interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  download_url?: string;
  error?: string;
}

const Archive: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecordings, setTotalRecordings] = useState(0);
  const [sortBy] = useState<'created_at' | 'duration' | 'file_size' | 'camera_name'>('created_at');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [exportJobs, setExportJobs] = useState<Map<string, ExportJob>>(new Map());
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  
  const limit = 20;
  
  // Carregar câmeras
  const loadCameras = useCallback(async () => {
    try {
      const data = await api.get<CamerasResponse>(endpoints.cameras.getAll());
      setCameras(data.cameras || []);
    } catch (error) {
      console.error('Erro ao carregar câmeras:', error);
    }
  }, []);
  
  // Carregar gravações
  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = {
        page: currentPage.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
        ...Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
        )
      };
      
      const data = await api.get<RecordingsResponse>(endpoints.recordings.getAll(), params);
      setRecordings(data.data || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalRecordings(data.pagination?.total || 0);
    } catch (error) {
      console.error('Erro ao carregar gravações:', error);
      toast.error('Erro ao carregar gravações');
    } finally {
      setLoading(false);
    }
  }, [currentPage, sortBy, sortOrder, filters]);
  
  // Carregar estatísticas
  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<StatsResponse>(endpoints.recordings.getStats(), { period: '30d' });
      setStats(data.data);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }, []);
  
  // Aplicar filtros
  const applyFilters = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);
  
  // Limpar filtros
  const clearFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(1);
  }, []);
  
  // Selecionar/deselecionar gravação
  const toggleRecordingSelection = useCallback((recordingId: string) => {
    setSelectedRecordings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordingId)) {
        newSet.delete(recordingId);
      } else {
        newSet.add(recordingId);
      }
      return newSet;
    });
  }, []);
  
  // Selecionar todas as gravações
  const toggleSelectAll = useCallback(() => {
    if (selectedRecordings.size === recordings.length) {
      setSelectedRecordings(new Set());
    } else {
      setSelectedRecordings(new Set(recordings.map(r => r.id)));
    }
  }, [recordings, selectedRecordings]);
  
  // Download de gravação individual
  const downloadRecording = useCallback(async (recording: Recording) => {
    try {
      const response = await fetch(recording.download_url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${recording.camera_name}_${recording.created_at}.mp4`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success('Download iniciado');
      } else {
        toast.error('Erro ao baixar gravação');
      }
    } catch (error) {
      console.error('Erro no download:', error);
      toast.error('Erro ao baixar gravação');
    }
  }, []);
  
  // Exportar gravações selecionadas
  const exportSelectedRecordings = useCallback(async () => {
    if (selectedRecordings.size === 0) {
      toast.error('Selecione pelo menos uma gravação');
      return;
    }
    
    try {
      const data = await api.post<ExportResponse>(endpoints.recordings.export(), {
        recording_ids: Array.from(selectedRecordings),
        format: 'zip',
        include_metadata: true
      });
      
      const exportJob: ExportJob = {
        id: data.export_id,
        status: 'pending',
        progress: 0
      };
      
      setExportJobs(prev => new Map(prev).set(exportJob.id, exportJob));
      toast.success('Exportação iniciada');
      
      // Monitorar progresso
      monitorExportJob(exportJob.id);
    } catch (error) {
      console.error('Erro na exportação:', error);
      toast.error('Erro ao exportar gravações');
    }
  }, [selectedRecordings]);
  
  // Monitorar job de exportação
  const monitorExportJob = useCallback(async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const data = await api.get<ExportJobResponse>(endpoints.recordings.exportStatus(jobId));
        const job = data.data;
        
        setExportJobs(prev => {
          const newMap = new Map(prev);
          newMap.set(jobId, job);
          return newMap;
        });
        
        if (job.status === 'completed') {
          toast.success('Exportação concluída');
        } else if (job.status === 'failed') {
          toast.error(`Exportação falhou: ${job.error}`);
        } else if (job.status === 'processing') {
          setTimeout(checkStatus, 2000);
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    };
    
    checkStatus();
  }, []);
  
  // Deletar gravações selecionadas
  const deleteSelectedRecordings = useCallback(async () => {
    if (selectedRecordings.size === 0) {
      toast.error('Selecione pelo menos uma gravação');
      return;
    }
    
    if (!confirm(`Tem certeza que deseja deletar ${selectedRecordings.size} gravação(ões)?`)) {
      return;
    }
    
    try {
      const data = await api.delete<DeleteResponse>(endpoints.recordings.deleteMultiple(), {
        recording_ids: Array.from(selectedRecordings),
        confirm: true
      });
      
      toast.success(`${data.deleted_count} gravações deletadas`);
      setSelectedRecordings(new Set());
      loadRecordings();
      loadStats();
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao deletar gravações');
    }
  }, [selectedRecordings, loadRecordings, loadStats]);
  
  // Reproduzir gravação
  const playRecording = useCallback((recording: Recording) => {
    setSelectedRecording(recording);
    setShowPlayer(true);
  }, []);
  
  // Effects
  useEffect(() => {
    loadCameras();
    loadStats();
  }, [loadCameras, loadStats]);
  
  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);
  
  // Render do card de gravação
  const renderRecordingCard = (recording: Recording) => (
    <div
      key={recording.id}
      className={`bg-white rounded-lg shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg ${
        selectedRecordings.has(recording.id) ? 'ring-2 ring-primary-500' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-200">
        {recording.thumbnail_url ? (
          <img
            src={recording.thumbnail_url}
            alt="Thumbnail"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileVideo className="w-12 h-12 text-gray-400" />
          </div>
        )}
        
        {/* Overlay com controles */}
        <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
          <button
            onClick={() => playRecording(recording)}
            className="p-3 bg-white bg-opacity-20 rounded-full hover:bg-opacity-30 transition-colors"
          >
            <Play className="w-6 h-6 text-white" />
          </button>
        </div>
        
        {/* Checkbox de seleção */}
        <div className="absolute top-2 left-2">
          <input
            type="checkbox"
            checked={selectedRecordings.has(recording.id)}
            onChange={() => toggleRecordingSelection(recording.id)}
            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
          />
        </div>
        
        {/* Duração */}
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {recording.duration_formatted}
        </div>
        
        {/* Status do arquivo */}
        {!recording.file_exists && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            Arquivo não encontrado
          </div>
        )}
      </div>
      
      {/* Informações */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold text-gray-900 truncate">{recording.camera_name}</h3>
            <p className="text-sm text-gray-600 truncate">{recording.camera_location}</p>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${
            recording.event_type === 'motion' ? 'bg-yellow-100 text-yellow-800' :
            recording.event_type === 'alert' ? 'bg-red-100 text-red-800' :
            recording.event_type === 'scheduled' ? 'bg-primary-100 text-primary-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {recording.event_type}
          </span>
        </div>
        
        <div className="text-sm text-gray-600 space-y-1">
          <div className="flex items-center justify-between">
            <span>Data:</span>
            <span>{new Date(recording.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tamanho:</span>
            <span>{recording.file_size_formatted}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Qualidade:</span>
            <span className="capitalize">{recording.quality}</span>
          </div>
        </div>
        
        {/* Ações */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button
            onClick={() => playRecording(recording)}
            className="flex items-center space-x-1 text-primary-600 hover:text-primary-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span className="text-sm">Visualizar</span>
          </button>
          
          <button
            onClick={() => downloadRecording(recording)}
            disabled={!recording.file_exists}
            className="flex items-center space-x-1 text-green-600 hover:text-green-700 transition-colors disabled:text-gray-400"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm">Download</span>
          </button>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Arquivo de Gravações</h1>
        <p className="text-gray-600">Gerencie e visualize suas gravações de segurança</p>
      </div>
      
      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <FileVideo className="w-8 h-8 text-primary-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total de Gravações</p>
                <p className="text-2xl font-bold text-gray-900">{(stats as any)?.total?.recordings || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Clock className="w-8 h-8 text-green-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Duração Total</p>
                <p className="text-2xl font-bold text-gray-900">{(stats as any)?.total?.total_duration_formatted || '00:00:00'}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <HardDrive className="w-8 h-8 text-purple-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Espaço Usado</p>
                <p className="text-2xl font-bold text-gray-900">{(stats as any)?.total?.total_size_formatted || '0 B'}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Camera className="w-8 h-8 text-orange-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Câmeras Ativas</p>
                <p className="text-2xl font-bold text-gray-900">{Array.isArray(stats?.by_camera) ? stats.by_camera.length : 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Controles */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Busca */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar gravações..."
                value={filters.search || ''}
                onChange={(e) => applyFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Controles de ação */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
            </button>
            
            {selectedRecordings.size > 0 && (
              <>
                <button
                  onClick={exportSelectedRecordings}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar ({selectedRecordings.size})</span>
                </button>
                
                <button
                  onClick={deleteSelectedRecordings}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Deletar ({selectedRecordings.size})</span>
                </button>
              </>
            )}
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Filtros expandidos */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Câmera</label>
                <select
                  value={filters.camera_id || ''}
                  onChange={(e) => applyFilters({ ...filters, camera_id: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todas as câmeras</option>
                  {cameras.map(camera => (
                    <option key={camera.id} value={camera.id}>
                      {camera.name} - {camera.location}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
                <input
                  type="datetime-local"
                  value={filters.start_date || ''}
                  onChange={(e) => applyFilters({ ...filters, start_date: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
                <input
                  type="datetime-local"
                  value={filters.end_date || ''}
                  onChange={(e) => applyFilters({ ...filters, end_date: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Evento</label>
                <select
                  value={filters.event_type || ''}
                  onChange={(e) => applyFilters({ ...filters, event_type: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todos os tipos</option>
                  <option value="motion">Movimento</option>
                  <option value="scheduled">Agendado</option>
                  <option value="manual">Manual</option>
                  <option value="alert">Alerta</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedRecordings.size === recordings.length && recordings.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Selecionar todos</span>
                </label>
                
                <span className="text-sm text-gray-600">
                  {selectedRecordings.size} de {recordings.length} selecionados
                </span>
              </div>
              
              <button
                onClick={clearFilters}
                className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Lista de gravações */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-12">
          <FileVideo className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma gravação encontrada</h3>
          <p className="text-gray-600">Tente ajustar os filtros ou verificar se há gravações disponíveis.</p>
        </div>
      ) : (
        <>
          <div className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
              : 'grid-cols-1'
          }`}>
            {recordings.map(renderRecordingCard)}
          </div>
          
          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8">
              <div className="text-sm text-gray-600">
                Mostrando {((currentPage - 1) * limit) + 1} a {Math.min(currentPage * limit, totalRecordings)} de {totalRecordings} gravações
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Anterior
                </button>
                
                <span className="px-4 py-2 text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Jobs de exportação */}
      {exportJobs.size > 0 && (
        <div className="fixed bottom-4 right-4 space-y-2">
          {Array.from(exportJobs.values()).map(job => (
            <div key={job.id} className="bg-white rounded-lg shadow-lg p-4 max-w-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Exportação</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  job.status === 'completed' ? 'bg-green-100 text-green-800' :
                  job.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-primary-100 text-primary-800'
                }`}>
                  {job.status}
                </span>
              </div>
              
              {job.status === 'processing' && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  ></div>
                </div>
              )}
              
              {job.status === 'completed' && job.download_url && (
                <a
                  href={job.download_url}
                  className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Baixar arquivo
                </a>
              )}
              
              {job.status === 'failed' && (
                <p className="text-sm text-red-600">{job.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Modal do player */}
      {showPlayer && selectedRecording && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold">{selectedRecording.camera_name}</h3>
                <p className="text-sm text-gray-600">
                  {new Date(selectedRecording.created_at).toLocaleString()}
                </p>
              </div>
              
              <button
                onClick={() => setShowPlayer(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="aspect-video">
              <VideoPlayer
                src={selectedRecording.stream_url}
                poster={selectedRecording.thumbnail_url}
                className="w-full h-full"
                controls={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Archive;