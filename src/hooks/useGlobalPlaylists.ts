import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useAppContext } from './useAppContext'
import { useState, useMemo, useEffect, useRef } from 'react'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import type { Video } from './usePlaylist'

export interface GlobalPlaylist {
  eventId: string
  pubkey: string
  identifier: string
  name: string
  description?: string
  videos: Video[]
}

const PLAYLIST_KIND = 30005

const GLOBAL_PLAYLIST_FILTER = { kinds: [PLAYLIST_KIND] }

function parseVideoIds(tags: string[][]): Video[] {
  const videos: Video[] = []
  for (const t of tags) {
    if (t[0] === 'e') {
      videos.push({ id: t[1], kind: 0, added_at: 0, relayHint: t[2] })
    } else if (t[0] === 'a') {
      const parts = t[1]?.split(':')
      if (parts && parts.length >= 3) {
        const kind = parseInt(parts[0])
        const pubkey = parts[1]
        const identifier = parts.slice(2).join(':')
        videos.push({
          id: `${kind}:${pubkey}:${identifier}`,
          kind,
          added_at: 0,
          relayHint: t[2],
          address: t[1],
        })
      }
    }
  }
  return videos
}

export function useGlobalPlaylists() {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()

  const readRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  const filters = useMemo(() => [GLOBAL_PLAYLIST_FILTER], [])

  const rawEvents = use$(() => eventStore.timeline(filters), [eventStore, filters])
  const allEvents = useMemo(() => rawEvents ?? [], [rawEvents])

  const [isLoading, setIsLoading] = useState(false)
  const hasLoadedOnceRef = useRef(false)

  const loader = useMemo(
    () => createTimelineLoader(pool, readRelays, filters, { eventStore }),
    [pool, readRelays, filters, eventStore]
  )

  useEffect(() => {
    if (hasLoadedOnceRef.current) return
    hasLoadedOnceRef.current = true

    const loadingTimer = setTimeout(() => setIsLoading(true), 0)
    const load$ = loader()

    const quickTimeout = setTimeout(() => setIsLoading(false), 2000)
    const safetyTimeout = setTimeout(() => setIsLoading(false), 15000)

    const sub = load$.subscribe({
      next: event => eventStore.add(event),
      complete: () => {
        clearTimeout(quickTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
      error: () => {
        clearTimeout(quickTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
    })

    return () => {
      clearTimeout(loadingTimer)
      clearTimeout(quickTimeout)
      clearTimeout(safetyTimeout)
      sub.unsubscribe()
    }
  }, [loader, eventStore])

  // Only public playlists (content === '' means not encrypted)
  const playlists = useMemo((): GlobalPlaylist[] => {
    return allEvents
      .filter(event => !event.content)
      .map(event => {
        const titleTag = event.tags.find(t => t[0] === 'title')
        const descTag = event.tags.find(t => t[0] === 'description')
        const identifier = event.tags.find(t => t[0] === 'd')?.[1] || ''
        return {
          eventId: event.id,
          pubkey: event.pubkey,
          identifier,
          name: titleTag?.[1] || 'Untitled Playlist',
          description: descTag?.[1],
          videos: parseVideoIds(event.tags),
        }
      })
  }, [allEvents])

  return { playlists, isLoading }
}
