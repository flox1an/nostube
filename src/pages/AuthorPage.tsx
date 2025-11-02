import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoGrid } from '@/components/VideoGrid'
import { useProfile } from '@/hooks/useProfile'
import { useUserPlaylists, Playlist } from '@/hooks/usePlaylist'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { eventStore } from '@/nostr/core'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from '@/hooks/useAppContext'
import { useInView } from 'react-intersection-observer'
import { authorVideoLoader } from '@/nostr/loaders'
import { Loader2 } from 'lucide-react'

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
  const { npub } = useParams<{ npub: string }>()
  const [activeTab, setActiveTab] = useState<Tabs>('videos')

  const pubkey = nip19.decode(npub ?? '').data as string

  // State for selected playlist videos
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, any[]>>({})
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null)
  const loadedPlaylistsRef = useRef<Set<string>>(new Set())

  // Fetch playlists for this author
  const { data: playlists = [] } = useUserPlaylists(pubkey)
  const { config } = useAppContext()
  const relays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  // Helper to fetch full video events for a playlist
  const fetchPlaylistVideos = useCallback(
    async (playlist: Playlist) => {
      if (!playlist || !playlist.videos?.length) return []
      setLoadingPlaylist(playlist.identifier)
      const ids = playlist.videos.map(v => v.id)

      try {
        // First try to get events from EventStore
        let events = ids.map(id => eventStore.getEvent(id)).filter(Boolean) as any[]

        // If we don't have all events, fetch missing ones from relays
        const missingIds = ids.filter(id => !eventStore.getEvent(id))

        if (missingIds.length > 0) {
          console.log(
            `Fetching ${missingIds.length} missing video events for playlist:`,
            playlist.name
          )

          // Create a simple loader to fetch the missing events
          const { createEventLoader } = await import('applesauce-loaders/loaders')
          const { pool } = config
          const loader = createEventLoader(pool, { eventStore })

          // Fetch missing events
          const fetchPromises = missingIds.map(id =>
            loader({ ids: [id] })
              .toPromise()
              .catch(err => {
                console.warn(`Failed to fetch event ${id}:`, err)
                return null
              })
          )

          const fetchedEvents = (await Promise.all(fetchPromises)).filter(Boolean)

          // Add fetched events to the store
          fetchedEvents.forEach(event => {
            if (event) eventStore.add(event)
          })

          // Get all events again (now including fetched ones)
          events = ids.map(id => eventStore.getEvent(id)).filter(Boolean) as any[]
        }

        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: events }))
        loadedPlaylistsRef.current.add(playlist.identifier)
        return events
      } catch (error) {
        console.error('Failed to fetch playlist videos:', error)
        setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: [] }))
        loadedPlaylistsRef.current.add(playlist.identifier) // Mark as attempted even if failed
        return []
      } finally {
        setLoadingPlaylist(null)
      }
    },
    [config]
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
  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  })

  // Trigger load more when in view
  React.useEffect(() => {
    if (inView && !exhausted && !loading) {
      loadMore()
    }
  }, [exhausted, loading, loadMore, inView])

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="aspect-video bg-muted animate-pulse rounded-lg" />
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <VideoGrid
                    videos={videos}
                    isLoading={loading && videos.length === 0}
                    showSkeletons={false}
                    layoutMode="auto"
                  />

                  {/* Infinite scroll trigger */}
                  <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
                    {loading && videos.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading more videos...
                      </div>
                    )}
                    {!loading && exhausted && videos.length > 0 && (
                      <div className="text-muted-foreground">No more videos to load.</div>
                    )}
                    {videos.length === 0 && !loading && (
                      <div className="text-muted-foreground">No videos found.</div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="shorts" className="mt-6">
              {loading && shorts.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="aspect-video bg-muted animate-pulse rounded-lg" />
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <VideoGrid
                    videos={shorts}
                    isLoading={loading && shorts.length === 0}
                    showSkeletons={false}
                    layoutMode="vertical"
                  />

                  {/* Infinite scroll trigger */}
                  <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
                    {loading && shorts.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading more videos...
                      </div>
                    )}
                    {!loading && exhausted && shorts.length > 0 && (
                      <div className="text-muted-foreground">No more videos to load.</div>
                    )}
                    {shorts.length === 0 && !loading && (
                      <div className="text-muted-foreground">No videos found.</div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {playlists.map(playlist => (
              <TabsContent key={playlist.identifier} value={playlist.identifier} className="mt-6">
                {loadingPlaylist === playlist.identifier ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="aspect-video bg-muted animate-pulse rounded-lg" />
                        <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                        <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <VideoGrid
                    videos={playlistVideos[playlist.identifier] || []}
                    isLoading={false}
                    showSkeletons={false}
                    layoutMode="auto"
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
