/**
 * Shorts Video Page
 *
 * Main page for viewing short-form videos with controlled vertical navigation.
 * Playback is handled by one persistent <video> element whose src changes as the
 * active short changes, preserving browser media state across videos.
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { of } from 'rxjs'
import { switchMap, catchError, map } from 'rxjs/operators'
import { useEffect, useMemo, useRef, useCallback, startTransition, useState } from 'react'
import { processEvent, processEvents } from '@/utils/video-event'
import { buildVideoPath } from '@/utils/video-utils'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppContext,
  useReportedPubkeys,
  useReadRelays,
  useVideoHistory,
  useVideoViewTracking,
  useIsPortrait,
} from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import {
  createEventLoader,
  createAddressLoader,
  createTimelineLoader,
} from 'applesauce-loaders/loaders'
import { getKindsForType } from '@/lib/video-types'
import { Header } from '@/components/Header'
import { PlayPauseOverlay } from '@/components/PlayPauseOverlay'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useVideoPrefetch } from '@/hooks/useVideoPrefetch'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { ShortVideoItem } from './ShortVideoItem'
import { ShortVideoOverlay } from './ShortVideoOverlay'

type DeckPhase = 'idle' | 'settling'

interface DragState {
  pointerId: number
  startY: number
  currentY: number
  startedAt: number
}

const SWIPE_DISTANCE_THRESHOLD_PX = 80
const SWIPE_VELOCITY_THRESHOLD_PX_PER_MS = 0.45
const SETTLE_TRANSITION_MS = 260
const WHEEL_NAVIGATION_COOLDOWN_MS = 420

export function ShortsVideoPage() {
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { nevent } = useParams<{ nevent: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const { addToHistory } = useVideoHistory()

  // Use zustand store for videos and current index
  const {
    videos: allVideos,
    currentIndex: currentVideoIndex,
    isLoading: isLoadingVideos,
    setVideos,
    setCurrentIndex,
    setLoading,
  } = useShortsFeedStore()

  const singletonVideoRef = useRef<HTMLVideoElement | null>(null)
  const [activeVideoElement, setActiveVideoElement] = useState<HTMLVideoElement | null>(null)
  const userInitiatedPlayPauseRef = useRef(false)
  const userMutedPreferenceRef = useRef<boolean | null>(null)
  const userPausedRef = useRef(false)
  const initializedVideoElementRef = useRef(false)
  const sourceSwitchIdRef = useRef(0)
  const dragStateRef = useRef<DragState | null>(null)
  const wheelCooldownTimeoutRef = useRef<number | undefined>(undefined)
  const [deckOffsetY, setDeckOffsetY] = useState(0)
  const [deckPhase, setDeckPhase] = useState<DeckPhase>('idle')
  const [settlingTargetIndex, setSettlingTargetIndex] = useState<number | null>(null)
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null)
  const [isVideoReady, setIsVideoReady] = useState(false)

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

  const initialVideoEvent = use$(() => videoObservable, [videoObservable])

  // Process the initial video
  const initialVideo = useMemo(() => {
    if (!nevent || !initialVideoEvent) return null
    const hintRelays = videoIdentifier?.data?.relays ?? []
    return processEvent(
      initialVideoEvent,
      hintRelays,
      config.blossomServers,
      presetContent.nsfwPubkeys
    )
  }, [nevent, initialVideoEvent, videoIdentifier, config.blossomServers, presetContent.nsfwPubkeys])

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
          return processEvents(events, readRelays, {
            blockPubkeys: blockedPubkeys,
            blossomServers: config.blossomServers,
            nsfwPubkeys: presetContent.nsfwPubkeys,
            reportedEventIds: config.reportedEventIds,
            includeYouTube: config.showYouTubeContent ?? true,
            includeAudio: config.showAudioContent ?? true,
          }).filter(v => v.type === 'shorts')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally limited deps: adding full relay/filter/processing deps would cause unwanted resubscriptions on every render
  }, [
    initialVideo,
    authorParam,
    allVideos.length,
    config.showYouTubeContent,
    config.showAudioContent,
  ])

  // Track if we've selected the direct-link video from an existing feed
  const hasSelectedInitialVideoRef = useRef(false)
  const pendingUrlUpdateRef = useRef<string | null>(null)

  useEffect(() => {
    if (allVideos.length === 0 || hasSelectedInitialVideoRef.current || currentVideoIndex > 0)
      return

    if (initialVideo) {
      const index = allVideos.findIndex(v => v.id === initialVideo.id)
      if (index > 0) {
        setCurrentIndex(index)
      }
    }
    hasSelectedInitialVideoRef.current = true
  }, [allVideos, currentVideoIndex, initialVideo, setCurrentIndex])

  // Reset flags when the component unmounts
  useEffect(() => {
    return () => {
      hasSelectedInitialVideoRef.current = false
      loadSourceRef.current = null
      if (wheelCooldownTimeoutRef.current !== undefined) {
        window.clearTimeout(wheelCooldownTimeoutRef.current)
      }
    }
  }, [])

  // Track video in history when loaded (using ref to avoid dependency on addToHistory)
  const addToHistoryRef = useRef(addToHistory)
  useEffect(() => {
    addToHistoryRef.current = addToHistory
  })
  useEffect(() => {
    if (initialVideoEvent) {
      addToHistoryRef.current(initialVideoEvent)
    }
  }, [initialVideoEvent])

  // Only reset data-load flags when navigation comes from outside this page
  useEffect(() => {
    if (!nevent) return
    if (pendingUrlUpdateRef.current === nevent) {
      pendingUrlUpdateRef.current = null
      return
    }
    hasSelectedInitialVideoRef.current = false
    loadSourceRef.current = null
  }, [nevent])

  const currentVideo = allVideos[currentVideoIndex]
  const isLoadingInitialEvent = !initialVideo && initialVideoEvent === undefined

  const handleVideoUrlError = useCallback((error: Error) => {
    console.error('Video URL failover error:', error)
  }, [])

  // Memoize proxyConfig to prevent infinite loops
  const proxyConfig = useMemo(
    () => ({
      enabled: true,
    }),
    []
  )

  const {
    currentUrl: videoUrl,
    moveToNext: moveToNextVideo,
    hasMore: hasMoreVideoUrls,
  } = useMediaUrls({
    urls: currentVideo?.urls ?? [],
    mediaType: 'video',
    sha256: currentVideo?.x,
    kind: currentVideo?.kind,
    authorPubkey: currentVideo?.pubkey,
    proxyConfig,
    enabled: !!currentVideo,
    onError: handleVideoUrlError,
  })

  // Preload neighbor videos (Tier 1): resolve their URLs now through the same
  // pipeline and warm the HTTP cache so the singleton can play them
  // near-instantly on swipe. sha256-keyed discovery is cached, so this also
  // primes the resolution the singleton will reuse when the neighbor activates.
  const nextVideo = allVideos[currentVideoIndex + 1] ?? null
  const previousVideo = allVideos[currentVideoIndex - 1] ?? null
  useVideoPrefetch({ video: nextVideo, enabled: !!nextVideo })
  useVideoPrefetch({ video: previousVideo, enabled: !!previousVideo })

  useVideoViewTracking({
    video: currentVideo,
    mediaElement: activeVideoElement,
    active: !!currentVideo && !!activeVideoElement,
    source: 'shorts',
  })

  const currentAspectRatio = useMemo(() => {
    if (!currentVideo?.dimensions) return naturalAspectRatio

    const match = /^(\d+)x(\d+)$/i.exec(currentVideo.dimensions.trim())
    if (!match) return naturalAspectRatio

    const width = Number(match[1])
    const height = Number(match[2])
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return naturalAspectRatio
    }

    return width / height
  }, [currentVideo?.dimensions, naturalAspectRatio])

  const videoMaxWidth = useMemo(() => {
    if (!currentAspectRatio) return 'calc(100vh * 9 / 16)'

    if (currentAspectRatio >= 0.9 && currentAspectRatio <= 1.1) {
      return '85vh'
    }

    if (currentAspectRatio > 1.1) {
      return '95vh'
    }

    return 'calc(100vh * 9 / 16)'
  }, [currentAspectRatio])

  // Overscan (object-cover, no maxWidth) only when the video is portrait AND the device
  // viewport is also portrait — phones held upright. Desktop and landscape phones letterbox.
  const isPortraitViewport = useIsPortrait()
  const isPortraitVideo = currentAspectRatio !== null && currentAspectRatio < 1.0
  const useOverscan = isPortraitVideo && isPortraitViewport

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    singletonVideoRef.current = node
    setActiveVideoElement(node)

    if (!node || initializedVideoElementRef.current) return

    node.muted = true
    userMutedPreferenceRef.current = true
    initializedVideoElementRef.current = true
  }, [])

  useEffect(() => {
    const videoElement = singletonVideoRef.current
    if (!videoElement || !currentVideo || !videoUrl) return

    const playCurrentSource = () => {
      if (userPausedRef.current) return

      const playPromise = videoElement.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error(
            'Error playing singleton short video:',
            currentVideo.id.substring(0, 8),
            error
          )
        })
      }
    }

    const sourceChanged =
      videoElement.dataset.videoId !== currentVideo.id || videoElement.src !== videoUrl
    if (!sourceChanged) {
      playCurrentSource()
      return
    }

    const switchId = sourceSwitchIdRef.current + 1
    sourceSwitchIdRef.current = switchId
    setIsVideoReady(false)

    const mutedPreference = userMutedPreferenceRef.current ?? videoElement.muted
    videoElement.pause()
    videoElement.removeAttribute('src')
    videoElement.dataset.videoId = ''
    videoElement.load()

    window.requestAnimationFrame(() => {
      if (sourceSwitchIdRef.current !== switchId) return

      videoElement.dataset.videoId = currentVideo.id
      videoElement.src = videoUrl
      videoElement.currentTime = 0
      videoElement.muted = mutedPreference
      videoElement.load()
      userPausedRef.current = false
      playCurrentSource()
    })
  }, [currentVideo, videoUrl])

  const handleVideoError = useCallback(() => {
    if (hasMoreVideoUrls) {
      moveToNextVideo()
    } else if (currentVideo) {
      console.error('All video URLs failed for:', currentVideo.id)
    }
  }, [currentVideo, hasMoreVideoUrls, moveToNextVideo])

  const handleVideoLoadedMetadata = useCallback(() => {
    const videoElement = singletonVideoRef.current
    if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) return

    setNaturalAspectRatio(videoElement.videoWidth / videoElement.videoHeight)
  }, [])

  const handleVideoLoadedData = useCallback(() => {
    const videoElement = singletonVideoRef.current
    if (!videoElement || !currentVideo || videoElement.dataset.videoId !== currentVideo.id) return

    const switchId = sourceSwitchIdRef.current
    const revealVideo = () => {
      if (sourceSwitchIdRef.current !== switchId) return
      if (videoElement.dataset.videoId !== currentVideo.id) return
      setIsVideoReady(true)
    }

    if (typeof videoElement.requestVideoFrameCallback === 'function') {
      const fallbackTimeout = window.setTimeout(revealVideo, 120)
      videoElement.requestVideoFrameCallback(() => {
        window.clearTimeout(fallbackTimeout)
        revealVideo()
      })
    } else {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(revealVideo)
      })
    }
  }, [currentVideo])

  const handleVideoClick = useCallback(() => {
    const videoElement = singletonVideoRef.current
    if (!videoElement) return

    userInitiatedPlayPauseRef.current = true

    if (videoElement.muted) {
      videoElement.muted = false
      userMutedPreferenceRef.current = false
      userPausedRef.current = false
      const playPromise = videoElement.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Error unmuting singleton short video:', error)
        })
      }
      return
    }

    if (videoElement.paused) {
      userPausedRef.current = false
      const playPromise = videoElement.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Error playing singleton short video:', error)
        })
      }
    } else {
      userPausedRef.current = true
      videoElement.pause()
    }
  }, [])

  const finishSettling = useCallback(() => {
    if (settlingTargetIndex !== null) {
      setIsVideoReady(false)
      setCurrentIndex(settlingTargetIndex)
    }

    setSettlingTargetIndex(null)
    setDeckPhase('idle')
    setDeckOffsetY(0)
  }, [setCurrentIndex, settlingTargetIndex])

  const startSettlingToIndex = useCallback(
    (nextIndex: number) => {
      if (deckPhase !== 'idle' || nextIndex < 0 || nextIndex >= allVideos.length) return

      const direction = nextIndex > currentVideoIndex ? 1 : -1
      setSettlingTargetIndex(nextIndex)
      setDeckPhase('settling')
      setDeckOffsetY(direction > 0 ? -window.innerHeight : window.innerHeight)
    },
    [allVideos.length, currentVideoIndex, deckPhase]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (deckPhase !== 'idle') return

      const target = event.target as HTMLElement
      if (target.closest('button,a,[role="button"],input,textarea,[data-no-drag]')) return

      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        currentY: event.clientY,
        startedAt: performance.now(),
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [deckPhase]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId || deckPhase !== 'idle') return

      dragState.currentY = event.clientY
      const rawOffset = event.clientY - dragState.startY
      const isDraggingPastFirstVideo = currentVideoIndex === 0 && rawOffset > 0
      const isDraggingPastLastVideo = currentVideoIndex === allVideos.length - 1 && rawOffset < 0
      const resistance = isDraggingPastFirstVideo || isDraggingPastLastVideo ? 0.25 : 1
      setDeckOffsetY(rawOffset * resistance)
    },
    [allVideos.length, currentVideoIndex, deckPhase]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return

      dragStateRef.current = null
      const offset = dragState.currentY - dragState.startY

      const elapsed = Math.max(performance.now() - dragState.startedAt, 1)
      const velocity = Math.abs(offset) / elapsed
      const shouldCommit =
        Math.abs(offset) > SWIPE_DISTANCE_THRESHOLD_PX ||
        velocity > SWIPE_VELOCITY_THRESHOLD_PX_PER_MS

      if (shouldCommit && offset < 0 && currentVideoIndex < allVideos.length - 1) {
        setSettlingTargetIndex(currentVideoIndex + 1)
        setDeckPhase('settling')
        setDeckOffsetY(-window.innerHeight)
      } else if (shouldCommit && offset > 0 && currentVideoIndex > 0) {
        setSettlingTargetIndex(currentVideoIndex - 1)
        setDeckPhase('settling')
        setDeckOffsetY(window.innerHeight)
      } else if (Math.abs(offset) > 1) {
        setSettlingTargetIndex(null)
        setDeckPhase('settling')
        setDeckOffsetY(0)
      } else {
        setSettlingTargetIndex(null)
        setDeckPhase('idle')
        setDeckOffsetY(0)
        handleVideoClick()
      }
    },
    [allVideos.length, currentVideoIndex, handleVideoClick]
  )

  const handlePointerCancel = useCallback(() => {
    dragStateRef.current = null
    setSettlingTargetIndex(null)
    setDeckPhase('idle')
    setDeckOffsetY(0)
  }, [])

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (deckPhase !== 'idle' || wheelCooldownTimeoutRef.current !== undefined) return
      if (Math.abs(event.deltaY) < 20) return

      if (event.deltaY > 0 && currentVideoIndex < allVideos.length - 1) {
        startSettlingToIndex(currentVideoIndex + 1)
      } else if (event.deltaY < 0 && currentVideoIndex > 0) {
        startSettlingToIndex(currentVideoIndex - 1)
      }

      wheelCooldownTimeoutRef.current = window.setTimeout(() => {
        wheelCooldownTimeoutRef.current = undefined
      }, WHEEL_NAVIGATION_COOLDOWN_MS)
    },
    [allVideos.length, currentVideoIndex, deckPhase, startSettlingToIndex]
  )

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        handleVideoClick()
      } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault()
        startSettlingToIndex(currentVideoIndex + 1)
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        startSettlingToIndex(currentVideoIndex - 1)
      } else if (event.key === 'Escape') {
        navigate('/shorts')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentVideoIndex, handleVideoClick, navigate, startSettlingToIndex])

  // Fullscreen mode - hide main layout elements
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

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

  // Update URL when video changes (debounced and non-blocking)
  // Uses startTransition to avoid blocking interactions
  const urlUpdateTimeoutRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (currentVideo && currentVideo.link !== nevent) {
      // Clear any pending URL update
      if (urlUpdateTimeoutRef.current !== undefined) {
        window.clearTimeout(urlUpdateTimeoutRef.current)
      }

      // Debounce URL updates to avoid excessive history API calls during fast navigation
      urlUpdateTimeoutRef.current = window.setTimeout(() => {
        const newPath = buildVideoPath(currentVideo.link, 'shorts')
        pendingUrlUpdateRef.current = currentVideo.link
        // Use startTransition to make this non-blocking for interactions
        startTransition(() => {
          navigate(newPath, { replace: true })
        })
      }, 150)
    }

    return () => {
      if (urlUpdateTimeoutRef.current !== undefined) {
        window.clearTimeout(urlUpdateTimeoutRef.current)
      }
    }
  }, [currentVideo, nevent, navigate, currentVideoIndex])

  const visibleSlideIndexes = useMemo(() => {
    const indexes = [currentVideoIndex - 1, currentVideoIndex, currentVideoIndex + 1]
    return indexes.filter(index => index >= 0 && index < allVideos.length)
  }, [allVideos.length, currentVideoIndex])

  const videoPoster = currentVideo?.images[0]
  const videoTransition =
    deckPhase === 'settling'
      ? `transform ${SETTLE_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none'

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
      <div className="fixed top-0 left-0 right-0 z-100">
        <Header transparent />
      </div>
      <div
        className="fixed top-0 left-0 right-0 bottom-0 z-50 bg-black overflow-hidden touch-none select-none"
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0))' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
      >
        {visibleSlideIndexes.map(index => {
          const video = allVideos[index]
          const relativeIndex = index - currentVideoIndex
          const isCurrentSlide = index === currentVideoIndex

          return (
            <div
              key={video.id}
              className="absolute inset-0"
              style={{
                transform: `translate3d(0, calc(${relativeIndex * 100}vh + ${deckOffsetY}px), 0)`,
                transition: videoTransition,
                willChange: deckPhase === 'idle' ? undefined : 'transform',
              }}
              onTransitionEnd={isCurrentSlide ? finishSettling : undefined}
            >
              <ShortVideoItem video={video} isActive={isCurrentSlide} />
            </div>
          )
        })}

        {currentVideo && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            style={{
              transform: `translate3d(0, ${deckOffsetY}px, 0)`,
              transition: videoTransition,
              willChange: deckPhase === 'idle' ? undefined : 'transform',
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center bg-transparent">
              <div
                className="relative w-full h-full pointer-events-auto"
                style={useOverscan ? undefined : { maxWidth: videoMaxWidth }}
              >
                <video
                  ref={handleVideoRef}
                  className={`w-full h-full cursor-pointer ${useOverscan ? 'object-cover' : 'object-contain'} ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
                  loop
                  playsInline
                  poster={videoPoster}
                  preload="auto"
                  style={{ transition: isVideoReady ? 'opacity 100ms ease-out' : 'none' }}
                  onError={handleVideoError}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onLoadedData={handleVideoLoadedData}
                  onCanPlay={handleVideoLoadedData}
                  onPlaying={handleVideoLoadedData}
                />
                <PlayPauseOverlay
                  videoRef={singletonVideoRef}
                  userInitiatedRef={userInitiatedPlayPauseRef}
                />
              </div>
            </div>
          </div>
        )}

        {/* Interactive overlay (action icons + bottom info) for the current video.
            Rendered at z-20 — above the singleton <video> (z-10) and the slide
            thumbnail backgrounds (z-auto) — so buttons are always tappable.
            pointer-events-none on the root lets taps on transparent areas fall
            through to the <video> element for play/pause toggling. */}
        {currentVideo && (
          <div
            className="absolute inset-0 z-20"
            style={{
              transform: `translate3d(0, ${deckOffsetY}px, 0)`,
              transition: videoTransition,
              willChange: deckPhase === 'idle' ? undefined : 'transform',
            }}
          >
            <ShortVideoOverlay video={currentVideo} maxWidth={videoMaxWidth} />
          </div>
        )}
      </div>
    </>
  )
}
