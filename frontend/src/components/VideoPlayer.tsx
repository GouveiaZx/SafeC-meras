import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Hls from 'hls.js';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  token?: string;
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
  token,
  onError,
  onLoadStart,
  onLoadEnd
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const [hlsSupported, setHlsSupported] = useState(false);

  // Verificar suporte ao HLS
  useEffect(() => {
    setHlsSupported(Hls.isSupported());
  }, []);

  const cleanupHLS = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const initializeHLS = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Limpar instância anterior
    cleanupHLS();

    // Verificar se é stream HLS
    const isHLS = src.includes('.m3u8') || src.includes('/hls');
    
    if (isHLS && hlsSupported) {
      console.log('Inicializando HLS.js para:', src);
      
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3,
        xhrSetup: (xhr, url) => {
          console.log('Configurando XHR para:', url);
          
          // Adicionar token de autenticação
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            console.log('Token adicionado ao header Authorization');
          }
          
          // Headers adicionais para CORS e streaming
          xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, */*');
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.setRequestHeader('Pragma', 'no-cache');
          
          // Configurar timeout
          xhr.timeout = 20000;
          
          // Log de debug
          xhr.addEventListener('loadstart', () => {
            console.log('XHR loadstart para:', url);
          });
          
          xhr.addEventListener('error', (e) => {
            console.error('XHR error para:', url, e);
          });
          
          xhr.addEventListener('timeout', () => {
            console.error('XHR timeout para:', url);
          });
        }
      });

      hlsRef.current = hls;

      // Event listeners do HLS
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest carregado com sucesso');
        setIsLoading(false);
        setError(null);
        onLoadEnd?.();
        
        if (autoPlay) {
          video.play().catch(err => {
            console.warn('Autoplay falhou:', err);
          });
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('Erro HLS:', data);
        
        if (data.fatal) {
          let errorMessage = 'Erro no stream HLS';
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.response?.code === 401) {
                errorMessage = 'Erro de autenticação - Token inválido ou expirado';
              } else if (data.response?.code === 403) {
                errorMessage = 'Acesso negado ao stream';
              } else if (data.response?.code === 404) {
                errorMessage = 'Stream não encontrado';
              } else {
                errorMessage = 'Erro de rede ao carregar stream';
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              errorMessage = 'Erro ao decodificar stream';
              // Tentar recuperar automaticamente
              if (retryCount < maxRetries) {
                console.log('Tentando recuperar erro de mídia...');
                setTimeout(() => {
                  hls.recoverMediaError();
                  setRetryCount(prev => prev + 1);
                }, 1000);
                return;
              }
              break;
            default:
              errorMessage = 'Erro fatal no stream HLS';
          }
          
          setError(errorMessage);
          setIsLoading(false);
          onError?.(errorMessage);
          
          // Tentar reconectar automaticamente
          if (retryCount < maxRetries && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => {
              console.log(`Tentativa de reconexão ${retryCount + 1}/${maxRetries}`);
              setRetryCount(prev => prev + 1);
              initializeHLS();
            }, 2000 * (retryCount + 1));
          }
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        console.log('Fragmento HLS carregado');
      });

      // Carregar stream
      hls.loadSource(src);
      hls.attachMedia(video);
      
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari nativo suporta HLS
      console.log('Usando suporte nativo HLS do Safari');
      const urlWithToken = token ? `${src}${src.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : src;
      video.src = urlWithToken;
      video.load();
    } else {
      // Stream não-HLS ou fallback
      console.log('Usando video nativo para:', src);
      video.src = src;
      video.load();
    }
  }, [src, token, autoPlay, onError, onLoadEnd, retryCount, maxRetries, hlsSupported, cleanupHLS]);

  // Configurar video e event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setRetryCount(0);
    setError(null);
    setIsLoading(true);
    onLoadStart?.();

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleLoadedData = () => {
      setIsLoading(false);
      onLoadEnd?.();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleVideoError = (e: Event) => {
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
      
      console.error('Erro no video:', errorMessage, target?.error);
      setError(errorMessage);
      setIsLoading(false);
      onError?.(errorMessage);
    };

    // Event listeners
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleVideoError);

    // Configurar video
    video.muted = muted;
    video.playsInline = true;
    video.preload = 'metadata';
    
    // Inicializar player
    initializeHLS();

    return () => {
      // Limpar event listeners
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleVideoError);
      
      // Limpar HLS
      cleanupHLS();
    };
  }, [src, autoPlay, muted, token, onError, onLoadStart, onLoadEnd, initializeHLS, cleanupHLS]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
      } else {
        await video.play();
      }
    } catch (err) {
      console.error('Erro ao reproduzir vídeo:', err);
      toast.error('Erro ao reproduzir vídeo');
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
    setError(null);
    setIsLoading(true);
    setRetryCount(0);
    initializeHLS();
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
            {retryCount > 0 && (
              <p className="text-xs text-gray-300 mt-1">Tentativa {retryCount}/{maxRetries}</p>
            )}
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
      {(src.includes('.m3u8') || src.includes('/hls')) && (
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