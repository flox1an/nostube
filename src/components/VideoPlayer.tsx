import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  url: string;
  mime: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

export function VideoPlayer({ url, mime, poster, onTimeUpdate, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (mime === 'application/vnd.apple.mpegurl' && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [url, mime]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls
      poster={poster}
      onTimeUpdate={() => {
        if (onTimeUpdate && videoRef.current) {
          onTimeUpdate(videoRef.current.currentTime);
        }
      }}
    />
  );
}