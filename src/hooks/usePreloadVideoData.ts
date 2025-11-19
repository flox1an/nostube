import { useEffect } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

interface UsePreloadVideoDataOptions {
  videoId: string
  authorPubkey: string
  kind: number
  relays: string[]
  enabled: boolean
}

/**
 * Hook to preload reactions and comments for a video.
 * Combines filters into a single REQ for efficiency.
 * Adds all events to EventStore for instant availability.
 */
export function usePreloadVideoData({
  videoId,
  authorPubkey,
  kind,
  relays,
  enabled,
}: UsePreloadVideoDataOptions) {
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  useEffect(() => {
    if (!enabled || !videoId || relays.length === 0) {
      return
    }

    // Combine reactions and comments filters into one request
    const filters = [
      // Reactions (kind 7) and regular comments (kind 1) with #e tag
      {
        kinds: [1, 7],
        '#e': [videoId],
        limit: 100,
      },
      // Video comments (kind 1111) with #E tag
      {
        kinds: [1111],
        '#E': [videoId],
        limit: 100,
      },
    ]

    // Load reactions and comments from relays
    const loader = createTimelineLoader(pool, relays, filters, {
      eventStore,
      limit: 100,
    })

    const subscription = loader().subscribe({
      next: event => {
        // Events are automatically added to EventStore by the loader
        eventStore.add(event)
      },
      error: err => {
        console.error('Error preloading video data:', err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [videoId, authorPubkey, kind, relays, enabled, eventStore, pool])
}
