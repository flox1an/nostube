import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useIsMobile, useIsPortrait } from '@/hooks'
import { cn } from '@/lib/utils'

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
    if (!useStickyPlayer) {
      setIsStuck(false)
      return
    }

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [useStickyPlayer])

  // Stable DOM structure to prevent VideoPlayer and Sidebar remounting
  // Uses a single grid where item positions shift based on mode
  return (
    <div className="w-full pb-8">
      {/* Sentinel element to detect when sticky player becomes "stuck" */}
      <div ref={sentinelRef} className="h-0" />

      {/* Fixed background to cover notch area when header hides and video is stuck */}
      {useStickyPlayer && (
        <div
          className="fixed top-0 left-0 right-0 z-[59] bg-background"
          style={{ height: 'env(safe-area-inset-top, 0)' }}
        />
      )}

      {/* 
        Main layout grid:
        - Mobile: Single column, natural stack.
        - Desktop Normal: 2 columns (1fr, 384px) with max-width.
        - Desktop Cinema: Full width, stacked (via grid-cols-1).
      */}
      <div
        className={cn(
          'grid grid-cols-1 mx-auto transition-all duration-300',
          !cinemaMode
            ? 'max-w-560 lg:grid-cols-[1fr_384px] lg:grid-rows-[min-content_1fr] lg:gap-4 lg:px-4 lg:pt-4'
            : 'w-full'
        )}
      >
        {/* 1. Video Player - Stays in Row 1 Col 1 (or span all) */}
        <div
          className={cn(
            'transition-shadow duration-200 min-w-0 self-start',
            useStickyPlayer ? 'sticky z-[60] bg-background' : 'relative',
            isStuck && 'shadow-lg',
            cinemaMode && 'lg:col-span-1' // In cinema mode grid is 1-col anyway
          )}
          style={useStickyPlayer ? { top: 'env(safe-area-inset-top, 0)' } : undefined}
        >
          {videoPlayer}
        </div>

        {/* 2. Video Info - Stays below player */}
        <div className={cn('min-w-0 self-start', cinemaMode && 'max-w-560 mx-auto w-full px-0 md:px-4 mt-4')}>
          {videoInfo}
        </div>

        {/* 3. Sidebar (Suggestions/Playlist) */}
        {/* In Normal mode: Pushed to column 2, spans both rows */}
        {/* In Cinema mode: Stacked below info, centered */}
        <div
          className={cn(
            'space-y-4 self-start',
            cinemaMode
              ? 'max-w-560 mx-auto w-full px-2 md:px-4 mt-4'
              : 'p-2 md:p-0 lg:row-start-1 lg:row-span-2 lg:col-start-2'
          )}
        >
          {sidebar}
        </div>
      </div>
    </div>
  )
}
