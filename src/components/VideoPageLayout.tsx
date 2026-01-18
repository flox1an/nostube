import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { PanelRight } from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useTranslation } from 'react-i18next'

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
 * Layout behavior:
 * - xl+ screens (1280px+): two-column grid with video/info on left, sidebar on right
 * - lg to xl (1024-1280px): full-width video, sidebar as sheet overlay (toggle button)
 * - Mobile/tablet (< lg): single column stacked layout
 * - Cinema mode: full-width video, info and sidebar below
 */
export function VideoPageLayout({
  cinemaMode,
  videoPlayer,
  videoInfo,
  sidebar,
}: VideoPageLayoutProps) {
  const { t } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={cn('pb-8', !cinemaMode && 'max-w-560 mx-auto sm:py-4 md:px-4')}>
      {/* CSS Grid layout: single column on mobile/lg, two columns on xl+ (normal mode only) */}
      <div
        className={cn('grid grid-cols-1 gap-0', !cinemaMode && 'xl:grid-cols-[1fr_384px] xl:gap-4')}
      >
        {/* Left column: video player + info together */}
        <div className={cn('flex flex-col', cinemaMode && 'col-span-full')}>
          {videoPlayer}
          <div className={cn('pt-2', cinemaMode && 'p-2 lg:px-4 w-full max-w-560 mx-auto')}>
            {videoInfo}
          </div>
        </div>

        {/* Right column: sidebar - hidden on lg-xl screens in favor of sheet */}
        <div
          className={cn(
            'w-full p-2 md:p-0 space-y-4',
            // Hide on lg-xl screens where we use sheet overlay instead
            !cinemaMode && 'lg:hidden xl:block',
            !cinemaMode && 'xl:col-start-2 xl:row-start-1',
            cinemaMode && 'max-w-560 mx-auto lg:px-4'
          )}
        >
          {sidebar}
        </div>
      </div>

      {/* Floating sidebar toggle button - only visible on lg-xl screens when not in cinema mode */}
      {!cinemaMode && (
        <Button
          variant="secondary"
          size="icon"
          className="fixed bottom-4 right-4 z-50 hidden lg:flex xl:hidden shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label={t('video.suggestions', 'Show suggestions')}
        >
          <PanelRight className="h-5 w-5" />
        </Button>
      )}

      {/* Sheet overlay for sidebar on lg-xl screens */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="right" className="w-[400px] overflow-y-auto p-4">
          <VisuallyHidden>
            <SheetTitle>{t('video.suggestions', 'Suggestions')}</SheetTitle>
          </VisuallyHidden>
          <div className="space-y-4 pt-4">{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
