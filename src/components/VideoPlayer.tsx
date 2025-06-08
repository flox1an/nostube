import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import 'media-chrome';

interface VideoPlayerProps {
  url: string;
  loop?: boolean;
  mime: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

export function VideoPlayer({ url, mime, poster, loop = false, onTimeUpdate }: VideoPlayerProps) {
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
    <media-controller >
        <video
        className='self-center'
          ref={videoRef}
          slot="media"
          autoPlay
          loop={loop}
          poster={poster}
          onTimeUpdate={() => {
            if (onTimeUpdate && videoRef.current) {
              onTimeUpdate(videoRef.current.currentTime);
            }
          }}
        />
        <media-control-bar>
          <media-play-button />
          <media-time-display />
          <media-time-range />
          <media-mute-button />
          <media-volume-range />
          <media-pip-button />
          <media-fullscreen-button />
        </media-control-bar>
      </media-controller>
  );
}