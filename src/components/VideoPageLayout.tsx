import { ReactNode } from 'react'

interface VideoPageLayoutProps {
  cinemaMode: boolean
  videoPlayer: ReactNode
  videoInfo: ReactNode
  sidebar: ReactNode
}

/**
 * Layout component for the video page
 * Handles cinema mode vs normal mode layout
 */
export function VideoPageLayout({
  cinemaMode,
  videoPlayer,
  videoInfo,
  sidebar,
}: VideoPageLayoutProps) {
  return (
    <div className={cinemaMode ? 'pb-8' : 'max-w-[140rem] mx-auto sm:py-4 pb-8'}>
      <div className={cinemaMode ? 'flex flex-col' : 'flex gap-6 md:px-6 flex-col lg:flex-row'}>
        {/* Video player container - always rendered in same position */}
        <div className={cinemaMode ? '' : 'flex-1'}>
          {videoPlayer}
          {!cinemaMode && videoInfo}
        </div>

        {/* Sidebar/Bottom content */}
        {cinemaMode ? (
          <div className="w-full max-w-[140rem] mx-auto">
            <div className="flex gap-6 md:px-6 flex-col lg:flex-row">
              <div className="flex-1">{videoInfo}</div>
              <div className="w-full lg:w-96 p-2 md:p-0 space-y-4 mt-4">{sidebar}</div>
            </div>
          </div>
        ) : (
          <div className="w-full lg:w-96 p-2 md:p-0 space-y-4">{sidebar}</div>
        )}
      </div>
    </div>
  )
}
