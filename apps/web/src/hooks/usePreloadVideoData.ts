import { useEffect } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useAppContext } from './useAppContext'
import { loadInteractions } from '@/nostr/interaction-loader'

interface UsePreloadVideoDataOptions {
  videoId?: string
  videoAddress?: string
  authorPubkey?: string
  kind?: number
  relays: string[]
  enabled: boolean
}

/** Preload comments and reactions together; nearby slides and statistics share the same read. */
export function usePreloadVideoData({
  videoId,
  videoAddress,
  relays,
  enabled,
}: UsePreloadVideoDataOptions) {
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const relaysKey = JSON.stringify([...new Set(relays)].sort())
  useEffect(() => {
    if (!enabled || (!videoId && !videoAddress)) return
    void loadInteractions(pool, eventStore, JSON.parse(relaysKey), {
      eventIds: videoId ? [videoId] : [],
      address: videoAddress,
    }).catch(error => console.error('Error preloading video data:', error))
  }, [videoId, videoAddress, relaysKey, enabled, eventStore, pool])
}
