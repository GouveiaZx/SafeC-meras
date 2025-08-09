import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertCircle, Settings } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface StreamInfo {
  id: string;
  camera_id: string;
  name: string;
  status: string;
  urls: {
    hls: string;
    flv: string;
    rtsp: string;
    rtmp: string;
  };
  quality: string;
  fps: number;
  startedAt?: string;
}

const StreamViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('720p');
  const [selectedFps, setSelectedFps] = useState<number>(30);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const fetchStreamInfo = async () => {
    if (!id || !token) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/streams/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Stream não encontrado');
      }

      const data = await response.json();
      setStreamInfo(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar stream');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStreamInfo();
  };

  const updateStreamSettings = async (quality: string, fps: number) => {
    if (!id || !token) return;
    
    try {
      setUpdatingSettings(true);
      const response = await fetch(`/api/streams/${id}/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quality, fps }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar configurações');
      }

      // Atualizar as informações do stream
      await fetchStreamInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar configurações');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleQualityChange = (quality: string) => {
    setSelectedQuality(quality);
    updateStreamSettings(quality, selectedFps);
  };

  const handleFpsChange = (fps: string) => {
    const fpsNumber = parseInt(fps);
    setSelectedFps(fpsNumber);
    updateStreamSettings(selectedQuality, fpsNumber);
  };

  useEffect(() => {
    fetchStreamInfo();
  }, [fetchStreamInfo]);

  useEffect(() => {
    if (streamInfo) {
      setSelectedQuality(streamInfo.quality);
      setSelectedFps(streamInfo.fps);
    }
  }, [streamInfo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/cameras')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle>Visualização de Stream</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="w-full h-96" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/cameras')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle>Visualização de Stream</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="mt-4">
                <Button onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Tentar Novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!streamInfo) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/cameras')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle>Visualização de Stream</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p>Stream não disponível</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const hlsUrl = `/api/streams/${streamInfo.id}/hls/hls.m3u8`;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/cameras')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle>{streamInfo.name || 'Visualização de Stream'}</CardTitle>
                  <p className="text-sm text-gray-500">
                    Stream ID: {streamInfo.id} | Câmera: {streamInfo.camera_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  streamInfo.status === 'active' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {streamInfo.status === 'active' ? 'ONLINE' : 'OFFLINE'}
                </div>
                
                {/* Controles de Qualidade */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" disabled={streamInfo.status !== 'active'}>
                      <Settings className="h-4 w-4 mr-2" />
                      Qualidade
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-4">
                      <h4 className="font-medium">Configurações de Qualidade</h4>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Resolução</label>
                        <Select value={selectedQuality} onValueChange={handleQualityChange} disabled={updatingSettings}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a resolução" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1080p">Alta (1080p)</SelectItem>
                            <SelectItem value="720p">Média (720p)</SelectItem>
                            <SelectItem value="480p">Baixa (480p)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">FPS (Quadros por segundo)</label>
                        <Select value={selectedFps.toString()} onValueChange={handleFpsChange} disabled={updatingSettings}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o FPS" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="60">60 FPS</SelectItem>
                            <SelectItem value="30">30 FPS</SelectItem>
                            <SelectItem value="25">25 FPS</SelectItem>
                            <SelectItem value="15">15 FPS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {updatingSettings && (
                        <div className="text-sm text-gray-500 flex items-center">
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Aplicando configurações...
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {streamInfo.status === 'active' && hlsUrl ? (
                <div className="relative">
                  <VideoPlayer
                    src={hlsUrl}
                    token={token}
                    autoPlay={true}
                    muted={true}
                    controls={true}
                    className="w-full aspect-video rounded-lg"
                    onError={(error) => {
                      console.error('Erro no player:', error);
                      setError('Erro ao carregar o stream');
                    }}
                  />
                </div>
              ) : (
                <div className="w-full aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">
                      {streamInfo.status === 'active' 
                        ? 'Aguardando stream...' 
                        : 'Stream offline'}
                    </p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Qualidade:</span>
                  <span className="ml-2">{streamInfo.quality}</span>
                </div>
                <div>
                  <span className="font-medium">FPS:</span>
                  <span className="ml-2">{streamInfo.fps}</span>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <span className="ml-2 capitalize">{streamInfo.status}</span>
                </div>
                {streamInfo.startedAt && (
                  <div>
                    <span className="font-medium">Iniciado:</span>
                    <span className="ml-2">
                      {new Date(streamInfo.startedAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StreamViewPage;