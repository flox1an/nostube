import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { decodeProfilePointer } from '@nostube/core/nip19'
import { isNip05 } from '@nostube/core/nip05-bunker'
import { resolveNip05 } from '@nostube/core/nip05'
import { nip19 } from 'nostr-tools'
import type { ProfilePointer } from 'nostr-tools/nip19'
import { cn, combineRelays } from '@/lib/utils'
import { Button } from '@nostube/widgets/components/button'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoCard } from '@/components/VideoCard'
import { PlaylistThumbnailCollage } from '@/components/playlists/PlaylistThumbnailCollage'
import { CreatePlaylistDialog } from '@/components/playlists'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { FollowingList } from '@/components/FollowingList'
import { Loader2, Plus } from 'lucide-react'
import { AuthorPageLoader } from '@/components/page-loaders'
import NotFound from '@/pages/NotFound'
import {
  useProfile,
  useUserPlaylists,
  usePlaylists,
  type Playlist,
  useAppContext,
  useInfiniteScroll,
  useAuthorPageRelays,
  useCurrentUser,
  useAuthorLikedVideos,
  useBlockedPubkeys,
  useReportedPubkeys,
  useAuthorFollowing,
} from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useInfiniteTimeline } from '@nostube/widgets/hooks/useInfiniteTimeline'
import { authorVideoLoader } from '@/nostr/loaders'
import type { VideoEvent } from '@nostube/core/video-event'
import { processEvents } from '@nostube/core/video-event'
import type { NostrEvent } from 'nostr-tools'
import { createEventLoader, createAddressLoader } from 'applesauce-loaders/loaders'
import { getKindsForType } from '@nostube/core/video-types'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { useTranslation } from 'react-i18next'
import { ContentSafetyRoute } from '@/components/ContentSafetyGate'
import { getContentSafetyGate } from '@nostube/core/content-safety'
import { appTitle, pageTitle } from '@nostube/core/instance-config'
import { ProfileCard, AuthorBanner, AuthorBannerDisplay } from '@/components/profile/ProfileCard'
import { AuthorTabs, type AuthorTab } from '@/components/author/AuthorTabs'
import type { Tabs } from '@/components/author/shared'
import { isAuthorTab, TAP_TARGET, SHELF_SCROLLER } from '@/components/author/shared'
import { useAuthorPinnedVideos } from '@/hooks/useAuthorPinnedVideos'

function AuthorPageContent({ profileData }: { profileData: ProfilePointer | null }) {
  const { t } = useTranslation()
  const { nprofile, tab } = useParams<{ nprofile: string; tab?: string }>()
  const location = useLocation()
  const activeTab: Tabs = isAuthorTab(tab) ? tab : 'overview'
  const setShortsFeedVideos = useShortsFeedStore(state => state.setVideos)

  const pubkey = profileData?.pubkey || ''
  const nprofileRelays = profileData?.relays || []
  const profileBasePath = `${location.pathname.startsWith('/author/') ? '/author' : '/p'}/${nprofile}`
  const getTabPath = (nextTab: Tabs) =>
    nextTab === 'overview' ? profileBasePath : `${profileBasePath}/${nextTab}`

  // State for selected playlist videos
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, VideoEvent[]>>({})
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null)
  const loadedPlaylistsRef = useRef<Set<string>>(new Set())

  const { user } = useCurrentUser()
  const isOwnProfile = user?.pubkey === pubkey
  const { createPlaylist } = usePlaylists()
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false)

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
  const relaysKey = relaysFromHook.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-compare relay URLs to prevent unnecessary loader recreations
  const relays = useMemo(() => relaysFromHook, [relaysKey])

  // Fetch playlists and videos for this author using the reactive relay set
  const { data: playlists = [], isLoading: isLoadingPlaylists } = useUserPlaylists(pubkey, relays)

  // Fetch liked/zapped video IDs for this author
  const {
    eventIds: likedEventIds,
    isLoading: isLoadingLiked,
    count: likedCount,
  } = useAuthorLikedVideos(pubkey)
  const [likedVideos, setLikedVideos] = useState<VideoEvent[]>([])
  const [loadingLikedVideos, setLoadingLikedVideos] = useState(false)
  const likedVideosLoadedRef = useRef(false)
  const blockedPubkeys = useReportedPubkeys()

  // Fetch author's media follows list (kind 10020, NIP-51)
  const { followedPubkeys: authorFollowing, isLoading: isLoadingFollowing } = useAuthorFollowing(
    pubkey,
    relays
  )

  // Pinned videos (kind 10001, NIP-51): subscription, resolution and processing.
  const pinnedVideos = useAuthorPinnedVideos({ pubkey, relays })

  // Helper to fetch full video events for a playlist
  const fetchPlaylistVideos = useCallback(
    async (playlist: Playlist) => {
      if (!playlist || !playlist.videos?.length) return []
      setLoadingPlaylist(playlist.identifier)

      try {
        const refs = playlist.videos.map(v => ({ id: v.id, address: v.address }))
        // Check which events are missing from store
        const missingRefs = refs.filter(ref => {
          if (ref.address) {
            const parts = ref.address.split(':')
            if (parts.length < 3) return false
            const kind = parseInt(parts[0], 10)
            const author = parts[1]
            const identifier = parts.slice(2).join(':')
            return !eventStoreInstance.getReplaceable(kind, author, identifier)
          }
          return !eventStoreInstance.getEvent(ref.id)
        })

        if (missingRefs.length > 0) {
          // Get relay hints from where the playlist itself was seen
          const playlistEvent = playlist.eventId
            ? eventStoreInstance.getEvent(playlist.eventId)
            : undefined
          const playlistSeenRelaysSet = playlistEvent ? getSeenRelays(playlistEvent) : undefined
          const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []

          // Fetch missing events with relay hints
          const fetchPromises = missingRefs.map(ref => {
            // Get relay hints from where this event has been seen before
            const referencedEvent = ref.id ? eventStoreInstance.getEvent(ref.id) : undefined
            const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
            const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []

            // Combine seen relays with playlist relays and general relays (prioritize seen relays)
            const videoRelays = combineRelays([seenRelays, playlistSeenRelays, relays])

            // Create loader with specific relay hints for this video
            if (ref.address) {
              const parts = ref.address.split(':')
              if (parts.length >= 3) {
                const loader = createAddressLoader(pool, {
                  eventStore: eventStoreInstance,
                  extraRelays: videoRelays,
                })
                return loader({
                  kind: parseInt(parts[0], 10),
                  pubkey: parts[1],
                  identifier: parts.slice(2).join(':'),
                })
                  .toPromise()
                  .catch(err => {
                    console.warn(`Failed to fetch address ${ref.address}:`, err)
                    return null
                  })
              }
            }

            const loader = createEventLoader(pool, {
              eventStore: eventStoreInstance,
              extraRelays: videoRelays,
            })
            return loader({ id: ref.id })
              .toPromise()
              .catch(err => {
                console.warn(`Failed to fetch event ${ref.id}:`, err)
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
        const events = refs
          .map(ref => {
            if (ref.address) {
              const parts = ref.address.split(':')
              if (parts.length >= 3) {
                const kind = parseInt(parts[0], 10)
                const author = parts[1]
                const identifier = parts.slice(2).join(':')
                return eventStoreInstance.getReplaceable(kind, author, identifier)
              }
            }
            return eventStoreInstance.getEvent(ref.id)
          })
          .filter((e): e is NostrEvent => !!e)

        // Process events to VideoEvent format
        const processedVideos = processEvents(events, relays, {
          blossomServers: config.blossomServers,
          nsfwPubkeys: presetContent.nsfwPubkeys,
          reportedEventIds: config.reportedEventIds,
          includeYouTube: config.showYouTubeContent ?? true,
          includeAudio: true,
        })

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

  // Helper to fetch liked/zapped video events
  const fetchLikedVideos = useCallback(async () => {
    if (likedEventIds.length === 0 || likedVideosLoadedRef.current) return
    setLoadingLikedVideos(true)

    try {
      // Check which events are missing from store
      const missingIds = likedEventIds.filter(id => !eventStoreInstance.getEvent(id))

      if (missingIds.length > 0) {
        const loader = createEventLoader(pool, {
          eventStore: eventStoreInstance,
          extraRelays: relays,
        })

        // Load in chunks
        const CHUNK_SIZE = 50
        for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
          const chunk = missingIds.slice(i, i + CHUNK_SIZE)
          await Promise.all(
            chunk.map(id =>
              loader({ id })
                .toPromise()
                .then(e => e && eventStoreInstance.add(e))
                .catch(() => {})
            )
          )
        }
      }

      // Get all events from store
      const events = likedEventIds
        .map(id => eventStoreInstance.getEvent(id))
        .filter((e): e is NostrEvent => !!e)

      const processedVideos = processEvents(events, relays, {
        blockPubkeys: blockedPubkeys,
        blossomServers: config.blossomServers,
        nsfwPubkeys: presetContent.nsfwPubkeys,
        reportedEventIds: config.reportedEventIds,
        includeYouTube: config.showYouTubeContent ?? true,
        includeAudio: true,
      })

      setLikedVideos(processedVideos)
      likedVideosLoadedRef.current = true
    } catch (error) {
      console.error('Failed to fetch liked videos:', error)
    } finally {
      setLoadingLikedVideos(false)
    }
  }, [
    likedEventIds,
    eventStoreInstance,
    pool,
    relays,
    blockedPubkeys,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  useEffect(() => {
    if (activeTab === 'liked' && !likedVideosLoadedRef.current) {
      void fetchLikedVideos()
    }
  }, [activeTab, fetchLikedVideos])

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
  const loader = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log('[AuthorPage] creating loader for', pubkey.slice(0, 8), 'with relays:', relays)
    }
    return authorVideoLoader(pubkey, relays)
  }, [pubkey, relays])

  const timelineFilter = useMemo(
    () => ({ kinds: getKindsForType('all'), authors: [pubkey] }),
    [pubkey]
  )

  const {
    videos: allVideos,
    loading,
    exhausted,
    loadMore,
    phase,
  } = useInfiniteTimeline(loader, relays, { filters: timelineFilter, includeAudio: true })

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted,
  })

  const shorts = useMemo(() => allVideos.filter(v => v.type == 'shorts'), [allVideos])

  useEffect(() => {
    if (shorts.length > 0) {
      setShortsFeedVideos(shorts)
    }
  }, [shorts, setShortsFeedVideos])

  const videos = useMemo(() => allVideos.filter(v => v.type == 'videos'), [allVideos])

  // Same relays the video list uses (nprofile hints, outbox); this call loads the
  // profile for the banner/header too, they read the same store entry.
  const authorMeta = useProfile({ pubkey, relays })
  const authorName = authorMeta?.display_name || authorMeta?.name || pubkey?.slice(0, 8) || pubkey

  useEffect(() => {
    if (authorName) {
      document.title = pageTitle(`${authorName}`)
    } else {
      document.title = appTitle()
    }
    return () => {
      document.title = appTitle()
    }
  }, [authorName])

  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const handleBannerLoad = useCallback(() => {
    if (authorMeta?.banner) setBannerUrl(authorMeta.banner)
  }, [authorMeta?.banner])
  const handleBannerError = useCallback(() => setBannerUrl(null), [])

  if (!pubkey) return null

  const overviewPlaylists = playlists
    .filter(playlist => playlist.videos && playlist.videos.length > 0)
    .sort((a, b) => b.videos.length - a.videos.length)
    .slice(0, 8)

  const tabs: AuthorTab[] = [
    { id: 'overview', label: t('pages.author.overview', 'Overview'), show: true },
    {
      id: 'videos',
      label: t('pages.author.videosTab'),
      count: videos.length,
      show: videos.length > 0,
    },
    {
      id: 'shorts',
      label: t('pages.author.shortsTab'),
      count: shorts.length,
      show: shorts.length > 0,
    },
    {
      id: 'playlists',
      label: t('navigation.playlists'),
      count: playlists.length,
      show: isLoadingPlaylists || playlists.length > 0 || isOwnProfile,
    },
    {
      id: 'liked',
      label: t('pages.author.liked'),
      count: likedCount,
      show: likedCount > 0,
    },
    {
      id: 'following',
      label: t('pages.author.following'),
      count: authorFollowing.length,
      show: authorFollowing.length > 0,
    },
  ]

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <AuthorBanner pubkey={pubkey} onLoad={handleBannerLoad} onError={handleBannerError} />
      {bannerUrl && <AuthorBannerDisplay banner={bannerUrl} pubkey={pubkey} />}
      <ProfileCard className="px-4 py-2 sm:p-2" pubkey={pubkey} hasBanner={!!bannerUrl} />

      <div className="px-4 py-2 sm:p-2">
        <AuthorTabs basePath={profileBasePath} activeTab={activeTab} tabs={tabs} />

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="mt-4 space-y-6">
            {pinnedVideos.length > 0 && (
              <section>
                <div className="mb-3 flex min-h-9 items-center justify-between">
                  <h2 className="text-lg font-semibold">{t('pages.author.pinned', 'Pinned')}</h2>
                </div>
                <div className={SHELF_SCROLLER}>
                  <div className="flex min-w-max gap-2">
                    {pinnedVideos.map(video => {
                      const format = video.type === 'shorts' ? 'vertical' : 'horizontal'
                      return (
                        <div
                          key={`pinned-${video.id}`}
                          className={`video-shelf-item shrink-0 ${format === 'vertical' ? 'video-shelf-short' : ''}`}
                        >
                          <VideoCard
                            video={video}
                            format={format}
                            hideAuthor={video.pubkey === pubkey}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}
            {videos.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {t('pages.author.latestVideos', 'Latest videos')}
                  </h2>
                  <Button variant="ghost" size="sm" className={TAP_TARGET} asChild>
                    <Link to={getTabPath('videos')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className={SHELF_SCROLLER}>
                  <div className="flex min-w-max gap-2">
                    {videos.slice(0, 10).map(video => (
                      <div key={`latest-video-${video.id}`} className="video-shelf-item shrink-0">
                        <VideoCard video={video} format="horizontal" hideAuthor />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {shorts.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {t('pages.author.latestShorts', 'Latest shorts')}
                  </h2>
                  <Button variant="ghost" size="sm" className={TAP_TARGET} asChild>
                    <Link to={getTabPath('shorts')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className={SHELF_SCROLLER}>
                  <div className="flex min-w-max gap-2">
                    {shorts.slice(0, 10).map((video, index) => (
                      <div
                        key={`latest-short-${video.id}`}
                        className="video-shelf-item video-shelf-short shrink-0"
                      >
                        <VideoCard
                          video={video}
                          format="vertical"
                          allVideos={shorts}
                          videoIndex={index}
                          hideAuthor
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {overviewPlaylists.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {t('pages.author.playlistsTitle', 'Playlists')}
                  </h2>
                  <Button variant="ghost" size="sm" className={TAP_TARGET} asChild>
                    <Link to={getTabPath('playlists')}>{t('common.viewAll', 'View all')}</Link>
                  </Button>
                </div>
                <div className={SHELF_SCROLLER}>
                  <div className="flex min-w-max gap-2">
                    {overviewPlaylists.map(playlist => {
                      const playlistNaddr = nip19.naddrEncode({
                        kind: 30005,
                        pubkey,
                        identifier: playlist.identifier,
                        relays: relays.slice(0, 3),
                      })
                      const videoIds = playlist.videos.map(video => video.id)
                      return (
                        <Link
                          key={`playlist-overview-${playlist.identifier}`}
                          to={`/playlist/${playlistNaddr}`}
                          className={cn(
                            'group rounded-lg p-1 transition-colors hover:bg-accent',
                            'video-shelf-item shrink-0'
                          )}
                        >
                          <PlaylistThumbnailCollage
                            videoIds={videoIds}
                            safetyState={playlist.safetyState}
                            contentWarning={playlist.contentWarning}
                            className="rounded-lg transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <div className="px-1 pt-3">
                            <div className="line-clamp-1 text-[15px] font-semibold leading-5">
                              {playlist.name}
                            </div>
                            <div className="text-[13px] leading-5 text-muted-foreground">
                              {playlist.videos.length} videos
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="mt-4 -mx-4 sm:mx-0">
            <VideoGrid
              videos={videos}
              isLoading={loading}
              showSkeletons={true}
              layoutMode="auto"
              emptyMessage={t('pages.author.noVideos')}
              error={phase === 'error'}
              onRetry={loadMore}
              fullBleed
            />
            <InfiniteScrollTrigger
              triggerRef={loadMoreRef}
              loading={loading && videos.length > 0}
              exhausted={exhausted}
              itemCount={videos.length}
              error={phase === 'error'}
              onRetry={loadMore}
              loadingMessage={t('pages.author.loadingMore')}
              exhaustedMessage={t('pages.author.noMore')}
            />
          </div>
        )}

        {activeTab === 'shorts' && (
          <div className="mt-4 -mx-4 sm:mx-0">
            <VideoGrid
              videos={shorts}
              isLoading={loading}
              showSkeletons={true}
              layoutMode="vertical"
              emptyMessage={t('pages.author.noShorts')}
              error={phase === 'error'}
              onRetry={loadMore}
              fullBleed
            />
            <InfiniteScrollTrigger
              triggerRef={loadMoreRef}
              loading={loading && shorts.length > 0}
              exhausted={exhausted}
              itemCount={shorts.length}
              error={phase === 'error'}
              onRetry={loadMore}
              loadingMessage={t('pages.author.loadingMoreShorts')}
              exhaustedMessage={t('pages.author.noMoreShorts')}
            />
          </div>
        )}

        {activeTab === 'liked' && (
          <div className="mt-4 -mx-4 sm:mx-0">
            <VideoGrid
              videos={likedVideos}
              isLoading={loadingLikedVideos || isLoadingLiked}
              showSkeletons={true}
              layoutMode="auto"
              fullBleed
            />
            {likedVideos.length === 0 && !loadingLikedVideos && !isLoadingLiked && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noLikedVideos')}
              </div>
            )}
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="mt-4 space-y-6">
            {isOwnProfile && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setCreatePlaylistOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('playlists.create.newPlaylist')}
                </Button>
                <CreatePlaylistDialog
                  open={createPlaylistOpen}
                  onOpenChange={setCreatePlaylistOpen}
                  onCreatePlaylist={createPlaylist}
                />
              </div>
            )}
            {isLoadingPlaylists && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('pages.author.loadingPlaylists')}
              </div>
            )}
            {playlists.length === 0 && !isLoadingPlaylists && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noPlaylists', 'No playlists yet.')}
              </div>
            )}
            {playlists.map(playlist => {
              const playlistNaddr = nip19.naddrEncode({
                kind: 30005,
                pubkey,
                identifier: playlist.identifier,
                relays: relays.slice(0, 3),
              })
              const isLoading = loadingPlaylist === playlist.identifier
              const previewVideos = (playlistVideos[playlist.identifier] || []).slice(0, 10)
              return (
                <section key={`playlist-tab-${playlist.identifier}`} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">
                        <Link to={`/playlist/${playlistNaddr}`} className="hover:underline">
                          {playlist.name}
                        </Link>
                      </h2>
                      <p className="text-[13px] text-muted-foreground">
                        {playlist.videos.length} videos
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('shrink-0', TAP_TARGET)}
                      asChild
                    >
                      <Link to={`/playlist/${playlistNaddr}`}>
                        {t('pages.author.openPlaylist', 'Open playlist')}
                      </Link>
                    </Button>
                  </div>
                  {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('pages.author.loadingPreview', 'Loading preview...')}
                    </div>
                  )}
                  <div className={SHELF_SCROLLER}>
                    <div className="flex min-w-max gap-2">
                      {previewVideos.length === 0 && !isLoading && (
                        <div className="px-1 text-[13px] text-muted-foreground">
                          {t('pages.author.noPlaylistVideos', 'No videos in this playlist.')}
                        </div>
                      )}
                      {previewVideos.map(video => {
                        const format = video.type === 'shorts' ? 'vertical' : 'horizontal'
                        return (
                          <div
                            key={`playlist-tab-video-${playlist.identifier}-${video.id}`}
                            className={`video-shelf-item shrink-0 ${format === 'vertical' ? 'video-shelf-short' : ''}`}
                          >
                            <VideoCard
                              video={video}
                              format={format}
                              hideAuthor={video.pubkey === pubkey}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {activeTab === 'following' && (
          <div className="mt-4">
            <FollowingList
              pubkeys={authorFollowing}
              relays={relays}
              isLoading={isLoadingFollowing}
            />
            {authorFollowing.length === 0 && !isLoadingFollowing && (
              <div className="text-center py-12 text-muted-foreground">
                {t('pages.author.noFollowing')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AuthorPage() {
  const { t } = useTranslation()
  const { nprofile = '' } = useParams<{ nprofile: string }>()
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useBlockedPubkeys()

  // A NIP-05 address (`name@domain`, `domain`) instead of an npub/nprofile: its pubkey and
  // nostr.json relays act as the nprofile's. The URL stays as typed.
  const address = !/^n(pub|profile)1/.test(nprofile) && isNip05(nprofile) ? nprofile : undefined
  const decoded = useMemo(
    () => (address ? null : decodeProfilePointer(nprofile)),
    [address, nprofile]
  )
  const [resolved, setResolved] = useState<{ address: string; profile: ProfilePointer | null }>()
  useEffect(() => {
    if (!address) return
    let cancelled = false
    resolveNip05(address).then(
      profile => {
        if (!cancelled) setResolved({ address, profile })
      },
      () => {
        if (!cancelled) setResolved({ address, profile: null })
      }
    )
    return () => {
      cancelled = true
    }
  }, [address])
  const profile = address ? (resolved?.address === address ? resolved.profile : undefined) : decoded

  const safetyGate = getContentSafetyGate(profile?.pubkey, config.nsfwFilter, {
    nsfwPubkeys: presetContent.nsfwPubkeys,
    blockedPubkeys,
  })

  if (profile === undefined) return <AuthorPageLoader />
  if (address && !profile) return <NotFound hint={t('pages.author.nip05Unresolved')} />
  return (
    <ContentSafetyRoute safetyGate={safetyGate}>
      <AuthorPageContent profileData={profile} />
    </ContentSafetyRoute>
  )
}
