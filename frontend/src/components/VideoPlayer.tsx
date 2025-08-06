import React from 'react';
import UnifiedVideoPlayer, { UnifiedVideoPlayerProps } from './UnifiedVideoPlayer';

// VideoPlayer é um alias para UnifiedVideoPlayer para compatibilidade
const VideoPlayer: React.FC<UnifiedVideoPlayerProps> = (props) => {
  return <UnifiedVideoPlayer {...props} />;
};

export default VideoPlayer;