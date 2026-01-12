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

  // Normal mode - uses CSS grid on desktop to position video+info in left column, sidebar in right
  // Video player is always rendered once to prevent remounting on orientation change
  // Mobile portrait: video is sticky at top, content stacks below
  // Desktop (lg): two-column grid layout with video/info on left, sidebar on right
  return (
    <div className="max-w-560 mx-auto sm:py-4 pb-8 md:px-4">
      {/* Sentinel element to detect when sticky player becomes "stuck" (only used in mobile portrait) */}
      <div ref={sentinelRef} className="h-0" />

      {/* Fixed background to cover notch area when header hides and video is stuck (mobile portrait only) */}
      {useStickyPlayer && (
        <div
          className="fixed top-0 left-0 right-0 z-[59] bg-background"
          style={{ height: 'env(safe-area-inset-top, 0)' }}
        />
      )}

      {/* Grid layout: stacked on mobile, two columns on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_384px] gap-0 lg:gap-4">
        {/* Left column: video + info */}
        <div className="flex flex-col">
          {/* Video player container - sticky on mobile portrait, normal flow otherwise */}
          <div
            className={
              useStickyPlayer
                ? `sticky z-[60] bg-background transition-shadow duration-200 ${isStuck ? 'shadow-lg' : ''}`
                : ''
            }
            style={useStickyPlayer ? { top: 'env(safe-area-inset-top, 0)' } : undefined}
          >
            {videoPlayer}
          </div>
          {videoInfo}
        </div>

        {/* Right column: sidebar/suggestions */}
        <div className="w-full p-2 md:p-0 space-y-4">{sidebar}</div>
      </div>
    </div>
  )
}
