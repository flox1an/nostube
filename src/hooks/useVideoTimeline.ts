import { useEventStore, useObservableMemo } from 'applesauce-react/hooks';
import { useReportedPubkeys } from './useReportedPubkeys';
import { useAppContext } from './useAppContext';
import { useEffect, useMemo, useState } from 'react';
import { getKindsForType } from '@/lib/video-types';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import { processEvents } from '@/utils/video-event';
import { catchError, finalize, map, of, switchMap } from 'rxjs';
import { VideoType } from '@/contexts/AppContext';
import { hashObjectBigInt } from '@/lib/utils';

const lastLoadedTimestamp = new Map<string, number>();

export default function useVideoTimeline(type: VideoType, authors?: string[]) {
  const blockedPubkeys = useReportedPubkeys();
  const eventStore = useEventStore();
  const { pool, config } = useAppContext();
  const [videosLoading, setVideosLoading] = useState(false);
  const readRelays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);
  console.log('lastloaded', lastLoadedTimestamp);
  const filters = useMemo(() => {
    if (authors) {
      return { kinds: getKindsForType(type), authors };
    }
    return { kinds: getKindsForType(type) };
  }, [type, authors]);

  const hash = useMemo(() => hashObjectBigInt(filters), [filters]);
  const loader = useMemo(() => createTimelineLoader(pool, readRelays, filters, { limit: 50 }), [pool, readRelays]);

  const videos$ = useMemo(() => {
    console.log('loading timeline', hash, filters);
    return eventStore.timeline(filters).pipe(
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
      map(events => processEvents(events, readRelays, blockedPubkeys))
    );
  }, [eventStore, readRelays, blockedPubkeys, type, loader]);

  const videos = useObservableMemo(() => videos$, []) || [];

  useEffect(() => {
    const lastLoaded = lastLoadedTimestamp.get(hash);
    if (lastLoaded == undefined || Date.now() - lastLoaded < 60000) {
      loader()
        .pipe(
          finalize(() => {
            lastLoadedTimestamp.set(hash, Date.now());
            setVideosLoading(false);
          })
        )
        .subscribe(e => eventStore.add(e));
      return;
    }
  }, [eventStore, loader]);

  return { videos, videosLoading };
}
