import { useEventStore, use$ } from 'applesauce-react/hooks'
import { map } from 'rxjs/operators'

interface UseCommentCountOptions {
  videoId: string
}

/**
 * Hook to count comments for a video event.
 * Returns the total count of comments (kind 1 and kind 1111).
 */
export function useCommentCount({ videoId }: UseCommentCountOptions) {
  const eventStore = useEventStore()

  // Subscribe to timeline and count comments (kind 1 and kind 1111)
  const count =
    use$(
      () =>
        eventStore
          .timeline([
            { kinds: [1], '#e': [videoId] },
            { kinds: [1111], '#E': [videoId] },
          ])
          .pipe(map(events => events.length)),
      [eventStore, videoId]
    ) ?? 0

  return count
}
