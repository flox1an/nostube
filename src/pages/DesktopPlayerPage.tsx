import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { VideoPage } from './VideoPage'

/**
 * Dedicated Tauri player-window route. VideoPage remains the single source of
 * playback data and interaction state; its desktop composition is introduced
 * at this route rather than duplicating loaders in a second application.
 */
export function DesktopPlayerPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void listen<string>('desktop-player-route', event => navigate(event.payload)).then(stop => {
      if (disposed) stop()
      else unlisten = stop
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [navigate])

  return <VideoPage />
}
