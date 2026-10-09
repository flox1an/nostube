import { useEffect } from 'react'

/**
 * Timestamps in a description ask the player to jump with a `nostube:seek-to` event (the same
 * one nostube uses); this moves the given media element.
 */
export function useSeekEvents(element: HTMLMediaElement | null) {
  useEffect(() => {
    if (!element) return
    const onSeek = (event: Event) => {
      const time = (event as CustomEvent<{ time?: number }>).detail?.time
      if (typeof time === 'number' && Number.isFinite(time)) element.currentTime = time
    }
    window.addEventListener('nostube:seek-to', onSeek)
    return () => window.removeEventListener('nostube:seek-to', onSeek)
  }, [element])
}
