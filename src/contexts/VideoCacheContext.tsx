import { useReportedPubkeys } from "@/hooks/useReportedPubkeys";
import { VideoEvent } from "@/utils/video-event";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useInView } from "react-intersection-observer";

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
  setVideoType: (type: "all" | "shorts" | "videos") => void;
  loadMoreRef: (node?: Element | null) => void;
  setLikedVideoIds: (ids: string[]) => void;
  initSearch: (relays: string[]) => void;
  /** Public keys of followed authors */
  followedPubkeys: string[];
  likedVideoIds: string[];
  /** Set the public keys of followed authors */
  setFollowedPubkeys: (pubkeys: string[]) => void;
  isWorkerReady: boolean;
}

const VideoCacheContext = createContext<VideoCacheContextType | undefined>(
  undefined
);

export function VideoCacheProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workerRef = useRef<Worker | null>(null);
  const [videos, setVideos] = useState<VideoCache[]>([]);
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
    rootMargin: "200px",
  });

  const blockedPubkeys = useReportedPubkeys();

  useEffect(() => {
    // Initialize worker
    const worker = new Worker(
      new URL("../workers/videoCacheWorker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    // Set up message handler
    worker.onmessage = (e) => {
      const { type, results, tags, count, hasMore } = e.data;

      switch (type) {
        case "SEARCH_RESULTS":
          setVideos(results);
          break;
        case "ALL_TAGS":
          setAllTags(tags);
          break;
        case "LOAD_PROGRESS":
          setTotalVideos(count);
          setHasMore(hasMore);
          setAllTags(tags);
          setIsLoading(false);
          break;
        case "LOAD_COMPLETE":
          setTotalVideos(count);
          //setHasMore(false);
          setIsLoading(false);
          break;
        case "WORKER_READY": 
          setIsWorkerReady(true);
      }
    };

    return () => {
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (workerRef.current && blockedPubkeys) {
      workerRef.current.postMessage({ type: "SET_BLOCKED_PUBKEYS", data: blockedPubkeys });
    }
  }, [blockedPubkeys]);

  // Handle infinite loading
  useEffect(() => {
    if (inView && !isLoading && hasMore) {
      workerRef.current?.postMessage({ type: "LOAD_MORE" });
    }
  }, [inView, isLoading, hasMore]);

  const searchVideos = useCallback((query: string) => {
    workerRef.current?.postMessage({
      type: "SEARCH",
      data: query,
    });
  }, []);

  const filterByTags = useCallback((tags: string[]) => {
    workerRef.current?.postMessage({
      type: "FILTER_TAGS",
      data: tags,
    });
  }, []);

  const clearCache = useCallback(() => {
    workerRef.current?.postMessage({ type: "CLEAR_CACHE" });
  }, []);

  const setVideoType = useCallback((type: "all" | "shorts" | "videos") => {
    workerRef.current?.postMessage({
      type: "SET_VIDEO_TYPE",
      data: type,
    });
  }, []);

  const setFollowedPubkeys = useCallback((pubkeys: string[]) => {
    workerRef.current?.postMessage({
      type: "SET_FOLLOWED_PUBKEYS",
      data: pubkeys,
    });
    setFollowedPubkeysState(pubkeys);
  }, []);

  const setLikedVideoIds = useCallback((ids: string[]) => {
    workerRef.current?.postMessage({
      type: "SET_LIKED_VIDEO_IDS",
      data: ids,
    });
    setLikedVideoIdsState(ids);
  }, []);

  const initSearch = useCallback((relays: string[]) => {
    console.log(" initSearch ", relays);

    workerRef.current?.postMessage({
      type: "INIT",
      data: {
        relayUrls: relays,
      },
    });
  }, []);

  const value = {
    videos,
    setVideos,
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
    throw new Error("useVideoCache must be used within a VideoCacheProvider");
  }
  return context;
}
