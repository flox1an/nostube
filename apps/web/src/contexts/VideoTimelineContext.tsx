import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { type VideoType } from '@/contexts/AppContext'
import { type VideoEvent } from '@/utils/video-event'
import { useAppContext } from '@/hooks/useAppContext'
import { getKindsForType } from '@/lib/video-types'
import { hashObjectBigInt } from '@/lib/utils'
import { useTimeline } from '@/nostr/useTimeline'
import { type Filter } from 'nostr-tools'

interface TimelineRequest {
  filter: Filter
  relays: string[]
  cacheKey: string
}

interface VideoTimelineContextType {
  videos: VideoEvent[]
  videosLoading: boolean
  hasMore: boolean
  loadTimeline: (type: VideoType, authors?: string[]) => void
}

const VideoTimelineContext = createContext<VideoTimelineContextType | undefined>(undefined)

export function VideoTimelineProvider({ children }: { children: React.ReactNode }) {
  const { config } = useAppContext()
  const [request, setRequest] = useState<TimelineRequest>()

  const loadTimeline = useCallback(
    (type: VideoType, authors?: string[]) => {
      const filter: Filter = authors
        ? { kinds: getKindsForType(type), authors, limit: 50 }
        : { kinds: getKindsForType(type), limit: 50 }
      const relays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
      const cacheKey = String(hashObjectBigInt({ filter, relays: [...relays].sort() }))

      setRequest({ filter, relays, cacheKey })
    },
    [config.relays]
  )

  const { videos, loading, hasMore } = useTimeline(request?.filter, {
    relays: request?.relays ?? [],
    enabled: !!request,
    cacheKey: request?.cacheKey,
    staleTimeMs: 60000,
  })

  const contextValue = useMemo(
    () => ({
      videos,
      videosLoading: loading,
      hasMore,
      loadTimeline,
    }),
    [videos, loading, hasMore, loadTimeline]
  )

  return (
    <VideoTimelineContext.Provider value={contextValue}>{children}</VideoTimelineContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVideoTimelineContext() {
  const context = useContext(VideoTimelineContext)
  if (context === undefined) {
    throw new Error('useVideoTimelineContext must be used within a VideoTimelineProvider')
  }

  return context
}
