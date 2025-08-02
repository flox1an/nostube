import { useReportedPubkeys } from '@/hooks/useReportedPubkeys';
import { processEvents, VideoEvent } from '@/utils/video-event';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { AppContext } from './AppContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useEventStore, useObservableMemo, useObservableState } from 'applesauce-react/hooks';
import { getKindsForType } from '@/lib/video-types';
import { from, map, of, switchMap } from 'rxjs';


interface VideoCacheContextType {
  videos: VideoEvent[];
  allTags: string[];
  isLoading: boolean;
  hasMore: boolean;
  totalVideos: number;
  searchVideos: (query: string) => void;
  filterByTags: (tags: string[]) => void;
  clearCache: () => void;
  setVideoType: (type: 'all' | 'shorts' | 'videos') => void;
  loadMoreRef: (node?: Element | null) => void;
  setLikedVideoIds: (ids: string[]) => void;
  initSearch: (relays: string[]) => void;
  /** Public keys of followed authors */
  followedPubkeys: string[];
  likedVideoIds: string[];
  /** Set the public keys of followed authors */
  setFollowedPubkeys: (pubkeys: string[]) => void;
  isWorkerReady: boolean;
  /** Get video observable with fallback to loader */
  getVideoObservable: (id: string) => any;
}

const VideoCacheContext = createContext<VideoCacheContextType | undefined>(undefined);


export function VideoCacheProvider({ children }: { children: React.ReactNode }) {
  // const workerRef = useRef<Worker | null>(null);
  //const [videos, setVideos] = useState<VideoCache[]>([]);
  /*
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalVideos, setTotalVideos] = useState(0);
  const [followedPubkeys, setFollowedPubkeysState] = useState<string[]>([]);
  const [likedVideoIds, setLikedVideoIdsState] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });
*/
/*
  useEffect(() => {
    // Initialize worker
    const worker = new Worker(new URL('../workers/videoCacheWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    // Set up message handler
    worker.onmessage = e => {
      const { type, results, tags, count, hasMore } = e.data;

      switch (type) {
        case 'SEARCH_RESULTS':
          setVideos(results);
          break;
        case 'ALL_TAGS':
          setAllTags(tags);
          break;
        case 'LOAD_PROGRESS':
          setTotalVideos(count);
          setHasMore(hasMore);
          setAllTags(tags);
          setIsLoading(false);
          break;
        case 'LOAD_COMPLETE':
          setTotalVideos(count);
          //setHasMore(false);
          setIsLoading(false);
          break;
        case 'WORKER_READY':
          setIsWorkerReady(true);
      }
    };

    return () => {
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (workerRef.current && blockedPubkeys) {
      workerRef.current.postMessage({ type: 'SET_BLOCKED_PUBKEYS', data: blockedPubkeys });
    }
  }, [blockedPubkeys]);

  // Handle infinite loading
  useEffect(() => {
    if (inView && !isLoading && hasMore) {
      workerRef.current?.postMessage({ type: 'LOAD_MORE' });
    }
  }, [inView, isLoading, hasMore]);
*/

  const blockedPubkeys = useReportedPubkeys();
  const eventStore = useEventStore();
  const { pool, config } = useAppContext();

  const readRelays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);
  const loader = useMemo(() => createTimelineLoader(pool, readRelays, {kinds: getKindsForType('all')}), [pool, readRelays]);

  // Function to get video observable with fallback
  const getVideoObservable = useCallback((id: string) => {
    const storeEvent = eventStore.event(id);
    
    // If event exists in store, return it as observable
    if (storeEvent) {
      return of(storeEvent);
    }
    
    // Otherwise, use loader to fetch it
    return loader.load(id);
  }, [eventStore, loader]);


  const searchVideos = useCallback((query: string) => {
  }, []);

  const filterByTags = useCallback((tags: string[]) => {
  }, []);

  const clearCache = useCallback(() => {
  }, []);

  const setVideoType = useCallback((type: 'all' | 'shorts' | 'videos') => {
  }, []);

  const setFollowedPubkeys = useCallback((pubkeys: string[]) => {
    setFollowedPubkeysState(pubkeys);
  }, []);

  const setLikedVideoIds = useCallback((ids: string[]) => {
    setLikedVideoIdsState(ids);
  }, []);

  const initSearch = useCallback((relays: string[]) => {
    console.log(' initSearch ', relays);

  }, []);

  const value = {
    videos,
    
    allTags,
    isLoading,
    hasMore,
    totalVideos,
    searchVideos,
    filterByTags,
    clearCache,
    setVideoType,
    loadMoreRef,
    setLikedVideoIds,
    initSearch,
    followedPubkeys,
    likedVideoIds,
    setFollowedPubkeys,
    isWorkerReady,
    getVideoObservable,
  };

  return <VideoCacheContext.Provider value={value}>{children}</VideoCacheContext.Provider>;
}

export function useVideoCache() {
  const context = useContext(VideoCacheContext);
  if (context === undefined) {
    throw new Error('useVideoCache must be used within a VideoCacheProvider');
  }
  return context;
}
