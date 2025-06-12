import { VideoEvent } from '@/utils/video-event';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';

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
}

const VideoCacheContext = createContext<VideoCacheContextType | undefined>(undefined);

export function VideoCacheProvider({ children }: { children: React.ReactNode }) {
  const worker = useRef<Worker>();
  const [videos, setVideos] = useState<VideoCache[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalVideos, setTotalVideos] = useState(0);

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

    // Start initial load
    worker.current.postMessage({
      type: 'INIT',
      data: {
        relayUrls: [
          'wss://relay.nostr.band',
          'wss://nos.lol',
          'wss://relay.damus.io',

        ],
      },
    });

    return () => {
      worker.current?.terminate();
    };
  }, []);

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