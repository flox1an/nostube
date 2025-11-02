import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { VideoType } from '@/contexts/AppContext'
import { VideoEvent } from '@/utils/video-event'
import { useEventStore } from 'applesauce-react/hooks'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { useAppContext } from '@/hooks/useAppContext'
import { getKindsForType } from '@/lib/video-types'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { finalize, map } from 'rxjs'
import { hashObjectBigInt } from '@/lib/utils'
import { Filter } from 'nostr-tools'

const lastLoadedTimestamp = new Map<string, number>()
let logSeq = 0

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

  // Single timeline state
  const [timelineState, setTimelineState] = useState<TimelineState>({
    videos: [],
    videosLoading: false,
    hasMore: true,
  })

  // Function to load timeline - sets parameters for the hook to process
  const loadTimeline = useCallback(
    (type: VideoType, authors?: string[]) => {
      const seq = ++logSeq
      console.log(`[${seq}] loadTimeline called with type:`, type, 'authors:', authors)

      // Reset state when loading new timeline
      setTimelineState({
        videos: [],
        videosLoading: true,
        hasMore: true,
      })

      console.log(`[${seq}] processing timeline for type:`, type, 'authors:', authors)

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
        .pipe(map(events => processEvents(events, readRelays, blockedPubkeys, config.blossomServers)))

      // Subscribe to videos observable
      videos$.subscribe(events => {
        setTimelineState(prev => ({
          ...prev,
          videos: events,
          videosLoading: false,
        }))
      })

      // Load from relays if needed
      const lastLoaded = lastLoadedTimestamp.get(hash)
      console.log(
        `[${seq}] lastLoaded:`,
        lastLoaded,
        'time since last load:',
        lastLoaded ? Date.now() - lastLoaded : 'undefined'
      )

      // Reload only if never loaded or if last load was more than 60s ago
      if (lastLoaded === undefined || Date.now() - lastLoaded > 60000) {
        console.log(`[${seq}] loading new events from relays, hash:`, hash, 'filter:', filter)
        setTimelineState(prev => ({ ...prev, videosLoading: true }))
        createTimelineLoader(pool, readRelays, filter, { limit: 50 })()
          .pipe(
            finalize(() => {
              const finalizeSeq = ++logSeq
              console.log(
                `[${finalizeSeq}] loader finalize called, setting timestamp for hash:`,
                hash
              )
              lastLoadedTimestamp.set(hash, Date.now())
              setTimelineState(prev => ({ ...prev, videosLoading: false }))
            })
          )
          .subscribe(e => {
            // const subscribeSeq = ++logSeq;
            // console.log(`[${subscribeSeq}] loader event received:`, e.id);
            eventStore.add(e)
          })
      } else {
        console.log(`[${seq}] skipping load, last loaded was recent enough`)
      }
    },
    [blockedPubkeys, eventStore, config.relays, pool]
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
