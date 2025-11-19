import { useMemo } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
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

  // Filters to get all comments for this video
  const filters = useMemo(
    () => [
      {
        kinds: [1],
        '#e': [videoId],
      },
      {
        kinds: [1111],
        '#E': [videoId],
      },
    ],
    [videoId]
  )

  // Subscribe to timeline and count events
  const commentCount$ = useMemo(() => {
    return eventStore.timeline(filters).pipe(map(events => events.length))
  }, [eventStore, filters])

  const count = useObservableState(commentCount$, 0)

  return count
}
