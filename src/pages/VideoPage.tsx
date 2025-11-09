import { useParams, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { of } from 'rxjs'
import { switchMap, catchError } from 'rxjs/operators'
import { VideoPlayer } from '@/components/VideoPlayer'
import { VideoSuggestions } from '@/components/VideoSuggestions'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { processEvent } from '@/utils/video-event'
import { decodeEventPointer } from '@/lib/nip19'
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
} from '@/hooks'
import { createEventLoader } from 'applesauce-loaders/loaders'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { extractBlossomHash } from '@/utils/video-event'
import { PlaylistSidebar } from '@/components/PlaylistSidebar'
import { VideoInfoSection } from '@/components/VideoInfoSection'
import { VideoAvailabilityAlert } from '@/components/VideoAvailabilityAlert'
import { VideoPageLayout } from '@/components/VideoPageLayout'
import { shouldVideoLoop, buildShareUrl, buildShareLinks } from '@/utils/video-utils'
import { Button } from '@/components/ui/button'
import { MirrorVideoDialog } from '@/components/MirrorVideoDialog'

export function VideoPage() {
  const { config } = useAppContext()
  const { nevent } = useParams<{ nevent: string }>()
  const [searchParams] = useSearchParams()
  const playlistParam = searchParams.get('playlist')
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const navigate = useNavigate()
  const eventPointer = useMemo(() => decodeEventPointer(nevent ?? ''), [nevent])
  const { markVideoAsMissing, clearMissingVideo, isVideoMissing } = useMissingVideos()
  const { cinemaMode: persistedCinemaMode, setCinemaMode } = useCinemaMode()
  const location = useLocation()
  const { user } = useCurrentUser()

  // Get initial relays for loading the video event
  const initialRelays = useVideoPageRelays({
    neventRelays: eventPointer?.relays,
    videoEvent: undefined, // Not loaded yet
    playlistEvent: undefined, // Not loaded yet
    authorPubkey: undefined, // Don't know author yet
  })

  const loader = useMemo(
    () => createEventLoader(pool, { eventStore, extraRelays: initialRelays }),
    [pool, eventStore, initialRelays]
  )

  // Use EventStore to get the video event with fallback to loader
  const videoObservable = useMemo(() => {
    if (!eventPointer) return of(null)
    return eventStore.event(eventPointer.id).pipe(
      switchMap(event => {
        if (event) {
          return of(event)
        }
        // If no event in store, fallback to loader
        return loader(eventPointer)
      }),
      catchError(() => {
        // If eventStore fails, fallback to loader
        return loader(eventPointer)
      })
    )
  }, [eventStore, loader, eventPointer])

  const videoEvent = useObservableState(videoObservable)

  // Get relays for playlist loading (includes video event relays once available)
  const playlistRelays = useVideoPageRelays({
    neventRelays: eventPointer?.relays,
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
    neventRelays: eventPointer?.relays,
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
      const processedEvent = processEvent(videoEvent, [], config.blossomServers)
      return processedEvent
    }

    return null
  }, [nevent, videoEvent, config.blossomServers])

  const isLoading = !video && videoEvent === undefined

  const metadata = useProfile(video?.pubkey ? { pubkey: video.pubkey } : undefined)
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''

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
  const { currentPlayPos, setCurrentPlayPos, initialPlayPos, videoElementRef } =
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

  // Check if video is only available on 1 blossom server
  const blossomServerCount = useMemo(() => {
    if (!video || !video.urls || video.urls.length === 0) return 0

    // Extract unique blossom server hostnames (exclude proxy URLs which have ?origin=)
    const servers = new Set<string>()

    for (const url of video.urls) {
      // Skip proxy URLs (they have ?origin= query parameter)
      if (url.includes('?origin=')) continue

      try {
        const urlObj = new URL(url)
        const { sha256 } = extractBlossomHash(url)
        // Only count if it's a valid blossom URL (has SHA256 hash)
        if (sha256) {
          servers.add(urlObj.origin)
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return servers.size
  }, [video])

  // Handle mirror action
  const handleMirror = () => {
    setMirrorDialogOpen(true)
  }

  // Build share URL and links
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = buildShareUrl(baseUrl, nevent || '', includeTimestamp, currentPlayPos)
  const fullUrl = shareUrl
  const title = video?.title || 'Watch this video'
  const thumbnailUrl = video?.images[0] || ''

  const shareLinks = useMemo(() => {
    return buildShareLinks(shareUrl, fullUrl, title, thumbnailUrl)
  }, [shareUrl, fullUrl, title, thumbnailUrl])

  // Handle video element ready callback
  const handleVideoElementReady = useCallback(
    (element: HTMLVideoElement | null) => {
      videoElementRef.current = element
      setActiveVideoElement(element)
    },
    [videoElementRef]
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
      />
    )
  }

  // Handle video not found or missing
  if (!isLoading && !video) {
    const isMissing = eventPointer && isVideoMissing(eventPointer.id)
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant={isMissing ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{isMissing ? 'Video Unavailable' : 'Video Not Found'}</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <p>
              {isMissing
                ? 'This video has been marked as unavailable because it could not be loaded from any source. It will be automatically retried later.'
                : 'This video could not be found. It may have been deleted or the event ID is incorrect.'}
            </p>
            {isMissing && eventPointer && (
              <Button
                onClick={() => {
                  clearMissingVideo(eventPointer.id)
                  window.location.reload()
                }}
                variant="outline"
                className="w-fit"
              >
                Retry Now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Render video player
  const renderVideoPlayer = () => {
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
        loop={shouldVideoLoop(video.kind)}
        className={
          cinemaMode ? 'w-full aspect-video' : 'w-full max-h-[80dvh] aspect-video rounded-lg'
        }
        onTimeUpdate={setCurrentPlayPos}
        initialPlayPos={currentPlayPos > 0 ? currentPlayPos : initialPlayPos}
        contentWarning={video.contentWarning}
        sha256={video.x} // Pass SHA256 hash for URL discovery
        authorPubkey={video.pubkey} // Pass author pubkey for AS query parameter
        onAllSourcesFailed={urls => markVideoAsMissing(video.id, urls)}
        cinemaMode={cinemaMode}
        onToggleCinemaMode={toggleCinemaMode}
        onVideoDimensionsLoaded={handleVideoDimensionsLoaded}
        onEnded={playlistParam ? handlePlaylistVideoEnd : undefined}
        onVideoElementReady={handleVideoElementReady}
      />
    )
  }

  return (
    <>
      <VideoPageLayout
        cinemaMode={cinemaMode}
        videoPlayer={renderVideoPlayer()}
        videoInfo={
          <VideoInfoSection
            video={video}
            isLoading={isLoading}
            metadata={metadata}
            authorName={authorName}
            relaysToUse={relaysToUse}
            userPubkey={user?.pubkey}
            configRelays={config.relays}
            configBlossomServers={config.blossomServers}
            videoEvent={videoEvent}
            shareOpen={shareOpen}
            setShareOpen={setShareOpen}
            shareUrl={shareUrl}
            includeTimestamp={includeTimestamp}
            setIncludeTimestamp={setIncludeTimestamp}
            shareLinks={shareLinks}
            onDelete={() => navigate('/')}
          />
        }
        sidebar={
          <>
            <VideoAvailabilityAlert
              blossomServerCount={blossomServerCount}
              onMirror={handleMirror}
            />
            {renderSidebarContent()}
          </>
        }
      />

      {/* Mirror Dialog */}
      {video && (
        <MirrorVideoDialog
          open={mirrorDialogOpen}
          onOpenChange={setMirrorDialogOpen}
          videoUrls={video.urls}
        />
      )}
    </>
  )
}
