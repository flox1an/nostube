import { useEffect, useState } from 'react'

export function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    // Debounced resize handler to avoid excessive re-renders
    let resizeTimeout: ReturnType<typeof setTimeout>
    function handleResize() {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => setWidth(window.innerWidth), 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(resizeTimeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return width
}
