import { type ReactNode } from 'react'
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
 * Video player is always rendered in the same DOM position to prevent remounting
 * when toggling cinema mode (which would interrupt playback).
 *
 * Normal mode (desktop): two-column grid with video/info on left, sidebar on right
 * Cinema mode: full-width video, info and sidebar below in row
 * Mobile: single column stacked layout
 */
export function VideoPageLayout({
  cinemaMode,
  videoPlayer,
  videoInfo,
  sidebar,
}: VideoPageLayoutProps) {
  return (
    <div className={cn('pb-8', !cinemaMode && 'max-w-560 mx-auto sm:py-4 md:px-4')}>
      {/* CSS Grid layout: single column on mobile, two columns on desktop (normal mode only) */}
      <div
        className={cn('grid grid-cols-1 gap-0', !cinemaMode && 'lg:grid-cols-[1fr_384px] lg:gap-2')}
      >
        {/* Left column: video player + info together */}
        <div className={cn('flex flex-col', cinemaMode && 'col-span-full')}>
          {videoPlayer}
          <div className="mt-4">{videoInfo}</div>
        </div>

        {/* Right column: sidebar */}
        <div
          className={cn(
            'w-full p-2 md:p-0 space-y-4',
            !cinemaMode && 'lg:col-start-2 lg:row-start-1',
            cinemaMode && 'max-w-560 mx-auto'
          )}
        >
          {sidebar}
        </div>
      </div>
    </div>
  )
}
