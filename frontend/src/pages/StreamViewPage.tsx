import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

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
  const { token, user } = useAuth();
  
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    fetchStreamInfo();
  }, [id, token]);

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
                <div className={`px-2 py-1 rounded text-xs ${
                  streamInfo.status === 'active' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {streamInfo.status === 'active' ? 'ONLINE' : 'OFFLINE'}
                </div>
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
                    token={token || undefined}
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