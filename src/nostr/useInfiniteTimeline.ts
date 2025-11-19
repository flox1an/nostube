import { processEvents } from '@/utils/video-event'
import { useReportedPubkeys, useAppContext, useMissingVideos } from '@/hooks'
import { type TimelineLoader } from 'applesauce-loaders/loaders'
import { type NostrEvent } from 'nostr-tools'
import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'

export function useInfiniteTimeline(loader?: () => TimelineLoader, readRelays: string[] = []) {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()

  const [events, setEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)

  // Store subscription reference for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Track event count before load to detect if new events were added
  const eventCountBeforeLoadRef = useRef(0)

  // Track safety timeout to clear it properly
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup subscription and timeout on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
    }
  }, [])

  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])

  // Track if this is the first load to allow calling next() when loading=true initially
  const isFirstLoadRef = useRef(true)

  const next = useCallback(() => {
    // Allow first load even if loading is true (initial state)
    if (!loader || (loading && !isFirstLoadRef.current) || exhausted) {
      return
    }
    isFirstLoadRef.current = false

    // Cleanup previous subscription and timeout before creating a new one
    subscriptionRef.current?.unsubscribe()
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
    }

    setLoading(true)

    // Store the current event count before loading
    setEvents(prev => {
      eventCountBeforeLoadRef.current = prev.length
      return prev
    })

    let receivedAnyEvents = false

    // Safety timeout: force complete after 5 seconds
    // Note: applesauce loaders may not call complete() if relays are slow
    safetyTimeoutRef.current = setTimeout(() => {
      subscriptionRef.current?.unsubscribe()
      safetyTimeoutRef.current = null

      // Check if we actually added new events (not just received duplicates)
      setEvents(currentEvents => {
        const addedNewEvents = currentEvents.length > eventCountBeforeLoadRef.current

        if (!addedNewEvents) {
          setExhausted(true)
        }

        return currentEvents
      })

      setLoading(false)
    }, 5000)

    subscriptionRef.current = loader()().subscribe({
      next: event => {
        receivedAnyEvents = true
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

        // Check immediately if we received any events from the loader
        if (!receivedAnyEvents) {
          setExhausted(true)
          setLoading(false)
          return
        }

        // If we received events, check if any were actually added (not duplicates)
        setEvents(currentEvents => {
          const addedNewEvents = currentEvents.length > eventCountBeforeLoadRef.current

          if (!addedNewEvents) {
            setExhausted(true)
          }

          setLoading(false)
          return currentEvents
        })
      },
      error: err => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current)
          safetyTimeoutRef.current = null
        }
        console.error('[useInfiniteTimeline] Load error:', err)
        setLoading(false)
        // Don't mark as exhausted on error, allow retry
      },
    })
  }, [loader, loading, exhausted])

  // Process events to VideoEvent format
  const videos = useMemo(() => {
    return processEvents(events, readRelays, blockedPubkeys, config.blossomServers, missingVideoIds)
  }, [events, readRelays, blockedPubkeys, config.blossomServers, missingVideoIds])
  /*
  const videos = useObservableMemo(
    () =>
      relayPool
        .group(readRelays)
        .subscription({ kinds: getKindsForType('videos'), limit: 20 })
        .pipe(
          onlyEvents(),
          mapEventsToStore(eventStore),
          mapEventsToTimeline(),
          map(events => processEvents(events, readRelays, blockedPubkeys))
        ),
    [readRelays]
  );
  */

  /*

  const loadMore = useCallback(() => {
    if (loading || exhausted || !loader) {
      console.log('loadMore: early return - loading:', loading, 'exhausted:', exhausted, 'loader:', !!loader);
      return;
    }
    setLoading(true);

    // The loader is a function that returns an observable
    const sub = loader()
      .pipe(
        finalize(() => setLoading(false)) // egal ob complete/error
      )
      .subscribe({
        next: (e) => {
          console.log('Event received:', e.id, e.kind, e.content.slice(0, 50));
          setEvents(prev => (prev.some(x => x.id === e.id) ? prev : [...prev, e]));
        },
        complete: () => {
          console.log('Loader completed');
          // Simple Heuristik: nichts Neues? -> eventuell „am Ende"
          setExhausted(prev => prev || false);
        },
        error: (err) => {
          console.log('Loader error:', err);
          // Fehler beendet diesen Page-Load, aber wir lassen die Liste stehen
        }
      });

    return () => { console.log("unsubscribe"); sub.unsubscribe(); }
  }, [loading, exhausted, loader]); // Include readRelays for relay updates

  // Reset (z. B. beim Filterwechsel)
  const reset = useCallback(() => {
    setEvents([]);
    setExhausted(false);
    setLoading(false);
  }, []);

  // Process events to VideoEvent format
  const videos = useMemo(() => {
    return processEvents(events, readRelays, blockedPubkeys);
  }, [events, readRelays, blockedPubkeys]);
*/
  const reset = useCallback(() => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = null
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    setEvents([])
    setExhausted(false)
    setLoading(true)
    isFirstLoadRef.current = true
  }, [])

  // Reset when loader changes (e.g., when relays or filters change)
  // Use a ref to track the loader and only reset if it actually changed
  const loaderRef = useRef(loader)

  useEffect(() => {
    // Skip reset on initial mount (loader is undefined)
    if (!loaderRef.current && !loader) {
      loaderRef.current = loader
      return
    }

    // If loader changed, always reset
    // The loading guard in `next()` will prevent new loads while loading
    if (loaderRef.current !== loader) {
      loaderRef.current = loader
      let cancelled = false
      ;(async () => {
        await Promise.resolve()
        if (!cancelled) {
          reset()
        }
      })()
      return () => {
        cancelled = true
      }
    }
  }, [loader, reset])

  return {
    videos,
    loading,
    exhausted,
    loadMore: next,
    reset,
  }
}
