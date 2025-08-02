import { useEventStore, useObservableMemo } from 'applesauce-react/hooks';
import { useReportedPubkeys } from './useReportedPubkeys';
import { useAppContext } from './useAppContext';
import { useEffect, useMemo, useState } from 'react';
import { getKindsForType } from '@/lib/video-types';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import { processEvents } from '@/utils/video-event';
import { map } from 'rxjs';
import { VideoType } from '@/contexts/AppContext';

export default function useVideoTimeline(type: VideoType) {
  const blockedPubkeys = useReportedPubkeys();
  const eventStore = useEventStore();
  const { pool, config } = useAppContext();
  const [videosLoading, setVideosLoading] = useState(true);
  const readRelays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const loader = useMemo(
    () => createTimelineLoader(pool, readRelays, { kinds: getKindsForType(type) }, { limit: 50 }),
    [pool, readRelays]
  );

  const videos$ = useMemo(
    () =>
      eventStore
        .timeline({ kinds: getKindsForType(type) })
        .pipe(map(events => processEvents(events, readRelays, blockedPubkeys))),
    [eventStore, readRelays, blockedPubkeys]
  );

  const videos = useObservableMemo(() => videos$, []) || [];

  useEffect(() => {
    const needLoad = videos.length === 0 && !hasLoadedOnce;

    if (needLoad) {
      console.log('using loader to load more video events');
      const load$ = loader();

      load$.subscribe(e => eventStore.add(e));
      setHasLoadedOnce(true);
    }
    setVideosLoading(false);

  }, [eventStore, hasLoadedOnce, loader]);

  return { videos, videosLoading };
}
