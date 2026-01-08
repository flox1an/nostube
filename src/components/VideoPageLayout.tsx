import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks'

interface VideoPageLayoutProps {
  cinemaMode: boolean
  videoPlayer: ReactNode
  videoInfo: ReactNode
  sidebar: ReactNode
}

/**
 * Layout component for the video page
 * Handles cinema mode vs normal mode layout
 *
 * On mobile portrait: video player sticks to top while scrolling through content
 * On tablet/desktop: normal scrolling layout with video in left column
 */
export function VideoPageLayout({
  cinemaMode,
  videoPlayer,
  videoInfo,
  sidebar,
}: VideoPageLayoutProps) {
  const isMobile = useIsMobile()

  // Track when the sticky player is actually "stuck" to add safe-area padding only when needed
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    if (!isMobile || cinemaMode) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    // IntersectionObserver detects when the sentinel (placed just above sticky element)
    // leaves the viewport, meaning the sticky element is now "stuck" to the top
    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is not intersecting (scrolled past), the player is stuck
        setIsStuck(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isMobile, cinemaMode])

  if (cinemaMode) {
    return (
      <div className="pb-8">
        <div className="flex flex-col">
          <div>{videoPlayer}</div>
          <div className="w-full max-w-560 mx-auto">
            <div className="flex gap-0 md:gap-4 md:px-4 flex-col lg:flex-row">
              <div className="flex-1">{videoInfo}</div>
              <div className="w-full lg:w-96 p-2 md:p-0 space-y-4 mt-4">{sidebar}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Normal mode - use JS-based conditional rendering to avoid mounting two video players
  // (CSS hiding would mount both, causing double audio playback)
  return (
    <div className="max-w-560 mx-auto sm:py-4 pb-8">
      {/* Mobile: sticky video player at top level so it can stick while ALL content scrolls */}
      {isMobile && (
        <>
          {/* Sentinel element to detect when sticky player becomes "stuck" */}
          <div ref={sentinelRef} className="h-0" />
          {/* pt-[env(safe-area-inset-top)] adds padding for iOS notch only when stuck under status bar */}
          <div
            className="sticky top-0 z-[60] bg-background transition-[padding] duration-150"
            style={{ paddingTop: isStuck ? 'env(safe-area-inset-top, 0)' : '0' }}
          >
            {videoPlayer}
          </div>
        </>
      )}

      <div className="flex gap-0 md:gap-4 md:px-4 flex-col lg:flex-row">
        {/* Desktop: video player inside the flex column */}
        <div className="flex-1">
          {!isMobile && videoPlayer}
          {videoInfo}
        </div>

        {/* Sidebar/suggestions */}
        <div className="w-full lg:w-96 p-2 md:p-0 space-y-4">{sidebar}</div>
      </div>
    </div>
  )
}
