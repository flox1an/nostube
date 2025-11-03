import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { decodeProfilePointer } from '@/lib/nip19'
import { nip19 } from 'nostr-tools'
import { combineRelays } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoGridSkeleton } from '@/components/VideoGridSkeleton'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import {
  useProfile,
  useUserPlaylists,
  type Playlist,
  useAppContext,
  useInfiniteScroll,
  useReadRelays,
} from '@/hooks'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { eventStore } from '@/nostr/core'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { authorVideoLoader } from '@/nostr/loaders'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { presetRelays } from '@/constants/relays'

type Tabs = 'videos' | 'shorts' | 'tags' | string

interface AuthorStats {
  videoCount: number
  totalViews: number
  joinedDate: Date
}

function AuthorProfile({ pubkey, joinedDate }: { pubkey: string; joinedDate: Date }) {
  const metadata = useProfile({ pubkey })
  const displayName = metadata?.display_name ?? metadata?.name ?? pubkey?.slice(0, 8) ?? pubkey
  const picture = metadata?.picture

  return (
    <div className="flex items-center space-x-4">
      <div className="flex-shrink-0">
        <img
          src={picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`}
          alt={displayName}
          className="w-16 h-16 rounded-full"
          onError={e => {
            const target = e.target as HTMLImageElement
            target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-semibold text-foreground">{displayName}</h1>
        <p className="text-sm text-muted-foreground">Joined {joinedDate.toLocaleDateString()}</p>
        {metadata?.about && <p className="text-sm text-muted-foreground mt-1">{metadata.about}</p>}
      </div>
    </div>
  )
}

export function AuthorPage() {
  const { nprofile } = useParams<{ nprofile: string }>()
  const [activeTab, setActiveTab] = useState<Tabs>('videos')

  // Decode nprofile to get pubkey and relays
  const profileData = useMemo(() => {
    if (!nprofile) return null
    return decodeProfilePointer(nprofile)
  }, [nprofile])

  const pubkey = profileData?.pubkey || ''
  const nprofileRelays = profileData?.relays || []

  // State for selected playlist videos
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, any[]>>({})
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null)
  const loadedPlaylistsRef = useRef<Set<string>>(new Set())

  // Fetch playlists for this author
  const { data: playlists = [] } = useUserPlaylists(pubkey)
  const { config } = useAppContext()
  const readRelays = useReadRelays()
  const eventStoreInstance = useEventStore()

  // Combine nprofile relays with user's read relays for loading NIP-65 event
  const loadRelays = useMemo(() => {
    return combineRelays([nprofileRelays, readRelays])
  }, [nprofileRelays, readRelays])

  // Load author's NIP-65 mailboxes event (kind 10002) from relays
  useEffect(() => {
    if (!pubkey) return
    const { pool } = config

    const addressLoader = createAddressLoader(pool, {
      eventStore: eventStoreInstance,
    })

    const sub = addressLoader({
      kind: 10002,
      pubkey,
      identifier: '',
      relays: loadRelays,
    }).subscribe({
      next: (event: any) => {
        if (event) eventStoreInstance.add(event)
      },
      error: (err: any) => console.warn('Failed to load author mailboxes:', err),
    })

    return () => sub.unsubscribe()
  }, [pubkey, loadRelays, config, eventStoreInstance])

  // Subscribe to author's NIP-65 mailboxes to get their outbox relays
  const authorMailboxes = useObservableState(
    useMemo(
      () => (pubkey ? eventStoreInstance.mailboxes(pubkey) : undefined),
      [eventStoreInstance, pubkey]
    ),
    { inboxes: [], outboxes: [] }
  )

  // Well-known video relays as fallbacks
  const videoRelayFallbacks = presetRelays.map(r => r.url)

  // Combine all relay sources (prioritize in order: nprofile relays, author's outbox, user's read relays, video fallbacks)
  const relays = useMemo(() => {
    const authorOutboxes = authorMailboxes?.outboxes || []
    console.log(`[AuthorPage] nprofile relays:`, nprofileRelays)
    console.log(`[AuthorPage] Author outbox relays for ${pubkey.slice(0, 8)}:`, authorOutboxes)
    console.log(`[AuthorPage] User read relays:`, readRelays)
    // Combine and deduplicate (order matters - first ones are tried first)
    const combined = combineRelays([
      nprofileRelays,
      authorOutboxes,
      readRelays,
      videoRelayFallbacks,
    ])
    console.log(`[AuthorPage] Combined relays (${combined.length}):`, combined)
    return combined
  }, [nprofileRelays, authorMailboxes, readRelays, pubkey])

  // Helper to fetch full video events for a playlist
  const fetchPlaylistVideos = useCallback(
    async (playlist: Playlist) => {
      if (!playlist || !playlist.videos?.length) return []
      setLoadingPlaylist(playlist.identifier)
      const ids = playlist.videos.map(v => v.id)

      try {
        // Check which events are missing from store
        const missingIds = ids.filter(id => !eventStoreInstance.getEvent(id))

        if (missingIds.length > 0) {
          console.log(
            `Fetching ${missingIds.length} missing video events for playlist:`,
            playlist.name
          )

          // Create a loader to fetch the missing events with proper relays
          const { createEventLoader } = await import('applesauce-loaders/loaders')
          const { pool } = config

          // Get relay hints from where the playlist itself was seen
          const playlistEvent = playlist.eventId
            ? eventStoreInstance.getEvent(playlist.eventId)
            : undefined
          const playlistSeenRelaysSet = playlistEvent ? getSeenRelays(playlistEvent) : undefined
          const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []
          console.log('[AuthorPage] Playlist seen relays:', playlistSeenRelays)

          // Fetch missing events with relay hints
          const fetchPromises = missingIds.map(id => {
            // Get relay hints from where this event has been seen before
            const referencedEvent = eventStoreInstance.getEvent(id)
            const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
            const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []

            // Combine seen relays with playlist relays and general relays (prioritize seen relays)
            const videoRelays = combineRelays([seenRelays, playlistSeenRelays, relays])

            console.log(`[AuthorPage] Loading video ${id} from ${videoRelays.length} relays`)
            console.log(`[AuthorPage] - Seen relays: ${seenRelays.length}`, seenRelays)
            console.log(
              `[AuthorPage] - Playlist relays: ${playlistSeenRelays.length}`,
              playlistSeenRelays
            )

            // Create loader with specific relay hints for this video
            const loader = createEventLoader(pool, {
              eventStore: eventStoreInstance,
              extraRelays: videoRelays,
            })

            return loader({ id })
              .toPromise()
              .catch(err => {
                console.warn(`Failed to fetch event ${id}:`, err)
                return null
              })
          })

          const fetchedEvents = (await Promise.all(fetchPromises)).filter(Boolean)

          // Add fetched events to the store
          fetchedEvents.forEach(event => {
            if (event) eventStoreInstance.add(event)
          })
        }

        // Get all events from store (both existing and newly fetched)
        const events = ids.map(id => eventStoreInstance.getEvent(id)).filter(Boolean) as any[]

        // Process events to VideoEvent format
        const { processEvents } = await import('@/utils/video-event')
        const processedVideos = processEvents(events, relays, undefined, config.blossomServers)

        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: processedVideos }))
        loadedPlaylistsRef.current.add(playlist.identifier)
        return processedVideos
      } catch (error) {
        console.error('Failed to fetch playlist videos:', error)
        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: [] }))
        loadedPlaylistsRef.current.add(playlist.identifier) // Mark as attempted even if failed
        return []
      } finally {
        setLoadingPlaylist(null)
      }
    },
    [config, eventStoreInstance, relays]
  )

  // Auto-fetch video events for all playlists when playlists are loaded
  useEffect(() => {
    if (playlists.length > 0) {
      playlists.forEach(async playlist => {
        // Only fetch if we haven't already loaded this playlist's videos
        if (!loadedPlaylistsRef.current.has(playlist.identifier) && playlist.videos.length > 0) {
          await fetchPlaylistVideos(playlist)
        }
      })
    }
  }, [playlists, fetchPlaylistVideos]) // Include fetchPlaylistVideos dependency

  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = authorVideoLoader(pubkey, relays)
    console.log('newLoader =', newLoader)
    setLoader(newLoader)
  }, [relays, pubkey])

  const { videos: allVideos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  const { ref } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted,
  })

  // Get unique tags from all videos
  const uniqueTags = useMemo(
    () =>
      Array.from(new Set(allVideos.flatMap(video => video.tags)))
        .filter(Boolean)
        .sort(),
    [allVideos]
  )

  const shorts = useMemo(() => allVideos.filter(v => v.type == 'shorts'), [allVideos])

  const videos = useMemo(() => allVideos.filter(v => v.type == 'videos'), [allVideos])

  useEffect(() => {
    if (videos.length > shorts.length) {
      setActiveTab('videos')
    } else {
      setActiveTab('shorts')
    }
  }, [shorts, videos])

  const authorMeta = useProfile({ pubkey })
  const authorName = authorMeta?.display_name || authorMeta?.name || pubkey?.slice(0, 8) || pubkey

  useEffect(() => {
    if (authorName) {
      document.title = `${authorName} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [authorName])

  // Get author stats
  const stats: AuthorStats = {
    videoCount: allVideos.length,
    totalViews: 0, // Could be implemented with NIP-78 view counts
    joinedDate:
      allVideos.length > 0
        ? new Date(Math.min(...allVideos.map(v => v.created_at * 1000)))
        : new Date(),
  }

  if (!pubkey) return null

  return (
    <div className="sm:p-4">
      <Card>
        <CardHeader className="border-b">
          <AuthorProfile pubkey={pubkey} joinedDate={stats.joinedDate} />
        </CardHeader>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as Tabs)}>
            <TabsList>
              {videos.length > 0 && (
                <TabsTrigger value="videos" className="cursor-pointer">
                  All videos ({videos.length})
                </TabsTrigger>
              )}
              {shorts.length > 0 && (
                <TabsTrigger value="shorts" className="cursor-pointer">
                  All shorts ({shorts.length})
                </TabsTrigger>
              )}

              {playlists.map(playlist => (
                <TabsTrigger
                  key={playlist.identifier}
                  value={playlist.identifier}
                  className="cursor-pointer"
                  onClick={async () => {
                    if (!playlistVideos[playlist.identifier]) {
                      await fetchPlaylistVideos(playlist)
                    }
                  }}
                >
                  {playlist.name}
                </TabsTrigger>
              ))}
              <TabsTrigger value="tags" className="cursor-pointer">
                Tags
              </TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="mt-6">
              {loading && videos.length === 0 ? (
                <VideoGridSkeleton count={8} />
              ) : (
                <>
                  <VideoGrid
                    videos={videos}
                    isLoading={loading && videos.length === 0}
                    showSkeletons={false}
                    layoutMode="auto"
                  />

                  <InfiniteScrollTrigger
                    triggerRef={ref}
                    loading={loading && videos.length > 0}
                    exhausted={exhausted}
                    itemCount={videos.length}
                    emptyMessage="No videos found."
                    loadingMessage="Loading more videos..."
                    exhaustedMessage="No more videos to load."
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="shorts" className="mt-6">
              {loading && shorts.length === 0 ? (
                <VideoGridSkeleton count={8} />
              ) : (
                <>
                  <VideoGrid
                    videos={shorts}
                    isLoading={loading && shorts.length === 0}
                    showSkeletons={false}
                    layoutMode="vertical"
                  />

                  <InfiniteScrollTrigger
                    triggerRef={ref}
                    loading={loading && shorts.length > 0}
                    exhausted={exhausted}
                    itemCount={shorts.length}
                    emptyMessage="No shorts found."
                    loadingMessage="Loading more shorts..."
                    exhaustedMessage="No more shorts to load."
                  />
                </>
              )}
            </TabsContent>

            {playlists.map(playlist => (
              <TabsContent key={playlist.identifier} value={playlist.identifier} className="mt-6">
                {loadingPlaylist === playlist.identifier ? (
                  <VideoGridSkeleton count={8} />
                ) : (
                  <VideoGrid
                    videos={playlistVideos[playlist.identifier] || []}
                    isLoading={false}
                    showSkeletons={false}
                    layoutMode="auto"
                    playlistParam={nip19.naddrEncode({
                      kind: 30005,
                      pubkey,
                      identifier: playlist.identifier,
                      relays: loadRelays.slice(0, 3),
                    })}
                  />
                )}
              </TabsContent>
            ))}

            <TabsContent value="tags" className="mt-6">
              <div className="flex flex-wrap gap-2">
                {uniqueTags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
