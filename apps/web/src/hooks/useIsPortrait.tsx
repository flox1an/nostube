import * as React from 'react'

/**
 * Detects if the current viewport is in portrait orientation.
 * Returns true when height > width.
 */
export function useIsPortrait() {
  const [isPortrait, setIsPortrait] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.innerHeight > window.innerWidth
  })

  React.useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }

    // Check on mount
    checkOrientation()

    // Listen for orientation/resize changes
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  return isPortrait
}
