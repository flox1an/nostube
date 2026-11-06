import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Scroll position per history entry, keyed by react-router's location.key.
// Going back (POP) restores where the user was instead of resetting to the
// top like a fresh push navigation does.
// ponytail: unbounded for the session's lifetime; fine at this scale, add an
// LRU cap if a session ever visits thousands of distinct routes.
const scrollPositions = new Map<string, number>()

/** Longest wait for a restored page's content (store feeds, grid rows) to grow tall enough. */
const RESTORE_TIMEOUT_MS = 10_000

/** Input that means the user is scrolling themselves; restoration must not fight it. */
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

export function ScrollToTop() {
  const location = useLocation()
  const navigationType = useNavigationType()

  useLayoutEffect(() => {
    const key = location.key
    const target = navigationType === 'POP' ? (scrollPositions.get(key) ?? 0) : 0
    window.scrollTo(0, target)

    // A remounted page usually renders shorter than it was (feeds re-emit from
    // the event store after a tick, virtualized grids start from estimates), so
    // the first scroll gets clamped. Re-apply it whenever the page grows until
    // it lands, the user scrolls, or the content never arrives.
    let stopRestoring = () => {}
    if (window.scrollY < target - 1) {
      const observer = new ResizeObserver(() => {
        window.scrollTo(0, target)
        // The native scroll event only arrives next frame. Virtualized grids
        // that measure rows in between would correct from the stale clamped
        // offset and scroll back up, so let listeners read the new offset now.
        window.dispatchEvent(new Event('scroll'))
        if (window.scrollY >= target - 1) stopRestoring()
      })
      const timeout = setTimeout(() => stopRestoring(), RESTORE_TIMEOUT_MS)
      stopRestoring = () => {
        observer.disconnect()
        clearTimeout(timeout)
        USER_SCROLL_EVENTS.forEach(type => window.removeEventListener(type, stopRestoring))
      }
      observer.observe(document.body)
      USER_SCROLL_EVENTS.forEach(type =>
        window.addEventListener(type, stopRestoring, { passive: true })
      )
    }

    return () => {
      stopRestoring()
      scrollPositions.set(key, window.scrollY)
    }
  }, [location.key, navigationType])

  return null
}
