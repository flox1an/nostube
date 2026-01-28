import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { decodeProfilePointer } from '@/lib/nip19'
import { nip19 } from 'nostr-tools'
import { cn, combineRelays } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { RichTextContent } from '@/components/RichTextContent'
import { ZapButton } from '@/components/ZapButton'
import {
  useProfile,
  useUserPlaylists,
  type Playlist,
  useAppContext,
  useInfiniteScroll,
  useAuthorPageRelays,
  useCurrentUser,
} from '@/hooks'
import { hasLightningAddress } from '@/lib/zap-utils'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { authorVideoLoader } from '@/nostr/loaders'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { useTranslation } from 'react-i18next'

type Tabs = 'videos' | 'shorts' | 'tags' | string

function AuthorBanner({ pubkey }: { pubkey: string }) {
  const metadata = useProfile({ pubkey })
  const banner = metadata?.banner

  if (!banner) return null

  return (
    <div className="relative w-full h-32 sm:h-48 md:h-56 overflow-hidden rounded-lg">
      <img
        src={banner}
        alt=""
        className="w-full h-full object-cover"
        onError={e => {
          // Hide the banner container if image fails to load
          const target = e.target as HTMLImageElement
          target.parentElement!.style.display = 'none'
        }}
      />
      {/* Gradient fade to background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-background" />
    </div>
  )
}

function AuthorProfile({
  pubkey,
  hasBanner,
  className = '',
}: {
  pubkey: string
  hasBanner: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const metadata = useProfile({ pubkey })
  const displayName = metadata?.display_name ?? metadata?.name ?? pubkey?.slice(0, 8) ?? pubkey
  const picture = metadata?.picture
  const [isAboutExpanded, setIsAboutExpanded] = useState(false)
  const [isAboutClamped, setIsAboutClamped] = useState(false)
  const aboutRef = useRef<HTMLDivElement>(null)

  const isOwnProfile = user?.pubkey === pubkey
  const canZap = !isOwnProfile && hasLightningAddress(metadata)

  // Check if about text is clamped (overflows 3 lines)
  useEffect(() => {
    const el = aboutRef.current
    if (el) {
      setIsAboutClamped(el.scrollHeight > el.clientHeight)
    }
  }, [metadata?.about])

  return (
    <div
      className={cn(
        'flex items-start space-x-4 relative',
        hasBanner && '-mt-10 sm:-mt-12',
        className
      )}
    >
      <div className="shrink-0">
        <img
          src={picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`}
          alt={displayName}
          className="w-16 h-16 rounded-full ring-2 ring-background"
          onError={e => {
            const target = e.target as HTMLImageElement
            target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-foreground">{displayName}</h1>
          {canZap && <ZapButton authorPubkey={pubkey} layout="inline" showZapText={true} />}
        </div>
        {metadata?.about && (
          <div className="mt-1">
            <div
              ref={aboutRef}
              className={cn('text-sm text-muted-foreground', !isAboutExpanded && 'line-clamp-3')}
            >
              <RichTextContent content={metadata.about} />
            </div>
            {(isAboutClamped || isAboutExpanded) && (
              <button
                onClick={() => setIsAboutExpanded(!isAboutExpanded)}
                className="text-sm text-primary hover:underline mt-1"
              >
                {isAboutExpanded ? t('pages.author.showLess') : t('pages.author.showMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AuthorPage() {
  const { t } = useTranslation()
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
  const { presetContent } = useSelectedPreset()

  // Get relays for this author page
  // Initially: nprofile relays, user config, presets, purplepag.es
  // After NIP-65 loads: also includes author's outbox relays (reactive update)
  const relaysFromHook = useAuthorPageRelays({
    nprofileRelays,
    authorPubkey: pubkey,
  })

  // Stabilize relays array to prevent unnecessary loader recreations
  // Only update if the relay URLs actually changed (deep comparison)
  // Note: NIP-65 relay discovery is handled by useUserRelays inside useAuthorPageRelays
  // with indexer relays included for better discovery in incognito mode
  const relays = useMemo(() => relaysFromHook, [relaysFromHook.join(',')])

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
        const processedVideos = processEvents(
          events,
          relays,
          undefined,
          config.blossomServers,
          undefined,
          presetContent.nsfwPubkeys
        )

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
    [config, pool, eventStoreInstance, relays, presetContent.nsfwPubkeys]
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

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => authorVideoLoader(pubkey, relays), [pubkey, relays])

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

  // Set initial tab based on content type (only once when first videos load)
  const hasSetInitialTab = useRef(false)
  useEffect(() => {
    if (hasSetInitialTab.current) return
    if (videos.length === 0 && shorts.length === 0) return

    hasSetInitialTab.current = true
    if (videos.length > shorts.length) {
      setActiveTab('videos')
    } else {
      setActiveTab('shorts')
    }
  }, [shorts.length, videos.length])

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

  const hasBanner = !!authorMeta?.banner

  if (!pubkey) return null

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <AuthorBanner pubkey={pubkey} />
      <AuthorProfile className="p-2" pubkey={pubkey} hasBanner={hasBanner} />

      <div className="p-2">
        {/* Scrollable tab bar */}
        <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide -mx-2 px-2 py-2">
          <div className="flex gap-2 min-w-max">
            {videos.length > 0 && (
              <Button
                variant={activeTab === 'videos' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                onClick={() => setActiveTab('videos')}
              >
                {t('pages.author.allVideos', { count: videos.length })}
              </Button>
            )}
            {shorts.length > 0 && (
              <Button
                variant={activeTab === 'shorts' ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                onClick={() => setActiveTab('shorts')}
              >
                {t('pages.author.allShorts', { count: shorts.length })}
              </Button>
            )}

            {isLoadingPlaylists && (
              <Button variant="outline" size="sm" className="shrink-0 rounded-full px-4" disabled>
                {t('pages.author.loadingPlaylists')}
              </Button>
            )}
            {playlists.map(playlist => (
              <Button
                key={playlist.identifier}
                variant={activeTab === playlist.identifier ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full px-4"
                onClick={async () => {
                  setActiveTab(playlist.identifier)
                  if (!playlistVideos[playlist.identifier]) {
                    await fetchPlaylistVideos(playlist)
                  }
                }}
              >
                {playlist.name}
              </Button>
            ))}
            <Button
              variant={activeTab === 'tags' ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 rounded-full px-4"
              onClick={() => setActiveTab('tags')}
            >
              {t('pages.author.tags')}
            </Button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'videos' && (
          <div className="mt-6">
            <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="auto" />

            <InfiniteScrollTrigger
              triggerRef={ref}
              loading={loading && videos.length > 0}
              exhausted={exhausted}
              itemCount={videos.length}
              emptyMessage={t('pages.author.noVideos')}
              loadingMessage={t('pages.author.loadingMore')}
              exhaustedMessage={t('pages.author.noMore')}
            />
          </div>
        )}

        {activeTab === 'shorts' && (
          <div className="mt-6">
            <VideoGrid
              videos={shorts}
              isLoading={loading}
              showSkeletons={true}
              layoutMode="vertical"
            />

            <InfiniteScrollTrigger
              triggerRef={ref}
              loading={loading && shorts.length > 0}
              exhausted={exhausted}
              itemCount={shorts.length}
              emptyMessage={t('pages.author.noShorts')}
              loadingMessage={t('pages.author.loadingMoreShorts')}
              exhaustedMessage={t('pages.author.noMoreShorts')}
            />
          </div>
        )}

        {playlists.map(playlist => {
          if (activeTab !== playlist.identifier) return null

          const isLoading = loadingPlaylist === playlist.identifier
          const hasLoadedVideos = playlistVideos[playlist.identifier] !== undefined
          const hasAttemptedLoad = loadedPlaylistsRef.current.has(playlist.identifier)
          const playlistHasVideoIds = playlist.videos && playlist.videos.length > 0

          // Show skeleton only if:
          // 1. Currently loading, OR
          // 2. Has video IDs in playlist AND hasn't loaded yet AND not currently loading
          const showSkeleton =
            isLoading || (playlistHasVideoIds && !hasLoadedVideos && !hasAttemptedLoad)

          return (
            <div key={playlist.identifier} className="mt-6">
              <VideoGrid
                videos={playlistVideos[playlist.identifier] || []}
                isLoading={showSkeleton}
                showSkeletons={true}
                layoutMode="auto"
                playlistParam={nip19.naddrEncode({
                  kind: 30005,
                  pubkey,
                  identifier: playlist.identifier,
                  relays: relays.slice(0, 3),
                })}
              />
            </div>
          )
        })}

        {activeTab === 'tags' && (
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              {uniqueTags.map(tag => (
                <Link key={tag} to={`/tag/${tag.toLowerCase()}`}>
                  <span className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm cursor-pointer hover:bg-muted/80 transition-colors">
                    #{tag}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
