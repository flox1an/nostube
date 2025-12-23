import { createContext, useContext, useState, useCallback } from 'react'
import { type VideoEvent } from '@/utils/video-event'

interface VideoCacheContextType {
  videos: VideoEvent[]
  allTags: string[]
  isLoading: boolean
  hasMore: boolean
  totalVideos: number
  searchVideos: (query: string) => void
  filterByTags: (tags: string[]) => void
  clearCache: () => void
  setVideoType: (type: 'all' | 'shorts' | 'videos') => void
  loadMoreRef: (node?: Element | null) => void
  setLikedVideoIds: (ids: string[]) => void
  initSearch: (relays: string[]) => void
  /** Public keys of followed authors */
  followedPubkeys: string[]
  likedVideoIds: string[]
  /** Set the public keys of followed authors */
  setFollowedPubkeys: (pubkeys: string[]) => void
  isWorkerReady: boolean
  /** Get video observable with fallback to loader */
  getVideoObservable: (id: string) => unknown
}

const VideoCacheContext = createContext<VideoCacheContextType | undefined>(undefined)

export function VideoCacheProvider({ children }: { children: React.ReactNode }) {
  const [videos, setVideos] = useState<VideoEvent[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [isLoading, _setIsLoading] = useState(false)
  const [hasMore, _setHasMore] = useState(true)
  const [totalVideos, _setTotalVideos] = useState(0)
  const [followedPubkeys, setFollowedPubkeysState] = useState<string[]>([])
  const [likedVideoIds, setLikedVideoIdsState] = useState<string[]>([])
  const [isWorkerReady, _setIsWorkerReady] = useState(true)

  const searchVideos = useCallback((_query: string) => {
    // Implementation would go here
  }, [])

  const filterByTags = useCallback((_tags: string[]) => {
    // Implementation would go here
  }, [])

  const clearCache = useCallback(() => {
    setVideos([])
    setAllTags([])
  }, [])

  const setVideoType = useCallback((_type: 'all' | 'shorts' | 'videos') => {
    // Implementation would go here
  }, [])

  const setFollowedPubkeys = useCallback((pubkeys: string[]) => {
    setFollowedPubkeysState(pubkeys)
  }, [])

  const setLikedVideoIds = useCallback((ids: string[]) => {
    setLikedVideoIdsState(ids)
  }, [])

  const initSearch = useCallback((_relays: string[]) => {
    // Initialize search with relays
  }, [])

  const loadMoreRef = useCallback((_node?: Element | null) => {
    // Implementation would go here
  }, [])

  const getVideoObservable = useCallback((_id: string) => {
    // Implementation would go here
    return null
  }, [])

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
  }

  return <VideoCacheContext.Provider value={value}>{children}</VideoCacheContext.Provider>
}

export function useVideoCache() {
  const context = useContext(VideoCacheContext)
  if (context === undefined) {
    throw new Error('useVideoCache must be used within a VideoCacheProvider')
  }
  return context
}
