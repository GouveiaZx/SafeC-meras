import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle, Settings } from 'lucide-react';
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
  onQualityChange?: (quality: string) => void;
  availableQualities?: string[];
  currentQuality?: string;
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
  onLoadEnd,
  onQualityChange,
  availableQualities = ['1080p', '720p', '480p'],
  currentQuality = '720p'
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
  const [isLive, setIsLive] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const [hlsSupported, setHlsSupported] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Função para lidar com mudança de qualidade
  const handleQualityChange = useCallback((quality: string) => {
    console.log('VideoPlayer: Mudança de qualidade solicitada para:', quality);
    
    // Implementar troca de qualidade no HLS
    if (hlsRef.current && hlsRef.current.levels.length > 0) {
      // Mapeamento consistente com backend e frontend
      const qualityMap: { [key: string]: number } = {
        '4K': -1,    // Auto (melhor qualidade disponível) - ultra
        '1080p': -1, // Auto para 1080p - high
        '720p': 1,   // Qualidade média - medium
        '480p': 0    // Qualidade baixa - low
      };
      
      const targetLevel = qualityMap[quality];
      console.log('VideoPlayer: Mapeamento de qualidade:', { quality, targetLevel, availableLevels: hlsRef.current.levels.length });
      
      if (targetLevel !== undefined) {
        if (targetLevel === -1) {
          // Auto quality - deixa o HLS escolher automaticamente
          hlsRef.current.currentLevel = -1;
          console.log('VideoPlayer: Qualidade definida para AUTO (melhor disponível)');
        } else {
          // Força um nível específico
          const actualLevel = Math.min(targetLevel, hlsRef.current.levels.length - 1);
          hlsRef.current.currentLevel = actualLevel;
          console.log(`VideoPlayer: Qualidade definida para nível ${actualLevel}`);
        }
        
        console.log(`VideoPlayer: Qualidade alterada para: ${quality} (nível HLS: ${hlsRef.current.currentLevel})`);
      } else {
        console.warn('VideoPlayer: Qualidade não reconhecida:', quality);
      }
    } else {
      console.warn('VideoPlayer: HLS não disponível ou sem níveis de qualidade');
    }
    
    // Sempre chamar o callback para notificar o componente pai
    onQualityChange?.(quality);
  }, [onQualityChange]);

  // Verificar suporte ao HLS e se é transmissão ao vivo
  useEffect(() => {
    setHlsSupported(Hls.isSupported());
    setIsLive(src ? (src.includes('.m3u8') || src.includes('/hls')) : false);
  }, [src]);

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
        lowLatencyMode: false, // Desabilitar para melhor estabilidade
        backBufferLength: 90,
        maxBufferLength: 60, // Aumentar buffer para evitar stalling
        maxMaxBufferLength: 600,
        manifestLoadingTimeOut: 15000, // Aumentar timeout
        manifestLoadingMaxRetry: 5, // Mais tentativas
        levelLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 5,
        fragLoadingTimeOut: 30000, // Aumentar timeout para fragmentos
        fragLoadingMaxRetry: 5,
        xhrSetup: (xhr, url) => {
          console.log('Configurando XHR para:', url);
          
          // Validação robusta do token
          const isValidToken = (
            token && 
            typeof token === 'string' && 
            token.trim() !== '' &&
            token !== 'null' && 
            token !== 'undefined' &&
            token !== 'false' &&
            !token.includes('undefined') &&
            token.length > 10 // Token JWT mínimo
          );
          
          console.log('Análise do token:', {
            received: token,
            type: typeof token,
            length: token?.length || 0,
            isValid: isValidToken,
            preview: isValidToken ? token.substring(0, 20) + '...' : 'INVÁLIDO'
          });
          
          if (isValidToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            console.log('✅ Token válido adicionado ao header Authorization');
          } else {
            console.error('❌ Token inválido detectado:', {
              token,
              type: typeof token,
              isEmpty: !token,
              isUndefinedString: token === 'undefined',
              containsUndefined: token?.includes('undefined')
            });
            // Não adicionar header de autorização com token inválido
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

      // Configurações otimizadas para reduzir buffer stalling
      hls.config.maxBufferLength = 30; // Buffer máximo de 30 segundos
      hls.config.maxMaxBufferLength = 60; // Buffer máximo absoluto
      hls.config.maxBufferSize = 60 * 1000 * 1000; // 60MB
      hls.config.maxBufferHole = 0.5; // Tolerância para buracos no buffer
      hls.config.highBufferWatchdogPeriod = 3; // Verificação menos frequente quando buffer alto
      hls.config.nudgeOffset = 0.1; // Ajuste fino para sincronização
      hls.config.nudgeMaxRetry = 3; // Máximo de tentativas de ajuste
      hls.config.maxFragLookUpTolerance = 0.25; // Tolerância para busca de fragmentos
      hls.config.liveSyncDurationCount = 3; // Sincronização com live stream
      hls.config.liveMaxLatencyDurationCount = 10; // Latência máxima

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
        // Tratar erros não fatais primeiro
        if (!data.fatal) {
          switch (data.details) {
            case 'bufferStalledError':
              // Recuperação silenciosa para buffer stalling
              if (hlsRef.current && videoRef.current) {
                try {
                  hlsRef.current.startLoad();
                } catch (e) {
                  // Falha silenciosa na recuperação
                }
              }
              return;
            case 'bufferAppendError':
            case 'bufferAddCodecError':
            case 'bufferSeekOverHole':
            case 'bufferNudgeOnStall':
              // Erros de buffer não fatais - ignorar silenciosamente
              return;
            default:
              // Outros erros não fatais - log apenas em desenvolvimento
              if (process.env.NODE_ENV === 'development') {
                console.warn('Erro HLS não fatal:', data.details);
              }
              return;
          }
        }
        
        console.error('Erro HLS fatal:', data);
        
        // Tratar erros fatais
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
      // Para Safari, não adicionar token na URL, usar apenas headers quando possível
      video.src = src;
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
          {/* Progress Bar - Only for non-live content */}
          {!isLive && duration > 0 && (
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

              {/* Time display - Only for non-live content */}
              {!isLive && duration > 0 && (
                <span className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* Live indicator in controls - moved to right side */}
              {isLive && (
                <span className="text-red-400 text-sm font-medium flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse"></div>
                  AO VIVO
                </span>
              )}
              
              {/* Quality Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="text-white hover:text-gray-300 transition-colors"
                  title="Qualidade do vídeo"
                >
                  <Settings className="h-5 w-5" />
                </button>
                
                {showQualityMenu && (
                  <div className="absolute bottom-8 right-0 bg-black bg-opacity-90 rounded-lg p-2 min-w-[120px] z-50">
                    <div className="text-white text-xs font-medium mb-2 px-2">Qualidade</div>
                    {availableQualities.map((quality) => (
                      <button
                        key={quality}
                        onClick={() => {
                          handleQualityChange(quality);
                          setShowQualityMenu(false);
                        }}
                        className={`block w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                          currentQuality === quality
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        {quality === '1080p' && 'Alta (1080p)'}
                        {quality === '720p' && 'Média (720p)'}
                        {quality === '480p' && 'Baixa (480p)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
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


    </div>
  );
};

export default VideoPlayer;