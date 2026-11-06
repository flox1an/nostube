import { useEventStore, use$ } from 'applesauce-react/hooks'
import { map } from 'rxjs/operators'
import type { Filter } from 'nostr-tools'

interface UseCommentCountOptions {
  videoId: string
  videoAddress?: string
}

/**
 * Hook to count comments for a video event.
 * Returns the total count of comments (kind 1 and kind 1111).
 */
export function useCommentCount({ videoId, videoAddress }: UseCommentCountOptions) {
  const eventStore = useEventStore()

  // Subscribe to timeline and count comments (kind 1 and kind 1111)
  const count =
    use$(() => {
      const filters: Filter[] = [
        { kinds: [1], '#e': [videoId] },
        { kinds: [1111], '#E': [videoId] },
      ]
      if (videoAddress)
        filters.push({ kinds: [1], '#a': [videoAddress] }, { kinds: [1111], '#A': [videoAddress] })
      return eventStore.timeline(filters).pipe(map(events => events.length))
    }, [eventStore, videoId, videoAddress]) ?? 0

  return count
}
