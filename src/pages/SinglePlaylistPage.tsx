import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { VideoGrid } from '@/components/VideoGrid'
import { UserAvatar } from '@/components/UserAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { usePlaylistDetails, useProfile } from '@/hooks'

export default function SinglePlaylistPage() {
  const { nip19: nip19param } = useParams<{ nip19: string }>()
  const {
    playlistEvent,
    playlistTitle,
    playlistDescription,
    videoEvents,
    readRelays,
    isLoadingPlaylist,
    isLoadingVideos,
    failedVideoIds,
    loadingVideoIds,
  } = usePlaylistDetails(nip19param)

  const metadata = useProfile(playlistEvent?.pubkey ? { pubkey: playlistEvent.pubkey } : undefined)
  const name =
    metadata?.display_name || metadata?.name || playlistEvent?.pubkey?.slice(0, 8) || 'Unknown'

  useEffect(() => {
    if (playlistTitle) {
      document.title = `${playlistTitle} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [playlistTitle])

  if (isLoadingPlaylist) {
    return (
      <div className="max-w-560 mx-auto p-8 flex flex-col gap-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!playlistEvent) {
    return (
      <div className="max-w-560 mx-auto p-8">
        <div className="text-center py-12 text-muted-foreground">
          Playlist not found or failed to load
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto p-8 flex flex-col gap-8">
      <div className="flex">
        <h1 className="text-2xl font-bold flex-grow">{playlistTitle}</h1>

        <Link
          to={buildProfileUrlFromPubkey(playlistEvent.pubkey, readRelays)}
          className="shrink-0 flex flex-row gap-2 items-center"
        >
          <UserAvatar
            picture={metadata?.picture}
            pubkey={playlistEvent.pubkey}
            name={name}
            className="h-10 w-10"
          />
          {name}
        </Link>
      </div>

      {playlistDescription && (
        <div className="text-muted-foreground mt-2">{playlistDescription}</div>
      )}

      {failedVideoIds.size > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {failedVideoIds.size} video{failedVideoIds.size > 1 ? 's' : ''} could not be loaded from
            any relay. {failedVideoIds.size > 1 ? 'They' : 'It'} may have been deleted or{' '}
            {failedVideoIds.size > 1 ? 'are' : 'is'} no longer available.
          </AlertDescription>
        </Alert>
      )}

      <VideoGrid
        videos={videoEvents}
        isLoading={isLoadingVideos || loadingVideoIds.size > 0}
        playlistParam={nip19param}
      />
    </div>
  )
}
