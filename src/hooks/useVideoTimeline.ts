import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { useReportedPubkeys } from './useReportedPubkeys'
import { useAppContext } from './useAppContext'
import { useEffect, useMemo, useState } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { finalize, map } from 'rxjs'
import { VideoType } from '@/contexts/AppContext'
import { hashObjectBigInt } from '@/lib/utils'

const lastLoadedTimestamp = new Map<string, number>()
let logSeq = 0

export default function useVideoTimeline(type: VideoType, authors?: string[]) {
  const seq = ++logSeq
  console.log(`[${seq}] useVideoTimeline called with type:`, type, 'authors:', authors)

  const blockedPubkeys = useReportedPubkeys()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const [videosLoading, setVideosLoading] = useState(false)

  // TODO we need to read the authers outbox relays here too
  const readRelays = useMemo(() => {
    const seq = ++logSeq
    console.log(`[${seq}] readRelays useMemo called, config.relays:`, config.relays)
    const relays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    console.log(`[${seq}] readRelays result:`, relays)
    return relays
  }, [config.relays])

  const filters = useMemo(() => {
    const seq = ++logSeq
    console.log(`[${seq}] filters useMemo called, type:`, type, 'authors:', authors)
    const result = authors
      ? { kinds: getKindsForType(type), authors }
      : { kinds: getKindsForType(type) }
    console.log(`[${seq}] filters result:`, result)
    return result
  }, [type, authors])

  const hash = useMemo(() => {
    const seq = ++logSeq
    console.log(`[${seq}] hash useMemo called, filters:`, filters)
    const hash = hashObjectBigInt(filters)
    console.log(`[${seq}] hash result:`, hash)
    return hash
  }, [filters])

  /*
  const loader = useMemo(
    () => createTimelineLoader(pool, readRelays, filters, { limit: 50 }),
    [pool, readRelays, filters]
  );
  */

  const videos$ = useMemo(() => {
    const seq = ++logSeq
    console.log(`[${seq}] videos$ useMemo called, hash:`, hash, 'filters:', filters)
    const result = eventStore.timeline(filters).pipe(
      /*
        switchMap(events => {
          if (events && events.length > 0) {
            return of(events);
          }
          // If no events in store, subscribe to loader and add events to store
          loader().pipe(
            finalize(() => {
              lastLoadedTimestamp.set(hash, Date.now());
              setVideosLoading(false);
            })
          ).subscribe(e => eventStore.add(e));
          return of([]); // Return empty array initially, timeline will update when events are added
        }),
        catchError(() => {
          // If eventStore fails, subscribe to loader and add events to store
          loader().pipe(
            finalize(() => {
              lastLoadedTimestamp.set(hash, Date.now());
              setVideosLoading(false);
            })
          ).subscribe(e => eventStore.add(e));
          return of([]); // Return empty array initially, timeline will update when events are added
        }),
*/
      map(events => {
        console.log(`[${seq}] processing events:`, events.length)
        return processEvents(events, readRelays, blockedPubkeys, config.blossomServers)
      })
    )
    console.log(`[${seq}] videos$ observable created`)
    return result
  }, [eventStore, readRelays, blockedPubkeys, type, filters, config.blossomServers])

  const videos =
    useObservableMemo(() => {
      const seq = ++logSeq
      console.log(`[${seq}] useObservableMemo called for videos`)
      return videos$
    }, []) || []

  useEffect(() => {
    const seq = ++logSeq
    console.log(`[${seq}] useEffect called, hash:`, hash, 'filters:', filters)
    const lastLoaded = lastLoadedTimestamp.get(hash)
    console.log(
      `[${seq}] lastLoaded:`,
      lastLoaded,
      'time since last load:',
      lastLoaded ? Date.now() - lastLoaded : 'undefined'
    )

    if (lastLoaded == undefined || Date.now() - lastLoaded < 60000) {
      console.log(`[${seq}] loading new events from relays, hash:`, hash, 'filters:', filters)
      setVideosLoading(true)
      createTimelineLoader(pool, readRelays, filters, { limit: 50 })()
        .pipe(
          finalize(() => {
            const finalizeSeq = ++logSeq
            console.log(
              `[${finalizeSeq}] loader finalize called, setting timestamp for hash:`,
              hash
            )
            lastLoadedTimestamp.set(hash, Date.now())
            setVideosLoading(false)
          })
        )
        .subscribe(e => {
          const subscribeSeq = ++logSeq
          console.log(`[${subscribeSeq}] loader event received:`, e.id)
          eventStore.add(e)
        })
      return
    } else {
      console.log(`[${seq}] skipping load, last loaded was recent enough`)
    }
  }, [eventStore, hash, filters, pool, readRelays])

  console.log(
    `[${seq}] useVideoTimeline returning, videos count:`,
    videos.length,
    'videosLoading:',
    videosLoading
  )
  return { videos, videosLoading }
}
