import { processEvents } from '@/utils/video-event'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { NostrEvent } from 'nostr-tools'
import { useCallback, useMemo, useState } from 'react'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'
import { useAppContext } from '@/hooks/useAppContext'
import { useMissingVideos } from '@/hooks/useMissingVideos'

export function useInfiniteTimeline(loader?: TimelineLoader, readRelays: string[] = []) {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()

  const [events, setEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(false)
  
  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])
  const next = useCallback(() => {
    if (!loader) return
    setLoading(true)
    loader().subscribe({
      next: evnet => setEvents(prev => Array.from(insertEventIntoDescendingList(prev, evnet))),
      complete: () => {
        setLoading(false)
      },
    })
  }, [loader])

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
  return {
    videos,
    loading,
    exhausted: false,
    loadMore: next,
    reset: () => {},
  }
}
