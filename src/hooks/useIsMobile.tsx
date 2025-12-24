import * as React from 'react'

/**
 * Detects if the current device is a mobile device using multiple signals:
 * 1. User agent string (most reliable for actual mobile devices)
 * 2. Touch-primary device with no hover (phones/tablets, not touchscreen laptops)
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

  // Check for touch-primary device with no hover capability
  // This reliably detects phones/tablets while excluding touchscreen laptops
  // pointer: coarse = primary input is touch (not mouse)
  // hover: none = device cannot hover (no mouse)
  const isTouchPrimaryDevice = window.matchMedia('(pointer: coarse) and (hover: none)').matches

  return isMobileUserAgent || isTouchPrimaryDevice
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile)

  React.useEffect(() => {
    // Re-check on mount (handles SSR hydration)
    setIsMobile(getIsMobile())
  }, [])

  return isMobile
}
