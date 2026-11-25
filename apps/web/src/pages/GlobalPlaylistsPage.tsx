import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { PlaylistThumbnailCollage } from '@/components/playlists/PlaylistThumbnailCollage'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useGlobalPlaylists, type GlobalPlaylist } from '@/hooks'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { useReadRelays } from '@/hooks'
import { appTitle, pageTitle } from '@nostube/core/instance-config'

interface GlobalPlaylistCardProps {
  playlist: GlobalPlaylist
}

function GlobalPlaylistCard({ playlist }: GlobalPlaylistCardProps) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey: playlist.pubkey })
  const readRelays = useReadRelays()
  const naddr = nip19.naddrEncode({
    kind: 30005,
    pubkey: playlist.pubkey,
    identifier: playlist.identifier,
    relays: [],
  })

  const authorUrl = buildProfileUrlFromPubkey(playlist.pubkey, readRelays)
  const displayName = profile?.display_name || profile?.name || playlist.pubkey.slice(0, 8)
  const videoIds = playlist.videos.map((v: { id: string }) => v.id)

  return (
    <div className="group flex flex-col rounded-lg overflow-hidden bg-card hover:bg-card/80 transition-colors">
      <Link to={`/playlist/${naddr}`} className="block" tabIndex={-1} aria-hidden="true">
        <PlaylistThumbnailCollage
          videoIds={videoIds}
          safetyState={playlist.safetyState}
          contentWarning={playlist.contentWarning}
          className="rounded-t-lg transition-transform duration-200 group-hover:scale-[1.01]"
        />
      </Link>
      <div className="p-3 flex flex-col gap-2">
        <Link to={`/playlist/${naddr}`} className="hover:underline">
          <h2 className="font-medium line-clamp-1">{playlist.name}</h2>
        </Link>
        <p className="text-xs text-muted-foreground">
          {t('playlists.videoCount', {
            count: playlist.videos.length,
            defaultValue: '{{count}} videos',
            defaultValue_one: '{{count}} video',
          })}
        </p>
        <Link to={authorUrl} className="flex items-center gap-1.5 group/author">
          <span aria-hidden="true" className="shrink-0">
            <UserAvatar
              picture={profile?.picture}
              pubkey={playlist.pubkey}
              name={displayName}
              className="h-5 w-5"
            />
          </span>
          <span className="text-xs text-muted-foreground truncate group-hover/author:text-foreground transition-colors">
            {displayName}
          </span>
        </Link>
      </div>
    </div>
  )
}

function PlaylistGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-video rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function GlobalPlaylistsPage() {
  const { t } = useTranslation()
  const { playlists, isLoading } = useGlobalPlaylists()

  useEffect(() => {
    document.title = pageTitle(`${t('navigation.playlists')}`)
    return () => {
      document.title = appTitle()
    }
  }, [t])

  return (
    <div className="max-w-560 mx-auto sm:p-4 p-2">
      <h1 className="text-2xl font-semibold mb-4">{t('navigation.playlists')}</h1>
      {isLoading && playlists.length === 0 ? (
        <PlaylistGridSkeleton />
      ) : playlists.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 px-4 text-center">
          <p className="text-muted-foreground text-sm">
            {t('playlists.emptyState.noPublicPlaylists', 'No public playlists found.')}
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to="/">{t('pages.history.browseButton', { defaultValue: 'Browse Videos' })}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map(playlist => (
            <GlobalPlaylistCard
              key={`${playlist.pubkey}-${playlist.identifier}`}
              playlist={playlist}
            />
          ))}
        </div>
      )}
    </div>
  )
}
