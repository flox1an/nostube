import { VideoEvent } from '@/utils/video-event';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { AppContext } from '@/contexts/AppContext';

type VideoCache = VideoEvent;

interface VideoCacheContextType {
  videos: VideoCache[];
  allTags: string[];
  isLoading: boolean;
  hasMore: boolean;
  totalVideos: number;
  searchVideos: (query: string) => void;
  filterByTags: (tags: string[]) => void;
  clearCache: () => void;
  setVideoTypes: (type: 'all' | 'shorts' | 'videos') => void;
  loadMoreRef: (node?: Element | null) => void;
  setFilterByFollowedAuthors: (enable: boolean) => void;
  setLikedVideoIds: (ids: string[]) => void;
  initSearch: () => void;
}

const VideoCacheContext = createContext<VideoCacheContextType | undefined>(undefined);

export function VideoCacheProvider({ children }: { children: React.ReactNode }) {
  const worker = useRef<Worker>();
  const [videos, setVideos] = useState<VideoCache[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalVideos, setTotalVideos] = useState(0);
  const { config, followedPubkeys, likedVideoIds } = useContext(AppContext)!;

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  useEffect(() => {
    // Initialize worker
    worker.current = new Worker(
      new URL('../workers/videoCacheWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Set up message handler
    worker.current.onmessage = (e) => {
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
      }
    };

    return () => {
      worker.current?.terminate();
    };
  }, [config.videoType, followedPubkeys, likedVideoIds]);

  // Handle infinite loading
  useEffect(() => {
    if (inView && !isLoading && hasMore) {
      worker.current?.postMessage({ type: 'LOAD_MORE' });
    }
  }, [inView, isLoading, hasMore]);

  const searchVideos = useCallback((query: string) => {
    worker.current?.postMessage({
      type: 'SEARCH',
      data: query,
    });
  }, []);

  const filterByTags = useCallback((tags: string[]) => {
    worker.current?.postMessage({
      type: 'FILTER_TAGS',
      data: tags,
    });
  }, []);

  const clearCache = useCallback(() => {
    worker.current?.postMessage({ type: 'CLEAR_CACHE' });
  }, []);

  const setVideoTypes = useCallback((type: 'all' | 'shorts' | 'videos') => {
    worker.current?.postMessage({
      type: 'SET_VIDEO_TYPES',
      data: type,
    });
  }, []);

  const setAuthors = useCallback((pubkeys: string[]) => {
    worker.current?.postMessage({
      type: 'SET_AUTHORS_FILTER',
      data: pubkeys,
    });
  }, []);

  const setLikedVideoIds = useCallback((ids: string[]) => {
    worker.current?.postMessage({
      type: 'SET_LIKED_VIDEO_IDS',
      data: ids,
    });
  }, []);

  const initSearch = useCallback(() => {
    worker.current?.postMessage({
      type: 'INIT',
      data: {
        relayUrls: [
          'wss://relay.nostr.band',
          'wss://nos.lol',
          'wss://relay.damus.io',
        ],
        videoType: config.videoType,
        followedPubkeys: followedPubkeys,
        likedVideoIds: likedVideoIds,
      },
    });
  }, [config.videoType, followedPubkeys, likedVideoIds]);

  const value = {
    videos,
    allTags,
    isLoading,
    hasMore,
    totalVideos,
    searchVideos,
    filterByTags,
    clearCache,
    setVideoTypes,
    loadMoreRef,
    setAuthors,
    setLikedVideoIds,
    initSearch,
  };

  return (
    <VideoCacheContext.Provider value={value}>
      {children}
    </VideoCacheContext.Provider>
  );
}

export function useVideoCache() {
  const context = useContext(VideoCacheContext);
  if (context === undefined) {
    throw new Error('useVideoCache must be used within a VideoCacheProvider');
  }
  return context;
} 