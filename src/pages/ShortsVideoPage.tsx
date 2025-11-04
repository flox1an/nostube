import { useParams, useNavigate, Link } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { of, map } from 'rxjs'
import { switchMap, catchError } from 'rxjs/operators'
import { ButtonWithReactions } from '@/components/ButtonWithReactions'
import { FollowButton } from '@/components/FollowButton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDistance } from 'date-fns'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { processEvent, type VideoEvent, processEvents } from '@/utils/video-event'
import { decodeEventPointer } from '@/lib/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppContext, useProfile, useReportedPubkeys } from '@/hooks'
import { createEventLoader, createTimelineLoader } from 'applesauce-loaders/loaders'
import { ImageIcon, MessageCircle, ChevronDown, Share2 } from 'lucide-react'
import { imageProxy, imageProxyVideoPreview } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getKindsForType } from '@/lib/video-types'
import { nprofileFromEvent } from '@/lib/nprofile'
import { useValidUrl } from '@/hooks/useValidUrl'
import { UserBlossomServersModel } from 'applesauce-core/models'
import { useEventModel } from 'applesauce-react/hooks'

function ShortVideoItem({
  video,
  isActive,
  shouldPreload,
}: {
  video: VideoEvent
  isActive: boolean
  shouldPreload: boolean
}) {
  const metadata = useProfile({ pubkey: video.pubkey })
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''
  const authorPicture = metadata?.picture
  const videoRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const eventStore = useEventStore()
  const { config } = useAppContext()

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

  // Validate video URLs with Blossom server fallbacks
  const { validUrl: videoUrl } = useValidUrl({
    urls: video.urls,
    blossomServers: allBlossomServers,
    resourceType: 'video',
    sha256: video.x, // Pass SHA256 hash for URL discovery
    enabled: shouldPreload || isActive,
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

  // Auto-play/pause based on isActive
  useEffect(() => {
    const videoEl = videoElementRef.current
    if (!videoEl) return

    if (isActive) {
      // Reset to beginning and play immediately
      videoEl.currentTime = 0
      videoEl.muted = false

      const playPromise = videoEl.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Error playing video:', video.id.substring(0, 8), error)
        })
      }
    } else {
      // Pause and mute inactive videos
      videoEl.pause()
      videoEl.muted = true
    }
  }, [isActive, video.id])

  // Handle video ready to play
  const handleCanPlay = useCallback(() => {
    // Video is ready, can start playing
  }, [])

  // Handle video error
  const handleVideoError = useCallback(() => {
    console.error('Error loading video:', videoUrl)
  }, [videoUrl])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = `${baseUrl}/short/${video.link}`

  return (
    <div
      ref={videoRef}
      className="snap-center min-h-screen h-screen w-full flex items-center justify-center bg-black"
      style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
    >
      <div className="relative w-full h-screen flex flex-col items-center justify-center">
        {/* Video player - fullscreen vertical */}
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <div className="relative w-full h-full" style={{ maxWidth: 'calc(100vh * 9 / 16)' }}>
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
              <video
                ref={videoElementRef}
                src={videoUrl || undefined}
                className="w-full h-full object-contain rounded-lg"
                loop
                muted={false}
                playsInline
                poster={thumbnailUrl ? imageProxyVideoPreview(thumbnailUrl) : undefined}
                preload={shouldPreload || isActive ? 'auto' : 'metadata'}
                onCanPlay={handleCanPlay}
                onError={handleVideoError}
                style={{ opacity: isActive ? 1 : 0.5 }}
              />
              {/* Show thumbnail overlay when not active for better visibility */}
              {!isActive && thumbnailUrl && (
                <div className="absolute inset-0 rounded-lg overflow-hidden bg-black">
                  <img
                    src={imageProxyVideoPreview(thumbnailUrl)}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar with interactions */}
        <div className="absolute right-4 bottom-24 flex flex-col items-center gap-4 z-10">
          {/* Profile picture */}
          <Link to={`/author/${authorNprofile}`}>
            <Avatar className="h-12 w-12 border-2 border-white cursor-pointer hover:scale-110 transition-transform">
              <AvatarImage src={imageProxy(authorPicture)} alt={authorName} />
              <AvatarFallback>
                {authorPicture ? <ImageIcon className="h-6 w-6" /> : authorName?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </Link>

          {/* Like button */}
          <div className="flex flex-col items-center gap-1">
            <ButtonWithReactions
              eventId={video.id}
              kind={video.kind}
              authorPubkey={video.pubkey}
              className="bg-black/50 hover:bg-black/70 text-white border-white/20"
            />
          </div>

          {/* Comments button */}
          <div className="flex flex-col items-center gap-1">
            <button className="bg-black/50 hover:bg-black/70 rounded-full p-3 border border-white/20 transition-colors">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="w-full" style={{ maxWidth: 'calc(100vh * 9 / 16)' }}>
            {/* Author info */}
            <div className="flex items-center gap-3 mb-3">
              <Link to={`/author/${authorNprofile}`}>
                <Avatar className="h-10 w-10 border-2 border-white">
                  <AvatarImage src={imageProxy(authorPicture)} alt={authorName} />
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
              <FollowButton pubkey={video.pubkey} className="text-white" />
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
    </div>
  )
}

export function ShortsVideoPage() {
  const { config } = useAppContext()
  const { nevent } = useParams<{ nevent: string }>()
  const navigate = useNavigate()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const blockedPubkeys = useReportedPubkeys()
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const currentVideoIndexRef = useRef(0)
  const isUpdatingIndexRef = useRef(false)
  const [allVideos, setAllVideos] = useState<VideoEvent[]>([])

  const readRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  const eventPointer = useMemo(() => {
    if (!nevent) return null
    return decodeEventPointer(nevent)
  }, [nevent])

  // Get relays from nevent if available, otherwise use config relays
  // Currently not used but kept for potential future use with relay hints
  // const relaysToUse = useMemo(() => {
  //   const neventRelays = eventPointer?.relays || []
  //   return combineRelays([neventRelays, readRelays])
  // }, [eventPointer, readRelays])

  const loader = useMemo(() => createEventLoader(pool, { eventStore }), [pool, eventStore])

  // Use EventStore to get the initial video event
  const videoObservable = useMemo(() => {
    if (!eventPointer) return of(null)
    return eventStore.event(eventPointer.id).pipe(
      switchMap(event => {
        if (event) {
          return of(event)
        }
        return loader(eventPointer)
      }),
      catchError(() => {
        return loader(eventPointer)
      })
    )
  }, [eventStore, loader, eventPointer])

  const initialVideoEvent = useObservableState(videoObservable)

  // Process the initial video
  const initialVideo = useMemo(() => {
    if (!nevent || !initialVideoEvent) return null
    return processEvent(initialVideoEvent, [], config.blossomServers)
  }, [nevent, initialVideoEvent, config.blossomServers])

  // Load suggestions (shorts only) and subscribe to timeline
  useEffect(() => {
    if (!initialVideo) return

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
        // Complete loading
      },
      error: err => {
        console.error('Error loading suggestions:', err)
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
        setAllVideos(unique)
      })

    return () => {
      subscription.unsubscribe()
      shortsSub.unsubscribe()
    }
  }, [initialVideo, pool, readRelays, eventStore, blockedPubkeys, config.blossomServers])

  // Find initial video index and scroll to it
  useEffect(() => {
    if (initialVideo && allVideos.length > 0 && containerRef.current) {
      const index = allVideos.findIndex(v => v.id === initialVideo.id)
      if (index !== -1 && index !== 0) {
        // Scroll to the initial video immediately - this will trigger scroll handler to update state
        containerRef.current.scrollTo({
          top: index * window.innerHeight,
          behavior: 'instant',
        })
      }
    }
    // Only run once when videos are loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideo, allVideos.length])

  const scrollToVideo = useCallback(
    (index: number) => {
      if (index < 0) {
        navigate('/shorts')
        return
      }
      if (index >= allVideos.length) return

      isUpdatingIndexRef.current = true
      currentVideoIndexRef.current = index
      setCurrentVideoIndex(index)

      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: index * window.innerHeight,
          behavior: 'smooth',
        })
      }

      // Reset flag after scroll completes
      setTimeout(() => {
        isUpdatingIndexRef.current = false
      }, 500)
    },
    [allVideos.length, navigate]
  )

  // Handle scroll to update current index - detect which video we've snapped to
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let scrollTimeout: NodeJS.Timeout
    let lastScrollTop = container.scrollTop

    const handleScroll = () => {
      // Don't process scroll events if we're programmatically updating
      if (isUpdatingIndexRef.current) {
        return
      }

      clearTimeout(scrollTimeout)
      const currentScrollTop = container.scrollTop
      lastScrollTop = currentScrollTop

      // Shorter timeout since snap-mandatory will stop scroll quickly
      scrollTimeout = setTimeout(() => {
        const scrollTop = container.scrollTop

        // With snap-mandatory, scroll should stop very quickly
        // Use a smaller threshold (5px) since snap is precise
        if (Math.abs(scrollTop - lastScrollTop) < 5) {
          const scrollIndex = Math.round(scrollTop / window.innerHeight)

          if (scrollIndex >= 0 && scrollIndex < allVideos.length) {
            // Only update if index has actually changed
            if (scrollIndex !== currentVideoIndexRef.current) {
              isUpdatingIndexRef.current = true
              currentVideoIndexRef.current = scrollIndex
              setCurrentVideoIndex(scrollIndex)

              // Reset flag after a short delay
              setTimeout(() => {
                isUpdatingIndexRef.current = false
              }, 100)
            }
          }
        }
      }, 150)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [allVideos.length])

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
  const isLoading = !initialVideo && initialVideoEvent === undefined

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
    if (currentVideo && currentVideo.link !== nevent && !isUpdatingIndexRef.current) {
      navigate(`/short/${currentVideo.link}`, { replace: true })
    }
  }, [currentVideo, nevent, navigate])

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Skeleton className="w-full h-full max-w-md aspect-[9/16]" />
      </div>
    )
  }

  if (!currentVideo && allVideos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div>Video not found</div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
      style={{
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {allVideos.map((video, index) => {
        // Preload current video and adjacent videos (prev and next)
        const shouldPreload = Math.abs(index - currentVideoIndex) <= 1
        return (
          <ShortVideoItem
            key={video.id}
            video={video}
            isActive={index === currentVideoIndex}
            shouldPreload={shouldPreload}
          />
        )
      })}
      {allVideos.length === 0 && initialVideo && (
        <ShortVideoItem
          key={initialVideo.id}
          video={initialVideo}
          isActive={true}
          shouldPreload={true}
        />
      )}
    </div>
  )
}
