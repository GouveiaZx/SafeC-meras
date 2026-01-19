import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import Hls from 'hls.js';

const DEBUG_LOGGING_ENABLED = import.meta.env.DEV;

const debugLog = (...args: unknown[]): void => {
  if (DEBUG_LOGGING_ENABLED) {
    console.debug(...args);
  }
};

const debugWarn = (...args: unknown[]): void => {
  if (DEBUG_LOGGING_ENABLED) {
    console.warn(...args);
  }
};

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
  // 🔍 DEBUG: Log detalhado do token recebido
  debugLog('🔍 VideoPlayer - Token recebido:', {
    token: token,
    type: typeof token,
    length: token?.length || 0,
    isString: typeof token === 'string',
    isEmpty: token === '',
    isNull: token === null,
    isUndefined: token === undefined,
    stringValue: String(token),
    rawValue: token
  });

  // Validação extra do token no VideoPlayer
  const validatedToken = useMemo(() => {
    if (!token) {
      debugWarn('🔍 VideoPlayer - Token não fornecido');
      return undefined;
    }
    
    if (typeof token !== 'string') {
      console.error('🔍 VideoPlayer - Token não é string:', typeof token, token);
      return undefined;
    }
    
    if (token.length < 10) {
      console.error('🔍 VideoPlayer - Token muito curto:', token.length);
      return undefined;
    }
    
    // Verificar se parece um JWT (tem 3 partes separadas por ponto)
    const parts = token.split('.');
    if (parts.length !== 3) {
      debugWarn('🔍 VideoPlayer - Token não parece ser JWT (não tem 3 partes):', parts.length);
    }
    
    debugLog('🔍 VideoPlayer - Token validado:', token.substring(0, 50) + '...');
    return token;
  }, [token]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playAttemptInProgressRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionHealth, setConnectionHealth] = useState<'good' | 'poor' | 'bad'>('good');
  const [lastErrorTime, setLastErrorTime] = useState<number>(0);
  const [wasPlayingBeforeHidden, setWasPlayingBeforeHidden] = useState(false);
  const [showAutoplayMessage, setShowAutoplayMessage] = useState(false);
  const maxRetries = 3;
  const [hlsSupported, setHlsSupported] = useState(false);




  // Verificar suporte ao HLS e se é transmissão ao vivo
  useEffect(() => {
    setHlsSupported(Hls.isSupported());
    // Detectar se é stream ao vivo (HLS) ou gravação (MP4)
    setIsLive(src ? (src.includes('.m3u8') || src.includes('/hls') || src.includes('/live/')) : false);
  }, [src]);

  const cleanupHLS = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Função unificada para tentar autoplay (evita tentativas simultâneas)
  const attemptAutoplay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !autoPlay || playAttemptInProgressRef.current) {
      return;
    }

    playAttemptInProgressRef.current = true;

    try {
      await video.play();
      debugLog('✅ Autoplay bem-sucedido');
      setShowAutoplayMessage(false);
      playAttemptInProgressRef.current = false;
    } catch (err) {
      playAttemptInProgressRef.current = false;

      // Mostrar mensagem apenas uma vez, não repetir para cada erro
      if (!showAutoplayMessage) {
        debugWarn('⚠️ Autoplay bloqueado pelo navegador');
        setShowAutoplayMessage(true);

        // Aguardar interação do usuário
        const handleUserInteraction = () => {
          setShowAutoplayMessage(false);
          video.play().catch(() => {});
          document.removeEventListener('click', handleUserInteraction);
          document.removeEventListener('touchstart', handleUserInteraction);
        };
        document.addEventListener('click', handleUserInteraction, { once: true });
        document.addEventListener('touchstart', handleUserInteraction, { once: true });
      }
    }
  }, [autoPlay, showAutoplayMessage]);

  // Função para tentar acesso direto ao ZLMediaKit como fallback
  const tryDirectZLM = useCallback(async () => {
	 // DISABLED: Direct ZLMediaKit access causes 401 errors
    // Always use backend proxy instead
    throw new Error('Direct ZLMediaKit access disabled - use backend proxy');
  }, [src]);

  const initializeHLS = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Limpar instância anterior
    cleanupHLS();

    // Verificar se é stream HLS ou MP4
    const isHLS = src.includes('.m3u8') || src.includes('/hls');
    const isMP4 = src.includes('.mp4') || src.includes('/stream') || src.includes('/recordings/') || src.includes('/play-web');
    
    if (isHLS && hlsSupported) {
      debugLog('🚀 Inicializando HLS.js para:', src);
      
      // Usar token validado em vez de validação redundante
      const isValidToken = !!validatedToken;
      
      debugLog('🔐 Análise do token validado:', {
        received: validatedToken ? `${validatedToken.substring(0, 20)}...` : 'NULO',
        type: typeof validatedToken,
        length: validatedToken?.length || 0,
        isValid: isValidToken
      });
      
      // Verificar se a URL já contém token antes de adicionar
      let urlWithToken = src;
      if (isValidToken && validatedToken) {
        // Verificar se o token já está presente na URL
        const urlObj = new URL(src, window.location.origin);
        const existingToken = urlObj.searchParams.get('token');
        
        if (existingToken) {
          debugLog('🔗 URL já contém token, usando URL original');
          urlWithToken = src;
        } else {
          const separator = src.includes('?') ? '&' : '?';
          urlWithToken = `${src}${separator}token=${encodeURIComponent(validatedToken)}`;
          debugLog('🔗 Token adicionado à URL de HLS');
        }
      }
      
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true, // Habilitar para menor latência
        backBufferLength: 10, // Buffer traseiro reduzido
        maxBufferLength: 30, // Buffer suficiente para estabilidade
        maxMaxBufferLength: 60, // Buffer máximo
        manifestLoadingTimeOut: 30000, // Timeout aumentado para manifesto
        manifestLoadingMaxRetry: 5, // Mais tentativas para manifesto
        levelLoadingTimeOut: 20000, // Timeout aumentado para níveis
        levelLoadingMaxRetry: 4, // Mais tentativas para níveis
        fragLoadingTimeOut: 15000, // Timeout aumentado para fragmentos
        fragLoadingMaxRetry: 4, // Mais tentativas para fragmentos
        // Configurações adicionais para carregamento rápido
        startFragPrefetch: true, // Pré-carregar fragmentos
        testBandwidth: false, // Desabilitar teste de largura de banda
        progressive: true, // Habilitar carregamento progressivo
        liveSyncDurationCount: 3, // Sincronização balanceada
        liveMaxLatencyDurationCount: 10, // Latência controlada
        maxFragLookUpTolerance: 0.25, // Tolerância aumentada
        liveDurationInfinity: true, // Duração infinita para live streams
        startLevel: -1, // Auto-seleção de qualidade
        capLevelToPlayerSize: false, // Não limitar qualidade ao tamanho do player
        abrEwmaFastLive: 3.0, // Adaptação rápida para live
        abrEwmaSlowLive: 9.0,
        abrMaxWithRealBitrate: false,
        maxStarvationDelay: 2, // Reduzir delay de starvation
        maxLoadingDelay: 2, // Reduzir delay de carregamento
        xhrSetup: (xhr, url) => {
          debugLog('⚙️ Configurando XHR para:', url.replace(validatedToken || '', 'TOKEN_HIDDEN'));
          
          // Tentar header Authorization primeiro
          if (isValidToken && validatedToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${validatedToken}`);
            debugLog('✅ Token validado adicionado ao header Authorization');
          } else {
            debugWarn('⚠️ Token validado não disponível - usando apenas query parameter');
          }
          
          // Headers CORS otimizados
          xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, */*');
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.setRequestHeader('Pragma', 'no-cache');
          
          // Evitar problemas CORS
          xhr.withCredentials = false;
          
          // Configurar timeout aumentado
          xhr.timeout = 30000;
          
          // Event listeners para debug
          xhr.addEventListener('loadstart', () => {
            debugLog('📡 XHR iniciado para:', url.replace(validatedToken || '', 'TOKEN_HIDDEN'));
          });
          
          xhr.addEventListener('error', (e) => {
            console.error('❌ XHR erro para:', url.replace(validatedToken || '', 'TOKEN_HIDDEN'), e);
          });
          
          xhr.addEventListener('timeout', () => {
            console.error('⏰ XHR timeout para:', url.replace(validatedToken || '', 'TOKEN_HIDDEN'));
          });
        }
      });

      // Configurações dinâmicas para estabilidade de buffer
      hls.config.maxBufferLength = 30; // Buffer adequado para estabilidade
      hls.config.maxMaxBufferLength = 60; // Buffer máximo balanceado
      hls.config.maxBufferSize = 60 * 1000 * 1000; // 60MB
      hls.config.maxBufferHole = 0.5; // Tolerância aumentada para buracos no buffer
      hls.config.highBufferWatchdogPeriod = 2; // Verificação menos agressiva
      hls.config.nudgeOffset = 0.1; // Ajuste balanceado para sincronização
      hls.config.nudgeMaxRetry = 3; // Mais tentativas de ajuste
      hls.config.maxFragLookUpTolerance = 0.25; // Tolerância adequada para busca de fragmentos
      
      // Configurações específicas para live streaming estável
      if (src.includes('/live/')) {
        debugLog('🔴 Configurando para live stream estável');
        hls.config.liveSyncDurationCount = 3; // Sincronização balanceada
        hls.config.liveMaxLatencyDurationCount = 10; // Latência controlada
        hls.config.backBufferLength = 15; // Back buffer adequado
        hls.config.maxStarvationDelay = 4; // Delay adequado para evitar stalling
        hls.config.maxLoadingDelay = 4; // Delay de carregamento balanceado
      } else {
        hls.config.liveSyncDurationCount = 3; // Sincronização padrão
        hls.config.liveMaxLatencyDurationCount = 10; // Latência padrão
      }

      hlsRef.current = hls;

      // Event listeners do HLS
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        debugLog('✅ HLS manifest carregado com sucesso (autenticado)');
        setIsLoading(false);
        setError(null);
        setRetryCount(0); // Reset contador de tentativas em sucesso
        setConnectionHealth('good'); // Reset saúde da conexão
        onLoadEnd?.();

        // Tentar autoplay de forma unificada (apenas uma tentativa)
        attemptAutoplay();
      });
      
      // Reset contador quando fragmentos carregam com sucesso
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (retryCount > 0) {
          setRetryCount(0);
          debugLog('✅ Fragmento carregado - reset contador de tentativas');
        }
        // Autoplay já foi tentado em MANIFEST_PARSED - não tentar novamente aqui
      });
      
      // Monitorar buffer para detectar problemas
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        if (connectionHealth !== 'good') {
          setConnectionHealth('good');
          debugLog('✅ Buffer estável - conexão recuperada');
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const currentTime = Date.now();
        const timeSinceLastError = currentTime - lastErrorTime;
        
        // Atualizar saúde da conexão baseado na frequência de erros
        if (timeSinceLastError < 5000) { // Menos de 5 segundos desde último erro
          setConnectionHealth('bad');
        } else if (timeSinceLastError < 30000) { // Menos de 30 segundos
          setConnectionHealth('poor');
        } else {
          setConnectionHealth('good');
        }
        
        setLastErrorTime(currentTime);
        
        // Tratar erro de codec específico primeiro (pode ser fatal)
        if (data.details === 'bufferAddCodecError') {
          debugWarn('🔄 Codec não suportado (provável H265), tentando alternativas...');
          debugLog('🐞 DEBUG bufferAddCodecError: retryCount =', retryCount);
          if (retryCount < 3) {
            let fallbackUrl = urlWithToken;
            
            // Tentar diferentes alternativas baseadas no retry count
            const zlmBaseUrl = import.meta.env.VITE_ZLM_BASE_URL || 'http://localhost:8000';

            if (retryCount === 0) {
              // Primeira tentativa: Stream direto do ZLMediaKit (bypass proxy)
              const streamId = urlWithToken.match(/streams\/([^/]+)\/hls/)?.[1];
              if (streamId) {
                fallbackUrl = `${zlmBaseUrl}/live/${streamId}/hls.m3u8${urlWithToken.includes('?') ? '&' + urlWithToken.split('?')[1] : ''}`;
                debugLog('🎥 Tentativa 1: Stream direto ZLMediaKit:', fallbackUrl);
              }
            } else if (retryCount === 1) {
              // Segunda tentativa: FMP4 format
              const streamId = urlWithToken.match(/streams\/([^/]+)\/hls/)?.[1];
              if (streamId) {
                fallbackUrl = `${zlmBaseUrl}/${streamId}.live.m3u8${urlWithToken.includes('?') ? '?' + urlWithToken.split('?')[1] : ''}`;
                debugLog('🎥 Tentativa 2: Formato FMP4:', fallbackUrl);
              }
            } else {
              // Terceira tentativa: Stream com parâmetros de qualidade reduzida
              fallbackUrl = urlWithToken + (urlWithToken.includes('?') ? '&' : '?') + 'vcodec=h264&acodec=aac';
              debugLog('🎥 Tentativa 3: Codec forçado H264:', fallbackUrl);
            }
            
            setTimeout(() => {
              try {
                hlsRef.current?.loadSource(fallbackUrl);
                setRetryCount(prev => prev + 1);
              } catch (e) {
                debugWarn(`Falha na tentativa ${retryCount + 1}:`, e);
              }
            }, 1000);
          } else {
            console.error('❌ Todas as tentativas de fallback falharam - codec H265 não suportado');
          }
          return;
        }
        
        // Tratar erros não fatais primeiro
        if (!data.fatal) {
          switch (data.details) {
            case 'fragLoadError':
            case 'fragLoadTimeOut':
              // Erros de fragmento - recuperação inteligente baseada na saúde da conexão
              if (hlsRef.current && retryCount < 3) {
                const delay = connectionHealth === 'bad' ? 3000 : connectionHealth === 'poor' ? 2000 : 1000;
                debugLog(`🔄 Tentando recuperar fragmento (tentativa ${retryCount + 1}/3, conexão: ${connectionHealth})`);
                setTimeout(() => {
                  try {
                    hlsRef.current?.startLoad();
                  } catch (e) {
                    debugWarn('Falha na recuperação de fragmento:', e);
                  }
                }, delay * (retryCount + 1));
                setRetryCount(prev => prev + 1);
              }
              return;
            case 'bufferStalledError':
              // Recuperação menos agressiva para buffer stalling
              if (hlsRef.current && videoRef.current && retryCount < 2) {
                try {
                  debugLog('🔄 Recuperando buffer stalling (tentativa', retryCount + 1, '/2)');
                  setTimeout(() => {
                    if (hlsRef.current) {
                      hlsRef.current.startLoad();
                    }
                  }, 1000 * (retryCount + 1)); // Delay progressivo
                  setRetryCount(prev => prev + 1);
                } catch (e) {
                  debugWarn('Falha na recuperação de stalling:', e);
                }
              }
              return;
            case 'bufferAppendError':
            case 'bufferSeekOverHole':
            case 'bufferNudgeOnStall':
              // Erros de buffer não fatais - ignorar silenciosamente
              return;
            case 'manifestLoadError':
            case 'manifestLoadTimeOut':
              // Erro de manifesto - recuperação adaptativa
              if (hlsRef.current && retryCount < 2) {
                const delay = connectionHealth === 'bad' ? 5000 : 2000;
                debugLog(`🔄 Recarregando manifesto (tentativa ${retryCount + 1}/2, conexão: ${connectionHealth})`);
                setTimeout(() => {
                  try {
                    hlsRef.current?.loadSource(urlWithToken);
                  } catch (e) {
                    debugWarn('Falha no recarregamento do manifesto:', e);
                  }
                }, delay * (retryCount + 1));
                setRetryCount(prev => prev + 1);
              }
              return;
            default:
              // Outros erros não fatais - log apenas em desenvolvimento
              if (process.env.NODE_ENV === 'development') {
                debugWarn('Erro HLS não fatal:', data.details);
              }
              return;
          }
        }
        
        console.error('Erro HLS fatal:', data);
        
        // Tratar erros fatais
        if (data.fatal) {
          let errorMessage = 'Erro no stream HLS';
          let shouldTryFallback = false;
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.response?.code === 401) {
                errorMessage = 'Erro de autenticação - Tentando acesso direto';
                shouldTryFallback = true;
              } else if (data.response?.code === 403) {
                errorMessage = 'Acesso negado ao stream';
                shouldTryFallback = true;
              } else if (data.response?.code === 404) {
                errorMessage = 'Stream não encontrado';
              } else {
                errorMessage = 'Erro de rede ao carregar stream';
                shouldTryFallback = retryCount === 0; // Tentar fallback apenas na primeira vez
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              errorMessage = 'Erro ao decodificar stream';
              // Tentar recuperar automaticamente
              if (retryCount < maxRetries) {
                debugLog('🔄 Tentando recuperar erro de mídia...');
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
          
          // Tentar fallback para ZLMediaKit direto em caso de erro de autenticação
          if (shouldTryFallback && retryCount === 0) {
            debugLog('🔄 Tentando fallback para ZLMediaKit direto...');
            setRetryCount(prev => prev + 1);
            
            tryDirectZLM()
              .then(() => {
                debugLog('✅ Fallback ZLM bem-sucedido');
                setError(null);
                setIsLoading(false);
                onLoadEnd?.();
                
                if (autoPlay) {
                  video.play().catch(err => {
                    debugWarn('Autoplay falhou no fallback:', err);
                  });
                }
              })
              .catch((fallbackError) => {
                console.error('❌ Fallback ZLM também falhou:', fallbackError);
                setError('Stream indisponível - Verifique sua conexão');
                setIsLoading(false);
                onError?.('Stream indisponível - Verifique sua conexão');
              });
            
            return; // Não continuar com o tratamento de erro normal
          }
          
          setError(errorMessage);
          setIsLoading(false);
          onError?.(errorMessage);
          
          // Tentar reconectar automaticamente (apenas se não foi fallback)
          if (retryCount < maxRetries && data.type === Hls.ErrorTypes.NETWORK_ERROR && !shouldTryFallback) {
            setTimeout(() => {
              debugLog(`🔄 Tentativa de reconexão ${retryCount + 1}/${maxRetries}`);
              setRetryCount(prev => prev + 1);
              initializeHLS();
            }, 2000 * (retryCount + 1));
          }
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        // Log silencioso para evitar spam no console
        // debugLog('📦 Fragmento HLS carregado');
      });

      // Carregar stream com URL que inclui token
      hls.loadSource(urlWithToken);
      hls.attachMedia(video);
      
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari nativo suporta HLS
      debugLog('Usando suporte nativo HLS do Safari');
      // Para Safari, não adicionar token na URL, usar apenas headers quando possível
      video.src = src;
      video.load();
    } else if (isMP4) {
      // Arquivo MP4 - reprodução nativa com token de autenticação
      debugLog('🎬 Configurando reprodução de MP4:', src);
      
      // Adicionar token para MP4 se disponível
      let urlWithToken = src;
      let isS3PresignedUrl = false;
      
      if (validatedToken) {
        // Detectar URLs S3 presigned - NÃO adicionar tokens nessas URLs
        isS3PresignedUrl = src.includes('X-Amz-Signature') || 
                          src.includes('s3.wasabisys.com') || 
                          src.includes('s3.amazonaws.com') ||
                          src.includes('X-Amz-Algorithm');
        
        if (isS3PresignedUrl) {
          debugLog('🔒 URL S3 presigned detectada no VideoPlayer, não adicionando token');
          urlWithToken = src;
        } else {
          // Verificar se o token já está presente na URL (apenas para URLs locais)
          const urlObj = new URL(src, window.location.origin);
          const existingToken = urlObj.searchParams.get('token');
          
          if (existingToken) {
            debugLog('🔐 URL do MP4 já contém token, usando URL original');
            urlWithToken = src;
          } else {
            const separator = src.includes('?') ? '&' : '?';
            urlWithToken = `${src}${separator}token=${encodeURIComponent(validatedToken)}`;
            debugLog('🔐 Token adicionado à URL do MP4');
          }
        }
      } else {
        // Verificar S3 mesmo sem token validado
        isS3PresignedUrl = src.includes('X-Amz-Signature') || 
                          src.includes('s3.wasabisys.com') || 
                          src.includes('s3.amazonaws.com') ||
                          src.includes('X-Amz-Algorithm');
      }
      
      video.src = urlWithToken;
      video.load();
      
      // Configurações específicas para MP4 streaming
      if (src.includes('/play-web')) {
        // Stream de transcodificação em tempo real - configurações otimizadas
        video.preload = 'auto';
        // NÃO definir crossOrigin para URLs S3 presigned para evitar erro 400
        if (!isS3PresignedUrl) {
          video.crossOrigin = 'anonymous';
        }
        debugLog('🎥 Configurado para stream MP4 em tempo real (H264 transcoding)');
      } else {
        // Arquivo MP4 estático - configurações padrão
        video.preload = 'metadata';
        // NÃO definir crossOrigin para URLs S3 presigned para evitar erro 400
        if (!isS3PresignedUrl) {
          video.crossOrigin = 'anonymous';
        }
      }
      
    } else {
      // Stream não-HLS ou fallback
      debugLog('Usando video nativo para:', src);
      video.src = src;
      video.load();
    }
  }, [src, validatedToken, autoPlay, onError, onLoadEnd, hlsSupported, cleanupHLS, tryDirectZLM, attemptAutoplay]);

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
            if (src?.includes('/play-web')) {
              errorMessage = 'Erro de rede durante transcodificação H264';
            } else {
              errorMessage = 'Erro de rede ao carregar stream';
            }
            break;
          case MediaError.MEDIA_ERR_DECODE:
            if (src?.includes('/play-web')) {
              errorMessage = 'Erro ao decodificar stream H264 transcodificado';
            } else {
              errorMessage = 'Erro ao decodificar stream';
            }
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            if (src?.includes('/play-web')) {
              errorMessage = 'Transcodificação H264 não suportada pelo navegador';
            } else {
              errorMessage = 'Formato de stream não suportado';
            }
            break;
          default:
            errorMessage = 'Erro desconhecido no stream';
        }
      }
      
      console.error('Erro no video:', errorMessage, target?.error);
      
      // Para streams /play-web, tentar recarregar uma vez automaticamente
      if (src?.includes('/play-web') && retryCount === 0) {
        debugLog('🔄 Tentando recarregar stream de transcodificação...');
        setRetryCount(1);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
          }
        }, 2000);
        return;
      }
      
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

    // Configurar video para carregamento ultra-rápido
    video.muted = muted;
    video.playsInline = true;
    video.preload = src?.includes('/live/') ? 'auto' : 'metadata'; // Preload completo para live
    video.setAttribute('playsinline', 'true'); // iOS Safari
    video.setAttribute('webkit-playsinline', 'true'); // Older iOS
    video.disablePictureInPicture = false; // Permitir PiP para manter ativo
    
    // Configurações específicas para live streams
    if (src?.includes('/live/')) {
      video.setAttribute('x-webkit-airplay', 'allow');
      // Verificar se não é URL S3 presigned antes de definir crossOrigin
      const isS3Live = src.includes('X-Amz-Signature') || 
                      src.includes('s3.wasabisys.com') || 
                      src.includes('s3.amazonaws.com') ||
                      src.includes('X-Amz-Algorithm');
      if (!isS3Live) {
        video.crossOrigin = 'anonymous';
      }
      debugLog('🔴 Configurações de live stream aplicadas');
    }
    
    // Monitorar pausas apenas para debug
    video.addEventListener('pause', (e) => {
      if (src?.includes('/live/')) {
        debugLog('⏸️ Live stream pausado:', {
          userTriggered: e.isTrusted,
          documentHidden: document.hidden,
          currentTime: video.currentTime
        });
      }
    });
    
    // Detectar stalling e tentar recuperar
    video.addEventListener('waiting', () => {
      debugLog('⏳ Buffer stalling detectado');
      if (src?.includes('/live/') && hlsRef.current) {
        setTimeout(() => {
          if (video.readyState < 3 && hlsRef.current) {
            debugLog('🔄 Recuperando de stalling');
            hlsRef.current.startLoad();
          }
        }, 1000);
      }
    });
    
    // Inicializar player
    initializeHLS();

    // Gerenciar visibilidade da página para evitar erros de background media
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Página ficou oculta - pausar se estiver reproduzindo
        if (isPlaying) {
          setWasPlayingBeforeHidden(true);
          video.pause();
          debugLog('🔇 Pausando vídeo - aba inativa');
        }
      } else {
        // Página ficou visível - retomar se estava reproduzindo
        if (wasPlayingBeforeHidden) {
          setWasPlayingBeforeHidden(false);
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              debugLog('🔊 Retomando vídeo - aba ativa');
            }).catch(err => {
              debugWarn('Falha ao retomar reprodução:', err.name);
            });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Limpar event listeners
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleVideoError);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
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
        const playPromise = video.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    } catch (err) {
      console.error('Erro ao reproduzir vídeo:', err);
      // Não mostrar toast para erros de autoplay - são normais
      if (!err.message?.includes('interrupted') && !err.message?.includes('AbortError')) {
        toast.error('Erro ao reproduzir vídeo');
      }
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

      {/* Mensagem de autoplay */}
      {showAutoplayMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 text-center">
            <div className="text-2xl mb-2">🔊</div>
            <h3 className="text-lg font-semibold mb-2">Clique para reproduzir</h3>
            <p className="text-gray-600 text-sm">
              O navegador bloqueou a reprodução automática. Clique em qualquer lugar para iniciar o vídeo.
            </p>
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

              {/* Connection Health Indicator */}
              <div className="flex items-center space-x-1" title={connectionHealth === 'good' ? 'Conexão estável' : connectionHealth === 'poor' ? 'Conexão instável' : 'Conexão ruim'}>
                {connectionHealth === 'good' ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : connectionHealth === 'poor' ? (
                  <Wifi className="h-4 w-4 text-yellow-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                {retryCount > 0 && (
                  <span className="text-xs text-gray-300">({retryCount})</span>
                )}
              </div>

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
