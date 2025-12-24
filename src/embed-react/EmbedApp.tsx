import { useState, useEffect, useCallback } from 'react'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import type { EmbedParams } from './lib/url-params'
import type { ParsedVideo, VideoVariant } from './lib/video-parser'
import type { Profile } from './lib/profile-fetcher'
import { TitleOverlay } from './components/TitleOverlay'
import { ContentWarning } from './components/ContentWarning'
import { ErrorMessage } from './components/ErrorMessage'
import { LoadingState } from './components/LoadingState'

interface EmbedAppProps {
  params: EmbedParams
  video: ParsedVideo | null
  profile: Profile | null
  error: string | null
  isLoading: boolean
}

export function EmbedApp({ params, video, profile, error, isLoading }: EmbedAppProps) {
  const [contentWarningAccepted, setContentWarningAccepted] = useState(false)
  const [allSourcesFailed, setAllSourcesFailed] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

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

  // All sources failed
  if (allSourcesFailed) {
    return <ErrorMessage message="Video unavailable - all sources failed" />
  }

  // No video variants
  if (video.videoVariants.length === 0) {
    return <ErrorMessage message="No video sources found" />
  }

  // Content warning (if not accepted)
  if (video.contentWarning && !contentWarningAccepted) {
    return (
      <ContentWarning
        reason={video.contentWarning}
        onAccept={() => setContentWarningAccepted(true)}
        color={params.accentColor}
        poster={video.thumbnails[0]?.url}
      />
    )
  }

  // Map video variants to VideoPlayer format
  const playerVariants: VideoVariant[] = video.videoVariants.map(v => ({
    url: v.url,
    fallbackUrls: v.fallbackUrls,
    quality: v.quality || '',
    hash: v.hash,
    mime: v.mimeType || 'video/mp4',
  }))

  const urls = video.videoVariants.map(v => v.url)
  const poster = video.thumbnails[0]?.url

  return (
    <div
      id="nostube-embed"
      className="relative w-full h-full bg-black"
      style={{ '--embed-accent': `#${params.accentColor}` } as React.CSSProperties}
    >
      <VideoPlayer
        urls={urls}
        videoVariants={playerVariants}
        mime={video.videoVariants[0]?.mimeType || 'video/mp4'}
        poster={poster}
        loop={params.loop}
        initialPlayPos={params.startTime}
        contentWarning={undefined} // Already handled above
        authorPubkey={video.author}
        sha256={video.videoVariants[0]?.hash}
        onAllSourcesFailed={handleAllSourcesFailed}
        textTracks={[]}
        className="w-full h-full"
      />

      {/* Title overlay */}
      {params.showTitle && (
        <TitleOverlay
          title={video.title}
          author={profile}
          authorPubkey={video.author}
          visible={controlsVisible}
          videoId={params.videoId}
        />
      )}
    </div>
  )
}
