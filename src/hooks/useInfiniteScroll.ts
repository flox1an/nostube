import { useEffect } from 'react'
import { useInView } from 'react-intersection-observer'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  loading: boolean
  exhausted: boolean
  threshold?: number
  rootMargin?: string
}

/**
 * Hook for infinite scroll functionality
 * Triggers onLoadMore when the trigger element comes into view
 */
export function useInfiniteScroll({
  onLoadMore,
  loading,
  exhausted,
  threshold = 0,
  rootMargin = '0px 0px 800px 0px',
}: UseInfiniteScrollOptions) {
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
  })

  useEffect(() => {
    if (inView && !exhausted && !loading) {
      onLoadMore()
    }
  }, [inView, exhausted, loading, onLoadMore])

  return { ref, inView }
}
