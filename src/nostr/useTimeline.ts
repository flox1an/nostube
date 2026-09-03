import { useAppContext } from '@/hooks/useAppContext'
import { useMissingVideos } from '@/hooks/useMissingVideos'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { isDeletedByEvent } from '@/lib/deletions'
import { lastLoadedTimestamp } from '@/lib/video-timeline-cache'
import { hashObjectBigInt } from '@/lib/utils'
import { getPublishDate, processEvents, type VideoEvent } from '@/utils/video-event'
import { getTimelineLoader } from './core'
import { type TimelineLoader } from 'applesauce-loaders/loaders'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { type Filter, type NostrEvent } from 'nostr-tools'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'
import { auditTime, of } from 'rxjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type TimelinePhase =
  'idle' | 'loading-initial' | 'ready' | 'loading-more' | 'prefetching' | 'exhausted' | 'error'

type LoadIntent = 'initial' | 'load-more' | 'prefetch'

export interface UseTimelineOptions {
  relays?: string[]
  loader?: () => TimelineLoader
  directMode?: boolean
  includeAudio?: boolean
  enabled?: boolean
  skipCache?: boolean
  cacheKey?: string
  staleTimeMs?: number
  firstEventTimeoutMs?: number
  pageSettleMs?: number
  firstUsefulTimeoutMs?: number
}

export interface UseTimelineResult {
  videos: VideoEvent[]
  events: NostrEvent[]
  loading: boolean
  isInitialLoading: boolean
  isLoadingMore: boolean
  isPrefetching: boolean
  subscriptionActive: boolean
  exhausted: boolean
  hasMore: boolean
  phase: TimelinePhase
  loadMore: () => void
  prefetchMore: () => void
  reset: () => void
}

const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 10000
const DEFAULT_PAGE_SETTLE_MS = 5000
const DEFAULT_FIRST_USEFUL_TIMEOUT_MS = 900

function isSingleFilter(filters?: Filter | Filter[]): filters is Filter {
  return !!filters && !Array.isArray(filters)
}

export function useTimeline(
  filters?: Filter | Filter[],
  options: UseTimelineOptions = {}
): UseTimelineResult {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()
  const { presetContent } = useSelectedPreset()
  const eventStore = useEventStore()
  const {
    relays = [],
    loader: providedLoader,
    directMode = false,
    includeAudio,
    enabled = true,
    skipCache = false,
    cacheKey,
    staleTimeMs,
    firstEventTimeoutMs = DEFAULT_FIRST_EVENT_TIMEOUT_MS,
    pageSettleMs = DEFAULT_PAGE_SETTLE_MS,
    firstUsefulTimeoutMs = DEFAULT_FIRST_USEFUL_TIMEOUT_MS,
  } = options

  const generatedLoader = useMemo(() => {
    if (providedLoader || !isSingleFilter(filters)) return undefined

    const key =
      cacheKey ?? String(hashObjectBigInt({ filters, relays: [...relays].sort(), skipCache }))
    const timelineLoader = getTimelineLoader(key, filters, relays, { skipCache })
    return () => timelineLoader
  }, [cacheKey, filters, providedLoader, relays, skipCache])

  const loader = providedLoader ?? generatedLoader

  const timelineCacheKey = useMemo(() => {
    if (cacheKey) return cacheKey
    if (!filters) return undefined
    return String(hashObjectBigInt({ filters, relays: [...relays].sort(), skipCache }))
  }, [cacheKey, filters, relays, skipCache])

  const [directEvents, setDirectEvents] = useState<NostrEvent[]>([])
  const [fallbackEvents, setFallbackEvents] = useState<NostrEvent[]>([])
  const [phase, setPhase] = useState<TimelinePhase>('idle')
  const [exhausted, setExhausted] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState(false)

  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstUsefulTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const exhaustedRef = useRef(exhausted)
  const eventsRef = useRef<NostrEvent[]>([])
  const isFirstLoadRef = useRef(true)

  exhaustedRef.current = exhausted

  const hasAcceptedEvent = useCallback(
    (event: NostrEvent) => {
      if (typeof eventStore.hasEvent !== 'function') return true
      return eventStore.hasEvent(event.id)
    },
    [eventStore]
  )

  const clearTimers = useCallback(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current)
      settleTimeoutRef.current = null
    }
    if (firstUsefulTimeoutRef.current) {
      clearTimeout(firstUsefulTimeoutRef.current)
      firstUsefulTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
      clearTimers()
    }
  }, [clearTimers])

  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])

  const storeEvents = use$(() => {
    if (directMode || !filters) return of<NostrEvent[]>([])
    return eventStore.timeline(filters).pipe(auditTime(100))
  }, [eventStore, filters, directMode])

  const startLoad = useCallback(
    (intent: LoadIntent) => {
      if (!enabled || !loader || inFlightRef.current || exhaustedRef.current) {
        return
      }

      if (intent === 'initial' && staleTimeMs !== undefined && timelineCacheKey) {
        const lastLoaded = lastLoadedTimestamp.get(timelineCacheKey)
        if (lastLoaded !== undefined && Date.now() - lastLoaded <= staleTimeMs) {
          isFirstLoadRef.current = false
          setPhase('ready')
          return
        }
      }

      isFirstLoadRef.current = false
      subscriptionRef.current?.unsubscribe()
      clearTimers()

      inFlightRef.current = true
      setSubscriptionActive(true)

      if (intent === 'prefetch') {
        setPhase('prefetching')
      } else {
        setPhase(prev =>
          prev === 'idle' || intent === 'initial' ? 'loading-initial' : 'loading-more'
        )
      }

      let receivedAnyEvents = false
      let settled = false
      let readyVisible = false

      const setReadyVisible = () => {
        if (readyVisible || intent === 'prefetch') return
        readyVisible = true
        setPhase('ready')
      }

      const finish = (nextPhase: TimelinePhase) => {
        if (settled) return
        settled = true
        inFlightRef.current = false
        setSubscriptionActive(false)
        clearTimers()
        if (intent === 'initial' && timelineCacheKey) {
          lastLoadedTimestamp.set(timelineCacheKey, Date.now())
        }
        setPhase(nextPhase)
      }

      const scheduleSettle = () => {
        if (settleTimeoutRef.current) {
          clearTimeout(settleTimeoutRef.current)
        }

        settleTimeoutRef.current = setTimeout(() => {
          subscriptionRef.current?.unsubscribe()
          finish('ready')
        }, pageSettleMs)
      }

      safetyTimeoutRef.current = setTimeout(() => {
        subscriptionRef.current?.unsubscribe()
        setExhausted(true)
        finish('exhausted')
      }, firstEventTimeoutMs)

      if (intent !== 'prefetch') {
        firstUsefulTimeoutRef.current = setTimeout(() => {
          if (receivedAnyEvents) {
            setReadyVisible()
          }
        }, firstUsefulTimeoutMs)
      }

      const currentEvents = eventsRef.current
      const oldestCreatedAt =
        currentEvents.length > 0
          ? Math.min(...currentEvents.map(event => event.created_at))
          : undefined
      const loadWindow =
        intent === 'initial' || oldestCreatedAt === undefined
          ? undefined
          : { until: oldestCreatedAt - 1 }
      const timelineLoader = loader()

      subscriptionRef.current = timelineLoader(loadWindow).subscribe({
        next: event => {
          if (!receivedAnyEvents && safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current)
            safetyTimeoutRef.current = null
          }
          receivedAnyEvents = true
          setReadyVisible()
          scheduleSettle()
          if (event.kind === 5) {
            if (directMode) {
              setDirectEvents(prev => prev.filter(existing => !isDeletedByEvent(event, existing)))
            } else if (!filters) {
              setFallbackEvents(prev => prev.filter(existing => !isDeletedByEvent(event, existing)))
            }
            return
          }
          if (directMode) {
            if (hasAcceptedEvent(event)) {
              setDirectEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
            }
          } else if (!filters) {
            if (hasAcceptedEvent(event)) {
              setFallbackEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
            }
          } else {
            eventStore.add(event)
          }
        },
        complete: () => {
          if (!receivedAnyEvents) {
            setExhausted(true)
            finish('exhausted')
            return
          }

          finish('ready')
        },
        error: err => {
          console.error('[useTimeline] Load error:', err)
          finish(receivedAnyEvents ? 'ready' : 'error')
        },
      })
    },
    [
      clearTimers,
      directMode,
      enabled,
      eventStore,
      filters,
      firstEventTimeoutMs,
      firstUsefulTimeoutMs,
      loader,
      pageSettleMs,
      hasAcceptedEvent,
      staleTimeMs,
      timelineCacheKey,
    ]
  )

  const loadMore = useCallback(() => startLoad('load-more'), [startLoad])
  const prefetchMore = useCallback(() => startLoad('prefetch'), [startLoad])

  const events = useMemo(() => {
    if (directMode) return directEvents
    if (filters) return storeEvents ?? []
    return fallbackEvents
  }, [directMode, directEvents, filters, storeEvents, fallbackEvents])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const videos = useMemo(() => {
    const processed = processEvents(events, relays, {
      blockPubkeys: blockedPubkeys,
      blossomServers: config.blossomServers,
      missingVideoIds,
      nsfwPubkeys: presetContent.nsfwPubkeys,
      reportedEventIds: config.reportedEventIds,
      includeYouTube: config.showYouTubeContent ?? true,
      includeAudio: includeAudio ?? config.showAudioContent ?? true,
    })
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [
    events,
    relays,
    blockedPubkeys,
    config.blossomServers,
    missingVideoIds,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
    config.showAudioContent,
    includeAudio,
  ])

  const reset = useCallback(() => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = null
    clearTimers()
    inFlightRef.current = false
    setSubscriptionActive(false)
    setDirectEvents([])
    setFallbackEvents([])
    eventsRef.current = []
    setExhausted(false)
    setPhase('idle')
    isFirstLoadRef.current = true
  }, [clearTimers])

  useEffect(() => {
    if (enabled && loader && isFirstLoadRef.current) {
      queueMicrotask(() => startLoad('initial'))
    }
  }, [enabled, loader, startLoad])

  const loaderRef = useRef(loader)

  useEffect(() => {
    if (loaderRef.current === undefined) {
      loaderRef.current = loader
      return
    }

    if (loaderRef.current !== loader) {
      loaderRef.current = loader
      let cancelled = false
      ;(async () => {
        await Promise.resolve()
        if (!cancelled) {
          reset()
          queueMicrotask(() => {
            if (!cancelled) {
              startLoad('initial')
            }
          })
        }
      })()
      return () => {
        cancelled = true
      }
    }
  }, [loader, reset, startLoad])

  return {
    videos,
    events,
    loading: phase === 'loading-initial' || phase === 'loading-more',
    isInitialLoading: phase === 'loading-initial',
    isLoadingMore: phase === 'loading-more',
    isPrefetching: phase === 'prefetching',
    subscriptionActive,
    exhausted,
    hasMore: !exhausted,
    phase,
    loadMore,
    prefetchMore,
    reset,
  }
}
