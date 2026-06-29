import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useAppContext } from './useAppContext'
import { useState, useMemo, useEffect, useRef } from 'react'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { useSelectedPreset } from './useSelectedPreset'
import { usePlaylistValidation } from './usePlaylistValidation'
import type { Video } from './usePlaylist'

export interface GlobalPlaylist {
  eventId: string
  pubkey: string
  identifier: string
  name: string
  description?: string
  /** Reason from the playlist event's `content-warning` tag, if present. */
  contentWarning?: string
  videos: Video[]
}

const PLAYLIST_KIND = 30005

const GLOBAL_PLAYLIST_FILTER = { kinds: [PLAYLIST_KIND] }

const HEX64 = /^[0-9a-f]{64}$/i

function parseVideoIds(tags: string[][]): Video[] {
  const videos: Video[] = []
  for (const t of tags) {
    if (t[0] === 'e') {
      let pubkey: string | undefined
      for (let i = 3; i < t.length; i++) {
        if (typeof t[i] === 'string' && HEX64.test(t[i])) {
          pubkey = t[i]
          break
        }
      }
      videos.push({ id: t[1], kind: 0, added_at: 0, relayHint: t[2], pubkey })
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
          pubkey,
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

  // Two-stage NSFW gate for the global overview:
  //
  //  1. Drop anything obviously blocked here: private playlists (content body
  //     is encrypted; we can't validate) and playlists whose owner already
  //     marked them with a `content-warning` tag.
  //  2. For everything else, `usePlaylistValidation` resolves every referenced
  //     video against the EventStore (loading from relays as needed) and only
  //     reports `clean` once all refs check out. Anything else (`unsafe` or
  //     still `pending`) stays hidden when `hideNsfw` is on.
  //
  // The validator persists its verdict per `(address, eventId)` in IndexedDB,
  // so revisits never re-pay the relay cost unless the owner re-publishes.
  const nsfwFilter = config.nsfwFilter ?? 'hide'
  const hideNsfw = nsfwFilter === 'hide'
  const { presetContent } = useSelectedPreset()
  const reportedEventIds = config.reportedEventIds

  const candidateEvents = useMemo(() => {
    return allEvents.filter(event => {
      if (event.content) return false // private — can't validate
      const cwTag = event.tags.find(t => t[0] === 'content-warning')
      if (hideNsfw && cwTag) return false
      return true
    })
  }, [allEvents, hideNsfw])

  const validationSources = useMemo(
    () => ({
      nsfwPubkeys: presetContent.nsfwPubkeys,
      blockedPubkeys: presetContent.blockedPubkeys,
      blockedEvents: presetContent.blockedEvents,
      reportedEventIds: reportedEventIds ?? [],
    }),
    [
      presetContent.nsfwPubkeys,
      presetContent.blockedPubkeys,
      presetContent.blockedEvents,
      reportedEventIds,
    ]
  )

  const validationStatuses = usePlaylistValidation(candidateEvents, {
    enabled: hideNsfw,
    sources: validationSources,
    relays: readRelays,
  })

  const playlists = useMemo((): GlobalPlaylist[] => {
    const results: GlobalPlaylist[] = []
    for (const event of candidateEvents) {
      if (hideNsfw && validationStatuses.get(event.id) !== 'clean') continue
      const cwTag = event.tags.find(t => t[0] === 'content-warning')
      const contentWarning = cwTag ? cwTag[1] || 'NSFW' : undefined
      const videos = parseVideoIds(event.tags)
      const titleTag = event.tags.find(t => t[0] === 'title')
      const descTag = event.tags.find(t => t[0] === 'description')
      const identifier = event.tags.find(t => t[0] === 'd')?.[1] || ''
      results.push({
        eventId: event.id,
        pubkey: event.pubkey,
        identifier,
        name: titleTag?.[1] || 'Untitled Playlist',
        description: descTag?.[1],
        contentWarning,
        videos,
      })
    }
    return results
  }, [candidateEvents, hideNsfw, validationStatuses])

  return { playlists, isLoading }
}
