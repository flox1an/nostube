/**
 * Shorts Video Page
 *
 * Main page for viewing short-form videos with scroll-based navigation.
 * Uses intersection observer for active video detection and keyboard navigation.
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { of } from 'rxjs'
import { switchMap, catchError, map } from 'rxjs/operators'
import { useEffect, useMemo, useRef, useCallback, startTransition } from 'react'
import { processEvent, processEvents } from '@/utils/video-event'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppContext, useReportedPubkeys, useReadRelays, useVideoHistory } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import {
  createEventLoader,
  createAddressLoader,
  createTimelineLoader,
} from 'applesauce-loaders/loaders'
import { getKindsForType } from '@/lib/video-types'
import { Header } from '@/components/Header'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { ShortVideoItem } from './ShortVideoItem'

export function ShortsVideoPage() {
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { nevent } = useParams<{ nevent: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const containerRef = useRef<HTMLDivElement>(null)
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

  const currentVideoIndexRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const observerCallbackThrottleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const videoElementsRef = useRef(new Map<string, HTMLDivElement>())
  const videoIdsKey = useMemo(() => allVideos.map(video => video.id).join('|'), [allVideos])
  const lastTouchEndTimeRef = useRef(0)

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
        // Throttle callback to reduce computation frequency during scroll
        // Increased from 16ms to 100ms since video changes don't need 60fps updates
        if (observerCallbackThrottleRef.current) return

        observerCallbackThrottleRef.current = setTimeout(() => {
          observerCallbackThrottleRef.current = undefined

          // Find the best visible entry (highest intersection ratio)
          let bestEntry: IntersectionObserverEntry | null = null
          let bestRatio = 0

          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
              bestEntry = entry
              bestRatio = entry.intersectionRatio
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
        }, 100) // 100ms throttle for smoother scroll performance
      },
      {
        // Single threshold at 50% visibility for cleaner transitions
        threshold: 0.5,
        // Reduced rootMargin for less aggressive observation
        rootMargin: '100px',
      }
    )

    observerRef.current = observer
    videoElementsRef.current.forEach(element => observer.observe(element))

    return () => {
      if (observerCallbackThrottleRef.current) {
        clearTimeout(observerCallbackThrottleRef.current)
      }
      observer.disconnect()
      observerRef.current = null
    }
  }, [setCurrentIndex, videoIdsKey])

  // iOS autoplay fix: trigger play during user gesture (touchend/scroll)
  // This ensures play() is called within the user gesture context, which iOS requires
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const playActiveVideoOnGesture = () => {
      // Throttle to avoid too many play attempts
      const now = Date.now()
      if (now - lastTouchEndTimeRef.current < 100) return
      lastTouchEndTimeRef.current = now

      // Find the video element at the current index
      const currentVideo = allVideos[currentVideoIndexRef.current]
      if (!currentVideo) return

      const videoContainer = videoElementsRef.current.get(currentVideo.id)
      if (!videoContainer) return

      const videoElement = videoContainer.querySelector('video')
      if (!videoElement) return

      // Play within gesture context - iOS will allow this
      if (videoElement.paused) {
        // Start muted for iOS autoplay compliance
        videoElement.muted = true
        const playPromise = videoElement.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Unmute after playback starts
              videoElement.muted = false
            })
            .catch(error => {
              console.error('Error playing video during gesture:', error)
            })
        }
      }
    }

    // Listen for touchend (swipe gesture completion on mobile)
    container.addEventListener('touchend', playActiveVideoOnGesture)
    // Also listen for scroll events (for mouse wheel or programmatic scrolls)
    container.addEventListener('scrollend', playActiveVideoOnGesture)

    return () => {
      container.removeEventListener('touchend', playActiveVideoOnGesture)
      container.removeEventListener('scrollend', playActiveVideoOnGesture)
    }
  }, [allVideos, videoIdsKey])

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

  const initialVideoEvent = use$(() => videoObservable, [videoObservable])

  // Process the initial video
  const initialVideo = useMemo(() => {
    if (!nevent || !initialVideoEvent) return null
    return processEvent(initialVideoEvent, [], config.blossomServers, presetContent.nsfwPubkeys)
  }, [nevent, initialVideoEvent, config.blossomServers, presetContent.nsfwPubkeys])

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
          return processEvents(
            events,
            readRelays,
            blockedPubkeys,
            config.blossomServers,
            undefined,
            presetContent.nsfwPubkeys
          ).filter(v => v.type === 'shorts')
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
    [allVideos.length, navigate, setCurrentIndex]
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

  // Determine render window size based on viewport width (smaller on mobile)
  const renderWindow = useMemo(() => {
    if (typeof window === 'undefined') return 3
    return window.innerWidth < 768 ? 2 : 3
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
  // Uses startTransition to avoid blocking scroll interactions
  const urlUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (currentVideo && currentVideo.link !== nevent) {
      // Clear any pending URL update
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
      }

      // Debounce URL updates to avoid excessive history API calls during fast scrolling
      urlUpdateTimeoutRef.current = setTimeout(() => {
        const newPath = `/short/${currentVideo.link}`
        pendingUrlUpdateRef.current = currentVideo.link
        // Use startTransition to make this non-blocking for scroll
        startTransition(() => {
          navigate(newPath, { replace: true })
        })
      }, 150) // 150ms debounce
    }

    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
      }
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
      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Header transparent />
      </div>
      <div
        ref={containerRef}
        className="fixed top-0 left-0 right-0 bottom-0 bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(56px + env(safe-area-inset-top, 0))',
          // GPU acceleration hints for smoother scrolling
          willChange: 'scroll-position',
          transform: 'translateZ(0)',
        }}
      >
        {allVideos.map((video, index) => {
          // Only render videos within a window around the current video to keep DOM tidy
          // Render window: current +/- renderWindow videos
          // Mobile (< 768px): ±2 videos (5 total), Desktop: ±3 videos (7 total)
          const distanceFromCurrent = Math.abs(index - currentVideoIndex)
          const shouldRender = distanceFromCurrent <= renderWindow

          if (!shouldRender) {
            // Render placeholder to maintain scroll positioning for far videos
            return (
              <div
                key={video.id}
                data-video-id={video.id}
                data-index={index.toString()}
                className="snap-center min-h-screen h-screen w-full flex items-center justify-center bg-black"
                style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
                ref={registerVideoElement(video.id, index)}
              />
            )
          }

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
