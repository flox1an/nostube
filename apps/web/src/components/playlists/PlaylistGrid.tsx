import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

import { Skeleton } from '@/components/ui/skeleton'
import { PlaylistCard } from './PlaylistCard'
import { CreatePlaylistCard } from './CreatePlaylistCard'
import type { Playlist } from '@/hooks/usePlaylist'
import { useAppContext } from '@/hooks'

interface PlaylistGridProps {
  playlists: Playlist[]
  userPubkey: string
  isLoading: boolean
  onCreatePlaylist: (name: string, description?: string, isPrivate?: boolean) => Promise<void>
  onDeletePlaylist: (eventId: string) => Promise<void>
  onUpdatePlaylist: (playlist: Playlist) => Promise<Playlist | void>
}

export function PlaylistGrid({
  playlists,
  userPubkey,
  isLoading,
  onCreatePlaylist,
  onDeletePlaylist,
  onUpdatePlaylist,
}: PlaylistGridProps) {
  const { t } = useTranslation()
  const { config, pool } = useAppContext()
  const eventStore = useEventStore()

  const writeRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
    [config.relays]
  )

  const readRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  const visiblePlaylists = useMemo(
    () =>
      playlists.filter(
        playlist => (config.nsfwFilter ?? 'hide') !== 'hide' || playlist.safetyState === 'clean'
      ),
    [playlists, config.nsfwFilter]
  )

  // Load video events for thumbnails
  useEffect(() => {
    // Collect thumbnail source videos only from cards that may be rendered.
    const videoIds = visiblePlaylists.flatMap(p => p.videos.slice(0, 4).map(v => v.id))

    // Filter out videos we already have
    const missingIds = videoIds.filter(id => !eventStore.hasEvent(id))

    if (missingIds.length === 0) return

    // Deduplicate
    const uniqueIds = [...new Set(missingIds)]

    const loader = createTimelineLoader(pool, readRelays, { ids: uniqueIds }, { eventStore })

    const subscription = loader().subscribe({
      next: event => {
        if (event) {
          eventStore.add(event)
        }
      },
    })

    return () => subscription.unsubscribe()
  }, [visiblePlaylists, eventStore, pool, readRelays])

  // Sort playlists by video count (most videos first)
  const sortedPlaylists = useMemo(() => {
    return [...visiblePlaylists].sort((a, b) => b.videos.length - a.videos.length)
  }, [visiblePlaylists])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden bg-card">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Empty state - just show create card with helper text
  if (sortedPlaylists.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <CreatePlaylistCard onCreatePlaylist={onCreatePlaylist} />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {t('playlists.emptyState.helper')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {sortedPlaylists.map(playlist => (
        <PlaylistCard
          key={playlist.identifier}
          playlist={playlist}
          userPubkey={userPubkey}
          writeRelays={writeRelays}
          onDelete={onDeletePlaylist}
          onUpdate={onUpdatePlaylist}
        />
      ))}
      <CreatePlaylistCard onCreatePlaylist={onCreatePlaylist} />
    </div>
  )
}
