import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { nowInSecs } from '@/lib/utils'
import { useAppContext } from './useAppContext'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { filterDeletedEvents } from '@/lib/deletions'
import { getSeenRelays } from 'applesauce-core/helpers/relays'

export interface Video {
  id: string
  kind: number
  title?: string
  added_at: number
  relayHint?: string
}

export interface Playlist {
  eventId?: string
  identifier: string
  name: string
  description?: string
  videos: Video[]
}

// NIP-51 kind 30005 is for mutable lists including playlists
const PLAYLIST_KIND = 30005

export function usePlaylists() {
  const eventStore = useEventStore()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { config, pool } = useAppContext()
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const readRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )
  const filters = useMemo(() => [playlistFilter(user?.pubkey)], [user?.pubkey])

  // Also load deletion events (kind 5) for filtering
  const deletionFilters = useMemo(
    () => [{ kinds: [5], authors: user?.pubkey ? [user.pubkey] : [] }],
    [user?.pubkey]
  )

  const loader = useMemo(
    () =>
      createTimelineLoader(pool, readRelays, [...filters, ...deletionFilters], {
        timeout: 5000, // 5 second timeout per relay to prevent blocking
      }),
    [pool, readRelays, filters, deletionFilters]
  )

  // Use EventStore timeline to get playlists for current user
  const playlistsObservable = eventStore.timeline(filters)
  const allPlaylistEvents = useObservableState(playlistsObservable, [])

  // Filter out deleted playlists
  const playlistEvents = useMemo(
    () => filterDeletedEvents(eventStore, allPlaylistEvents),
    [eventStore, allPlaylistEvents]
  )

  // Load playlists on page load if not already loaded
  useEffect(() => {
    // Check allPlaylistEvents (before filtering) to avoid re-loading if events were just deleted
    const needLoad = allPlaylistEvents.length === 0 && !!user?.pubkey && !hasLoadedOnce

    if (needLoad) {
      setIsLoading(true)
      const load$ = loader()

      // Safety timeout to prevent infinite loading (10 seconds max)
      const safetyTimeout = setTimeout(() => {
        setIsLoading(false)
        setHasLoadedOnce(true)
      }, 10000)

      const subscription = load$.subscribe({
        next: event => eventStore.add(event),
        complete: () => {
          clearTimeout(safetyTimeout)
          setIsLoading(false)
          setHasLoadedOnce(true)
        },
        error: () => {
          clearTimeout(safetyTimeout)
          setIsLoading(false)
          setHasLoadedOnce(true)
        },
      })

      return () => {
        clearTimeout(safetyTimeout)
        subscription.unsubscribe()
      }
    }
  }, [allPlaylistEvents.length, user?.pubkey, hasLoadedOnce, loader, eventStore])

  const playlists = playlistEvents.map(event => {
    // Find the title from tags
    const titleTag = event.tags.find(t => t[0] === 'title')
    const descTag = event.tags.find(t => t[0] === 'description')
    const name = titleTag ? titleTag[1] : 'Untitled Playlist'
    const description = descTag ? descTag[1] : undefined

    // Get video references from 'e' tags (event IDs)
    const videos: Video[] = event.tags
      .filter(t => t[0] === 'e')
      .map(t => ({
        id: t[1], // Event ID
        kind: 0, // Kind will be determined when event is loaded
        title: undefined, // Title will be fetched from the actual event
        added_at: event.created_at,
        relayHint: (() => {
          if (t[2]) return t[2]
          const referencedEvent = eventStore.getEvent(t[1])
          const seenRelays = referencedEvent ? getSeenRelays(referencedEvent) : undefined
          return seenRelays ? Array.from(seenRelays)[0] : undefined
        })(),
      }))

    return {
      identifier: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name,
      description,
      videos,
      eventId: event.id, // Keep eventId for deletion
    }
  })

  const updatePlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!user?.pubkey) throw new Error('User not logged in')
      setIsLoading(true)

      try {
        // Create tags array following NIP-51 format
        const tags = [
          ['d', playlist.identifier],
          ['title', playlist.name],
          ['description', playlist.description || ''],
          // Add video references as 'e' tags (event IDs) with relay hints
          ...playlist.videos.map(video => {
            // Get relay hint from where this event has been seen
            const referencedEvent = eventStore.getEvent(video.id)
            const seenRelays = referencedEvent ? getSeenRelays(referencedEvent) : undefined
            const relayHint =
              video.relayHint || (seenRelays ? Array.from(seenRelays)[0] : undefined)

            const tag: string[] = ['e', video.id]
            if (relayHint) {
              tag.push(relayHint)
            }
            return tag
          }),
          ['client', 'nostube'],
        ]

        const draftEvent = {
          kind: PLAYLIST_KIND,
          created_at: nowInSecs(),
          tags,
          content: '', // Content can be empty as per NIP-51
        }

        const signedEvent = await publish({
          event: draftEvent,
          relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
        })

        // Add the updated playlist to the event store immediately for instant feedback
        eventStore.add(signedEvent)

        return playlist
      } finally {
        setIsLoading(false)
      }
    },
    [user?.pubkey, publish, config.relays, eventStore]
  )

  const createPlaylist = useCallback(
    async (name: string, description?: string) => {
      const playlist: Playlist = {
        eventId: undefined,
        identifier: 'nostube-' + crypto.randomUUID(),
        name,
        description,
        videos: [],
      }

      await updatePlaylist(playlist)
    },
    [updatePlaylist]
  )

  const addVideo = useCallback(
    async (playlistId: string, videoId: string, videoKind?: number, videoTitle?: string) => {
      const playlist = playlists.find(p => p.identifier === playlistId)
      if (!playlist) throw new Error('Playlist not found')

      // Don't add if already exists
      if (playlist.videos.some(v => v.id === videoId)) {
        return
      }

      const updatedPlaylist = {
        ...playlist,
        videos: [
          ...playlist.videos,
          {
            id: videoId,
            kind: videoKind || 0, // Kind is optional, will be determined when event is loaded
            title: videoTitle,
            added_at: nowInSecs(),
            relayHint: (() => {
              const referencedEvent = eventStore.getEvent(videoId)
              const seenRelays = referencedEvent ? getSeenRelays(referencedEvent) : undefined
              return seenRelays ? Array.from(seenRelays)[0] : undefined
            })(),
          },
        ],
      }

      await updatePlaylist(updatedPlaylist)
    },
    [playlists, updatePlaylist, eventStore]
  )

  const removeVideo = useCallback(
    async (playlistId: string, videoId: string) => {
      const playlist = playlists.find(p => p.identifier === playlistId)
      if (!playlist) throw new Error('Playlist not found')

      const updatedPlaylist = {
        ...playlist,
        videos: playlist.videos.filter(video => video.id !== videoId),
      }

      await updatePlaylist(updatedPlaylist)
    },
    [playlists, updatePlaylist]
  )

  const deletePlaylist = useCallback(
    async (eventId: string) => {
      if (!user?.pubkey) throw new Error('User not logged in')

      // NIP-9 delete event: kind 5, 'e' tag for eventId, 'k' tag for kind
      const deleteEvent = {
        kind: 5,
        created_at: nowInSecs(),
        tags: [
          ['e', eventId],
          ['k', PLAYLIST_KIND.toString()],
        ],
        content: 'Deleted by author',
      }

      const signedDeleteEvent = await publish({
        event: deleteEvent,
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      // Add the deletion event to the event store immediately for instant feedback
      eventStore.add(signedDeleteEvent)
    },
    [user?.pubkey, publish, config.relays, eventStore]
  )

  return {
    playlists,
    isLoading,
    createPlaylist,
    addVideo,
    removeVideo,
    deletePlaylist,
    updatePlaylist,
  }
}

const playlistFilter = (pubkey?: string) => ({
  kinds: [PLAYLIST_KIND],
  authors: pubkey ? [pubkey] : [],
})

// Query playlists for any user by pubkey
export function useUserPlaylists(pubkey?: string, customRelays?: string[]) {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()

  const defaultReadRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  // Use custom relays if provided, otherwise fall back to user's read relays
  const readRelays = customRelays || defaultReadRelays

  const filters = useMemo(() => [playlistFilter(pubkey)], [pubkey])

  // Also load deletion events (kind 5) for filtering
  const deletionFilters = useMemo(() => [{ kinds: [5], authors: pubkey ? [pubkey] : [] }], [pubkey])

  const allPlaylistEvents = useObservableState(eventStore.timeline(filters), [])

  // Filter out deleted playlists
  const playlistEvents = useMemo(
    () => filterDeletedEvents(eventStore, allPlaylistEvents),
    [eventStore, allPlaylistEvents]
  )

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const loader = useMemo(
    () =>
      createTimelineLoader(pool, readRelays, [...filters, ...deletionFilters], {
        timeout: 5000, // 5 second timeout per relay to prevent blocking
      }),
    [pool, readRelays, filters, deletionFilters]
  )

  // Reset hasLoadedOnce when relays change (e.g., when author's NIP-65 is loaded)
  useEffect(() => {
    setHasLoadedOnce(false)
  }, [readRelays])

  useEffect(() => {
    // Load if we have a pubkey and haven't loaded yet
    // Note: When relays change, hasLoadedOnce is reset to false (see effect above)
    const needLoad = !!pubkey && !hasLoadedOnce

    if (needLoad) {
      setIsLoading(true)
      const load$ = loader()

      // Safety timeout to prevent infinite loading (10 seconds max)
      const safetyTimeout = setTimeout(() => {
        setHasLoadedOnce(true)
        setIsLoading(false)
      }, 10000)

      const subscription = load$.subscribe({
        next: event => eventStore.add(event),
        complete: () => {
          clearTimeout(safetyTimeout)
          setHasLoadedOnce(true)
          setIsLoading(false)
        },
        error: () => {
          clearTimeout(safetyTimeout)
          setHasLoadedOnce(true)
          setIsLoading(false)
        },
      })

      return () => {
        clearTimeout(safetyTimeout)
        subscription.unsubscribe()
      }
    } else if (!pubkey) {
      // Reset loading state if no pubkey
      setIsLoading(false)
    }
  }, [pubkey, hasLoadedOnce, loader, eventStore])

  const playlists = playlistEvents?.map(event => {
    const titleTag = event.tags.find(t => t[0] === 'title')
    const descTag = event.tags.find(t => t[0] === 'description')
    const name = titleTag ? titleTag[1] : 'Untitled Playlist'
    const description = descTag ? descTag[1] : undefined
    const videos: Video[] = event.tags
      .filter(t => t[0] === 'e')
      .map(t => ({
        id: t[1], // Event ID
        kind: 0, // Kind will be determined when event is loaded
        title: undefined, // Title will be fetched from the actual event
        added_at: event.created_at,
      }))
    return {
      identifier: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name,
      description,
      videos,
      eventId: event.id,
    }
  })

  return {
    data: playlists,
    isLoading,
    enabled: !!pubkey,
  }
}
