import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useCommentHighlight() {
  const location = useLocation()

  useEffect(() => {
    const hash = location.hash
    if (!hash.startsWith('#comment-')) return

    const commentId = hash.replace('#comment-', '')
    const element = document.getElementById(`comment-${commentId}`)

    if (!element) return

    // Scroll to comment
    setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Add highlight animation
      element.classList.add('highlight-comment')

      // Remove after animation completes
      setTimeout(() => {
        element.classList.remove('highlight-comment')
      }, 3000)
    }, 100)
  }, [location.hash])
}
