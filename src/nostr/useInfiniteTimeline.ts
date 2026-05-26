import { processEvents, getPublishDate } from '@/utils/video-event'
import { useReportedPubkeys, useAppContext, useMissingVideos } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type TimelineLoader } from 'applesauce-loaders/loaders'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { type Filter, type NostrEvent } from 'nostr-tools'
import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'
import { auditTime, of } from 'rxjs'

type TimelinePhase = 'idle' | 'loading-initial' | 'ready' | 'loading-more' | 'exhausted' | 'error'
type LoadIntent = 'initial' | 'load-more' | 'prefetch'

interface UseInfiniteTimelineOptions {
  filters?: Filter | Filter[]
  directMode?: boolean
  firstEventTimeoutMs?: number
  pageSettleMs?: number
  firstUsefulTimeoutMs?: number
}

const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 10000
const DEFAULT_PAGE_SETTLE_MS = 3000
const DEFAULT_FIRST_USEFUL_TIMEOUT_MS = 900

export function useInfiniteTimeline(
  loader?: () => TimelineLoader,
  readRelays: string[] = [],
  options: UseInfiniteTimelineOptions = {}
) {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()
  const { presetContent } = useSelectedPreset()
  const eventStore = useEventStore()
  const {
    filters,
    directMode = false,
    firstEventTimeoutMs = DEFAULT_FIRST_EVENT_TIMEOUT_MS,
    pageSettleMs = DEFAULT_PAGE_SETTLE_MS,
    firstUsefulTimeoutMs = DEFAULT_FIRST_USEFUL_TIMEOUT_MS,
  } = options

  const [directEvents, setDirectEvents] = useState<NostrEvent[]>([])
  const [fallbackEvents, setFallbackEvents] = useState<NostrEvent[]>([])
  const [phase, setPhase] = useState<TimelinePhase | 'prefetching'>('idle')
  const [exhausted, setExhausted] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState(false)

  // Store subscription reference for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Track safety timeout to clear it properly
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstUsefulTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inFlightRef = useRef(false)
  const exhaustedRef = useRef(exhausted)
  exhaustedRef.current = exhausted
  const eventsRef = useRef<NostrEvent[]>([])

  // Cleanup subscription and timeout on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current)
      }
      if (firstUsefulTimeoutRef.current) {
        clearTimeout(firstUsefulTimeoutRef.current)
      }
    }
  }, [])

  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])

  // Track if this is the first load to allow calling next() when loading=true initially
  const isFirstLoadRef = useRef(true)

  const storeEvents = use$(() => {
    if (directMode || !filters) return of<NostrEvent[]>([])
    return eventStore.timeline(filters).pipe(auditTime(100))
  }, [eventStore, filters, directMode])

  // Stable callback — uses refs so it never changes reference when loading/exhausted changes.
  const startLoad = useCallback(
    (intent: LoadIntent) => {
      if (!loader || inFlightRef.current || exhaustedRef.current) {
        return
      }

      isFirstLoadRef.current = false

      // Cleanup previous subscription and timeouts before creating a new one
      subscriptionRef.current?.unsubscribe()
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current)
        settleTimeoutRef.current = null
      }
      if (firstUsefulTimeoutRef.current) {
        clearTimeout(firstUsefulTimeoutRef.current)
        firstUsefulTimeoutRef.current = null
      }

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

      const finish = (nextPhase: TimelinePhase | 'prefetching') => {
        if (settled) return
        settled = true
        inFlightRef.current = false
        setSubscriptionActive(false)
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

      // If nothing answers at all, release the pagination gate. Once events start
      // flowing, pageSettleMs takes over and waits for an idle period.
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
          if (directMode) {
            setDirectEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
          } else if (!filters) {
            // Compatibility path for callers that have not provided a store timeline filter yet.
            setFallbackEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
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
          console.error('[useInfiniteTimeline] Load error:', err)
          finish(receivedAnyEvents ? 'ready' : 'error')
        },
      })
    },
    [
      loader,
      directMode,
      filters,
      eventStore,
      firstEventTimeoutMs,
      firstUsefulTimeoutMs,
      pageSettleMs,
    ]
  )

  const next = useCallback(() => startLoad('load-more'), [startLoad])
  const prefetchMore = useCallback(() => startLoad('prefetch'), [startLoad])

  const events = useMemo(() => {
    if (directMode) return directEvents
    if (filters) return storeEvents ?? []
    return fallbackEvents
  }, [directMode, directEvents, filters, storeEvents, fallbackEvents])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  // Process events to VideoEvent format and sort by publish date
  const videos = useMemo(() => {
    const processed = processEvents(
      events,
      readRelays,
      blockedPubkeys,
      config.blossomServers,
      missingVideoIds,
      presetContent.nsfwPubkeys,
      config.reportedEventIds,
      { includeYouTube: config.showYouTubeContent ?? true }
    )
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [
    events,
    readRelays,
    blockedPubkeys,
    config.blossomServers,
    missingVideoIds,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  const reset = useCallback(() => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = null
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
    inFlightRef.current = false
    setSubscriptionActive(false)
    setDirectEvents([])
    setFallbackEvents([])
    eventsRef.current = []
    setExhausted(false)
    setPhase('idle')
    isFirstLoadRef.current = true
  }, [])

  // Trigger initial load when loader becomes available
  useEffect(() => {
    if (loader && isFirstLoadRef.current) {
      queueMicrotask(() => startLoad('initial'))
    }
  }, [loader, startLoad])

  // Reset when loader changes (e.g., when relays or filters change)
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
    loading: phase === 'loading-initial' || phase === 'loading-more',
    isInitialLoading: phase === 'loading-initial',
    isLoadingMore: phase === 'loading-more',
    isPrefetching: phase === 'prefetching',
    subscriptionActive,
    exhausted,
    phase,
    loadMore: next,
    prefetchMore,
    reset,
  }
}
