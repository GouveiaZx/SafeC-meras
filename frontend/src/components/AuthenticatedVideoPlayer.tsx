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

  // Monta uma URL com token na query para garantir que o <video>/Hls.js consiga acessar os segmentos
  const computedSrc = useMemo(() => {
    return buildAuthenticatedVideoUrl(src, {
      token: token || undefined,
      includeTokenInQuery: true
    });
  }, [src, token]);

  return (
    <VideoPlayer
      src={computedSrc}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      controls={controls}
      className={className}
      token={token || undefined}
      onError={onError}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
    />
  );
};

export default AuthenticatedVideoPlayer;