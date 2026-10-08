import { useState, useEffect, useCallback } from 'react'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import { useImageCascade } from '@/hooks/useImageCascade'
import type { VideoPlayback } from '@/lib/content-safety'
import { buildVideoPath } from '@/utils/video-utils'
import type { EmbedParams } from './lib/url-params'
import type { VideoEvent } from '@/utils/video-event'
import type { Profile } from './lib/profile-fetcher'
import { parseVideoChapters } from '@/lib/video-chapters'
import { TitleOverlay } from './components/TitleOverlay'
import { ContentWarning } from './components/ContentWarning'
import { ErrorMessage } from './components/ErrorMessage'
import { LoadingState } from './components/LoadingState'

/** `unverified`: the safety check (preset) could not run, so nothing plays. */
export type EmbedPlayback = VideoPlayback | 'unverified'

interface EmbedAppProps {
  params: EmbedParams
  video: VideoEvent | null
  playback: EmbedPlayback
  profile: Profile | null
  error: string | null
  isLoading: boolean
}

export function EmbedApp({ params, video, playback, profile, error, isLoading }: EmbedAppProps) {
  const [contentWarningAccepted, setContentWarningAccepted] = useState(false)
  const [allSourcesFailed, setAllSourcesFailed] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const isBlocked = playback === 'hidden' || playback === 'unverified'
  const embedPoster = useImageCascade({
    // Never fetch the thumbnail of a video the viewer isn't allowed to see.
    src: isBlocked ? undefined : video?.thumbnailVariants[0]?.url,
    preset: 'embed-card-v1',
    authorPubkey: video?.pubkey,
  }).src

  // Handle all sources failed
  const handleAllSourcesFailed = useCallback(() => {
    setAllSourcesFailed(true)
  }, [])

  // Show controls on mouse move
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    const handleMouseMove = () => {
      setControlsVisible(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setControlsVisible(false), 2000)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(timeout)
    }
  }, [])

  // Loading state
  if (isLoading) {
    return <LoadingState />
  }

  // Error state
  if (error || !video) {
    return <ErrorMessage message={error || 'Video not found'} />
  }

  // NSFW safety comes before anything that could reveal the video.
  if (isBlocked) {
    const watchUrl = `https://nostu.be${buildVideoPath(params.videoId, 'video')}`
    return playback === 'hidden' ? (
      <ContentWarning
        title="Sensitive content"
        message="This video is marked as sensitive. It only plays for viewers who enabled sensitive content in their nostube settings."
        color={params.accentColor}
        watchUrl={watchUrl}
      />
    ) : (
      <ContentWarning
        title="Couldn't verify this video"
        message="The safety check couldn't be completed, so this video won't play here."
        color={params.accentColor}
        watchUrl={watchUrl}
      />
    )
  }

  // All sources failed
  if (allSourcesFailed) {
    return <ErrorMessage message="Video unavailable - all sources failed" />
  }

  // No video variants
  if (video.videoVariants.length === 0) {
    return <ErrorMessage message="No video sources found" />
  }

  if (playback === 'warn' && !contentWarningAccepted) {
    return (
      <ContentWarning
        title="Content Warning"
        message={video.contentWarning || 'This video may contain sensitive content.'}
        onAccept={() => setContentWarningAccepted(true)}
        color={params.accentColor}
        poster={embedPoster ?? undefined}
      />
    )
  }

  // Use video variants directly from VideoEvent
  const urls = video.videoVariants.map(v => v.url)
  const poster = video.thumbnailVariants[0]?.url
  const posterHash = video.thumbnailVariants[0]?.hash
  const chapters = parseVideoChapters(video.description, video.duration)

  return (
    <div
      id="nostube-embed"
      className="relative w-full h-full bg-black"
      style={{ '--embed-accent': `#${params.accentColor}` } as React.CSSProperties}
    >
      <VideoPlayer
        urls={urls}
        videoVariants={video.videoVariants}
        mime={video.videoVariants[0]?.mimeType || 'video/mp4'}
        poster={poster}
        posterHash={posterHash}
        posterPreset="embed-card-v1"
        loop={params.loop}
        initialPlayPos={params.startTime}
        contentWarning={undefined} // Already handled above
        authorPubkey={video.pubkey}
        eventId={params.showZaps ? video.id : undefined}
        sha256={video.videoVariants[0]?.hash}
        onAllSourcesFailed={handleAllSourcesFailed}
        textTracks={video.textTracks}
        className="w-full h-full"
        chapters={chapters}
        showTimelineMarkers={params.showZaps}
      />

      {/* Title overlay */}
      {params.showTitle && (
        <TitleOverlay
          title={video.title}
          author={profile}
          authorPubkey={video.pubkey}
          visible={controlsVisible}
          videoId={params.videoId}
          onOpenVideo={() => {
            // Pause video when opening in nostube
            const videoEl = document.querySelector('video')
            if (videoEl) {
              videoEl.pause()
            }
          }}
        />
      )}
    </div>
  )
}
