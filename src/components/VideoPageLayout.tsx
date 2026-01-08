import { type ReactNode } from 'react'

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

  // Normal mode with sticky video on mobile
  return (
    <div className="max-w-560 mx-auto sm:py-4 pb-8">
      {/* Mobile: sticky video player at top level so it can stick while ALL content scrolls */}
      <div className="md:hidden sticky top-0 z-20 bg-background">{videoPlayer}</div>

      <div className="flex gap-0 md:gap-4 md:px-4 flex-col lg:flex-row">
        {/* Desktop: video player inside the flex column */}
        <div className="flex-1">
          <div className="hidden md:block">{videoPlayer}</div>
          {videoInfo}
        </div>

        {/* Sidebar/suggestions */}
        <div className="w-full lg:w-96 p-2 md:p-0 space-y-4">{sidebar}</div>
      </div>
    </div>
  )
}
