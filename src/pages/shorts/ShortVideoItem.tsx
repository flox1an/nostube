/**
 * Short Video Item Component
 *
 * Individual short video item with video playback, reactions, and comments sheet.
 * Extracted from ShortsVideoPage for better maintainability.
 */

import { Link } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useTranslation } from 'react-i18next'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import { FollowButton } from '@/components/FollowButton'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { formatDistance } from 'date-fns/formatDistance'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import type { VideoEvent } from '@/utils/video-event'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import {
  useAppContext,
  useProfile,
  useReadRelays,
  useCommentCount,
  usePreloadVideoData,
} from '@/hooks'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { MessageCircle, Share2 } from 'lucide-react'
import { imageProxyVideoPreview, combineRelays } from '@/lib/utils'
import { nprofileFromEvent } from '@/lib/nprofile'
import { useValidUrl } from '@/hooks/useValidUrl'
import { UserBlossomServersModel } from 'applesauce-common/models'
import { useEventModel } from 'applesauce-react/hooks'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VideoComments } from '@/components/VideoComments'
import { presetRelays } from '@/constants/relays'
import { PlayPauseOverlay } from '@/components/PlayPauseOverlay'
import { getDateLocale } from '@/lib/date-locale'

// Extract preset relay URLs at module level to avoid recreation on every render
const PRESET_RELAY_URLS = presetRelays.map(relay => relay.url)

export interface ShortVideoItemProps {
  video: VideoEvent
  isActive: boolean
  shouldPreload: boolean
  registerIntersectionRef?: (element: HTMLDivElement | null) => void
}

export function ShortVideoItem({
  video,
  isActive,
  shouldPreload,
  registerIntersectionRef,
}: ShortVideoItemProps) {
  const { i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const metadata = useProfile({ pubkey: video.pubkey })
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''
  const authorPicture = metadata?.picture
  const videoRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const userInitiatedPlayPauseRef = useRef<boolean>(false)
  const eventStore = useEventStore()
  const userReadRelays = useReadRelays()
  const { config } = useAppContext()
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)

  // Get comment count
  const commentCount = useCommentCount({ videoId: video.id })

  const playActiveVideo = useCallback(() => {
    const videoEl = videoElementRef.current
    if (!videoEl || !videoEl.paused) return

    const playPromise = videoEl.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Successfully started playing - now unmute for audio
          // This ensures iOS autoplay restrictions are satisfied (start muted, unmute after playback begins)
          videoEl.muted = false
        })
        .catch(error => {
          console.error('Error playing video:', video.id.substring(0, 8), error)
        })
    }
  }, [video.id])

  // Get video owner's Blossom servers
  const rawOwnerServers =
    useEventModel(UserBlossomServersModel, video.pubkey ? [video.pubkey] : null) || []

  // Combine config Blossom servers with video owner's servers
  const allBlossomServers = useMemo(() => {
    // Move conversion inside useMemo to avoid dependency warning
    const ownerServers = (rawOwnerServers || []).map(url => url.toString())
    const configServers = config.blossomServers?.map(s => s.url) || []
    // Owner servers first (more likely to have the file), then config servers
    return [...ownerServers, ...configServers]
  }, [rawOwnerServers, config.blossomServers])

  // Memoize proxyConfig to prevent infinite loops
  const proxyConfig = useMemo(
    () => ({
      enabled: true, // Enable proxy for videos
    }),
    []
  )

  // Handle video URL error
  const handleVideoUrlError = useCallback((error: Error) => {
    console.error('Video URL failover error:', error)
  }, [])

  // Use media URL failover system for video with Blossom proxy
  const {
    currentUrl: videoUrl,
    moveToNext: moveToNextVideo,
    hasMore: hasMoreVideoUrls,
  } = useMediaUrls({
    urls: video.urls,
    mediaType: 'video',
    sha256: video.x,
    kind: video.kind,
    authorPubkey: video.pubkey,
    proxyConfig,
    enabled: shouldPreload || isActive,
    onError: handleVideoUrlError,
  })

  // Validate thumbnail URLs with Blossom server fallbacks
  const { validUrl: thumbnailUrl } = useValidUrl({
    urls: video.images,
    blossomServers: allBlossomServers,
    resourceType: 'image',
    enabled: true,
  })

  // Get the event from store to access seenRelays
  const event = useMemo(() => eventStore.getEvent(video.id), [eventStore, video.id])
  const authorNprofile = useMemo(
    () => nprofileFromEvent(video.pubkey, event),
    [video.pubkey, event]
  )

  // Get relays from event's seenRelays
  const eventRelays = useMemo(() => {
    if (!event) return []
    const seenRelays = getSeenRelays(event)
    return seenRelays ? Array.from(seenRelays) : []
  }, [event])

  const pointerRelays = useMemo(() => {
    if (!video.link) return []
    try {
      const identifier = decodeVideoEventIdentifier(video.link)
      if (!identifier) return []
      const relays =
        identifier.type === 'event'
          ? identifier.data?.relays
          : identifier.type === 'address'
            ? identifier.data?.relays
            : undefined
      return relays ? [...relays] : []
    } catch {
      return []
    }
  }, [video.link])

  const reactionRelays = useMemo(
    () => combineRelays([eventRelays, pointerRelays, userReadRelays, PRESET_RELAY_URLS]),
    [eventRelays, pointerRelays, userReadRelays]
  )

  // Preload reactions and comments for this video
  usePreloadVideoData({
    videoId: video.id,
    authorPubkey: video.pubkey,
    kind: video.kind,
    relays: reactionRelays,
    enabled: shouldPreload || isActive,
  })

  // Auto-play/pause based on isActive
  useEffect(() => {
    const videoEl = videoElementRef.current
    if (!videoEl) return

    if (isActive) {
      // Only reset to beginning if video has ended or is at the very start
      // This prevents jarring resets when scrolling back to a partially watched video
      if (videoEl.ended || videoEl.currentTime === 0) {
        videoEl.currentTime = 0
      }
      // Start muted to comply with iOS autoplay restrictions
      // Will be unmuted after playback starts (see playActiveVideo)
      videoEl.muted = true

      if (videoUrl) {
        playActiveVideo()
      }
    } else {
      // Pause inactive videos at current position (don't reset)
      videoEl.pause()
      videoEl.muted = true
    }
  }, [isActive, playActiveVideo, video.id, videoUrl])

  // Handle click/touch to pause/play
  const handleVideoClick = useCallback(() => {
    const videoEl = videoElementRef.current
    if (!videoEl || !isActive) return

    // Mark this as a user-initiated action to show the play/pause overlay
    userInitiatedPlayPauseRef.current = true

    if (videoEl.paused) {
      const playPromise = videoEl.play()
      // User-initiated play can unmute immediately
      if (playPromise !== undefined) {
        playPromise.then(() => {
          videoEl.muted = false
        })
      }
    } else {
      videoEl.pause()
    }
  }, [isActive])

  // Allow toggling playback with spacebar while active
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        handleVideoClick()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleVideoClick, isActive])

  // Handle video ready to play
  const handleCanPlay = useCallback(() => {
    // Video is ready, can start playing
    const videoEl = videoElementRef.current
    if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
      setAspectRatio(videoEl.videoWidth / videoEl.videoHeight)
    }
    // Always try to play when video becomes ready and is active
    // This ensures videos that loaded slowly will still autoplay
    if (isActive) {
      playActiveVideo()
    }
  }, [isActive, playActiveVideo])

  // Handle when video has loaded enough data to start playing
  // This is an additional safeguard for slow-loading videos
  const handleLoadedData = useCallback(() => {
    if (isActive) {
      playActiveVideo()
    }
  }, [isActive, playActiveVideo])

  // Handle video error: try next URL in failover chain
  const handleVideoError = useCallback(() => {
    if (hasMoreVideoUrls) {
      moveToNextVideo()
    } else {
      console.error('All video URLs failed for:', video.id)
    }
  }, [hasMoreVideoUrls, moveToNextVideo, video.id])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = `${baseUrl}/short/${video.link}`

  // Calculate max-width based on aspect ratio
  // For vertical videos (9:16), use standard width
  // For square videos (1:1), use larger width (85vh)
  // For wider videos, use even larger width
  const getMaxWidth = useCallback(() => {
    if (!aspectRatio) return 'calc(100vh * 9 / 16)' // Default for vertical

    if (aspectRatio >= 0.9 && aspectRatio <= 1.1) {
      // Square video (1:1 ratio, with some tolerance)
      return '85vh'
    } else if (aspectRatio > 1.1) {
      // Wider than square (landscape)
      return '95vh'
    } else {
      // Vertical video
      return 'calc(100vh * 9 / 16)'
    }
  }, [aspectRatio])

  // Preload video in background when shouldPreload is true
  useEffect(() => {
    if (!shouldPreload || isActive || !videoUrl) {
      return
    }

    const videoEl = videoElementRef.current
    if (!videoEl) return

    // Start loading the video in the background
    videoEl.load()
  }, [shouldPreload, isActive, videoUrl])

  const handleRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      videoRef.current = node
      if (registerIntersectionRef) {
        registerIntersectionRef(node)
      }
    },
    [registerIntersectionRef]
  )

  return (
    <div
      ref={handleRootRef}
      data-video-id={video.id}
      className="snap-center min-h-screen h-screen w-full flex items-center justify-center bg-black"
      style={{
        scrollSnapAlign: 'center',
        scrollSnapStop: 'always',
        contain: 'layout style paint', // Isolate layout calculations
        contentVisibility: isActive ? 'visible' : 'auto', // Only render visible content
      }}
    >
      <div className="relative w-full h-screen flex flex-col md:flex-row items-center justify-center">
        {/* Video player - fullscreen vertical */}
        <div className="relative w-full md:flex-1 h-full flex items-center justify-center bg-black">
          <div className="relative w-full h-full" style={{ maxWidth: getMaxWidth() }}>
            {video.contentWarning && !isActive && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white drop-shadow-lg">
                    Content warning
                  </div>
                  <div className="text-base font-semibold text-white drop-shadow-lg mt-4">
                    {video.contentWarning}
                  </div>
                </div>
              </div>
            )}
            <div className="relative w-full h-full">
              <div className="relative w-full h-full" onClick={handleVideoClick}>
                <video
                  ref={videoElementRef}
                  src={videoUrl || undefined}
                  className="w-full h-full object-contain cursor-pointer"
                  loop
                  muted={true}
                  playsInline
                  poster={
                    thumbnailUrl
                      ? imageProxyVideoPreview(thumbnailUrl, config.thumbResizeServerUrl)
                      : undefined
                  }
                  preload={shouldPreload || isActive ? 'auto' : 'metadata'}
                  onCanPlay={handleCanPlay}
                  onLoadedData={handleLoadedData}
                  onError={handleVideoError}
                  style={{ opacity: isActive ? 1 : 0.5 }}
                />
                {/* Play/Pause icon overlay with animation */}
                {isActive && (
                  <PlayPauseOverlay
                    videoRef={videoElementRef}
                    userInitiatedRef={userInitiatedPlayPauseRef}
                  />
                )}
              </div>
              {/* Show thumbnail overlay when not active for better visibility */}
              {!isActive && thumbnailUrl && (
                <div
                  className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center"
                  onClick={handleVideoClick}
                >
                  <img
                    src={imageProxyVideoPreview(thumbnailUrl, config.thumbResizeServerUrl)}
                    alt={video.title}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar with interactions - mobile: absolute overlay, desktop: relative right side */}
        <div className="absolute bottom-24 right-4 md:right-0 flex flex-col items-center gap-4 z-10 md:pr-8 pb-8">
          {/* Upvote and Downvote buttons */}
          <VideoReactionButtons
            eventId={video.id}
            kind={video.kind}
            authorPubkey={video.pubkey}
            relays={reactionRelays}
          />

          {/* Comments button */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => setCommentsOpen(true)}
              aria-label="Comments"
            >
              <MessageCircle className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium">{commentCount}</span>
          </div>

          {/* Share button */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl)
              }}
              aria-label="Share"
            >
              <Share2 className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium">Share</span>
          </div>
        </div>

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 md:px-8 md:pb-8 bg-linear-to-t from-black/80 via-black/40 to-transparent">
          <div className="w-full" style={{ maxWidth: getMaxWidth() }}>
            {/* Follow button and Author info */}
            <div className="flex flex-col gap-4">
              <FollowButton pubkey={video.pubkey} className="text-white self-start" />
              <div className="flex items-center gap-4">
                <Link to={`/author/${authorNprofile}`}>
                  <UserAvatar
                    picture={authorPicture}
                    pubkey={video.pubkey}
                    name={authorName}
                    thumbResizeServerUrl={config.thumbResizeServerUrl}
                    className="h-10 w-10 border-2 border-white"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/author/${authorNprofile}`}>
                    <div className="text-white font-semibold truncate">{authorName}</div>
                  </Link>
                  <div className="text-white/70 text-sm">
                    {formatDistance(new Date(video.created_at * 1000), new Date(), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Video title/description */}
            <div className="text-white my-2 line-clamp-3">{video.title || video.description}</div>

            {/* Tags */}
            {video.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {video.tags.slice(0, 3).map(tag => (
                  <Link
                    key={tag}
                    to={`/tag/${tag}`}
                    className="text-blue-400 text-sm hover:underline"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments Sheet */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto max-w-2xl mx-auto">
          <SheetHeader>
            <SheetTitle>Comments</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <VideoComments
              videoId={video.id}
              authorPubkey={video.pubkey}
              link={video.link}
              relays={eventRelays}
              videoKind={video.kind}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
