import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Scroll position per history entry, keyed by react-router's location.key.
// Going back (POP) restores where the user was instead of resetting to the
// top like a fresh push navigation does.
// ponytail: unbounded for the session's lifetime; fine at this scale, add an
// LRU cap if a session ever visits thousands of distinct routes.
const scrollPositions = new Map<string, number>()

export function ScrollToTop() {
  const location = useLocation()
  const navigationType = useNavigationType()

  useLayoutEffect(() => {
    const key = location.key
    window.scrollTo(0, navigationType === 'POP' ? (scrollPositions.get(key) ?? 0) : 0)

    return () => {
      scrollPositions.set(key, window.scrollY)
    }
  }, [location.key, navigationType])

  return null
}
