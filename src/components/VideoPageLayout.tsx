import { type ReactNode } from 'react'
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
      {/* top: env(safe-area-inset-top) makes it stick at the safe area boundary (below iOS notch) */}
      {isMobile && (
        <div
          className="sticky z-[60] bg-background"
          style={{ top: 'env(safe-area-inset-top, 0)' }}
        >
          {videoPlayer}
        </div>
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
