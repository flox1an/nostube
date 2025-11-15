import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { of } from 'rxjs'
import { switchMap, catchError, map } from 'rxjs/operators'
import { ButtonWithReactions } from '@/components/ButtonWithReactions'
import { FollowButton } from '@/components/FollowButton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDistance } from 'date-fns'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { processEvent, type VideoEvent, processEvents } from '@/utils/video-event'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppContext, useProfile, useReportedPubkeys, useReadRelays } from '@/hooks'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import {
  createEventLoader,
  createAddressLoader,
  createTimelineLoader,
} from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { MessageCircle, ChevronDown, Share2 } from 'lucide-react'
import { imageProxy, imageProxyVideoPreview, combineRelays } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getKindsForType } from '@/lib/video-types'
import { nprofileFromEvent } from '@/lib/nprofile'
import { useValidUrl } from '@/hooks/useValidUrl'
import { UserBlossomServersModel } from 'applesauce-core/models'
import { useEventModel } from 'applesauce-react/hooks'
import { Header } from '@/components/Header'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VideoComments } from '@/components/VideoComments'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { presetRelays } from '@/constants/relays'

function ShortVideoItem({
  video,
  isActive,
  shouldPreload,
  registerIntersectionRef,
}: {
  video: VideoEvent
  isActive: boolean
  shouldPreload: boolean
  registerIntersectionRef?: (element: HTMLDivElement | null) => void
}) {
  const metadata = useProfile({ pubkey: video.pubkey })
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''
  const authorPicture = metadata?.picture
  const videoRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const eventStore = useEventStore()
  const userReadRelays = useReadRelays()
  const { config } = useAppContext()
  const [isPaused, setIsPaused] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const playActiveVideo = useCallback(() => {
    const videoEl = videoElementRef.current
    if (!videoEl || !videoEl.paused) return

    const playPromise = videoEl.play()
    if (playPromise !== undefined) {
      playPromise.catch(error => {
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

  const presetRelayUrls = useMemo(() => presetRelays.map(relay => relay.url), [])
  const reactionRelays = useMemo(
    () => combineRelays([eventRelays, pointerRelays, userReadRelays, presetRelayUrls]),
    [eventRelays, pointerRelays, userReadRelays, presetRelayUrls]
  )

  // Auto-play/pause based on isActive
  useEffect(() => {
    const videoEl = videoElementRef.current
    if (!videoEl) return
    let cancelled = false
    const syncPausedState = async (paused: boolean) => {
      await Promise.resolve()
      if (!cancelled) {
        setIsPaused(paused)
      }
    }

    if (isActive) {
      // Reset to beginning and play immediately
      videoEl.currentTime = 0
      videoEl.muted = false
      syncPausedState(false)

      if (videoUrl) {
        playActiveVideo()
      }
    } else {
      // Pause and mute inactive videos
      videoEl.pause()
      videoEl.muted = true
      syncPausedState(false)
    }
    return () => {
      cancelled = true
    }
  }, [isActive, playActiveVideo, video.id, videoUrl])

  // Handle click/touch to pause/play
  const handleVideoClick = useCallback(() => {
    const videoEl = videoElementRef.current
    if (!videoEl || !isActive) return

    if (videoEl.paused) {
      videoEl.play()
      setIsPaused(false)
    } else {
      videoEl.pause()
      setIsPaused(true)
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
    if (isActive) {
      setIsPaused(false)
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
      style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
    >
      <div className="relative w-full h-screen flex flex-col items-center justify-center">
        {/* Video player - fullscreen vertical */}
        <div className="relative w-full h-full flex items-center justify-center bg-black">
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
                  muted={false}
                  playsInline
                  poster={
                    thumbnailUrl
                      ? imageProxyVideoPreview(thumbnailUrl, config.thumbResizeServerUrl)
                      : undefined
                  }
                  preload={shouldPreload || isActive ? 'auto' : 'metadata'}
                  onCanPlay={handleCanPlay}
                  onError={handleVideoError}
                  style={{ opacity: isActive ? 1 : 0.5 }}
                />
                {/* Pause indicator */}
                {isPaused && isActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-4">
                      <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    </div>
                  </div>
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

        {/* Right sidebar with interactions */}
        <div className="absolute right-4 bottom-24 flex flex-col items-center gap-4 z-10">
          {/* Like button */}
          <div className="flex flex-col items-center gap-1">
            <ButtonWithReactions
              eventId={video.id}
              kind={video.kind}
              authorPubkey={video.pubkey}
              relays={reactionRelays}
              className="bg-black/50 hover:bg-black/70 text-white border-white/20"
            />
          </div>

          {/* Comments button */}
          <div className="flex flex-col items-center gap-1">
            <button
              className="bg-black/50 hover:bg-black/70 rounded-full p-2 border border-white/20 transition-colors"
              onClick={() => setCommentsOpen(true)}
            >
              <MessageCircle className="h-6 w-6 text-white" />
            </button>
            <span className="text-white text-xs">Comments</span>
          </div>

          {/* Share button */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/50 hover:bg-black/70 rounded-full border border-white/20"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl)
              }}
            >
              <Share2 className="h-6 w-6 text-white" />
            </Button>
            <span className="text-white text-xs">Share</span>
          </div>

          {/* Scroll indicator */}
          <div className="flex flex-col items-center gap-2 mt-4">
            <ChevronDown className="h-6 w-6 text-white/70 animate-bounce" />
            <span className="text-white/70 text-xs">Next</span>
          </div>
        </div>

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 bg-linear-to-t from-black/80 via-black/40 to-transparent">
          <div className="w-full" style={{ maxWidth: getMaxWidth() }}>
            {/* Follow button and Author info */}
            <div className="flex flex-col gap-2 mb-3">
              <FollowButton pubkey={video.pubkey} className="text-white self-start" />
              <div className="flex items-center gap-3">
                <Link to={`/author/${authorNprofile}`}>
                  <Avatar className="h-10 w-10 border-2 border-white">
                    <AvatarImage
                      src={imageProxy(authorPicture, config.thumbResizeServerUrl)}
                      alt={authorName}
                    />
                    <AvatarFallback>{authorName?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/author/${authorNprofile}`}>
                    <div className="text-white font-semibold truncate">{authorName}</div>
                  </Link>
                  <div className="text-white/70 text-sm">
                    {formatDistance(new Date(video.created_at * 1000), new Date(), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Video title/description */}
            <div className="text-white mb-2 line-clamp-3">{video.title || video.description}</div>

            {/* Tags */}
            {video.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {video.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-blue-400 text-sm">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments Sheet */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
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

export function ShortsVideoPage() {
  const { config } = useAppContext()
  const { nevent } = useParams<{ nevent: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const blockedPubkeys = useReportedPubkeys()

  // Use zustand store for videos and current index
  const {
    videos: allVideos,
    currentIndex: currentVideoIndex,
    isLoading: isLoadingVideos,
    setVideos,
    setCurrentIndex,
    setLoading,
  } = useShortsFeedStore()

  const currentVideoIndexRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const videoElementsRef = useRef(new Map<string, HTMLDivElement>())
  const videoIdsKey = useMemo(() => allVideos.map(video => video.id).join('|'), [allVideos])

  const registerVideoElement = useCallback(
    (videoId: string, index: number) => (element: HTMLDivElement | null) => {
      if (element) {
        element.dataset.index = index.toString()
        element.dataset.videoId = videoId
        videoElementsRef.current.set(videoId, element)
        observerRef.current?.observe(element)
      } else {
        const existing = videoElementsRef.current.get(videoId)
        if (existing) {
          observerRef.current?.unobserve(existing)
        }
        videoElementsRef.current.delete(videoId)
      }
    },
    []
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        let bestEntry: IntersectionObserverEntry | null = null

        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry
          }
        }

        if (!bestEntry) return

        const target = bestEntry.target as HTMLElement
        const indexAttr = target.dataset.index
        if (!indexAttr) return
        const nextIndex = Number(indexAttr)
        if (Number.isNaN(nextIndex)) return

        if (nextIndex !== currentVideoIndexRef.current) {
          currentVideoIndexRef.current = nextIndex
          setCurrentIndex(nextIndex)
        }
      },
      {
        threshold: [0.4, 0.6, 0.8, 1],
      }
    )

    observerRef.current = observer
    videoElementsRef.current.forEach(element => observer.observe(element))

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [setCurrentIndex, videoIdsKey])

  // Sync ref with store's currentIndex
  useEffect(() => {
    currentVideoIndexRef.current = currentVideoIndex
  }, [currentVideoIndex])

  // Use centralized read relays hook
  const readRelays = useReadRelays()

  // Decode video identifier (supports both nevent and naddr)
  const videoIdentifier = useMemo(() => {
    if (!nevent) return null
    return decodeVideoEventIdentifier(nevent)
  }, [nevent])

  const eventLoader = useMemo(() => createEventLoader(pool, { eventStore }), [pool, eventStore])
  const addressLoader = useMemo(() => createAddressLoader(pool, { eventStore }), [pool, eventStore])
  const authorParam = searchParams.get('author') || undefined

  // Use EventStore to get the initial video event
  const videoObservable = useMemo(() => {
    if (!videoIdentifier) return of(undefined)

    if (videoIdentifier.type === 'event') {
      const eventPointer = videoIdentifier.data
      return eventStore.event(eventPointer.id).pipe(
        switchMap(event => {
          if (event) {
            return of(event)
          }
          return eventLoader(eventPointer)
        }),
        catchError(() => {
          return eventLoader(eventPointer)
        }),
        map(event => event ?? undefined) // Normalize null to undefined
      )
    } else if (videoIdentifier.type === 'address') {
      const addressPointer = videoIdentifier.data
      if (!addressPointer) return of(undefined)

      return eventStore
        .replaceable(addressPointer.kind, addressPointer.pubkey, addressPointer.identifier)
        .pipe(
          switchMap(event => {
            if (event) {
              return of(event)
            }
            return addressLoader(addressPointer)
          }),
          catchError(() => {
            return addressLoader(addressPointer)
          }),
          map(event => event ?? undefined) // Normalize null to undefined
        )
    }

    return of(undefined)
  }, [eventStore, eventLoader, addressLoader, videoIdentifier])

  const initialVideoEvent = useObservableState(videoObservable)

  // Process the initial video
  const initialVideo = useMemo(() => {
    if (!nevent || !initialVideoEvent) return null
    return processEvent(initialVideoEvent, [], config.blossomServers)
  }, [nevent, initialVideoEvent, config.blossomServers])

  // Track whether we've loaded from store or relays
  const loadSourceRef = useRef<'store' | 'relays' | null>(null)

  // Load suggestions (shorts only) and subscribe to timeline
  useEffect(() => {
    if (!initialVideo) return

    if (authorParam) {
      loadSourceRef.current = 'store'

      if (allVideos.length === 0) {
        setVideos([initialVideo], 0)
      }
      return
    }

    // Check if store already has videos (from navigation via VideoCard click)
    if (allVideos.length > 0 && loadSourceRef.current === null) {
      // Store already populated, don't load from relays
      loadSourceRef.current = 'store'
      return
    }

    // If we already loaded from store, don't reload from relays
    if (loadSourceRef.current === 'store') {
      return
    }

    // Otherwise, load from relays (original behavior)
    loadSourceRef.current = 'relays'
    setLoading(true)

    const filters = {
      kinds: getKindsForType('shorts'),
      limit: 50,
    }

    // Load shorts from relays
    const suggestionsLoader = createTimelineLoader(pool, readRelays, filters, {
      eventStore,
      limit: 50,
    })

    const subscription = suggestionsLoader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      complete: () => {
        // Mark loading as complete after initial load finishes
        setLoading(false)
      },
      error: err => {
        console.error('Error loading suggestions:', err)
        setLoading(false)
      },
    })

    // Subscribe to shorts timeline for reactive updates
    const shortsObservable = eventStore.timeline([filters])
    const shortsSub = shortsObservable
      .pipe(
        map(events => {
          return processEvents(events, readRelays, blockedPubkeys, config.blossomServers).filter(
            v => v.type === 'shorts'
          )
        })
      )
      .subscribe(videos => {
        // Combine initial video with suggestions
        const all = initialVideo ? [initialVideo, ...videos] : videos
        // Deduplicate by ID
        const seen = new Set<string>()
        const unique = all.filter(v => {
          if (seen.has(v.id)) return false
          seen.add(v.id)
          return true
        })
        setVideos(unique, 0)
        // If we have at least the initial video, we can stop showing loading state
        if (unique.length > 0) {
          setLoading(false)
        }
      })

    return () => {
      subscription.unsubscribe()
      shortsSub.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideo, authorParam, allVideos.length])

  // Track if we've done the initial scroll
  const hasScrolledRef = useRef(false)
  const pendingUrlUpdateRef = useRef<string | null>(null)

  // Find initial video index and scroll to it
  useEffect(() => {
    if (!containerRef.current || allVideos.length === 0 || hasScrolledRef.current) return

    // Use currentIndex from store if available (set by VideoCard click)
    if (currentVideoIndex > 0) {
      containerRef.current.scrollTo({
        top: currentVideoIndex * window.innerHeight,
        behavior: 'instant',
      })
      hasScrolledRef.current = true
      return
    }

    // Fallback: find video by ID (for direct URL access)
    if (initialVideo) {
      const index = allVideos.findIndex(v => v.id === initialVideo.id)
      if (index !== -1 && index !== 0) {
        containerRef.current.scrollTo({
          top: index * window.innerHeight,
          behavior: 'instant',
        })
        hasScrolledRef.current = true
      }
    }
  }, [allVideos.length, currentVideoIndex, initialVideo])

  // Reset flags when the component unmounts
  useEffect(() => {
    return () => {
      hasScrolledRef.current = false
      loadSourceRef.current = null
    }
  }, [])

  // Only reset scroll flags when navigation comes from outside this page
  useEffect(() => {
    if (!nevent) return
    if (pendingUrlUpdateRef.current === nevent) {
      pendingUrlUpdateRef.current = null
      return
    }
    hasScrolledRef.current = false
    loadSourceRef.current = null
  }, [nevent])

  const scrollToVideo = useCallback(
    (index: number) => {
      if (index < 0) {
        navigate('/shorts')
        return
      }
      if (index >= allVideos.length) return

      currentVideoIndexRef.current = index
      setCurrentIndex(index)

      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: index * window.innerHeight,
          behavior: 'smooth',
        })
      }
    },
    [allVideos.length, navigate]
  )

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        scrollToVideo(currentVideoIndex + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        scrollToVideo(currentVideoIndex - 1)
      } else if (e.key === 'Escape') {
        navigate('/shorts')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentVideoIndex, navigate, scrollToVideo])

  // Fullscreen mode - hide main layout elements
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const currentVideo = allVideos[currentVideoIndex]
  const isLoadingInitialEvent = !initialVideo && initialVideoEvent === undefined

  useEffect(() => {
    if (currentVideo?.title) {
      document.title = `${currentVideo.title} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [currentVideo?.title])

  // Update URL when video changes (but not during programmatic updates)
  useEffect(() => {
    if (currentVideo && currentVideo.link !== nevent) {
      const newPath = `/short/${currentVideo.link}`

      pendingUrlUpdateRef.current = currentVideo.link
      navigate(newPath, { replace: true })
    }
  }, [currentVideo, nevent, navigate, currentVideoIndex])

  // Show loading state while fetching initial event OR while loading videos from relays
  if (isLoadingInitialEvent || (isLoadingVideos && allVideos.length === 0)) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <Skeleton className="w-full h-full max-w-md aspect-9/16" />
        <div className="text-white/70 text-sm">Looking for videos...</div>
      </div>
    )
  }

  // Only show "not found" after loading is complete and we have no videos
  if (!isLoadingVideos && !currentVideo && allVideos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-xl mb-2">Video not found</div>
          <div className="text-white/70 text-sm">
            The video may have been deleted or is unavailable
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <Header transparent />
      </div>
      <div
        ref={containerRef}
        className="fixed inset-0 bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {allVideos.map((video, index) => {
          // Preload current video, previous video, and next 2 videos for smoother scrolling
          const shouldPreload =
            index === currentVideoIndex || // Current
            index === currentVideoIndex - 1 || // Previous
            index === currentVideoIndex + 1 || // Next
            index === currentVideoIndex + 2 // Next + 1
          return (
            <ShortVideoItem
              key={video.id}
              video={video}
              isActive={index === currentVideoIndex}
              shouldPreload={shouldPreload}
              registerIntersectionRef={registerVideoElement(video.id, index)}
            />
          )
        })}
        {allVideos.length === 0 && initialVideo && (
          <ShortVideoItem
            key={initialVideo.id}
            video={initialVideo}
            isActive={true}
            shouldPreload={true}
            registerIntersectionRef={registerVideoElement(initialVideo.id, 0)}
          />
        )}
      </div>
    </>
  )
}
