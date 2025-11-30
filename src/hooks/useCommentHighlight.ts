import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useCommentHighlightStore } from '@/stores/commentHighlightStore'

export function useCommentHighlight() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const expandComments = useCommentHighlightStore(state => state.expandComments)
  const setHighlightedCommentId = useCommentHighlightStore(state => state.setHighlightedCommentId)
  const getAncestorIds = useCommentHighlightStore(state => state.getAncestorIds)

  useEffect(() => {
    // Check for comment in query parameter first, then fall back to hash
    const commentParam = searchParams.get('comment')
    const hash = location.hash

    let commentId: string | null = null

    if (commentParam) {
      commentId = commentParam
    } else if (hash.startsWith('#comment-')) {
      commentId = hash.replace('#comment-', '')
    }

    if (!commentId) return

    // Track all timeouts for cleanup
    const timeouts: NodeJS.Timeout[] = []
    let cancelled = false

    // Retry mechanism to wait for comment to be rendered
    let attempts = 0
    const maxAttempts = 20 // Try for up to 4 seconds (20 * 200ms)

    const tryScrollToComment = () => {
      if (cancelled) return

      // First, get the ancestor IDs from the comment data
      const ancestorIds = getAncestorIds(commentId)

      // Expand all ancestor comments first (so nested comments get rendered)
      if (ancestorIds.length > 0) {
        expandComments(ancestorIds)
      }

      // Now try to find the element in the DOM
      const element = document.getElementById(`comment-${commentId}`)

      if (!element) {
        attempts++
        if (attempts < maxAttempts) {
          // Comment not rendered yet, retry
          const retryTimer = setTimeout(tryScrollToComment, 200)
          timeouts.push(retryTimer)
        }
        return
      }

      // Wait for expansion animation, then scroll and highlight
      const scrollTimer = setTimeout(() => {
        if (cancelled) return

        element.scrollIntoView({ behavior: 'smooth', block: 'center' })

        // Set highlighted comment ID (React manages the class via Zustand)
        setHighlightedCommentId(commentId)
      }, 200)
      timeouts.push(scrollTimer)
    }

    // Start trying after a short initial delay
    const initialTimer = setTimeout(tryScrollToComment, 300)
    timeouts.push(initialTimer)

    return () => {
      cancelled = true
      timeouts.forEach(clearTimeout)
    }
  }, [location.hash, searchParams, expandComments, setHighlightedCommentId, getAncestorIds])
}
