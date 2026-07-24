import { ChevronLeft, ChevronRight, Home, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LoginArea } from '@/components/auth/LoginArea'
import { GlobalSearchBar } from '@/components/GlobalSearchBar'
import { NotificationBell } from '@/components/NotificationBell'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'
import { cn } from '@/lib/utils'
import {
  DESKTOP_MAIN_TITLEBAR_HEIGHT_CLASS,
  DESKTOP_TRAFFIC_LIGHT_SAFE_AREA_CLASS,
  DesktopWindowDragRegion,
} from './DesktopWindowChrome'

type RouteEntry = {
  path: string
}

const routePath = (location: ReturnType<typeof useLocation>) =>
  `${location.pathname}${location.search}${location.hash}`

function useDesktopAppHistory() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = routePath(location)
  const [historyState, setHistoryState] = useState(() => ({
    entries: [{ path: currentPath }] as RouteEntry[],
    index: 0,
  }))
  const pendingIndexRef = useRef<number | null>(null)

  useEffect(() => {
    setHistoryState(current => {
      const pendingIndex = pendingIndexRef.current
      if (
        pendingIndex !== null &&
        current.entries[pendingIndex] &&
        current.entries[pendingIndex].path === currentPath
      ) {
        pendingIndexRef.current = null
        return { ...current, index: pendingIndex }
      }

      pendingIndexRef.current = null
      if (current.entries[current.index]?.path === currentPath) return current

      const nextEntries = [...current.entries.slice(0, current.index + 1), { path: currentPath }]
      return { entries: nextEntries, index: nextEntries.length - 1 }
    })
  }, [currentPath])

  const goBack = useCallback(() => {
    setHistoryState(current => {
      const nextIndex = current.index - 1
      const nextEntry = current.entries[nextIndex]
      if (!nextEntry) return current
      pendingIndexRef.current = nextIndex
      navigate(nextEntry.path)
      return current
    })
  }, [navigate])

  const goForward = useCallback(() => {
    setHistoryState(current => {
      const nextIndex = current.index + 1
      const nextEntry = current.entries[nextIndex]
      if (!nextEntry) return current
      pendingIndexRef.current = nextIndex
      navigate(nextEntry.path)
      return current
    })
  }, [navigate])

  return {
    canGoBack: historyState.index > 0,
    canGoForward: historyState.index < historyState.entries.length - 1,
    goBack,
    goForward,
  }
}

export function DesktopMainHeader() {
  const { user } = useCurrentUser()
  const { canGoBack, canGoForward, goBack, goForward } = useDesktopAppHistory()

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex w-full items-center border-b bg-background/90 px-3 backdrop-blur-md',
        DESKTOP_MAIN_TITLEBAR_HEIGHT_CLASS
      )}
    >
      <DesktopWindowDragRegion
        className={cn('h-full shrink-0', DESKTOP_TRAFFIC_LIGHT_SAFE_AREA_CLASS)}
      />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="Back"
          className="h-8 w-8"
          disabled={!canGoBack}
          onClick={goBack}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Forward"
          className="h-8 w-8"
          disabled={!canGoForward}
          onClick={goForward}
          size="icon"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button asChild aria-label="Home" className="h-8 w-8" size="icon" variant="ghost">
          <Link to="/">
            <Home className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <DesktopWindowDragRegion className="h-full min-w-3 flex-1" />

      <div className="w-full max-w-xl px-3">
        <GlobalSearchBar
          clearButtonClassName="top-1"
          className="flex"
          containerClassName="max-w-none lg:w-full"
          iconClassName="top-2"
          inputClassName="h-8 rounded-full bg-muted/80 pl-9 text-sm focus-visible:ring-1 focus-visible:ring-offset-0"
          preserveSearchFilters
          syncWithSearchParam
        />
      </div>

      <DesktopWindowDragRegion className="h-full min-w-3 flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        {user && (
          <Button asChild aria-label="Upload" className="h-8 w-8" size="icon" variant="ghost">
            <Link to="/upload">
              <Upload className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <NotificationBell />
        <LoginArea className="[&>button]:h-8" />
      </div>
    </header>
  )
}
