import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useDesktopWindowCoordinator } from '@/desktop/useDesktopWindowCoordinator'
import { cn } from '@/lib/utils'
import { DesktopPlayerControlsContext } from './DesktopPlayerControlsContext'
import {
  DESKTOP_PLAYER_TITLEBAR_HEIGHT_CLASS,
  DESKTOP_TRAFFIC_LIGHT_SAFE_AREA_CLASS,
  DesktopWindowDragRegion,
} from './DesktopWindowChrome'

type InspectorTab = 'comments' | 'details' | 'playlist'

type DesktopPlayerShellProps = {
  comments: ReactNode
  details: ReactNode
  player: ReactNode
  playerTitle?: string
  playlist: ReactNode
  playlistLabel?: 'Playlist' | 'Suggestions'
}

const tabs = (
  playlistLabel: NonNullable<DesktopPlayerShellProps['playlistLabel']>
): Array<{ id: InspectorTab; label: string }> => [
  { id: 'details', label: 'Details' },
  { id: 'playlist', label: playlistLabel },
  { id: 'comments', label: 'Comments' },
]

export function DesktopPlayerShell({
  comments,
  details,
  player,
  playerTitle,
  playlist,
  playlistLabel = 'Suggestions',
}: DesktopPlayerShellProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('details')
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const desktopWindowCoordinator = useDesktopWindowCoordinator()
  const toggleInspector = useCallback(() => setIsInspectorOpen(open => !open), [])
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let unlistenResize: (() => void) | undefined
    let disposed = false
    const updateFullscreen = async () => {
      if (isTauri()) {
        setIsFullscreen(await getCurrentWindow().isFullscreen())
        return
      }
      setIsFullscreen(document.fullscreenElement !== null)
    }
    void updateFullscreen()
    document.addEventListener('fullscreenchange', updateFullscreen)
    if (isTauri()) {
      void getCurrentWindow()
        .onResized(() => void updateFullscreen())
        .then(unlisten => {
          if (disposed) unlisten()
          else unlistenResize = unlisten
        })
    }
    return () => {
      disposed = true
      document.removeEventListener('fullscreenchange', updateFullscreen)
      unlistenResize?.()
    }
  }, [])
  const content = { comments, details, playlist }

  return (
    <DesktopPlayerControlsContext.Provider value={{ isInspectorOpen, toggleInspector }}>
      <main
        className={cn(
          'relative grid h-dvh overflow-hidden bg-background transition-[grid-template-columns] duration-200',
          isInspectorOpen ? 'grid-cols-[minmax(0,1fr)_26rem]' : 'grid-cols-1'
        )}
      >
        <section aria-label="Video player" className="h-dvh min-w-0 bg-black" role="region">
          {player}
        </section>
        {!isFullscreen && (
          <header
            className={cn(
              'absolute left-0 top-0 z-30 flex items-center bg-background/80 pr-4 backdrop-blur-sm',
              DESKTOP_PLAYER_TITLEBAR_HEIGHT_CLASS,
              isInspectorOpen ? 'right-104' : 'right-0'
            )}
          >
            <DesktopWindowDragRegion
              className={cn('h-full shrink-0', DESKTOP_TRAFFIC_LIGHT_SAFE_AREA_CLASS)}
            />
            <Button asChild className="shrink-0" size="sm" variant="ghost">
              <a
                href="/"
                onClick={event => {
                  if (desktopWindowCoordinator) {
                    event.preventDefault()
                    void desktopWindowCoordinator.focusMain()
                  }
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to library
              </a>
            </Button>
            <DesktopWindowDragRegion className="min-w-0 flex-1 px-4">
              <p className="truncate text-sm font-medium">{playerTitle}</p>
            </DesktopWindowDragRegion>
          </header>
        )}
        {isInspectorOpen && (
          <aside className="flex min-h-0 flex-col border-l bg-background">
            <div aria-label="Player inspector" className="flex border-b" role="tablist">
              {tabs(playlistLabel).map(tab => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={cn(
                    'flex-1 px-3 py-3 text-sm font-medium',
                    activeTab === tab.id && 'border-b-2 border-primary text-primary'
                  )}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-2" role="tabpanel">
              {content[activeTab]}
            </div>
          </aside>
        )}
        <Button
          aria-label={isInspectorOpen ? 'Hide player inspector' : 'Show player inspector'}
          className={cn(
            'absolute top-1/2 z-10 h-10 w-8 -translate-y-1/2 rounded-r-none border-r-0 bg-transparent px-0 shadow-none hover:bg-background/80 hover:shadow-md',
            isInspectorOpen ? 'right-104' : 'right-0'
          )}
          onClick={toggleInspector}
          size="icon"
          variant="ghost"
        >
          {isInspectorOpen ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </main>
    </DesktopPlayerControlsContext.Provider>
  )
}
