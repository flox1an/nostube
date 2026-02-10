import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { nowInSecs } from '@/lib/utils'
import { useAppContext } from './useAppContext'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
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
  isPrivate?: boolean
}

// NIP-51 kind 30005 is for mutable lists including playlists
const PLAYLIST_KIND = 30005

export function usePlaylists() {
  const eventStore = useEventStore()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { config, pool } = useAppContext()
  const [isLoading, setIsLoading] = useState(false)
  const hasLoadedOnceRef = useRef(false)

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
        eventStore,
      }),
    [pool, readRelays, filters, deletionFilters, eventStore]
  )

  // Use EventStore timeline to get playlists for current user
  const allPlaylistEvents = use$(() => eventStore.timeline(filters), [eventStore, filters]) ?? []

  // Filter out deleted playlists
  const playlistEvents = useMemo(
    () => filterDeletedEvents(eventStore, allPlaylistEvents),
    [eventStore, allPlaylistEvents]
  )

  // Load playlists on page load if not already loaded
  useEffect(() => {
    // Only load once when user pubkey becomes available
    if (!user?.pubkey || hasLoadedOnceRef.current) {
      return
    }

    hasLoadedOnceRef.current = true // Set immediately to prevent multiple loads
    setIsLoading(true)
    const load$ = loader()

    let hasReceivedEvents = false

    // Show results quickly after first events arrive
    const quickDisplayTimeout = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    // Safety timeout to prevent infinite loading (10 seconds max)
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false)
    }, 10000)

    const subscription = load$.subscribe({
      next: event => {
        eventStore.add(event)

        // Mark that we've received events
        if (!hasReceivedEvents) {
          hasReceivedEvents = true
        }
      },
      complete: () => {
        clearTimeout(quickDisplayTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
      error: err => {
        console.warn('[usePlaylist] Failed to load playlists:', err)
        clearTimeout(quickDisplayTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
    })

    return () => {
      clearTimeout(quickDisplayTimeout)
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [user?.pubkey, eventStore, loader])

  // Parse playlists from events, with async decryption for private ones
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  useEffect(() => {
    let cancelled = false

    const parsePlaylist = (event: {
      tags: string[][]
      content: string
      id: string
      created_at: number
    }): Playlist => {
      const titleTag = event.tags.find(t => t[0] === 'title')
      const descTag = event.tags.find(t => t[0] === 'description')
      const name = titleTag ? titleTag[1] : 'Untitled Playlist'
      const description = descTag ? descTag[1] : undefined
      const isPrivate = event.content !== ''

      const videos: Video[] = event.tags
        .filter(t => t[0] === 'e')
        .map(t => ({
          id: t[1],
          kind: 0,
          title: undefined,
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
        name: isPrivate ? name || 'Private Playlist' : name,
        description,
        videos,
        eventId: event.id,
        isPrivate,
      }
    }

    const decryptAndParse = async () => {
      const results: Playlist[] = []

      for (const event of playlistEvents) {
        const playlist = parsePlaylist(event)

        // Attempt decryption for private playlists
        if (playlist.isPrivate && user?.signer?.nip44) {
          try {
            const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content)
            const decryptedTags: string[][] = JSON.parse(plaintext)

            const titleTag = decryptedTags.find(t => t[0] === 'title')
            const descTag = decryptedTags.find(t => t[0] === 'description')
            const videoTags = decryptedTags.filter(t => t[0] === 'e')

            if (titleTag) playlist.name = titleTag[1]
            if (descTag) playlist.description = descTag[1]
            playlist.videos = videoTags.map(t => ({
              id: t[1],
              kind: 0,
              title: undefined,
              added_at: event.created_at,
              relayHint: (() => {
                if (t[2]) return t[2]
                const referencedEvent = eventStore.getEvent(t[1])
                const seenRelays = referencedEvent ? getSeenRelays(referencedEvent) : undefined
                return seenRelays ? Array.from(seenRelays)[0] : undefined
              })(),
            }))
          } catch (err) {
            console.warn('[usePlaylist] Failed to decrypt private playlist:', err)
          }
        }

        results.push(playlist)
      }

      if (!cancelled) {
        setPlaylists(results)
      }
    }

    decryptAndParse()

    return () => {
      cancelled = true
    }
  }, [playlistEvents, user?.pubkey, user?.signer, eventStore])

  const updatePlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!user?.pubkey) throw new Error('User not logged in')
      setIsLoading(true)

      try {
        // Build video e-tags with relay hints
        const videoTags = playlist.videos.map(video => {
          const referencedEvent = eventStore.getEvent(video.id)
          const seenRelays = referencedEvent ? getSeenRelays(referencedEvent) : undefined
          const relayHint = video.relayHint || (seenRelays ? Array.from(seenRelays)[0] : undefined)

          const tag: string[] = ['e', video.id]
          if (relayHint) {
            tag.push(relayHint)
          }
          return tag
        })

        let tags: string[][]
        let content = ''

        if (playlist.isPrivate) {
          if (!user.signer?.nip44) {
            throw new Error('Signer does not support NIP-44 encryption')
          }

          // Private: only d + client in public tags
          tags = [
            ['d', playlist.identifier],
            ['client', 'nostube'],
          ]

          // Encrypt title, description, and e-tags into content
          const privateTags: string[][] = [
            ['title', playlist.name],
            ['description', playlist.description || ''],
            ...videoTags,
          ]
          content = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(privateTags))
        } else {
          // Public: all tags visible, empty content
          tags = [
            ['d', playlist.identifier],
            ['title', playlist.name],
            ['description', playlist.description || ''],
            ...videoTags,
            ['client', 'nostube'],
          ]
        }

        const draftEvent = {
          kind: PLAYLIST_KIND,
          created_at: nowInSecs(),
          tags,
          content,
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
    [user?.pubkey, user?.signer, publish, config.relays, eventStore]
  )

  const createPlaylist = useCallback(
    async (name: string, description?: string, isPrivate?: boolean) => {
      const playlist: Playlist = {
        eventId: undefined,
        identifier: 'nostube-' + crypto.randomUUID(),
        name,
        description,
        videos: [],
        isPrivate: isPrivate || false,
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

  const allPlaylistEvents = use$(() => eventStore.timeline(filters), [eventStore, filters]) ?? []

  // Filter out deleted playlists
  const playlistEvents = useMemo(
    () => filterDeletedEvents(eventStore, allPlaylistEvents),
    [eventStore, allPlaylistEvents]
  )

  const hasLoadedOnceRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const loader = useMemo(
    () =>
      createTimelineLoader(pool, readRelays, [...filters, ...deletionFilters], {
        eventStore,
      }),
    [pool, readRelays, filters, deletionFilters, eventStore]
  )

  // Reset hasLoadedOnce when relays change (e.g., when author's NIP-65 is loaded)
  useEffect(() => {
    hasLoadedOnceRef.current = false
  }, [readRelays])

  useEffect(() => {
    // Load if we have a pubkey and haven't loaded yet
    // Note: When relays change, hasLoadedOnce is reset to false (see effect above)
    if (!pubkey) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setIsLoading(false), 0)
      return () => clearTimeout(timer)
    }

    if (hasLoadedOnceRef.current) return

    hasLoadedOnceRef.current = true // Set immediately to prevent multiple loads
    // Use setTimeout to avoid synchronous setState in effect
    const loadingTimer = setTimeout(() => setIsLoading(true), 0)
    const load$ = loader()

    // Show results quickly after first events arrive
    const quickDisplayTimeout = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    // Safety timeout to prevent infinite loading (10 seconds max)
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false)
    }, 10000)

    const subscription = load$.subscribe({
      next: event => eventStore.add(event),
      complete: () => {
        clearTimeout(quickDisplayTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
      error: () => {
        clearTimeout(quickDisplayTimeout)
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      },
    })

    return () => {
      clearTimeout(loadingTimer)
      clearTimeout(quickDisplayTimeout)
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [pubkey, loader, eventStore])

  // Filter out private playlists (non-empty content = encrypted, can't decrypt other users')
  const publicPlaylistEvents = useMemo(
    () => playlistEvents?.filter(event => !event.content) ?? [],
    [playlistEvents]
  )

  const playlists = publicPlaylistEvents.map(event => {
    const titleTag = event.tags.find(t => t[0] === 'title')
    const descTag = event.tags.find(t => t[0] === 'description')
    const name = titleTag ? titleTag[1] : 'Untitled Playlist'
    const description = descTag ? descTag[1] : undefined
    const videos: Video[] = event.tags
      .filter(t => t[0] === 'e')
      .map(t => ({
        id: t[1],
        kind: 0,
        title: undefined,
        added_at: event.created_at,
      }))
    return {
      identifier: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name,
      description,
      videos,
      eventId: event.id,
      isPrivate: false,
    }
  })

  return {
    data: playlists,
    isLoading,
    enabled: !!pubkey,
  }
}
