import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle, Settings, Download, Wifi, WifiOff } from 'lucide-react';
import Hls from 'hls.js';

export interface UnifiedVideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  token?: string;
  mode?: 'simple' | 'advanced';
  showHealthCheck?: boolean;
  onError?: (error: string) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

const UnifiedVideoPlayer: React.FC<UnifiedVideoPlayerProps> = ({
  src,
  poster,
  autoPlay = false,
  muted = true,
  controls = true,
  className = '',
  token,
  mode = 'advanced',
  showHealthCheck = false,
  onError,
  onLoadStart,
  onLoadEnd,
  onPlay,
  onPause
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraHealth, setCameraHealth] = useState<'online' | 'offline' | 'checking' | 'unknown'>('unknown');
  const [hasBufferIssues, setHasBufferIssues] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState<number>(0);
  const [bufferHealthTimer, setBufferHealthTimer] = useState<NodeJS.Timeout | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'critical'>('excellent');

  // Função para logging detalhado
  const logStreamEvent = useCallback((event: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      event,
      src,
      mode,
      retryAttempt,
      hasBufferIssues,
      connectionQuality,
      ...data
    };
    console.log(`[UnifiedVideoPlayer] ${event}:`, logData);
  }, [src, mode, retryAttempt, hasBufferIssues, connectionQuality]);

  // Função para calcular delay de backoff exponencial
  const getBackoffDelay = useCallback((attempt: number) => {
    const baseDelay = 1000; // 1 segundo
    const maxDelay = 30000; // 30 segundos
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.1 * delay; // 10% de jitter
    return delay + jitter;
  }, []);

  // Função para adicionar token na URL
  const addTokenToUrl = useCallback((url: string) => {
    if (!token || !url) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${token}`;
  }, [token]);

  // Cleanup HLS
  const cleanupHLS = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
        logStreamEvent('HLS_CLEANUP', { success: true });
      } catch (error) {
        logStreamEvent('HLS_CLEANUP_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
        console.warn('Erro ao destruir HLS:', error);
      }
      hlsRef.current = null;
    }
    
    // Limpar timer de buffer health
    if (bufferHealthTimer) {
      clearInterval(bufferHealthTimer);
      setBufferHealthTimer(null);
    }
  }, [logStreamEvent, bufferHealthTimer]);

  // Função para verificar health da câmera
  const checkCameraHealth = useCallback(async () => {
    if (!src || !showHealthCheck) return true;
    
    setCameraHealth('checking');
    
    try {
      const match = src.match(/\/streams\/([^\/]+)\/hls/);
      if (!match) {
        setCameraHealth('unknown');
        return true;
      }
      
      const cameraId = match[1];
      const healthUrl = `/api/streams/${cameraId}/health`;
      
      const response = await fetch(healthUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCameraHealth(data.status === 'online' ? 'online' : 'offline');
        return data.status === 'online';
      }
      
      setCameraHealth('unknown');
      return false;
    } catch (error) {
      console.error('Erro no health check:', error);
      setCameraHealth('unknown');
      return false;
    }
  }, [src, token, showHealthCheck]);

  // Detecção de problemas de buffer
  const detectBufferIssues = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hlsRef.current) return;

    const buffered = video.buffered;
    const currentTime = video.currentTime;
    const duration = video.duration;
    
    if (buffered.length === 0) {
      setHasBufferIssues(true);
      setConnectionQuality('critical');
      logStreamEvent('BUFFER_EMPTY', { currentTime, duration });
      return;
    }

    // Verificar se há buffer suficiente à frente
    let bufferAhead = 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) > currentTime) {
        bufferAhead = buffered.end(i) - currentTime;
        break;
      }
    }

    // Classificar qualidade da conexão baseada no buffer
    if (bufferAhead < 2) {
      setConnectionQuality('critical');
      setHasBufferIssues(true);
      logStreamEvent('BUFFER_CRITICAL', { bufferAhead, currentTime });
    } else if (bufferAhead < 5) {
      setConnectionQuality('poor');
      setHasBufferIssues(true);
      logStreamEvent('BUFFER_LOW', { bufferAhead, currentTime });
    } else if (bufferAhead < 10) {
      setConnectionQuality('good');
      setHasBufferIssues(false);
    } else {
      setConnectionQuality('excellent');
      setHasBufferIssues(false);
    }
  }, [logStreamEvent]);

  // Configuração HLS baseada no modo e qualidade da conexão
  const getHlsConfig = useCallback(() => {
    const isLowQuality = connectionQuality === 'poor' || connectionQuality === 'critical';
    
    const baseConfig = {
      debug: false,
      enableWorker: true,
      lowLatencyMode: false,
      xhrSetup: (xhr: XMLHttpRequest) => {
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, */*');
        xhr.withCredentials = true;
        xhr.timeout = isLowQuality ? 15000 : 30000;
      }
    };

    if (mode === 'simple' || isLowQuality) {
      return {
        ...baseConfig,
        backBufferLength: 15,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.3,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 2,
        levelLoadingRetryDelay: 1500,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 1500,
      };
    }

    return {
      ...baseConfig,
      backBufferLength: 60,
      maxBufferLength: 120,
      maxMaxBufferLength: 240,
      maxBufferSize: 120 * 1000 * 1000,
      maxBufferHole: 1.0,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 2000,
      levelLoadingMaxRetry: 6,
      levelLoadingRetryDelay: 3000,
      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 3000,
    };
  }, [token, mode, connectionQuality]);

  // Retry inteligente com backoff exponencial
  const retryWithBackoff = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastError = now - lastErrorTime;
    
    // Evitar retry muito frequente
    if (timeSinceLastError < 5000) {
      logStreamEvent('RETRY_THROTTLED', { timeSinceLastError });
      return;
    }

    const maxRetries = mode === 'advanced' ? 5 : 3;
    if (retryAttempt >= maxRetries) {
      logStreamEvent('RETRY_EXHAUSTED', { maxRetries, retryAttempt });
      setHasError(true);
      return;
    }

    const delay = getBackoffDelay(retryAttempt);
    logStreamEvent('RETRY_SCHEDULED', { attempt: retryAttempt + 1, delay });
    
    setRetryAttempt(prev => prev + 1);
    setLastErrorTime(now);
    
    setTimeout(() => {
      logStreamEvent('RETRY_EXECUTING', { attempt: retryAttempt + 1 });
      initializePlayer();
    }, delay);
  }, [retryAttempt, lastErrorTime, mode, getBackoffDelay, logStreamEvent]);

  // Tratamento de erros HLS melhorado
  const handleHlsError = useCallback((event: Event, data: { type: string; details: string; fatal: boolean; reason?: string; response?: unknown; url?: string }) => {
    const errorInfo = {
      type: data.type,
      details: data.details,
      fatal: data.fatal,
      reason: data.reason,
      response: data.response,
      url: data.url,
      retryAttempt,
      connectionQuality
    };
    
    logStreamEvent('HLS_ERROR', errorInfo);
    console.error('Erro HLS:', data);
    
    setHasError(true);
    setIsLoading(false);

    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          logStreamEvent('HLS_NETWORK_ERROR', { details: data.details, url: data.url });
          
          // Diferentes estratégias baseadas no tipo de erro de rede
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || 
              data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
            logStreamEvent('HLS_FRAGMENT_ERROR', { details: data.details });
            setHasBufferIssues(true);
            
            // Tentar recuperar com startLoad primeiro
            try {
               hlsRef.current?.startLoad();
               logStreamEvent('HLS_STARTLOAD_ATTEMPTED');
             } catch (error) {
               logStreamEvent('HLS_STARTLOAD_FAILED', { error: error instanceof Error ? error.message : 'Unknown error' });
               retryWithBackoff();
             }
          } else {
            retryWithBackoff();
          }
          break;
          
        case Hls.ErrorTypes.MEDIA_ERROR:
          logStreamEvent('HLS_MEDIA_ERROR', { details: data.details });
          
          try {
             hlsRef.current?.recoverMediaError();
             logStreamEvent('HLS_MEDIA_RECOVERY_ATTEMPTED');
           } catch (error) {
             logStreamEvent('HLS_MEDIA_RECOVERY_FAILED', { error: error instanceof Error ? error.message : 'Unknown error' });
             retryWithBackoff();
           }
          break;
          
        default:
          logStreamEvent('HLS_FATAL_ERROR', { type: data.type, details: data.details });
          retryWithBackoff();
          break;
      }
    } else {
      // Erros não fatais - apenas log
      logStreamEvent('HLS_NON_FATAL_ERROR', errorInfo);
    }
  }, [retryAttempt, connectionQuality, logStreamEvent, retryWithBackoff]);

  // Tratamento de erros de carregamento de vídeo melhorado
  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (video?.error) {
      const errorCode = video.error.code;
      const errorMessages = [
        'Erro desconhecido',
        'Carregamento abortado',
        'Erro de rede',
        'Erro de decodificação',
        'Formato não suportado'
      ];
      
      const errorMessage = errorMessages[errorCode] || 'Erro de vídeo';
      
      const errorInfo = {
        code: errorCode,
        message: errorMessage,
        networkState: video.networkState,
        readyState: video.readyState,
        currentSrc: video.currentSrc,
        retryAttempt
      };
      
      logStreamEvent('VIDEO_ERROR', errorInfo);
      console.error('Erro de vídeo:', errorMessage, video.error);
      
      setHasError(true);
      setIsLoading(false);
      
      // Retry automático para erros de rede
      if (errorCode === 2) { // MEDIA_ERR_NETWORK
        setHasBufferIssues(true);
        retryWithBackoff();
      }
    }
  }, [retryAttempt, logStreamEvent, retryWithBackoff]);

  // Carregar HLS
  const loadHLS = useCallback(async (url: string) => {
    const video = videoRef.current;
    if (!video || !Hls.isSupported()) {
      throw new Error('HLS não suportado neste navegador');
    }

    return new Promise<void>((resolve, reject) => {
      cleanupHLS();

      const hls = new Hls(getHlsConfig());

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hlsRef.current = hls;
        setRetryAttempt(0); // Reset retry counter on success
        resolve();
      });

      hls.on(Hls.Events.ERROR, handleHlsError);

      try {
        hls.loadSource(url);
        hls.attachMedia(video);
      } catch (error) {
        reject(error);
      }
    });
  }, [cleanupHLS, getHlsConfig, handleHlsError]);

  // Carregar vídeo direto
  const loadDirectVideo = useCallback(async (url: string) => {
    const video = videoRef.current;
    if (!video) throw new Error('Elemento de vídeo não disponível');

    return new Promise<void>((resolve, reject) => {
      const handleLoad = () => {
        video.removeEventListener('loadeddata', handleLoad);
        video.removeEventListener('error', handleError);
        setRetryAttempt(0); // Reset retry counter on success
        resolve();
      };

      const handleError = () => {
        video.removeEventListener('loadeddata', handleLoad);
        video.removeEventListener('error', handleError);
        handleVideoError();
        reject(new Error('Erro ao carregar vídeo'));
      };

      video.addEventListener('loadeddata', handleLoad);
      video.addEventListener('error', handleError);
      video.src = url;
      video.load();
    });
  }, [handleVideoError]);

  // Inicializar player
  const initializePlayer = useCallback(async () => {
    if (!src) return;

    logStreamEvent('PLAYER_INIT_START', { src, mode, retryAttempt });
    setIsLoading(true);
    setHasError(false);
    setHasBufferIssues(false);
    onLoadStart?.();

    // Verificar health da câmera se necessário
    if (showHealthCheck) {
      logStreamEvent('HEALTH_CHECK_START');
      await checkCameraHealth();
    }

    const maxRetries = mode === 'advanced' ? 3 : 1;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      attempt++;

      try {
        const isHLS = src.includes('.m3u8') || src.includes('/hls/');
        const urlWithToken = addTokenToUrl(src);
        logStreamEvent('URL_PREPARED', { hasToken: !!token, isHLS });

        if (isHLS && Hls.isSupported()) {
          logStreamEvent('HLS_STREAM_DETECTED');
          await loadHLS(urlWithToken);
        } else if (isHLS && videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
          logStreamEvent('HLS_NATIVE_FALLBACK');
          videoRef.current.src = urlWithToken;
          videoRef.current.load();
        } else {
          logStreamEvent('DIRECT_STREAM_DETECTED');
          await loadDirectVideo(urlWithToken);
        }

        if (autoPlay && videoRef.current) {
          try {
            await videoRef.current.play();
            setIsPlaying(true);
            onPlay?.();
          } catch (playError) {
            console.warn('Autoplay falhou:', playError);
          }
        }

        // Iniciar monitoramento de buffer após carregamento bem-sucedido
        const timer = setInterval(detectBufferIssues, 2000);
        setBufferHealthTimer(timer);
        
        logStreamEvent('PLAYER_INIT_SUCCESS');
        setIsLoading(false);
        onLoadEnd?.();
        return;

      } catch (error) {
        lastError = error;
        logStreamEvent('PLAYER_INIT_ATTEMPT_FAILED', { attempt, error: error.message });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'Erro desconhecido';
    logStreamEvent('PLAYER_INIT_ERROR', { error: errorMessage });
    setHasError(true);
    setIsLoading(false);
    onLoadEnd?.();
    onError?.(errorMessage);
  }, [src, loadHLS, loadDirectVideo, addTokenToUrl, autoPlay, onLoadStart, onLoadEnd, onError, onPlay, checkCameraHealth, showHealthCheck, mode, logStreamEvent, retryAttempt, token, detectBufferIssues]);

  // Cleanup
  useEffect(() => {
    return () => {
      cleanupHLS();
    };
  }, [cleanupHLS]);

  // Monitoramento de eventos de vídeo para detecção de problemas
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleWaiting = () => {
      logStreamEvent('VIDEO_WAITING');
      setHasBufferIssues(true);
    };

    const handlePlaying = () => {
      logStreamEvent('VIDEO_PLAYING');
      setHasBufferIssues(false);
    };

    const handleStalled = () => {
      logStreamEvent('VIDEO_STALLED');
      setHasBufferIssues(true);
    };

    const handleSuspend = () => {
      logStreamEvent('VIDEO_SUSPEND');
    };

    const handleProgress = () => {
      // Detectar problemas de buffer durante o progresso
      detectBufferIssues();
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('suspend', handleSuspend);
    video.addEventListener('progress', handleProgress);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('suspend', handleSuspend);
      video.removeEventListener('progress', handleProgress);
    };
  }, [logStreamEvent, detectBufferIssues]);

  // Inicializar quando src mudar
  useEffect(() => {
    initializePlayer();
  }, [initializePlayer]);

  // Controles
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
      onPlay?.();
    } else {
      video.pause();
      setIsPlaying(false);
      onPause?.();
    }
  }, [onPlay, onPause]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      video.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  const retry = useCallback(() => {
    logStreamEvent('MANUAL_RETRY_TRIGGERED');
    setRetryAttempt(0); // Reset retry counter for manual retry
    setHasError(false);
    setHasBufferIssues(false);
    initializePlayer();
  }, [initializePlayer, logStreamEvent]);

  // Health status indicator
  const HealthIndicator = () => {
    if (!showHealthCheck) return null;

    const getStatusIcon = () => {
      switch (cameraHealth) {
        case 'online': return '●';
        case 'offline': return '●';
        case 'checking': return '⟳';
        default: return '●';
      }
    };

    const getStatusColor = () => {
      switch (cameraHealth) {
        case 'online': return 'text-green-400';
        case 'offline': return 'text-red-400';
        case 'checking': return 'text-yellow-400';
        default: return 'text-gray-400';
      }
    };

    return (
      <div className={`absolute top-2 left-2 flex items-center space-x-1 text-xs ${getStatusColor()}`}>
        <span>{getStatusIcon()}</span>
        <span className="capitalize">{cameraHealth}</span>
      </div>
    );
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
    <div 
      className={`relative bg-black rounded-lg overflow-hidden group ${className}`} 
      style={{ minHeight: mode === 'advanced' ? '200px' : '150px', aspectRatio: '16/9' }}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
      />

      <HealthIndicator />

      {/* Central Play Button - Modo Avançado */}
      {mode === 'advanced' && !isPlaying && !isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="bg-black/50 hover:bg-black/70 text-white rounded-full p-4 transition-all duration-300 transform hover:scale-110 pointer-events-auto backdrop-blur-sm"
            title="Reproduzir"
          >
            <Play className="h-8 w-8" fill="currentColor" />
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-white text-sm">
            {mode === 'advanced' ? 'Carregando vídeo...' : 'Carregando...'}
          </p>
          {retryAttempt > 0 && (
            <p className="text-white text-xs text-gray-300 mt-1">
              Tentativa {retryAttempt}...
            </p>
          )}
          {mode === 'advanced' && (
            <p className="text-white text-xs opacity-75 mt-1">Aguarde, isto pode levar até 30 segundos</p>
          )}
        </div>
      )}

      {/* Buffer issues indicator */}
      {hasBufferIssues && !isLoading && !hasError && (
        <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-300 px-3 py-2 rounded-lg text-sm flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span>Problemas de buffer</span>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="absolute inset-0 bg-black bg-opacity-85 flex flex-col items-center justify-center text-white p-4">
          <AlertCircle className="h-16 w-16 mb-4 text-red-400" />
          <p className="text-lg font-semibold mb-2">Erro ao carregar vídeo</p>
          <p className="text-sm text-gray-300 text-center mb-4">
            {mode === 'advanced' 
              ? 'Verifique se a câmera está online e tente novamente'
              : 'Tente novamente'
            }
          </p>
          <button
            onClick={retry}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* Custom Controls */}
      {controls && !hasError && (
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/50 to-transparent p-3 sm:p-4 ${mode === 'simple' ? 'opacity-0 hover:opacity-100' : 'opacity-90 group-hover:opacity-100'} transition-opacity duration-300`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={togglePlay}
                className="text-white hover:text-gray-300 transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2 backdrop-blur-sm"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </button>
              
              <button
                onClick={toggleMute}
                className="text-white hover:text-gray-300 transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2 backdrop-blur-sm"
                title={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </button>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Indicador de qualidade da conexão */}
              <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${connectionQuality === 'excellent' ? 'bg-green-500/20 text-green-300' : connectionQuality === 'good' ? 'bg-blue-500/20 text-blue-300' : connectionQuality === 'poor' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
                {connectionQuality === 'excellent' || connectionQuality === 'good' ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                <span className="capitalize">{connectionQuality}</span>
                {hasBufferIssues && (
                  <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                )}
              </div>
              
              {/* Indicador de retry attempts */}
              {retryAttempt > 0 && (
                <div className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-orange-500/20 text-orange-300">
                  <RotateCcw className="w-3 h-3" />
                  <span>{retryAttempt}</span>
                </div>
              )}
              
              {mode === 'advanced' && (
                <>
                  <button
                    className="text-white hover:text-gray-300 transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2 backdrop-blur-sm"
                    title="Configurações"
                  >
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    className="text-white hover:text-gray-300 transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2 backdrop-blur-sm"
                    title="Download"
                  >
                    <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </>
              )}
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-gray-300 transition-colors bg-black/30 hover:bg-black/50 rounded-full p-2 backdrop-blur-sm"
                title="Tela cheia"
              >
                <Maximize className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedVideoPlayer;