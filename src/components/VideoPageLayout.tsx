import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ArrowLeft, PanelRight } from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { DesktopPlayerShell } from '@/desktop/DesktopPlayerShell'

interface VideoPageLayoutProps {
  cinemaMode: boolean
  videoPlayer: ReactNode
  videoInfo: ReactNode
  sidebar: ReactNode
  playerTitle?: string
  comments?: ReactNode
  playlistLabel?: 'Playlist' | 'Suggestions'
  desktop?: boolean
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
  comments,
  playerTitle,
  playlistLabel = 'Suggestions',
  desktop = false,
}: VideoPageLayoutProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Only real in-app history (idx > 0) can be popped back into; a
  // direct-linked/refreshed video has none, so fall back to Home.
  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }
  if (desktop) {
    return (
      <DesktopPlayerShell
        comments={comments ?? videoInfo}
        details={videoInfo}
        player={videoPlayer}
        playlist={sidebar}
        playerTitle={playerTitle}
        playlistLabel={playlistLabel}
      />
    )
  }

  return (
    <div className={cn('pb-8', !cinemaMode && 'max-w-560 mx-auto sm:py-2 md:px-4')}>
      {/* CSS Grid layout: single column on mobile/lg, two columns on xl+ (normal mode only) */}
      <div
        className={cn(
          'grid grid-cols-1 gap-0',
          !cinemaMode && 'xl:grid-cols-[1fr_384px] 2xl:grid-cols-[1fr_480px] xl:gap-4'
        )}
      >
        {/* Left column: video player + info together */}
        <div className={cn('flex flex-col', cinemaMode && 'col-span-full')}>
          <Button
            variant="ghost"
            size="sm"
            className="self-start -ml-2 mb-1 text-muted-foreground"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('video.back', 'Back')}
          </Button>
          {videoPlayer}
          <div className={cn('pt-2 md:pt-3', cinemaMode && 'p-2 lg:px-4 w-full max-w-560 mx-auto')}>
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
        <SheetContent side="right" className="w-100 overflow-y-auto p-4">
          <VisuallyHidden>
            <SheetTitle>{t('video.suggestions', 'Suggestions')}</SheetTitle>
          </VisuallyHidden>
          <div className="space-y-4 pt-4">{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
