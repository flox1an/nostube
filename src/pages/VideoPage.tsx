import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { of, Subscription } from 'rxjs'
import { switchMap, catchError, take } from 'rxjs/operators'
import { logSubscriptionCreated, logSubscriptionClosed } from '@/lib/relay-debug'
import type { NostrEvent } from 'nostr-tools'
import { VideoPlayer } from '@/components/VideoPlayer'
import { VideoSuggestions } from '@/components/VideoSuggestions'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { processEvent } from '@/utils/video-event'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppContext,
  useCurrentUser,
  useProfile,
  useMissingVideos,
  useCinemaMode,
  usePlaylistDetails,
  useVideoPageRelays,
  useVideoPlayPosition,
  useUltraWideVideo,
  usePlaylistNavigation,
  useVideoKeyboardShortcuts,
  useVideoServerAvailability,
  useUserBlossomServers,
  useVideoHistory,
  useIsMobile,
} from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useVideoLabels } from '@/hooks/useVideoLabels'
import { useCommentHighlight } from '@/hooks/useCommentHighlight'
import { createEventLoader, createAddressLoader } from 'applesauce-loaders/loaders'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { PlaylistSidebar } from '@/components/PlaylistSidebar'
import { VideoInfoSection } from '@/components/VideoInfoSection'
import { VideoAvailabilityAlert } from '@/components/VideoAvailabilityAlert'
import { VideoTransformAlert } from '@/components/VideoTransformAlert'
import { VideoPageLayout } from '@/components/VideoPageLayout'
import { shouldVideoLoop, buildShareUrl, buildShareLinks } from '@/utils/video-utils'
import { Button } from '@/components/ui/button'
import { MirrorVideoDialog } from '@/components/MirrorVideoDialog'
import { TransformVideoDialog } from '@/components/TransformVideoDialog'
import { getNeededTransformations } from '@/lib/video-transformation-detection'
import { useTranslation } from 'react-i18next'

// Stable empty array to prevent infinite re-renders
const EMPTY_URLS: string[] = []

export function VideoPage() {
  const { t } = useTranslation()
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { nevent } = useParams<{ nevent: string }>()
  const [searchParams] = useSearchParams()
  const playlistParam = searchParams.get('playlist')
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const navigate = useNavigate()

  // Use comment highlight hook
  useCommentHighlight()
  // Decode video identifier (supports both nevent and naddr)
  const videoIdentifier = useMemo(() => decodeVideoEventIdentifier(nevent ?? ''), [nevent])
  const { markVideoAsMissing, clearMissingVideo, isVideoMissing } = useMissingVideos()
  const { cinemaMode: persistedCinemaMode, setCinemaMode } = useCinemaMode()
  const location = useLocation()
  const { user } = useCurrentUser()
  const { addToHistory } = useVideoHistory()
  const isMobile = useIsMobile()

  // Get initial relays for loading the video event
  const initialRelays = useVideoPageRelays({
    neventRelays:
      videoIdentifier?.type === 'event'
        ? videoIdentifier.data?.relays
        : videoIdentifier?.type === 'address'
          ? videoIdentifier.data?.relays
          : undefined,
    videoEvent: undefined, // Not loaded yet
    playlistEvent: undefined, // Not loaded yet
    authorPubkey: undefined, // Don't know author yet
  })

  const eventLoader = useMemo(
    () => createEventLoader(pool, { eventStore, extraRelays: initialRelays }),
    [pool, eventStore, initialRelays]
  )

  const addressLoader = useMemo(
    () => createAddressLoader(pool, { eventStore, extraRelays: initialRelays }),
    [pool, eventStore, initialRelays]
  )

  // State for video event loaded from EventStore/relays
  const [videoEvent, setVideoEvent] = useState<NostrEvent | undefined>(undefined)

  // Load video event with explicit subscription management for proper cleanup
  useEffect(() => {
    // Reset state when videoIdentifier becomes falsy - use microtask to avoid synchronous setState in effect
    if (!videoIdentifier) {
      queueMicrotask(() => setVideoEvent(undefined))
      return
    }

    let sub: Subscription | undefined
    let subId: string | undefined

    if (videoIdentifier.type === 'event') {
      const eventPointer = videoIdentifier.data
      subId = logSubscriptionCreated('VideoPage-event', initialRelays, {
        ids: [eventPointer.id],
      })

      sub = eventStore
        .event(eventPointer.id)
        .pipe(
          switchMap(event => {
            if (event) {
              return of(event)
            }
            // If no event in store, fallback to loader
            return eventLoader(eventPointer)
          }),
          catchError(() => {
            // If eventStore fails, fallback to loader
            return eventLoader(eventPointer)
          }),
          take(1) // Complete after first event to avoid keeping subscription open
        )
        .subscribe({
          next: event => {
            setVideoEvent(event ?? undefined)
          },
          error: () => {
            setVideoEvent(undefined)
          },
        })
    } else if (videoIdentifier.type === 'address') {
      const addressPointer = videoIdentifier.data
      if (!addressPointer) {
        queueMicrotask(() => setVideoEvent(undefined))
        return
      }

      subId = logSubscriptionCreated('VideoPage-address', initialRelays, {
        kinds: [addressPointer.kind],
        authors: [addressPointer.pubkey],
        '#d': [addressPointer.identifier],
      })

      sub = eventStore
        .replaceable(addressPointer.kind, addressPointer.pubkey, addressPointer.identifier)
        .pipe(
          switchMap(event => {
            if (event) {
              return of(event)
            }
            // If no event in store, fallback to loader
            return addressLoader(addressPointer)
          }),
          catchError(() => {
            // If eventStore fails, fallback to loader
            return addressLoader(addressPointer)
          }),
          take(1) // Complete after first event to avoid keeping subscription open
        )
        .subscribe({
          next: event => {
            setVideoEvent(event ?? undefined)
          },
          error: () => {
            setVideoEvent(undefined)
          },
        })
    }

    // Cleanup: always unsubscribe and log closure
    return () => {
      if (sub) {
        sub.unsubscribe()
      }
      if (subId) {
        logSubscriptionClosed(subId)
      }
    }
  }, [eventStore, eventLoader, addressLoader, videoIdentifier, initialRelays])

  // Get relays for playlist loading (includes video event relays once available)
  const playlistRelays = useVideoPageRelays({
    neventRelays:
      videoIdentifier?.type === 'event'
        ? videoIdentifier.data?.relays
        : videoIdentifier?.type === 'address'
          ? videoIdentifier.data?.relays
          : undefined,
    videoEvent: videoEvent,
    playlistEvent: undefined, // Not loaded yet
    authorPubkey: videoEvent?.pubkey,
  })

  const {
    playlistEvent,
    playlistTitle,
    playlistDescription,
    videoEvents: playlistVideos,
    isLoadingPlaylist,
    isLoadingVideos,
    failedVideoIds,
    loadingVideoIds,
  } = usePlaylistDetails(playlistParam, playlistRelays)

  // Get relays for comment loading (includes all available context)
  const commentRelays = useVideoPageRelays({
    neventRelays:
      videoIdentifier?.type === 'event'
        ? videoIdentifier.data?.relays
        : videoIdentifier?.type === 'address'
          ? videoIdentifier.data?.relays
          : undefined,
    videoEvent: videoEvent,
    playlistEvent: playlistEvent,
    authorPubkey: videoEvent?.pubkey,
  })

  // Full relays with all context (for nprofile encoding and suggestions)
  const relaysToUse = commentRelays

  // Process the video event or get from cache
  const video = useMemo(() => {
    if (!nevent) return null

    // If we have the event from EventStore, process it
    if (videoEvent) {
      const processedEvent = processEvent(
        videoEvent,
        [],
        config.blossomServers,
        presetContent.nsfwPubkeys
      )
      return processedEvent
    }

    return null
  }, [nevent, videoEvent, config.blossomServers, presetContent.nsfwPubkeys])

  const isLoading = !video && videoEvent === undefined

  // Calculate needed transformations
  const neededTransformations = useMemo(() => {
    if (!video?.videoVariants) return []
    return getNeededTransformations(video.videoVariants).recommendedTransforms
  }, [video])

  // Load NIP-32 labels for this video
  const { hashtags: labelHashtags, languages: labelLanguages } = useVideoLabels(video?.id)

  // Extract language from video event's L/l tags (NIP-32)
  const videoLanguage = useMemo(() => {
    if (!videoEvent) return null

    // Find L tag with ISO-639-1 namespace
    const lTagIndex = videoEvent.tags.findIndex(tag => tag[0] === 'L' && tag[1] === 'ISO-639-1')

    if (lTagIndex === -1) return null

    // Look for corresponding l tag after the L tag
    for (let i = lTagIndex + 1; i < videoEvent.tags.length; i++) {
      const tag = videoEvent.tags[i]

      // Stop if we hit another L tag (different namespace)
      if (tag[0] === 'L') break

      // Check if this is an l tag matching our namespace
      if (tag[0] === 'l' && tag[2] === 'ISO-639-1') {
        return tag[1]?.toLowerCase() || null
      }
    }

    return null
  }, [videoEvent])

  // Extract geohash from video event's g tag
  const videoGeohash = useMemo(() => {
    if (!videoEvent) return null

    // Find g tag (geohash)
    const gTag = videoEvent.tags.find(tag => tag[0] === 'g')

    return gTag?.[1] || null
  }, [videoEvent])

  // Merge video with label data
  const videoWithLabels = useMemo(() => {
    if (!video) return null

    // Merge hashtags: combine video tags with label hashtags (deduplicate)
    const allTags = [...new Set([...video.tags, ...labelHashtags])]

    // Merge languages: combine video language with label languages (deduplicate)
    const videoLangs = videoLanguage ? [videoLanguage] : []
    const allLanguages = [...new Set([...videoLangs, ...labelLanguages])]

    return {
      ...video,
      tags: allTags,
      // Store merged languages for display
      languages: allLanguages,
    }
  }, [video, labelHashtags, labelLanguages, videoLanguage])

  const metadata = useProfile(video?.pubkey ? { pubkey: video.pubkey } : undefined)
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''

  // Get user's blossom servers
  const { data: userBlossomServers } = useUserBlossomServers()

  // Use video server availability hook
  const { serverList, serverAvailability, checkAvailability, isChecking } =
    useVideoServerAvailability({
      videoUrls: video?.urls ?? EMPTY_URLS,
      videoHash: video?.x,
      configServers: config.blossomServers,
      userServers: userBlossomServers,
    })

  // Check availability on mount to find other servers
  useEffect(() => {
    if (video?.id) {
      checkAvailability()
    }
  }, [video?.id, checkAvailability])

  // Count servers that currently host the video (from video URLs + verified others)
  const blossomServerCount = useMemo(() => {
    const videoUrlCount = serverList.filter(s => s.source === 'video-url').length
    const otherAvailableCount = serverList.filter(
      s => s.source !== 'video-url' && serverAvailability.get(s.url)?.status === 'available'
    ).length
    return videoUrlCount + otherAvailableCount
  }, [serverList, serverAvailability])

  // Use ultra-wide video detection hook
  const { tempCinemaModeForWideVideo, setTempCinemaModeForWideVideo, handleVideoDimensionsLoaded } =
    useUltraWideVideo({
      videoDimensions: video?.dimensions,
      videoId: video?.id,
      persistedCinemaMode,
    })

  // Effective cinema mode: temp override for ultra-wide, or persisted preference
  const cinemaMode = tempCinemaModeForWideVideo || persistedCinemaMode

  // Toggle function that updates persisted state
  const toggleCinemaMode = useCallback(() => {
    setCinemaMode(!persistedCinemaMode)
    // Clear temp override when user manually toggles
    setTempCinemaModeForWideVideo(false)
  }, [persistedCinemaMode, setCinemaMode, setTempCinemaModeForWideVideo])

  // Use video play position hook
  const { currentPlayPos, setCurrentPlayPos, initialPlayPos, setVideoElement } =
    useVideoPlayPosition({
      user,
      videoId: video?.id,
      videoDuration: video?.duration,
      locationSearch: location.search,
    })

  // Use playlist navigation hook
  const {
    prevPlaylistVideo,
    nextPlaylistVideo,
    handlePlaylistVideoEnd,
    navigateToPrevious,
    navigateToNext,
  } = usePlaylistNavigation({
    playlistParam,
    currentVideoId: video?.id,
    playlistVideos,
    shouldLoop: shouldVideoLoop(video?.kind),
    onPlayPosReset: () => setCurrentPlayPos(0),
  })

  // State for active video element
  const [activeVideoElement, setActiveVideoElement] = useState<HTMLVideoElement | null>(null)

  // Use keyboard shortcuts hook
  useVideoKeyboardShortcuts({
    videoElement: activeVideoElement,
    toggleCinemaMode,
    onPreviousVideo: prevPlaylistVideo ? navigateToPrevious : undefined,
    onNextVideo: nextPlaylistVideo ? navigateToNext : undefined,
    isPlaylistMode: !!playlistParam,
  })

  // Share state
  const [shareOpen, setShareOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(false)

  // Mirror dialog state
  const [mirrorDialogOpen, setMirrorDialogOpen] = useState(false)

  // Transform dialog state
  const [transformDialogOpen, setTransformDialogOpen] = useState(false)

  // Update document title
  useEffect(() => {
    if (video?.title) {
      document.title = `${video.title} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [video?.title])

  // Scroll to top when video is loaded
  useEffect(() => {
    if (video) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [video, initialPlayPos])

  // Track video in history when loaded (using ref to avoid dependency on addToHistory)
  const addToHistoryRef = useRef(addToHistory)
  useEffect(() => {
    addToHistoryRef.current = addToHistory
  })
  useEffect(() => {
    if (videoEvent) {
      addToHistoryRef.current(videoEvent)
    }
  }, [videoEvent])

  // Handle mirror action - trigger availability check when dialog opens
  const handleMirror = () => {
    setMirrorDialogOpen(true)
    checkAvailability()
  }

  // Handle transform action
  const handleTransform = useCallback(() => {
    setTransformDialogOpen(true)
  }, [])

  // Build share URL and links
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = buildShareUrl(baseUrl, nevent || '', includeTimestamp, currentPlayPos)
  const fullUrl = shareUrl
  const title = video?.title || t('video.watchThisVideo')
  const thumbnailUrl = video?.images[0] || ''

  const shareLinks = useMemo(() => {
    return buildShareLinks(shareUrl, fullUrl, title, thumbnailUrl)
  }, [shareUrl, fullUrl, title, thumbnailUrl])

  // Handle video element ready callback (stable reference)
  const handleVideoElementReady = useCallback(
    (element: HTMLVideoElement | null) => {
      setVideoElement(element)
      setActiveVideoElement(element)
    },
    [setVideoElement]
  )

  // Stable callback for video failed (memoized)
  const handleAllSourcesFailed = useCallback(
    (urls: string[]) => {
      if (video?.id) {
        markVideoAsMissing(video.id, urls)
      }
      // Trigger availability check to find alternative servers
      checkAvailability()
    },
    [video, markVideoAsMissing, checkAvailability]
  )

  // Stable callback for video dimensions loaded (memoized)
  const handleVideoDimensionsLoadedStable = useCallback(
    (width: number, height: number) => {
      handleVideoDimensionsLoaded(width, height)
    },
    [handleVideoDimensionsLoaded]
  )

  // Render sidebar content (playlist or suggestions)
  const renderSidebarContent = () => {
    if (playlistParam) {
      return (
        <PlaylistSidebar
          playlistParam={playlistParam}
          currentVideoId={video?.id}
          playlistEvent={playlistEvent}
          playlistTitle={playlistTitle}
          playlistDescription={playlistDescription}
          videoEvents={playlistVideos}
          isLoadingPlaylist={isLoadingPlaylist}
          isLoadingVideos={isLoadingVideos}
          failedVideoIds={failedVideoIds}
          loadingVideoIds={loadingVideoIds}
        />
      )
    }

    return (
      <VideoSuggestions
        currentVideoId={video?.id}
        authorPubkey={video?.pubkey}
        currentVideoType={video?.type}
        relays={relaysToUse}
        cinemaMode={cinemaMode}
      />
    )
  }

  // Render video player (placed before early returns to satisfy React hooks rules)
  const videoPlayer = useMemo(() => {
    if (isLoading) {
      return <Skeleton className="w-full aspect-video" />
    }

    if (!video || video.urls.length === 0) {
      return null
    }

    // Use playlist ID as key when in playlist mode to prevent remounting between videos
    // This keeps fullscreen mode active when auto-advancing to the next video
    const playerKey = playlistParam ? `playlist-${playlistParam}` : video.id

    return (
      <VideoPlayer
        key={playerKey}
        urls={video.urls}
        textTracks={video.textTracks}
        mime={video.mimeType || ''}
        poster={video.images[0] || ''}
        posterHash={video.thumbnailVariants?.[0]?.hash}
        loop={shouldVideoLoop(video.kind)}
        className={
          cinemaMode
            ? 'w-full max-h-[80dvh]'
            : `w-full max-h-[80dvh] aspect-video ${isMobile ? '' : 'rounded-lg'}`
        }
        onTimeUpdate={setCurrentPlayPos}
        initialPlayPos={initialPlayPos}
        contentWarning={video.contentWarning}
        sha256={video.x} // Pass SHA256 hash for URL discovery
        authorPubkey={video.pubkey} // Pass author pubkey for AS query parameter
        onAllSourcesFailed={handleAllSourcesFailed}
        cinemaMode={cinemaMode}
        onToggleCinemaMode={toggleCinemaMode}
        onVideoDimensionsLoaded={handleVideoDimensionsLoadedStable}
        onEnded={playlistParam ? handlePlaylistVideoEnd : undefined}
        onVideoElementReady={handleVideoElementReady}
        videoVariants={video.allVideoVariants || video.videoVariants} // For quality selector
      />
    )
  }, [
    isLoading,
    video,
    playlistParam,
    cinemaMode,
    isMobile,
    initialPlayPos,
    setCurrentPlayPos,
    handleAllSourcesFailed,
    toggleCinemaMode,
    handleVideoDimensionsLoadedStable,
    handlePlaylistVideoEnd,
    handleVideoElementReady,
  ])

  // Handle video not found or missing
  if (!isLoading && !video) {
    // Get event ID for missing video check
    const eventId = videoIdentifier?.type === 'event' ? videoIdentifier.data.id : videoEvent?.id // For addressable events, use the actual event ID once loaded

    const isMissing = eventId && isVideoMissing(eventId)
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant={isMissing ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{isMissing ? t('video.unavailable') : t('video.notFound')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <p>{isMissing ? t('video.unavailableDescription') : t('video.notFoundDescription')}</p>
            {isMissing && eventId && (
              <Button
                onClick={() => {
                  clearMissingVideo(eventId)
                  window.location.reload()
                }}
                variant="outline"
                className="w-fit"
              >
                {t('common.retryNow')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <VideoPageLayout
        cinemaMode={cinemaMode}
        videoPlayer={videoPlayer}
        videoInfo={
          <VideoInfoSection
            video={videoWithLabels ?? null}
            isLoading={isLoading}
            metadata={metadata}
            authorName={authorName}
            relaysToUse={relaysToUse}
            userPubkey={user?.pubkey}
            configRelays={config.relays}
            configBlossomServers={config.blossomServers || []}
            videoEvent={videoEvent || undefined}
            shareOpen={shareOpen}
            setShareOpen={setShareOpen}
            shareUrl={shareUrl}
            includeTimestamp={includeTimestamp}
            setIncludeTimestamp={setIncludeTimestamp}
            shareLinks={shareLinks}
            onDelete={() => navigate('/')}
            onMirror={handleMirror}
            userServers={userBlossomServers}
            geohash={videoGeohash}
          />
        }
        sidebar={
          <>
            {video?.id && !isChecking && (
              <VideoAvailabilityAlert
                videoId={video.id}
                blossomServerCount={blossomServerCount}
                onMirror={handleMirror}
              />
            )}
            {video?.id && video?.allVideoVariants && blossomServerCount !== 1 && (
              <VideoTransformAlert
                videoId={video.id}
                videoVariants={video.allVideoVariants}
                onTransform={handleTransform}
              />
            )}
            {renderSidebarContent()}
          </>
        }
      />

      {/* Mirror Dialog */}
      {video && (
        <MirrorVideoDialog
          open={mirrorDialogOpen}
          onOpenChange={setMirrorDialogOpen}
          video={video}
          blossomServers={config.blossomServers}
          userServers={userBlossomServers}
          onMirrorComplete={checkAvailability}
        />
      )}

      {/* Transform Dialog */}
      {video && (
        <TransformVideoDialog
          open={transformDialogOpen}
          onOpenChange={setTransformDialogOpen}
          videoEvent={videoEvent}
          videoVariants={video.videoVariants}
          neededTransformations={neededTransformations}
        />
      )}
    </>
  )
}
