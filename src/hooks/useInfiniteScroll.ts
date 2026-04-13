import { useEffect } from 'react'
import { useInView } from 'react-intersection-observer'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  loading: boolean
  exhausted: boolean
  /** When true, a relay subscription is still open even if loading=false (early-complete).
   *  Prevents re-triggering loadMore during that window. */
  subscriptionActive?: boolean
  threshold?: number
  rootMargin?: string
}

/**
 * Hook for infinite scroll functionality
 * Triggers onLoadMore when the trigger element comes into view
 *
 * Performance optimized:
 * - Reduced rootMargin to 400px (from 800px) to minimize IntersectionObserver calculations
 * - Added triggerOnce: false to properly handle repeated scroll events
 */
export function useInfiniteScroll({
  onLoadMore,
  loading,
  exhausted,
  subscriptionActive = false,
  threshold = 0,
  rootMargin = '0px 0px 400px 0px',
}: UseInfiniteScrollOptions) {
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: false,
  })

  useEffect(() => {
    if (inView && !exhausted && !loading && !subscriptionActive) {
      onLoadMore()
    }
  }, [inView, exhausted, loading, subscriptionActive, onLoadMore])

  return { ref, inView }
}
