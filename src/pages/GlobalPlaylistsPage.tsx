import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { PlaylistThumbnailCollage } from '@/components/playlists/PlaylistThumbnailCollage'
import { UserAvatar } from '@/components/UserAvatar'
import { useGlobalPlaylists, type GlobalPlaylist } from '@/hooks'
import { useProfile } from '@/hooks/useProfile'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { useReadRelays } from '@/hooks'

interface GlobalPlaylistCardProps {
  playlist: GlobalPlaylist
}

function GlobalPlaylistCard({ playlist }: GlobalPlaylistCardProps) {
  const profile = useProfile({ pubkey: playlist.pubkey })
  const readRelays = useReadRelays()

  const naddr = nip19.naddrEncode({
    kind: 30005,
    pubkey: playlist.pubkey,
    identifier: playlist.identifier,
    relays: [],
  })

  const authorUrl = buildProfileUrlFromPubkey(playlist.pubkey, readRelays)
  const displayName =
    profile?.display_name || profile?.name || playlist.pubkey.slice(0, 8)
  const videoIds = playlist.videos.map((v: { id: string }) => v.id)

  return (
    <div className="group flex flex-col rounded-lg overflow-hidden bg-card hover:bg-card/80 transition-colors">
      <Link to={`/playlist/${naddr}`} className="block">
        <PlaylistThumbnailCollage
          videoIds={videoIds}
          className="rounded-t-lg transition-transform duration-200 group-hover:scale-[1.01]"
        />
      </Link>
      <div className="p-3 flex flex-col gap-2">
        <Link to={`/playlist/${naddr}`} className="hover:underline">
          <h3 className="font-medium line-clamp-1">{playlist.name}</h3>
        </Link>
        <p className="text-xs text-muted-foreground">
          {playlist.videos.length} {playlist.videos.length === 1 ? 'video' : 'videos'}
        </p>
        <Link to={authorUrl} className="flex items-center gap-1.5 group/author">
          <UserAvatar
            picture={profile?.picture}
            pubkey={playlist.pubkey}
            name={displayName}
            className="h-5 w-5"
          />
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
          <Skeleton className="aspect-video rounded-lg" />
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
    document.title = `${t('navigation.playlists')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  return (
    <div className="max-w-560 mx-auto sm:p-4 p-2">
      <h1 className="text-2xl font-semibold mb-4">{t('navigation.playlists')}</h1>
      {isLoading && playlists.length === 0 ? (
        <PlaylistGridSkeleton />
      ) : playlists.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">
          {t('playlists.emptyState.noPublicPlaylists', 'No public playlists found.')}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map(playlist => (
            <GlobalPlaylistCard key={`${playlist.pubkey}-${playlist.identifier}`} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  )
}
