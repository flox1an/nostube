import { processEvents, getPublishDate } from '@/utils/video-event'
import { useReportedPubkeys, useAppContext, useMissingVideos } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type TimelineLoader } from 'applesauce-loaders/loaders'
import { type NostrEvent } from 'nostr-tools'
import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'

export function useInfiniteTimeline(loader?: () => TimelineLoader, readRelays: string[] = []) {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()
  const { presetContent } = useSelectedPreset()

  const [events, setEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)
  // True while a relay subscription is actively open (even after early-complete sets loading=false).
  // Prevents useInfiniteScroll from firing loadMore again during that window.
  const [subscriptionActive, setSubscriptionActive] = useState(false)

  // Store subscription reference for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Track safety timeout to clear it properly
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Early-complete timer: fires 300ms after the first new video appears so results
  // are shown immediately without waiting for slow relays or EOSE.
  const earlyCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs so next() doesn't capture stale loading/exhausted values — prevents the
  // re-subscribe loop when early-complete fires and useInfiniteScroll re-triggers.
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const exhaustedRef = useRef(exhausted)
  exhaustedRef.current = exhausted

  // Always-current snapshot of the processed video count.
  // Read inside next() to capture the pre-load baseline without needing an extra effect.
  const videoCountRef = useRef(0)

  // Track processed video count before each load to detect new results.
  const videoCountBeforeLoadRef = useRef(0)

  // Cleanup subscription and timeout on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
      if (earlyCompleteTimerRef.current) {
        clearTimeout(earlyCompleteTimerRef.current)
      }
    }
  }, [])

  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])

  // Track if this is the first load to allow calling next() when loading=true initially
  const isFirstLoadRef = useRef(true)

  // Stable callback — uses refs so it never changes reference when loading/exhausted
  // change, avoiding the stale-closure re-trigger loop in useInfiniteScroll.
  const next = useCallback(() => {
    // Allow first load even if loading is true (initial state)
    if (!loader || (loadingRef.current && !isFirstLoadRef.current) || exhaustedRef.current) {
      return
    }
    isFirstLoadRef.current = false

    // Cleanup previous subscription and timeouts before creating a new one
    subscriptionRef.current?.unsubscribe()
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
    }
    if (earlyCompleteTimerRef.current) {
      clearTimeout(earlyCompleteTimerRef.current)
      earlyCompleteTimerRef.current = null
    }

    setLoading(true)
    setSubscriptionActive(true)

    // Capture current video count as the baseline for early-complete detection.
    // videoCountRef is synced on every render (after the videos memo), so it holds
    // the correct pre-load value here — no separate effect or render needed.
    videoCountBeforeLoadRef.current = videoCountRef.current

    let receivedAnyEvents = false

    // Safety timeout: force complete after 2 seconds if relays never send EOSE.
    // Reduced from 5s — the cursor in loadBackwardBlocks advances per-event so paging
    // state is already correct even if we cut the subscription short.
    safetyTimeoutRef.current = setTimeout(() => {
      subscriptionRef.current?.unsubscribe()
      safetyTimeoutRef.current = null

      if (!receivedAnyEvents) {
        setExhausted(true)
      }

      setLoading(false)
      setSubscriptionActive(false)
    }, 2000)

    subscriptionRef.current = loader()().subscribe({
      next: event => {
        receivedAnyEvents = true
        if (import.meta.env.DEV) {
          console.log('[useInfiniteTimeline] event received:', event.kind, event.id.slice(0, 8))
        }
        setEvents(prev => {
          const newList = Array.from(insertEventIntoDescendingList(prev, event))
          return newList
        })
      },
      complete: () => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current)
          safetyTimeoutRef.current = null
        }
        if (earlyCompleteTimerRef.current) {
          clearTimeout(earlyCompleteTimerRef.current)
          earlyCompleteTimerRef.current = null
        }

        if (!receivedAnyEvents) {
          setExhausted(true)
        }

        setLoading(false)
        setSubscriptionActive(false)
      },
      error: err => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current)
          safetyTimeoutRef.current = null
        }
        if (earlyCompleteTimerRef.current) {
          clearTimeout(earlyCompleteTimerRef.current)
          earlyCompleteTimerRef.current = null
        }
        console.error('[useInfiniteTimeline] Load error:', err)
        setLoading(false)
        setSubscriptionActive(false)
      },
    })
  }, [loader]) // stable — loading/exhausted read via refs

  // Process events to VideoEvent format and sort by publish date
  const videos = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log('[useInfiniteTimeline] processing', events.length, 'events')
    }
    const processed = processEvents(
      events,
      readRelays,
      blockedPubkeys,
      config.blossomServers,
      missingVideoIds,
      presetContent.nsfwPubkeys,
      config.reportedEventIds
    )
    if (import.meta.env.DEV) {
      console.log('[useInfiniteTimeline] processed to', processed.length, 'videos')
    }
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [
    events,
    readRelays,
    blockedPubkeys,
    config.blossomServers,
    missingVideoIds,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
  ])

  // Keep videoCountRef in sync with the latest processed count on every render.
  // next() reads this synchronously so it always gets the correct pre-load baseline.
  videoCountRef.current = videos.length

  // Early-complete: release loading/subscriptionActive as soon as new processed videos
  // appear, without waiting for EOSE or the safety timeout. The loadBackwardBlocks cursor
  // in getTimelineLoader advances per-event (via tap), so the next page loads from the
  // correct position even though the relay subscription is still open.
  useEffect(() => {
    if (!loading || !subscriptionActive) return
    if (videos.length <= videoCountBeforeLoadRef.current) return

    if (!earlyCompleteTimerRef.current) {
      earlyCompleteTimerRef.current = setTimeout(() => {
        earlyCompleteTimerRef.current = null
        setLoading(false)
        setSubscriptionActive(false)
      }, 300)
    }
  }, [videos.length, loading, subscriptionActive])

  const reset = useCallback(() => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = null
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    if (earlyCompleteTimerRef.current) {
      clearTimeout(earlyCompleteTimerRef.current)
      earlyCompleteTimerRef.current = null
    }
    setEvents([])
    setExhausted(false)
    setLoading(true)
    isFirstLoadRef.current = true
  }, [])

  // Trigger initial load when loader becomes available
  useEffect(() => {
    if (loader && isFirstLoadRef.current) {
      queueMicrotask(() => next())
    }
  }, [loader, next])

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
              next()
            }
          })
        }
      })()
      return () => {
        cancelled = true
      }
    }
  }, [loader, reset, next])

  return {
    videos,
    loading,
    exhausted,
    subscriptionActive,
    loadMore: next,
    reset,
  }
}
