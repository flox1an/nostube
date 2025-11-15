import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { decodeProfilePointer } from '@/lib/nip19'
import { nip19 } from 'nostr-tools'
import { cn, combineRelays } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoGridSkeleton } from '@/components/VideoGridSkeleton'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { RichTextContent } from '@/components/RichTextContent'
import {
  useProfile,
  useUserPlaylists,
  type Playlist,
  useAppContext,
  useInfiniteScroll,
  useAuthorPageRelays,
  useLoadAuthorRelayList,
} from '@/hooks'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import type { TimelineLoader } from 'applesauce-loaders/loaders'
import { authorVideoLoader } from '@/nostr/loaders'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'

type Tabs = 'videos' | 'shorts' | 'tags' | string

interface AuthorStats {
  videoCount: number
  totalViews: number
  joinedDate: Date
}

function AuthorProfile({
  pubkey,
  joinedDate,
  className = '',
}: {
  pubkey: string
  joinedDate: Date
  className: string
}) {
  const metadata = useProfile({ pubkey })
  const displayName = metadata?.display_name ?? metadata?.name ?? pubkey?.slice(0, 8) ?? pubkey
  const picture = metadata?.picture

  return (
    <div className={cn(className, 'flex items-center space-x-4')}>
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
        {metadata?.about && (
          <RichTextContent
            content={metadata.about}
            className="text-sm text-muted-foreground mt-1"
          />
        )}
      </div>
    </div>
  )
}

export function AuthorPage() {
  const { nprofile } = useParams<{ nprofile: string }>()
  const [activeTab, setActiveTab] = useState<Tabs>('videos')
  const setShortsFeedVideos = useShortsFeedStore(state => state.setVideos)

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

  const { config, pool } = useAppContext()
  const eventStoreInstance = useEventStore()

  // Get relays for this author page
  // Initially: nprofile relays, user config, presets, purplepag.es
  // After NIP-65 loads: also includes author's outbox relays (reactive update)
  const relaysFromHook = useAuthorPageRelays({
    nprofileRelays,
    authorPubkey: pubkey,
  })

  // Stabilize relays array to prevent unnecessary loader recreations
  // Only update if the relay URLs actually changed (deep comparison)
  const relays = useMemo(() => relaysFromHook, [relaysFromHook.join(',')])

  // Load author's NIP-65 relay list from network
  // Uses a broad set of discovery relays to ensure we find the relay list
  const discoveryRelays = useMemo(
    () => [
      ...relays,
      'wss://index.hzrd149.com', // Relay indexer
      'wss://relay.noswhere.com', // Another popular relay
      'wss://relay.snort.social', // Snort relay
    ],
    [relays]
  )

  useLoadAuthorRelayList(pubkey, discoveryRelays)

  // Fetch playlists and videos for this author using the reactive relay set
  const { data: playlists = [], isLoading: isLoadingPlaylists } = useUserPlaylists(pubkey, relays)

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
          // Create a loader to fetch the missing events with proper relays
          const { createEventLoader } = await import('applesauce-loaders/loaders')

          // Get relay hints from where the playlist itself was seen
          const playlistEvent = playlist.eventId
            ? eventStoreInstance.getEvent(playlist.eventId)
            : undefined
          const playlistSeenRelaysSet = playlistEvent ? getSeenRelays(playlistEvent) : undefined
          const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []

          // Fetch missing events with relay hints
          const fetchPromises = missingIds.map(id => {
            // Get relay hints from where this event has been seen before
            const referencedEvent = eventStoreInstance.getEvent(id)
            const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
            const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []

            // Combine seen relays with playlist relays and general relays (prioritize seen relays)
            const videoRelays = combineRelays([seenRelays, playlistSeenRelays, relays])

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
    [config, pool, eventStoreInstance, relays]
  )

  // Auto-fetch video events for all playlists when playlists are loaded
  useEffect(() => {
    // Only start fetching videos after playlists have finished loading
    if (!isLoadingPlaylists && playlists.length > 0) {
      playlists.forEach(playlist => {
        // Only fetch if we haven't already loaded this playlist's videos
        if (!loadedPlaylistsRef.current.has(playlist.identifier) && playlist.videos.length > 0) {
          // Fire off fetch without awaiting (parallel loading)
          fetchPlaylistVideos(playlist).catch(err =>
            console.error('Failed to fetch playlist videos:', err)
          )
        }
      })
    }
  }, [playlists, isLoadingPlaylists, fetchPlaylistVideos]) // Include fetchPlaylistVideos dependency

  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = authorVideoLoader(pubkey, relays)
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

  useEffect(() => {
    if (shorts.length > 0) {
      setShortsFeedVideos(shorts)
    }
  }, [shorts, setShortsFeedVideos])

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
      <AuthorProfile className="p-2" pubkey={pubkey} joinedDate={stats.joinedDate} />

      <Tabs className="p-2" value={activeTab} onValueChange={v => setActiveTab(v as Tabs)}>
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

          {isLoadingPlaylists && (
            <TabsTrigger value="playlists-loading" disabled>
              Loading playlists...
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

        {playlists.map(playlist => {
          const isLoading = loadingPlaylist === playlist.identifier
          const hasLoadedVideos = playlistVideos[playlist.identifier] !== undefined
          const hasAttemptedLoad = loadedPlaylistsRef.current.has(playlist.identifier)
          const playlistHasVideoIds = playlist.videos && playlist.videos.length > 0

          // Show skeleton only if:
          // 1. Currently loading, OR
          // 2. Has video IDs in playlist AND hasn't loaded yet AND not currently loading
          const showSkeleton = isLoading || (playlistHasVideoIds && !hasLoadedVideos && !hasAttemptedLoad)

          return (
            <TabsContent key={playlist.identifier} value={playlist.identifier} className="mt-6">
              {showSkeleton ? (
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
                    relays: relays.slice(0, 3),
                  })}
                />
              )}
            </TabsContent>
          )
        })}

        <TabsContent value="tags" className="mt-6">
          <div className="flex flex-wrap gap-2">
            {uniqueTags.map(tag => (
              <Link key={tag} to={`/tag/${tag.toLowerCase()}`}>
                <span className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm cursor-pointer hover:bg-muted/80 transition-colors">
                  #{tag}
                </span>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
