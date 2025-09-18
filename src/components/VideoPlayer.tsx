import * as React from 'react';
import { useRef, useEffect, useCallback, useState } from 'react';
import 'media-chrome';
import 'hls-video-element';
import { TextTrack } from '@/utils/video-event';
import { getLanguageLabel } from '@/lib/utils';
import 'media-chrome/menu';
import '@/types/media-chrome.d.ts';

interface VideoPlayerProps {
  urls: string[];
  loop?: boolean;
  textTracks: TextTrack[];
  mime: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  className?: string;
  /**
   * Initial play position in seconds
   */
  initialPlayPos?: number;
}

export function VideoPlayer({
  urls,
  mime,
  poster,
  textTracks,
  loop = false,
  onTimeUpdate,
  className,
  initialPlayPos = 0,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hlsEl, setHlsEl] = useState<HTMLVideoElement | null>(null);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const [triedHead, setTriedHead] = useState(false);

  const isHls = React.useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || urls[currentUrlIndex]?.endsWith('.m3u8'),
    [mime, urls, currentUrlIndex]
  );

  useEffect(() => {
    setAllFailed(false);
    setCurrentUrlIndex(0);
    setTriedHead(false);
  }, [urls]);

  // Set initial play position on mount or when initialPlayPos changes
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current;
    if (!el) return;
    if (initialPlayPos > 0) {
      // Only seek if the difference is significant (e.g., >1s)
      if (Math.abs(el.currentTime - initialPlayPos) > 1) {
        el.currentTime = initialPlayPos;
      }
    }
  }, [initialPlayPos, isHls, hlsEl]);

  // Frame-by-frame navigation with . and , keys (global listener)
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!el) return;

      // Don't capture keys if user is typing in an input field
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable
      )) {
        return;
      }

      // Only step if video is paused and present
      if (!el.paused) return;
      // Assume 30fps for frame step
      const frameStep = 1 / 30;
      if (e.key === '.') {
        el.currentTime = Math.min(el.duration, el.currentTime + frameStep);
        e.preventDefault();
      } else if (e.key === ',') {
        el.currentTime = Math.max(0, el.currentTime - frameStep);
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHls, hlsEl]);

  // Ref callback for hls-video custom element
  const hlsRef = useCallback((node: Element | null) => {
    setHlsEl(node && 'currentTime' in node ? (node as HTMLVideoElement) : null);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const el = isHls ? hlsEl : videoRef.current;
    if (onTimeUpdate && el) {
      onTimeUpdate(el.currentTime);
    }
  }, [onTimeUpdate, isHls, hlsEl]);

  // Handle error: on first error, do HEAD requests for all remaining URLs to find a working one
  const handleVideoError = useCallback(async () => {
    if (!triedHead && urls.length > 1 && currentUrlIndex < urls.length - 1) {
      setTriedHead(true);
      // Try HEAD requests for all remaining URLs in parallel
      const remaining = urls.slice(currentUrlIndex + 1);
      const checks = await Promise.all(
        remaining.map(async url => {
          try {
            const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
            return res.ok;
          } catch {
            return false;
          }
        })
      );
      const foundIdx = checks.findIndex(ok => ok);
      if (foundIdx !== -1) {
        setCurrentUrlIndex(currentUrlIndex + 1 + foundIdx);
        setAllFailed(false);
        return;
      } else {
        setAllFailed(true);
        return;
      }
    }
    if (currentUrlIndex < urls.length - 1) {
      setCurrentUrlIndex(i => i + 1);
    } else {
      setAllFailed(true);
    }
  }, [currentUrlIndex, urls, triedHead]);

  // Reset triedHead if currentUrlIndex changes (new error sequence)
  useEffect(() => {
    setTriedHead(false);
  }, [currentUrlIndex]);

  const hasCaptions = textTracks.length > 0;

  return (
    <media-controller className={className}>
      {allFailed ? (
        <div className="flex items-center justify-center h-64 text-red-600 font-semibold">
          Failed to load video from all sources.
        </div>
      ) : isHls ? (
        <hls-video
          src={urls[currentUrlIndex]}
          slot="media"
          autoPlay
          loop={loop}
          poster={poster}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          ref={hlsRef}
          tabIndex={0}
          onError={handleVideoError}
        ></hls-video>
      ) : (
        <video
          crossOrigin="anonymous"
          src={urls[currentUrlIndex]}
          ref={videoRef}
          slot="media"
          autoPlay
          loop={loop}
          poster={poster}
          onTimeUpdate={handleTimeUpdate}
          tabIndex={0}
          onError={handleVideoError}
        >
          {/* TODO translate label */}
          {textTracks.map(vtt => (
            <track
              key={vtt.lang}
              label={getLanguageLabel(vtt.lang)}
              kind="captions"
              srcLang={vtt.lang}
              src={vtt.url}
            ></track>
          ))}
          {/* TODO: add captions <track kind="captions" /> */}
          {/* TODO: add fallback sources <source src={url} type={mime} /> */}
        </video>
      )}

      {hasCaptions && <media-captions-menu hidden anchor="auto"></media-captions-menu>}

      <media-control-bar>
        <media-play-button />
        <media-mute-button />
        <media-volume-range />
        <media-time-display />
        <media-time-range />
        <media-playback-rate-button></media-playback-rate-button>
        <media-pip-button />
        {hasCaptions && <media-captions-menu-button></media-captions-menu-button>}
        <media-fullscreen-button />
      </media-control-bar>
    </media-controller>
  );
}
