import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';

interface VideoCache {
  id: string;
  identifier: string;
  title: string;
  description: string;
  thumb: string;
  pubkey: string;
  created_at: number;
  duration: number;
  tags: string[];
  searchText: string;
}

interface LoadProgress {
  count: number;
  hasMore: boolean;
  tags: string[];
}

export function useVideoCache() {
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
          setHasMore(false);
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
          'wss://haven.slidestr.net'
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

  const searchVideos = (query: string) => {
    worker.current?.postMessage({
      type: 'SEARCH',
      data: query,
    });
  };

  const filterByTags = (tags: string[]) => {
    worker.current?.postMessage({
      type: 'FILTER_TAGS',
      data: tags,
    });
  };

  const clearCache = () => {
    worker.current?.postMessage({ type: 'CLEAR_CACHE' });
  };

  return {
    videos,
    allTags,
    isLoading,
    hasMore,
    totalVideos,
    searchVideos,
    filterByTags,
    clearCache,
    loadMoreRef,
  };
}