import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onError?: (error: string) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  autoPlay = false,
  muted = true,
  controls = true,
  className = '',
  onError,
  onLoadStart,
  onLoadEnd
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playPromise, setPlayPromise] = useState<Promise<void> | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const attemptPlay = useCallback(async (video: HTMLVideoElement) => {
    if (playPromise) {
      try {
        await playPromise;
      } catch (err) {
        // Ignorar erros de promises anteriores
      }
    }

    if (video.readyState < 2) {
      // Aguardar dados suficientes
      return new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('error', handleError);
          video.play().then(resolve).catch(reject);
        };
        const handleError = () => {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('error', handleError);
          reject(new Error('Erro ao carregar vídeo'));
        };
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('error', handleError);
      });
    }

    return video.play();
  }, [playPromise]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let isMounted = true;
    setRetryCount(0);

    const handleLoadStart = () => {
      if (!isMounted) return;
      setIsLoading(true);
      setError(null);
      onLoadStart?.();
    };

    const handleLoadedData = () => {
      if (!isMounted) return;
      setIsLoading(false);
      onLoadEnd?.();
    };

    const handleError = (e: Event) => {
      if (!isMounted) return;
      const target = e.target as HTMLVideoElement;
      let errorMessage = 'Erro ao carregar o vídeo';
      
      if (target?.error) {
        switch (target.error.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Erro de rede ao carregar stream';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Erro ao decodificar stream';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Formato de stream não suportado';
            break;
          default:
            errorMessage = 'Erro desconhecido no stream';
        }
      }
      
      setError(errorMessage);
      setIsLoading(false);
      onError?.(errorMessage);
      
      // Tentar novamente automaticamente se não exceder o limite
      if (retryCount < maxRetries) {
        setTimeout(() => {
          if (isMounted) {
            setRetryCount(prev => prev + 1);
            video.load();
          }
        }, 2000 * (retryCount + 1)); // Backoff exponencial
      } else {
        toast.error(errorMessage);
      }
    };

    const handleTimeUpdate = () => {
      if (!isMounted) return;
      setCurrentTime(video.currentTime);
    };

    const handleDurationChange = () => {
      if (!isMounted) return;
      setDuration(video.duration);
    };

    const handlePlay = () => {
      if (!isMounted) return;
      setIsPlaying(true);
    };

    const handlePause = () => {
      if (!isMounted) return;
      setIsPlaying(false);
    };

    const handleCanPlay = async () => {
      if (!isMounted || !autoPlay) return;
      
      try {
        const promise = attemptPlay(video);
        setPlayPromise(promise);
        await promise;
      } catch (err) {
        console.warn('Autoplay falhou:', err);
        // Não mostrar erro para falha de autoplay
      } finally {
        setPlayPromise(null);
      }
    };

    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('canplay', handleCanPlay);

    // Configurar source
    video.src = src;
    video.muted = muted;
    video.load();

    return () => {
      isMounted = false;
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('canplay', handleCanPlay);
      
      // Cancelar promise de play pendente
      if (playPromise) {
        playPromise.catch(() => {});
        setPlayPromise(null);
      }
    };
  }, [src, autoPlay, muted, onError, onLoadStart, onLoadEnd, attemptPlay, retryCount, maxRetries]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
      } else {
        const promise = attemptPlay(video);
        setPlayPromise(promise);
        await promise;
      }
    } catch (err) {
      console.error('Erro ao reproduzir vídeo:', err);
      toast.error('Erro ao reproduzir vídeo');
    } finally {
      setPlayPromise(null);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!document.fullscreenElement) {
        await video.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Erro ao alternar tela cheia:', err);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setIsLoading(true);
    setRetryCount(0);
    video.load();
  };

  if (!src) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-400">
          <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum stream disponível</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-sm">Carregando stream...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="text-center text-white">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-semibold mb-2">Erro no Stream</p>
            <p className="text-sm text-gray-300 mb-4">{error}</p>
            <button
              onClick={retry}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center mx-auto"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </button>
          </div>
        </div>
      )}

      {/* Custom Controls */}
      {controls && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          {/* Progress Bar */}
          {duration > 0 && (
            <div className="mb-3">
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={togglePlay}
                className="text-white hover:text-gray-300 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="text-white hover:text-gray-300 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              {duration > 0 && (
                <span className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Indicator */}
      {src.includes('.m3u8') && (
        <div className="absolute top-4 left-4">
          <div className="flex items-center bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium">
            <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
            AO VIVO
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;