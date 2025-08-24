import React, { useState, useEffect } from 'react';
import { Play, Download, ExternalLink, AlertCircle, Clock, HardDrive, Monitor } from 'lucide-react';
import AuthenticatedVideoPlayer from './AuthenticatedVideoPlayer';
import Modal from './ui/modal';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { buildAuthenticatedVideoUrl } from '@/utils/videoUrl';

interface Recording {
  id: string;
  cameraId: string;
  cameraName: string;
  filename: string;
  startTime: string;
  endTime: string;
  duration: number;
  size: number;
  file_size?: number;
  status: 'recording' | 'completed' | 'uploading' | 'uploaded' | 'failed';
  uploadStatus: 'pending' | 'queued' | 'uploading' | 'uploaded' | 'failed' | 'cancelled' | 'retrying' | 'completed';
  upload_status?: string; // Backend field name
  uploadProgress?: number;
  localPath?: string;
  s3Key?: string;
  s3Url?: string;
  uploadedAt?: string;
  start_time?: string;
  end_time?: string;
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: number;
  };
}

interface RecordingPlayerProps {
  recording: Recording;
  isOpen: boolean;
  onClose: () => void;
}

const RecordingPlayer: React.FC<RecordingPlayerProps> = ({
  recording,
  isOpen,
  onClose
}) => {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (isOpen && recording) {
      console.log('🎬 RecordingPlayer aberto para gravação:', {
        recordingId: recording.id,
        filename: recording.filename,
        cameraName: recording.cameraName,
        uploadStatus: recording.status
      });
      loadPlaybackUrl();
    }
  }, [isOpen, recording]);

  const loadPlaybackUrl = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use unified endpoints that handle S3/local fallback automatically
      const streamEndpoint = `/api/recording-files/${recording.id}/stream`;
      const downloadEndpoint = `/api/recording-files/${recording.id}/download`;
      
      // First check if stream endpoint returns JSON (S3) or direct stream (local)
      console.log('🔍 Checking stream endpoint response type:', streamEndpoint);
      
      const response = await fetch(streamEndpoint, {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      const contentType = response.headers.get('content-type');
      console.log('📋 Stream endpoint content type:', contentType);
      
      if (contentType?.includes('application/json')) {
        // S3 source - endpoint returns JSON with presigned URL
        console.log('🌐 Stream source is S3, fetching presigned URL...');
        
        const jsonResponse = await fetch(streamEndpoint, {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });
        
        if (!jsonResponse.ok) {
          throw new Error(`HTTP ${jsonResponse.status}: ${jsonResponse.statusText}`);
        }
        
        const streamData = await jsonResponse.json();
        console.log('✅ S3 stream data received:', {
          source: streamData.source,
          s3_key: streamData.s3_key,
          expires_at: streamData.expires_at
        });
        
        // Use the presigned URL directly for S3
        setPlaybackUrl(streamData.url);
        
      } else {
        // Local source - endpoint streams directly
        console.log('💾 Stream source is local, using endpoint directly');
        setPlaybackUrl(streamEndpoint);
      }
      
      // Download endpoint can always be used directly (handles redirects)
      setDownloadUrl(downloadEndpoint);
      
      console.log('🎥 Playback URL configured successfully');
      console.log('📥 Download URL configured:', downloadEndpoint);
      
    } catch (err) {
      console.error('Erro ao carregar URL de reprodução:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar gravação');
      toast.error('Erro ao carregar gravação');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const url = buildAuthenticatedVideoUrl(downloadUrl, { token: token || undefined, includeTokenInQuery: true });
      window.open(url, '_blank');
    }
  };

  const handleOpenInNewTab = () => {
    if (playbackUrl) {
      const url = buildAuthenticatedVideoUrl(playbackUrl, { token: token || undefined, includeTokenInQuery: true });
      window.open(url, '_blank');
    }
  };

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
      recording: { color: 'bg-red-100 text-red-800', label: 'Gravando' },
      completed: { color: 'bg-primary-100 text-primary-800', label: 'Concluída' },
      uploading: { color: 'bg-yellow-100 text-yellow-800', label: 'Enviando' },
      uploaded: { color: 'bg-green-100 text-green-800', label: 'Enviada' },
      failed: { color: 'bg-red-100 text-red-800', label: 'Falhou' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.completed;

    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const getStorageBadge = () => {
    // Calculate recording age for retention logic
    const createdAt = new Date(recording.startTime || recording.start_time);
    const now = new Date();
    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const isWithinRetention = ageInDays < 7; // 7-day retention policy
    
    if (recording.uploadStatus === 'uploaded' && recording.s3Key) {
      if (isWithinRetention) {
        return (
          <Badge className="bg-green-100 text-green-800 ml-2">
            <HardDrive className="w-3 h-3 mr-1" />
            Local (Retenção)
          </Badge>
        );
      } else {
        return (
          <Badge className="bg-blue-100 text-blue-800 ml-2">
            <Monitor className="w-3 h-3 mr-1" />
            Cloud
          </Badge>
        );
      }
    } else {
      return (
        <Badge className="bg-gray-100 text-gray-800 ml-2">
          <HardDrive className="w-3 h-3 mr-1" />
          Local
        </Badge>
      );
    }
  };

  const getUploadStatusBadge = () => {
    if (!recording.uploadStatus || recording.uploadStatus === 'pending') {
      return null;
    }

    const uploadStatusConfig = {
      queued: { color: 'bg-blue-100 text-blue-800', label: 'Na fila' },
      uploading: { color: 'bg-yellow-100 text-yellow-800', label: `Enviando ${recording.uploadProgress || 0}%` },
      uploaded: { color: 'bg-green-100 text-green-800', label: 'Enviado' },
      failed: { color: 'bg-red-100 text-red-800', label: 'Falha no envio' },
      retrying: { color: 'bg-orange-100 text-orange-800', label: 'Tentando novamente' },
      cancelled: { color: 'bg-gray-100 text-gray-800', label: 'Cancelado' }
    };

    const config = uploadStatusConfig[recording.uploadStatus as keyof typeof uploadStatusConfig];
    
    if (!config) return null;

    return (
      <Badge className={`${config.color} ml-2`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      className="bg-white"
    >
      <div className="bg-white text-gray-900">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{recording.filename}</h2>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>{recording.cameraName}</span>
                <span>•</span>
                <span>{new Date(recording.startTime).toLocaleString('pt-BR')}</span>
                <span>•</span>
                <div className="flex items-center">
                  {getStatusBadge(recording.status)}
                  {getStorageBadge()}
                  {getUploadStatusBadge()}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {downloadUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="text-gray-700 border-gray-300 hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}
              {playbackUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  className="text-gray-700 border-gray-300 hover:bg-gray-50"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Nova Aba
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Video Player */}
        <div className="relative">
          {loading && (
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Carregando gravação...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="aspect-video bg-red-50 flex items-center justify-center">
              <div className="text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg font-semibold mb-2">Erro ao carregar gravação</p>
                <p className="text-sm text-gray-600">{error}</p>
                <Button
                  onClick={loadPlaybackUrl}
                  className="mt-4 bg-red-600 hover:bg-red-700"
                >
                  Tentar Novamente
                </Button>
              </div>
            </div>
          )}
          
          {!loading && !error && playbackUrl && (
            <div className="aspect-video">
              <AuthenticatedVideoPlayer
                src={playbackUrl}
                className="w-full h-full"
                onError={(error) => {
                  console.error('Erro no player:', error);
                  setError(error);
                }}
              />
            </div>
          )}
        </div>

        {/* Recording Details */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-primary-600" />
              <div>
                <p className="text-sm text-gray-500">Duração</p>
                <p className="font-medium text-gray-900">
                  {recording.duration && recording.duration > 0 ? 
                    formatDuration(recording.duration) :
                    recording.end_time && recording.start_time ? 
                      formatDuration(Math.floor((new Date(recording.end_time).getTime() - new Date(recording.start_time).getTime()) / 1000)) :
                      '--'
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <HardDrive className="w-5 h-5 text-primary-600" />
              <div>
                <p className="text-sm text-gray-500">Tamanho</p>
                <p className="font-medium text-gray-900">
                  {recording.file_size && recording.file_size > 0 ? formatBytes(recording.file_size) : 
                   recording.size && recording.size > 0 ? formatBytes(recording.size) : '--'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Storage Status */}
          <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Status de Armazenamento</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Local</p>
                <p className="text-sm font-medium">
                  {recording.localPath ? (
                    <span className="text-green-400">✓ Disponível</span>
                  ) : (
                    <span className="text-red-400">✗ Não disponível</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Wasabi S3</p>
                <p className="text-sm font-medium">
                  {recording.uploadStatus === 'uploaded' || recording.uploadStatus === 'completed' ? (
                    <span className="text-green-400">✓ Enviado</span>
                  ) : recording.uploadStatus === 'uploading' ? (
                    <span className="text-blue-400">📤 Enviando</span>
                  ) : recording.uploadStatus === 'failed' ? (
                    <span className="text-red-400">❌ Falhou</span>
                  ) : (
                    <span className="text-yellow-400">⏳ Pendente</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RecordingPlayer;