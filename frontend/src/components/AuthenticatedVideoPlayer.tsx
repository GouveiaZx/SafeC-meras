import React, { useMemo } from 'react';
import VideoPlayer from './VideoPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { buildAuthenticatedVideoUrl } from '@/utils/videoUrl';

interface AuthenticatedVideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onError?: (error: string) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

const AuthenticatedVideoPlayer: React.FC<AuthenticatedVideoPlayerProps> = ({
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
  const { token } = useAuth();
  
  // 🔍 DEBUG: Log detalhado do token do contexto
  console.log('🔍 AuthenticatedVideoPlayer - Token do contexto:', {
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

  // Normalizar o token para garantir que seja uma string válida
  const normalizedToken = useMemo(() => {
    if (!token) {
      console.warn('🔍 AuthenticatedVideoPlayer - Token não disponível');
      return undefined;
    }
    
    // Se o token é um objeto, tentar extrair a string
    if (typeof token === 'object' && token !== null) {
      console.warn('🔍 AuthenticatedVideoPlayer - Token é objeto, tentando extrair string:', token);
      
      // Tentar várias propriedades comuns
      const possibleTokens = [
        (token as any).accessToken,
        (token as any).access_token,
        (token as any).token,
        (token as any).jwt,
        (token as any).authToken
      ];
      
      for (const possibleToken of possibleTokens) {
        if (typeof possibleToken === 'string' && possibleToken.length > 10) {
          console.log('🔍 AuthenticatedVideoPlayer - Token extraído como string:', possibleToken.substring(0, 50) + '...');
          return possibleToken;
        }
      }
      
      console.error('🔍 AuthenticatedVideoPlayer - Não foi possível extrair token válido do objeto');
      return undefined;
    }
    
    // Se o token é uma string
    if (typeof token === 'string') {
      if (token.length < 10) {
        console.warn('🔍 AuthenticatedVideoPlayer - Token muito curto:', token.length);
        return undefined;
      }
      console.log('🔍 AuthenticatedVideoPlayer - Token string válido:', token.substring(0, 50) + '...');
      return token;
    }
    
    console.error('🔍 AuthenticatedVideoPlayer - Token em formato inesperado:', typeof token);
    return undefined;
  }, [token]);

  // Monta uma URL com token na query para garantir que o <video>/Hls.js consiga acessar os segmentos
  const computedSrc = useMemo(() => {
    return buildAuthenticatedVideoUrl(src, {
      token: normalizedToken,
      includeTokenInQuery: true
    });
  }, [src, normalizedToken]);

  return (
    <VideoPlayer
      src={computedSrc}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      controls={controls}
      className={className}
      token={normalizedToken}
      onError={onError}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
    />
  );
};

export default AuthenticatedVideoPlayer;