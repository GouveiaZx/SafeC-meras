import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Play, MapPin, Clock, Video, AlertCircle, Loader2, Power, PowerOff } from 'lucide-react';
import Modal from './ui/modal';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import AuthenticatedVideoPlayer from './AuthenticatedVideoPlayer';
import RecordingPlayer from './RecordingPlayer';
import { api, endpoints } from '@/lib/api';

interface CameraData {
  id: string;
  name: string;
  rtsp_url?: string;
  rtmp_url?: string;
  location?: string;
  status: 'online' | 'offline' | 'error';
  is_streaming?: boolean;
  is_recording?: boolean;
  recording_enabled?: boolean;
  last_seen?: string;
}

interface StreamStatus {
  status: 'active' | 'inactive' | 'error' | 'pending';
  camera_id?: string;
  stream_id?: string;
  urls?: {
    hls?: string;
    flv?: string;
    rtmp?: string;
  };
  bitrate?: number;
  viewers?: number;
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
  status: string;
  uploadStatus: string;
  localPath?: string;
  s3Url?: string;
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: number;
  };
}

interface CameraDetailsModalProps {
  camera: CameraData | null;
  streamStatus?: StreamStatus;
  isOpen: boolean;
  onClose: () => void;
  onStreamToggle?: (cameraId: string, action: 'start' | 'stop') => Promise<void>;
  canManage?: boolean; // Controle de permissão para gerenciar stream
}

const CameraDetailsModal: React.FC<CameraDetailsModalProps> = ({
  camera,
  streamStatus,
  isOpen,
  onClose,
  onStreamToggle,
  canManage = true // Default true para manter comportamento atual se não passado
}) => {
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isRecordingPlayerOpen, setIsRecordingPlayerOpen] = useState(false);
  const [streamActionLoading, setStreamActionLoading] = useState(false);

  // Buscar 10 gravacoes mais recentes da camera
  const fetchRecentRecordings = useCallback(async () => {
    if (!camera?.id) return;

    setLoadingRecordings(true);
    try {
      const params = {
        camera_id: camera.id,
        limit: '10',
        sort: 'start_time',
        order: 'desc'
      };

      const response = await api.get<{
        success: boolean;
        data: any[];
      }>(endpoints.recordings.getAll(), params);

      if (response.success && Array.isArray(response.data)) {
        const mappedRecordings: Recording[] = response.data.map((rec: any) => ({
          id: rec.id,
          cameraId: rec.camera_id,
          cameraName: rec.camera_name || camera.name,
          filename: rec.filename || '',
          startTime: rec.start_time,
          endTime: rec.end_time,
          duration: rec.duration || 0,
          size: rec.file_size || 0,
          status: rec.status,
          uploadStatus: rec.upload_status || 'pending',
          localPath: rec.file_path,
          s3Url: rec.s3_url,
          metadata: {
            resolution: rec.resolution || 'N/A',
            fps: rec.fps || 0,
            codec: rec.codec || 'h264',
            bitrate: rec.bitrate || 0
          }
        }));
        setRecentRecordings(mappedRecordings);
      }
    } catch (error) {
      console.error('Erro ao buscar gravacoes:', error);
    } finally {
      setLoadingRecordings(false);
    }
  }, [camera?.id, camera?.name]);

  useEffect(() => {
    if (isOpen && camera) {
      fetchRecentRecordings();
    }
  }, [isOpen, camera, fetchRecentRecordings]);

  // Resetar estado quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      setRecentRecordings([]);
      setSelectedRecording(null);
      setIsRecordingPlayerOpen(false);
    }
  }, [isOpen]);

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handlePlayRecording = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsRecordingPlayerOpen(true);
  };

  const handleCloseRecordingPlayer = () => {
    setIsRecordingPlayerOpen(false);
    setSelectedRecording(null);
  };

  const handleStartStream = async () => {
    if (!camera?.id) return;
    setStreamActionLoading(true);
    try {
      if (onStreamToggle) {
        await onStreamToggle(camera.id, 'start');
      } else {
        // Fallback: chamar API diretamente
        await api.post(endpoints.streams.start(camera.id), {});
      }
    } catch (error) {
      console.error('Erro ao iniciar stream:', error);
    } finally {
      setStreamActionLoading(false);
    }
  };

  const handleStopStream = async () => {
    if (!camera?.id) return;
    setStreamActionLoading(true);
    try {
      if (onStreamToggle) {
        await onStreamToggle(camera.id, 'stop');
      } else {
        // Fallback: chamar API diretamente
        await api.post(endpoints.streams.stop(camera.id), {});
      }
    } catch (error) {
      console.error('Erro ao parar stream:', error);
    } finally {
      setStreamActionLoading(false);
    }
  };

  if (!camera) return null;

  const isStreamActive = streamStatus?.status === 'active' && streamStatus?.urls?.hls;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={camera.name}
      >
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {/* Secao: Stream ao Vivo */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center text-gray-900">
                <Camera className="w-5 h-5 mr-2 text-blue-600" />
                Stream ao Vivo
                {camera.is_recording && (
                  <Badge className="ml-2 bg-red-500 text-white animate-pulse">
                    REC
                  </Badge>
                )}
              </h3>

              {/* Botoes de Ligar/Desligar Stream - Ocultar para cliente */}
              {canManage && (
                <div className="flex gap-2">
                  {camera.is_streaming || isStreamActive ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleStopStream}
                      disabled={streamActionLoading}
                      className="flex items-center gap-1"
                    >
                      {streamActionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PowerOff className="w-4 h-4" />
                      )}
                      Desligar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleStartStream}
                      disabled={streamActionLoading}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                    >
                      {streamActionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                      Ligar
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
              {isStreamActive ? (
                <AuthenticatedVideoPlayer
                  src={streamStatus.urls!.hls!}
                  className="w-full h-full"
                  autoPlay={true}
                  muted={true}
                  controls={true}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm mb-2">Stream nao disponivel</p>
                    <Badge className={
                      camera.is_streaming
                        ? 'bg-green-100 text-green-800'
                        : camera.status === 'online'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }>
                      {camera.is_streaming ? 'Conectando...' : camera.status === 'online' ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Secao: Informacoes da Camera */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Informacoes</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-gray-600">Localizacao:</span>
                <span className="ml-2 font-medium">{camera.location || 'Nao informado'}</span>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-gray-600">Ultima atividade:</span>
                <span className="ml-2 font-medium">
                  {camera.last_seen
                    ? new Date(camera.last_seen).toLocaleString('pt-BR')
                    : 'N/A'
                  }
                </span>
              </div>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  camera.is_streaming ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="text-gray-600">Streaming:</span>
                <span className="ml-2 font-medium">
                  {camera.is_streaming ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  camera.is_recording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
                }`} />
                <span className="text-gray-600">Gravando:</span>
                <span className="ml-2 font-medium">
                  {camera.is_recording ? 'Sim' : 'Nao'}
                </span>
              </div>
            </div>
          </div>

          {/* Secao: Gravacoes Recentes */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center text-gray-900">
              <Video className="w-5 h-5 mr-2 text-blue-600" />
              Gravacoes Recentes
            </h3>

            {loadingRecordings ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-sm text-gray-500">Carregando gravacoes...</p>
              </div>
            ) : recentRecordings.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Nenhuma gravacao encontrada</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentRecordings.map((recording) => (
                  <div
                    key={recording.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {recording.startTime
                          ? new Date(recording.startTime).toLocaleString('pt-BR')
                          : 'Data desconhecida'
                        }
                      </p>
                      <p className="text-xs text-gray-500">
                        Duracao: {formatDuration(recording.duration)} |
                        Tamanho: {formatBytes(recording.size)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePlayRecording(recording)}
                      className="ml-2 flex-shrink-0"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal do Player de Gravacao (reutilizado) */}
      {selectedRecording && (
        <RecordingPlayer
          recording={selectedRecording}
          isOpen={isRecordingPlayerOpen}
          onClose={handleCloseRecordingPlayer}
        />
      )}
    </>
  );
};

export default CameraDetailsModal;
