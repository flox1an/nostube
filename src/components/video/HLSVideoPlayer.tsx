import { useCallback, useState, useEffect } from 'react'
import 'hls-video-element'
import { type TextTrack } from '@/utils/video-event'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { getLanguageLabel } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface HLSVideoPlayerProps {
  videoUrl: string
  posterUrl?: string
  loop: boolean
  contentWarning?: string
  cinemaMode: boolean
  isMobile: boolean
  textTracks: TextTrack[]
  sha256?: string
  onTimeUpdate: () => void
  onVideoError: () => void
  hlsRef: (node: Element | null) => void
}

export function HLSVideoPlayer({
  videoUrl,
  posterUrl,
  loop,
  contentWarning,
  cinemaMode,
  isMobile,
  textTracks,
  sha256,
  onTimeUpdate,
  onVideoError,
  hlsRef,
}: HLSVideoPlayerProps) {
  // Track poster loading with a ref for current poster URL and loaded state
  const [posterLoadState, setPosterLoadState] = useState<{
    url: string | undefined
    loaded: boolean
  }>({
    url: posterUrl,
    loaded: !posterUrl, // If no poster, consider it loaded
  })

  // Preload poster image to track loading state
  useEffect(() => {
    // If posterUrl changed, mark as not loaded yet
    if (posterUrl !== posterLoadState.url) {
      queueMicrotask(() => setPosterLoadState({ url: posterUrl, loaded: !posterUrl }))
    }

    if (!posterUrl) return

    const img = new Image()
    img.onload = () => setPosterLoadState({ url: posterUrl, loaded: true })
    img.onerror = () => setPosterLoadState({ url: posterUrl, loaded: true }) // Still hide skeleton on error
    img.src = posterUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [posterUrl, posterLoadState.url])

  return (
    <div className="relative w-full h-full">
      {/* Skeleton overlay while poster loads */}
      {!posterLoadState.loaded && <Skeleton className="absolute inset-0 w-full h-full" />}
      <hls-video
        src={videoUrl}
        slot="media"
        className={cinemaMode || isMobile ? 'cinema' : 'normal'}
        autoPlay={!contentWarning}
        loop={loop}
        poster={posterUrl}
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        ref={hlsRef}
        tabIndex={0}
        onError={onVideoError}
      >
        {/* Captions for HLS */}
        {textTracks.map(vtt => (
          <CaptionTrack key={vtt.lang} track={vtt} sha256={sha256} />
        ))}
      </hls-video>
    </div>
  )
}

/**
 * Caption Track component with automatic failover using useMediaUrls
 */
function CaptionTrack({ track, sha256 }: { track: TextTrack; sha256?: string }) {
  // Use media URL failover for VTT captions
  const { currentUrl, moveToNext, hasMore } = useMediaUrls({
    urls: [track.url],
    mediaType: 'vtt',
    sha256, // Use video's sha256 to discover caption alternatives
  })

  const handleTrackError = useCallback(() => {
    if (hasMore) {
      if (import.meta.env.DEV) {
        console.log(`VTT track error for ${track.lang}, trying next URL...`)
      }
      moveToNext()
    } else {
      console.warn(`All VTT track URLs failed for ${track.lang}`)
    }
  }, [hasMore, moveToNext, track.lang])

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
