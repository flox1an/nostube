import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Detects if the current device is a mobile device using multiple signals:
 * 1. User agent string (most reliable for actual mobile devices)
 * 2. Touch capability with coarse pointer (tablets/phones vs touchscreen laptops)
 * 3. Screen width as fallback
 */
function getIsMobile() {
  if (typeof window === 'undefined') return false

  // Check user agent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase()
  const mobileKeywords = [
    'android',
    'webos',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
    'opera mini',
    'mobile',
  ]
  const isMobileUserAgent = mobileKeywords.some(keyword => userAgent.includes(keyword))

  // Check for touch capability with coarse pointer (excludes touchscreen laptops)
  const isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches

  // Screen width check as additional signal
  const isNarrowScreen = window.innerWidth < MOBILE_BREAKPOINT

  // Consider mobile if: mobile user agent OR (touch device AND narrow screen)
  return isMobileUserAgent || (isTouchDevice && isNarrowScreen)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile)

  React.useEffect(() => {
    // Re-check on mount (handles SSR hydration)
    setIsMobile(getIsMobile())

    // Listen for screen size changes (device rotation, etc.)
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(getIsMobile())
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
