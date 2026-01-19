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

  const normalizedToken = useMemo(() => {
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
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
