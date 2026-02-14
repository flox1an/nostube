import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import { type VideoType } from '@/contexts/AppContext'
import { type VideoEvent } from '@/utils/video-event'
import { useEventStore } from 'applesauce-react/hooks'
import { useReportedPubkeys, useAppContext } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { getKindsForType } from '@/lib/video-types'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { cacheRequest } from '@/nostr/core'
import { processEvents } from '@/utils/video-event'
import { finalize, map } from 'rxjs'
import { hashObjectBigInt } from '@/lib/utils'
import { type Filter } from 'nostr-tools'
import { lastLoadedTimestamp } from '@/lib/video-timeline-cache'

interface TimelineState {
  videos: VideoEvent[]
  videosLoading: boolean
  hasMore: boolean
}

interface VideoTimelineContextType {
  videos: VideoEvent[]
  videosLoading: boolean
  hasMore: boolean
  loadTimeline: (type: VideoType, authors?: string[]) => void
}

const VideoTimelineContext = createContext<VideoTimelineContextType | undefined>(undefined)

export function VideoTimelineProvider({ children }: { children: React.ReactNode }) {
  const blockedPubkeys = useReportedPubkeys()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const { presetContent } = useSelectedPreset()

  // Single timeline state
  const [timelineState, setTimelineState] = useState<TimelineState>({
    videos: [],
    videosLoading: false,
    hasMore: true,
  })

  // Store subscription references for cleanup
  const videosSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const loaderSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      videosSubscriptionRef.current?.unsubscribe()
      loaderSubscriptionRef.current?.unsubscribe()
    }
  }, [])

  // Function to load timeline - sets parameters for the hook to process
  const loadTimeline = useCallback(
    (type: VideoType, authors?: string[]) => {
      // Cleanup previous subscriptions
      videosSubscriptionRef.current?.unsubscribe()
      loaderSubscriptionRef.current?.unsubscribe()

      // Reset state when loading new timeline
      setTimelineState({
        videos: [],
        videosLoading: true,
        hasMore: true,
      })

      // Create filters
      const filter: Filter = authors
        ? { kinds: getKindsForType(type), authors, limit: 50 }
        : { kinds: getKindsForType(type), limit: 50 }

      // Create hash for caching
      const hash = hashObjectBigInt(filter)

      // Create read relays
      const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

      // Create videos observable
      const videos$ = eventStore
        .timeline(filter)
        .pipe(
          map(events =>
            processEvents(
              events,
              readRelays,
              blockedPubkeys,
              config.blossomServers,
              undefined,
              presetContent.nsfwPubkeys
            )
          )
        )

      // Subscribe to videos observable with cleanup tracking
      videosSubscriptionRef.current = videos$.subscribe(events => {
        setTimelineState(prev => ({
          ...prev,
          videos: events,
          videosLoading: false,
        }))
      })

      // Load from relays if needed
      const lastLoaded = lastLoadedTimestamp.get(hash)

      // Reload only if never loaded or if last load was more than 60s ago
      if (lastLoaded === undefined || Date.now() - lastLoaded > 60000) {
        setTimelineState(prev => ({ ...prev, videosLoading: true }))
        loaderSubscriptionRef.current = createTimelineLoader(pool, readRelays, filter, {
          limit: 50,
          eventStore,
          cache: cacheRequest, // Load from IndexedDB cache first
        })()
          .pipe(
            finalize(() => {
              lastLoadedTimestamp.set(hash, Date.now())
              setTimelineState(prev => ({ ...prev, videosLoading: false }))
            })
          )
          .subscribe(e => {
            eventStore.add(e)
          })
      }
    },
    [
      blockedPubkeys,
      eventStore,
      config.relays,
      config.blossomServers,
      pool,
      presetContent.nsfwPubkeys,
    ]
  )

  const contextValue = useMemo(
    () => ({
      videos: timelineState.videos,
      videosLoading: timelineState.videosLoading,
      hasMore: timelineState.hasMore,
      loadTimeline,
    }),
    [timelineState, loadTimeline]
  )

  return (
    <VideoTimelineContext.Provider value={contextValue}>{children}</VideoTimelineContext.Provider>
  )
}

export function useVideoTimelineContext() {
  const context = useContext(VideoTimelineContext)
  if (context === undefined) {
    throw new Error('useVideoTimelineContext must be used within a VideoTimelineProvider')
  }

  return context
}
