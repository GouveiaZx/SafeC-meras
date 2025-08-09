import React, { useRef, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { Button } from './ui/button';

interface AuthenticatedVideoPlayerProps {
  src: string;
  className?: string;
  onError?: (error: string) => void;
}

const AuthenticatedVideoPlayer: React.FC<AuthenticatedVideoPlayerProps> = ({
  src,
  className = '',
  onError
}) => {
  const { token, isAuthenticated, user } = useAuth();
  
  // 🔍 [DEBUG] Log inicial do componente
  console.log('🎬 [VIDEO_PLAYER DEBUG] Inicialização do AuthenticatedVideoPlayer:', {
    src,
    hasToken: !!token,
    isAuthenticated,
    hasUser: !!user,
    tokenLength: token?.length || 0,
    timestamp: new Date().toISOString()
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    // 🔍 [DEBUG] Log do início do useEffect
    console.log('🎬 [VIDEO_PLAYER DEBUG] useEffect executado:', {
      hasSrc: !!src,
      hasToken: !!token,
      srcValue: src,
      tokenLength: token?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    if (!src || !token) {
      const errorMsg = !src ? 'URL de origem não fornecida' : 'Token de autenticação não disponível';
      console.error('🎬 [VIDEO_PLAYER DEBUG] ❌ ERRO de configuração:', {
        errorMsg,
        hasSrc: !!src,
        hasToken: !!token,
        src,
        timestamp: new Date().toISOString()
      });
      setError(errorMsg);
      setLoading(false);
      return;
    }

    // Criar URL autenticada com token como query parameter
    const authenticatedUrl = `${src}?token=${encodeURIComponent(token)}`;
    
    // 🔍 [DEBUG] Log da URL autenticada criada
    console.log('🎬 [VIDEO_PLAYER DEBUG] ✅ URL autenticada criada:', {
      originalSrc: src,
      authenticatedUrl: authenticatedUrl.replace(token, '[TOKEN_HIDDEN]'),
      tokenLength: token.length,
      hasQueryParams: src.includes('?'),
      timestamp: new Date().toISOString()
    });
    
    setVideoSrc(authenticatedUrl);
    setLoading(false);
    setError(null);

  }, [src, token, onError]);

  // Event handlers
  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (time: number): string => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando vídeo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 flex items-center justify-center ${className}`}>
        <div className="text-center text-red-600">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">Erro ao carregar vídeo</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        src={videoSrc || undefined}
        className="w-full h-full"
        onLoadedMetadata={() => {
          if (videoRef.current) {
            const video = videoRef.current;
            setDuration(video.duration);
            
            // 🔍 [DEBUG] Log dos metadados carregados
            console.log('🎬 [VIDEO_PLAYER DEBUG] ✅ Metadados carregados:', {
              duration: video.duration,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              readyState: video.readyState,
              networkState: video.networkState,
              src: video.src,
              currentSrc: video.currentSrc,
              timestamp: new Date().toISOString()
            });
          }
        }}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onPlay={() => {
          setIsPlaying(true);
          // 🔍 [DEBUG] Log do evento play
          console.log('🎬 [VIDEO_PLAYER DEBUG] ▶️ Vídeo iniciado:', {
            currentTime: videoRef.current?.currentTime,
            duration: videoRef.current?.duration,
            readyState: videoRef.current?.readyState,
            networkState: videoRef.current?.networkState,
            timestamp: new Date().toISOString()
          });
        }}
        onPause={() => {
          setIsPlaying(false);
          // 🔍 [DEBUG] Log do evento pause
          console.log('🎬 [VIDEO_PLAYER DEBUG] ⏸️ Vídeo pausado:', {
            currentTime: videoRef.current?.currentTime,
            duration: videoRef.current?.duration,
            timestamp: new Date().toISOString()
          });
        }}
        onError={(e) => {
          const videoElement = e.currentTarget;
          const networkState = videoElement.networkState;
          const readyState = videoElement.readyState;
          const errorCode = videoElement.error?.code;
          const errorMessage = videoElement.error?.message;
          
          // 🔍 [DEBUG] Log detalhado do erro do player
          console.error('🎬 [VIDEO_PLAYER DEBUG] ❌ ERRO CRÍTICO do player:', {
            networkState,
            readyState,
            errorCode,
            errorMessage,
            src: videoElement.src,
            currentSrc: videoElement.currentSrc,
            videoSrc,
            originalSrc: src,
            hasToken: !!token,
            timestamp: new Date().toISOString(),
            // Estados de rede detalhados
            networkStateText: {
              0: 'NETWORK_EMPTY',
              1: 'NETWORK_IDLE', 
              2: 'NETWORK_LOADING',
              3: 'NETWORK_NO_SOURCE'
            }[networkState],
            readyStateText: {
              0: 'HAVE_NOTHING',
              1: 'HAVE_METADATA',
              2: 'HAVE_CURRENT_DATA',
              3: 'HAVE_FUTURE_DATA',
              4: 'HAVE_ENOUGH_DATA'
            }[readyState],
            errorCodeText: {
              1: 'MEDIA_ERR_ABORTED',
              2: 'MEDIA_ERR_NETWORK',
              3: 'MEDIA_ERR_DECODE',
              4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            }[errorCode || 0]
          });
          
          let userFriendlyMessage = 'Erro ao reproduzir vídeo';
          
          if (errorCode === 2) {
            userFriendlyMessage = 'Erro de rede - verifique a conexão';
          } else if (errorCode === 3) {
            userFriendlyMessage = 'Erro de decodificação do vídeo';
          } else if (errorCode === 4) {
            userFriendlyMessage = 'Formato de vídeo não suportado';
          }
          
          setError(userFriendlyMessage);
          onError?.(userFriendlyMessage);
        }}
      />
      
      {/* Controles customizados */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        {/* Barra de progresso */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-white mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        
        {/* Controles */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayPause}
              className="text-white hover:bg-white/20"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-white hover:bg-white/20"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className="text-white hover:bg-white/20"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Overlay de clique para play/pause */}
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={togglePlayPause}
      />
    </div>
  );
};

export default AuthenticatedVideoPlayer;