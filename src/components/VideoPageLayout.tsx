import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useIsMobile, useIsPortrait } from '@/hooks'

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
 * On tablet/desktop or landscape: normal scrolling layout with video in left column
 */
export function VideoPageLayout({
  cinemaMode,
  videoPlayer,
  videoInfo,
  sidebar,
}: VideoPageLayoutProps) {
  const isMobile = useIsMobile()
  const isPortrait = useIsPortrait()

  // Sticky behavior only applies in mobile portrait mode
  const useStickyPlayer = isMobile && isPortrait

  // Track when the sticky player is "stuck" to add drop shadow
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    if (!useStickyPlayer || cinemaMode) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    // IntersectionObserver detects when the sentinel (placed just above sticky element)
    // leaves the viewport, meaning the sticky element is now "stuck" to the top
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [useStickyPlayer, cinemaMode])

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
      {/* Mobile portrait: sticky video player at top level so it can stick while ALL content scrolls */}
      {useStickyPlayer && (
        <>
          {/* Sentinel element to detect when sticky player becomes "stuck" */}
          <div ref={sentinelRef} className="h-0" />
          {/* Fixed background to cover notch area when header hides and video is stuck */}
          <div
            className="fixed top-0 left-0 right-0 z-[59] bg-background"
            style={{ height: 'env(safe-area-inset-top, 0)' }}
          />
          {/* Video sticks just below the notch, gets shadow when stuck */}
          <div
            className={`sticky z-[60] bg-background transition-shadow duration-200 ${
              isStuck ? 'shadow-lg' : ''
            }`}
            style={{ top: 'env(safe-area-inset-top, 0)' }}
          >
            {videoPlayer}
          </div>
        </>
      )}

      <div className="flex gap-0 md:gap-4 md:px-4 flex-col lg:flex-row">
        {/* Desktop/landscape: video player inside the flex column */}
        <div className="flex-1">
          {!useStickyPlayer && videoPlayer}
          {videoInfo}
        </div>

        {/* Sidebar/suggestions */}
        <div className="w-full lg:w-96 p-2 md:p-0 space-y-4">{sidebar}</div>
      </div>
    </div>
  )
}
