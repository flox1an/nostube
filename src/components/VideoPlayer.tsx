import * as React from "react";
import { useRef } from "react";
import "media-chrome";
import "hls-video-element";

interface VideoPlayerProps {
  url: string;
  loop?: boolean;
  mime: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

export function VideoPlayer({
  url,
  mime,
  poster,
  loop = false,
  onTimeUpdate,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const isHls = React.useMemo(
    () => mime === "application/vnd.apple.mpegurl" || url.endsWith(".m3u8"),
    [mime, url]
  );

  return (
    <media-controller           className={className}>
      {isHls ? (
        <hls-video
          src={url}
          slot="media"
          autoPlay
          loop={loop}
          poster={poster}
          crossorigin
          onTimeUpdate={() => {
            if (onTimeUpdate && videoRef.current) {
              onTimeUpdate(videoRef.current.currentTime);
            }
          }}
        ></hls-video>
      ) : (
        <video
          src={url}
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
      )}
      <media-control-bar>
        <media-play-button />
        <media-mute-button />
        <media-volume-range />
        <media-time-display />
        <media-time-range />
        <media-playback-rate-button></media-playback-rate-button>
        <media-pip-button />
        <media-fullscreen-button />
      </media-control-bar>
    </media-controller>
  );
}
