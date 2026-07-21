import { forwardRef, useCallback } from 'react'
import { type TextTrack } from '@/utils/video-event'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { getLanguageLabel } from '@/lib/utils'

interface VideoElementProps {
  src: string
  poster?: string
  loop?: boolean
  autoPlay?: boolean
  textTracks?: TextTrack[]
  sha256?: string
  className?: string
  onError?: () => void
}

/**
 * Core video element component with caption track support
 */
export const VideoElement = forwardRef<HTMLVideoElement, VideoElementProps>(function VideoElement(
  { src, poster, loop = false, autoPlay = true, textTracks = [], sha256, className = '', onError },
  ref
) {
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      loop={loop}
      autoPlay={autoPlay}
      playsInline
      className={className}
      onError={onError}
    >
      {textTracks.map(track => (
        <CaptionTrack key={track.lang} track={track} sha256={sha256} />
      ))}
    </video>
  )
})

/**
 * Caption Track component with automatic failover using useMediaUrls
 */
function CaptionTrack({ track, sha256 }: { track: TextTrack; sha256?: string }) {
  const { ladder } = useMediaUrls({
    urls: [track.url],
    mediaType: 'vtt',
    sha256,
  })
  const currentUrl = ladder.currentUrl

  const handleTrackError = useCallback(() => {
    if (ladder.hasMore) {
      if (import.meta.env.DEV) {
        console.log(`VTT track error for ${track.lang}, trying next URL...`)
      }
      ladder.tryNext()
    } else {
      console.warn(`All VTT track URLs failed for ${track.lang}`)
    }
  }, [ladder, track.lang])

  if (!currentUrl) {
    return null
  }

  return (
    <track
      label={getLanguageLabel(track.lang)}
      kind="captions"
      srcLang={track.lang}
      src={currentUrl}
      onError={handleTrackError}
    />
  )
}
