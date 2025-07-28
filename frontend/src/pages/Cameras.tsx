import React, { useState, useEffect } from 'react';
import { Camera, Play, Pause, RotateCcw, Settings, Grid3X3, Maximize2, AlertCircle, Plus, X, Save, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import VideoPlayer from '@/components/VideoPlayer';
import { useAuth } from '@/contexts/AuthContext';

interface CameraData {
  id: string;
  name: string;
  rtsp_url: string;
  status: 'online' | 'offline' | 'error';
  location?: string;
  recording: boolean;
  last_seen?: string;
}

interface StreamStatus {
  camera_id: string;
  status: 'active' | 'inactive' | 'error';
  viewers: number;
  bitrate?: number;
  urls?: {
    hls?: string;
    rtmp?: string;
    rtsp?: string;
    flv?: string;
  };
  stream_id?: string;
}

interface CamerasResponse {
  data: CameraData[];
}

const Cameras: React.FC = () => {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [filteredCameras, setFilteredCameras] = useState<CameraData[]>([]);
  const [streamStatus, setStreamStatus] = useState<Map<string, StreamStatus>>(new Map());
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const location = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    rtsp_url: '',
    rtmp_url: '',
    location: '',
    stream_type: 'rtsp'
  });
  const [saving, setSaving] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedCameraForSettings, setSelectedCameraForSettings] = useState<CameraData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<string | null>(null);

  const handleDeleteCamera = async (cameraId: string) => {
    try {
      await api.delete(endpoints.cameras.delete(cameraId));
      toast.success('Câmera excluída com sucesso!');
      
      // Remover câmera da lista local
      const updatedCameras = cameras.filter(camera => camera.id !== cameraId);
      setCameras(updatedCameras);
      setFilteredCameras(updatedCameras);
      
      // Limpar stream status se existir
      setStreamStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(cameraId);
        return newMap;
      });
      
      setShowDeleteConfirm(false);
      setCameraToDelete(null);
    } catch (error: any) {
      console.error('Erro ao excluir câmera:', error);
      toast.error(error.response?.data?.message || 'Erro ao excluir câmera');
    }
  };

  const handleOpenSettings = (camera: CameraData) => {
    setSelectedCameraForSettings(camera);
    setFormData({
      name: camera.name,
      ip_address: '', // Não temos IP no modelo atual
      rtsp_url: camera.rtsp_url,
      rtmp_url: '',
      location: camera.location || '',
      stream_type: 'rtsp'
    });
    setShowSettingsModal(true);
  };

  const handleUpdateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCameraForSettings) return;
    
    setSaving(true);
    try {
      await api.put(endpoints.cameras.update(selectedCameraForSettings.id), {
        name: formData.name,
        rtsp_url: formData.rtsp_url,
        location: formData.location
      });
      
      toast.success('Câmera atualizada com sucesso!');
      setShowSettingsModal(false);
      setSelectedCameraForSettings(null);
      
      // Recarregar lista de câmeras
      const updatedResult = await api.get<CamerasResponse>(endpoints.cameras.getAll());
      const updatedCameras = updatedResult.data || [];
      setCameras(updatedCameras);
      setFilteredCameras(updatedCameras);
    } catch (error: any) {
      console.error('Erro ao atualizar câmera:', error);
      toast.error(error.response?.data?.message || 'Erro ao atualizar câmera');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (cameraId: string) => {
    setCameraToDelete(cameraId);
    setShowDeleteConfirm(true);
  };

  useEffect(() => {
    const loadCameras = async () => {
      try {
        const result = await api.get<CamerasResponse>(endpoints.cameras.getAll());
        const camerasData = result.data || [];
        setCameras(camerasData);
        setFilteredCameras(camerasData);
        setLoading(false);
      } catch (error) {
        // Erro já tratado no estado
        setError('Erro ao carregar câmeras');
        setLoading(false);
      }
    };

    const loadStreams = async () => {
      try {
        const streamsResult = await api.get(endpoints.streams.getAll()) as { data: any };
        // O backend retorna { data: streams, pagination: ... }
        const activeStreams = streamsResult.data?.data || streamsResult.data || [];
        
        // Mapear streams ativos para o estado
        const streamMap = new Map();
        activeStreams.forEach((stream: any) => {
          streamMap.set(stream.camera_id, {
            camera_id: stream.camera_id,
            status: stream.status,
            viewers: stream.viewers || 0,
            bitrate: stream.bitrate || 2048,
            urls: stream.urls,
            stream_id: stream.id
          });
        });
        
        setStreamStatus(streamMap);
      } catch (error) {
        console.error('Erro ao carregar streams:', error);
      }
    };

    loadCameras();
    loadStreams();
  }, []);

  // Filtrar câmeras baseado no termo de busca da URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchTerm = searchParams.get('search');
    
    if (searchTerm) {
      const filtered = cameras.filter(camera => 
        camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        camera.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        camera.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCameras(filtered);
    } else {
      setFilteredCameras(cameras);
    }
  }, [cameras, location.search]);

  const handleStartStream = async (cameraId: string) => {
    try {
      console.log('handleStartStream chamado com cameraId:', cameraId);
      console.log('Endpoint construído:', endpoints.streams.start(cameraId));
      
      // Verificar se já existe um stream ativo
      const existingStream = streamStatus.get(cameraId);
      if (existingStream && existingStream.status === 'active') {
        toast.info('Stream já está ativo para esta câmera');
        return;
      }
      
      // Chamar API real para iniciar stream
      const response = await api.post(endpoints.streams.start(cameraId), {
        quality: 'medium',
        format: 'hls',
        audio: true
      });
      
      if ((response as any).data) {
        const responseData = (response as any).data;
        // O backend retorna { data: streamConfig }, então acessamos responseData.data
        const streamConfig = responseData.data || responseData;
        setStreamStatus(prev => new Map(prev.set(cameraId, {
          camera_id: cameraId,
          status: 'active',
          viewers: 1,
          bitrate: streamConfig.bitrate || 2048,
          urls: streamConfig.urls,
          stream_id: streamConfig.id
        })));
        
        toast.success('Stream iniciado com sucesso');
      }
    } catch (error: any) {
      console.error('Erro ao iniciar stream:', error);
      const errorMessage = error.message || error.response?.data?.error || 'Erro ao iniciar stream';
      
      if (errorMessage.includes('Stream já está ativo')) {
        toast.info('Stream já está ativo para esta câmera');
        // Recarregar streams para sincronizar o estado
        try {
          const streamsResult = await api.get(endpoints.streams.getAll()) as { data: any };
          // O backend retorna { data: streams, pagination: ... }
          const activeStreams = streamsResult.data?.data || streamsResult.data || [];
          const streamMap = new Map();
          activeStreams.forEach((stream: any) => {
            streamMap.set(stream.camera_id, {
              camera_id: stream.camera_id,
              status: stream.status,
              viewers: stream.viewers || 0,
              bitrate: stream.bitrate || 2048,
              urls: stream.urls,
              stream_id: stream.id
            });
          });
          setStreamStatus(streamMap);
        } catch (syncError) {
          console.error('Erro ao sincronizar streams:', syncError);
        }
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleStopStream = async (cameraId: string) => {
    try {
      // Obter stream_id do status atual
      const currentStream = streamStatus.get(cameraId);
      if (!currentStream?.stream_id) {
        throw new Error('Stream ID não encontrado');
      }
      
      // Chamar API real para parar stream
      await api.post(endpoints.streams.stop(currentStream.stream_id));
      
      setStreamStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(cameraId);
        return newMap;
      });
      
      toast.success('Stream parado com sucesso');
    } catch (error: any) {
      console.error('Erro ao parar stream:', error);
      toast.error(error.response?.data?.message || 'Erro ao parar stream');
    }
  };

  const handleTestConnection = async (cameraId?: string) => {
    if (!cameraId) return;
    
    try {
      toast.info('Testando conexão...');
      
      // Chamar API real para testar conexão
      const response = await api.post(endpoints.cameras.testConnection(cameraId));
      
      if ((response as any).data) {
        const testResult = (response as any).data;
        
        // Atualizar o status da câmera localmente
        setCameras(prev => prev.map(camera => 
          camera.id === cameraId 
            ? { ...camera, status: testResult.success ? 'online' : 'offline' }
            : camera
        ));
        
        setFilteredCameras(prev => prev.map(camera => 
          camera.id === cameraId 
            ? { ...camera, status: testResult.success ? 'online' : 'offline' }
            : camera
        ));
        
        if (testResult.success) {
          toast.success('Conexão testada com sucesso - Câmera online');
        } else {
          toast.warning('Teste de conexão falhou - Câmera offline');
        }
      }
    } catch (error: any) {
      console.error('Erro ao testar conexão:', error);
      toast.error(error.response?.data?.message || 'Erro ao testar conexão');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Auto-preencher IP baseado na URL RTSP
    if (name === 'rtsp_url') {
      parseStreamingUrl(value);
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const parseStreamingUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      setFormData(prev => ({
        ...prev,
        ip_address: hostname,
        name: prev.name || `Câmera ${hostname}`
      }));
    } catch {
      // URL inválida, não fazer nada
    }
  };

  const handleQuickSetup = () => {
    const exampleUrl = 'rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch4/main/av_stream';
    setFormData({
      name: 'Câmera Exemplo',
      ip_address: '170.245.45.10',
      rtsp_url: exampleUrl,
      rtmp_url: '',
      location: 'Portaria Principal',
      stream_type: 'rtsp'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const payload: any = {
        name: formData.name,
        ip_address: formData.ip_address,
        type: 'ip',
        location: formData.location,
        stream_type: formData.stream_type
      };
      
      // Adicionar URL baseado no tipo de stream
      if (formData.stream_type === 'rtmp') {
        payload.rtmp_url = formData.rtmp_url;
      } else {
        payload.rtsp_url = formData.rtsp_url;
      }
      
      await api.post(endpoints.cameras.create(), payload);
      
      toast.success('Câmera cadastrada com sucesso!');
      setShowAddModal(false);
      setFormData({
        name: '',
        ip_address: '',
        rtsp_url: '',
        rtmp_url: '',
        location: '',
        stream_type: 'rtsp'
      });
      
      // Recarregar lista de câmeras
      const updatedResult = await api.get<CamerasResponse>(endpoints.cameras.getAll());
      const updatedCameras = updatedResult.data || [];
      setCameras(updatedCameras);
      setFilteredCameras(updatedCameras);
    } catch (err) {
      // Erro já tratado no toast
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar câmera');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setFormData({
      name: '',
      ip_address: '',
      rtsp_url: '',
      rtmp_url: '',
      location: '',
      stream_type: 'rtsp'
    });
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800';
      case 'offline': return 'bg-red-100 text-red-800';
      case 'error': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando câmeras...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro ao carregar câmeras</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Camera className="h-8 w-8 text-primary-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Câmeras</h1>
                <p className="text-sm text-gray-500">
                  {filteredCameras.filter(c => c.status === 'online').length} de {filteredCameras.length} câmeras online
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Câmera
              </button>
              
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'single'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCameras.map((camera) => {
              const status = streamStatus.get(camera.id);
              return (
                <div key={camera.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  {/* Video Player */}
                  <div className="aspect-video bg-gray-900 relative">
                    {status?.status === 'active' && status?.urls?.hls ? (
                      <VideoPlayer
                        src={status.urls.hls}
                        poster=""
                        className="w-full h-full"
                        controls={true}
                        autoPlay={true}
                        muted={true}
                        token={token}
                      />
                    ) : status?.status === 'active' ? (
                      <div className="w-full h-full flex items-center justify-center text-white">
                        <div className="text-center">
                          <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm opacity-75">Stream Ativo</p>
                          <p className="text-xs opacity-50">{status.bitrate} kbps</p>
                          <p className="text-xs opacity-50 mt-1">Aguardando URL do stream...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <div className="text-center">
                          <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Stream Inativo</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Status Indicator */}
                    <div className="absolute top-3 left-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        getStatusBadge(camera.status)
                      }`}>
                        <div className={`w-2 h-2 rounded-full mr-1 ${
                          camera.status === 'online' ? 'bg-green-500' :
                          camera.status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}></div>
                        {camera.status === 'online' ? 'Online' :
                         camera.status === 'offline' ? 'Offline' : 'Erro'}
                      </span>
                    </div>

                    {/* Recording Indicator */}
                    {camera.recording && (
                      <div className="absolute top-3 right-3">
                        <div className="flex items-center bg-red-600 text-white px-2 py-1 rounded-full text-xs">
                          <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                          REC
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Camera Info */}
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{camera.name}</h3>
                        {camera.location && (
                          <p className="text-sm text-gray-500">{camera.location}</p>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        <button 
                          onClick={() => handleOpenSettings(camera)}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded"
                          title="Configurações"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => confirmDelete(camera.id)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded"
                          title="Excluir câmera"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex space-x-2">
                      {status?.status === 'active' ? (
                        <button
                          onClick={() => handleStopStream(camera.id)}
                          className="flex-1 bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Parar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartStream(camera.id)}
                          className="flex-1 bg-primary-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors flex items-center justify-center"
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {camera.status === 'online' ? 'Iniciar' : 'Tentar Iniciar'}
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleTestConnection(camera.id)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Last Seen */}
                    {camera.last_seen && (
                      <p className="text-xs text-gray-500 mt-2">
                        Última atividade: {new Date(camera.last_seen).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Single View Mode */
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Visualização Individual</h2>
                <select
                  value={selectedCamera || ''}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecione uma câmera</option>
                  {filteredCameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.name} ({camera.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {selectedCamera ? (
              <div className="aspect-video bg-gray-900 relative">
                {(() => {
                  const camera = filteredCameras.find(c => c.id === selectedCamera);
                  const status = streamStatus.get(selectedCamera);
                  
                  if (status?.status === 'active' && status?.urls?.hls) {
                    return (
                      <VideoPlayer
                        src={status.urls.hls}
                        poster=""
                        className="w-full h-full"
                        controls={true}
                        autoPlay={true}
                        muted={false}
                        token={token}
                      />
                    );
                  }
                  
                  return (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <div className="text-center">
                        <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg mb-2">{camera?.name}</p>
                        {status?.status === 'active' ? (
                          <p className="text-sm opacity-75">Aguardando URL do stream...</p>
                        ) : (
                          <div>
                            <p className="text-sm opacity-75 mb-2">Stream não iniciado</p>
                            <button
                              onClick={() => handleStartStream(selectedCamera)}
                              className="bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors flex items-center mx-auto"
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {camera?.status === 'online' ? 'Iniciar Stream' : 'Tentar Iniciar Stream'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="aspect-video bg-gray-100 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Selecione uma câmera para visualizar</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Cadastro de Câmera */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Adicionar Câmera</h2>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleQuickSetup}
                  className="px-3 py-1 text-xs font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Configuração Rápida
                </button>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da Câmera *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                     value={formData.name}
                     onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: Câmera Entrada Principal"
                  />
                </div>
                
                <div>
                  <label htmlFor="ip_address" className="block text-sm font-medium text-gray-700 mb-1">
                    Endereço IP *
                  </label>
                  <input
                    type="text"
                    id="ip_address"
                    name="ip_address"
                    value={formData.ip_address}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="192.168.1.100"
                  />
                </div>
                
                <div>
                  <label htmlFor="stream_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Stream *
                  </label>
                  <select
                    id="stream_type"
                    name="stream_type"
                    value={formData.stream_type}
                    onChange={handleSelectChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="rtsp">RTSP</option>
                    <option value="rtmp">RTMP</option>
                  </select>
                </div>
                
                {formData.stream_type === 'rtsp' && (
                  <div>
                    <label htmlFor="rtsp_url" className="block text-sm font-medium text-gray-700 mb-1">
                      URL RTSP *
                    </label>
                    <input
                      type="text"
                      id="rtsp_url"
                      name="rtsp_url"
                      value={formData.rtsp_url}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="rtsp://usuario:senha@192.168.1.100:554/stream"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Exemplo: rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch4/main/av_stream
                    </p>
                  </div>
                )}
                
                {formData.stream_type === 'rtmp' && (
                  <div>
                    <label htmlFor="rtmp_url" className="block text-sm font-medium text-gray-700 mb-1">
                      URL RTMP *
                    </label>
                    <input
                      type="text"
                      id="rtmp_url"
                      name="rtmp_url"
                      value={formData.rtmp_url}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="rtmp://servidor:1935/live/stream"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Exemplo: rtmp://localhost:1935/live/camera1
                    </p>
                  </div>
                )}
                
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                    Localização
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: Portaria Principal"
                  />
                </div>
                

              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Configurações de Câmera */}
      {showSettingsModal && selectedCameraForSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Configurações da Câmera</h2>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setSelectedCameraForSettings(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateCamera} className="p-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da Câmera *
                  </label>
                  <input
                    type="text"
                    id="edit-name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: Câmera Entrada Principal"
                  />
                </div>
                
                <div>
                  <label htmlFor="edit-rtsp_url" className="block text-sm font-medium text-gray-700 mb-1">
                    URL RTSP *
                  </label>
                  <input
                    type="text"
                    id="edit-rtsp_url"
                    name="rtsp_url"
                    value={formData.rtsp_url}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="rtsp://usuario:senha@192.168.1.100:554/stream"
                  />
                </div>
                
                <div>
                  <label htmlFor="edit-location" className="block text-sm font-medium text-gray-700 mb-1">
                    Localização
                  </label>
                  <input
                    type="text"
                    id="edit-location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: Portaria Principal"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setSelectedCameraForSettings(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Atualizar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && cameraToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Confirmar Exclusão
                  </h3>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  Tem certeza que deseja excluir esta câmera? Esta ação não pode ser desfeita.
                </p>
                <p className="text-sm font-medium text-gray-900 mt-2">
                  Câmera: {cameras.find(c => c.id === cameraToDelete)?.name}
                </p>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setCameraToDelete(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCamera(cameraToDelete)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cameras;