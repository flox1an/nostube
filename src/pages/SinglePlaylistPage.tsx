import { Link, useParams } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { nip19 } from 'nostr-tools'
import { of } from 'rxjs'
import { Skeleton } from '@/components/ui/skeleton'
import { processEvents } from '@/utils/video-event'
import { useAppContext } from '@/hooks/useAppContext'
import { VideoGrid } from '@/components/VideoGrid'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { imageProxy } from '@/lib/utils'
import { useMemo } from 'react'
import { useProfile } from '@/hooks/useProfile'

function isNeventPointer(ptr: unknown): ptr is { id: string } {
  return typeof ptr === 'object' && ptr !== null && 'id' in ptr
}
function isNaddrPointer(ptr: unknown): ptr is { identifier: string; pubkey: string; kind: number } {
  return (
    typeof ptr === 'object' &&
    ptr !== null &&
    'identifier' in ptr &&
    'pubkey' in ptr &&
    'kind' in ptr
  )
}

export default function SinglePlaylistPage() {
  const { nip19: nip19param } = useParams<{ nip19: string }>()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

  // Decode nip19 (nevent or naddr)
  let playlistPointer: unknown = null
  try {
    playlistPointer = nip19.decode(nip19param ?? '').data
  } catch {
    // ignore
  }

  // Get playlist event from EventStore
  const playlistObservable = useMemo(() => {
    if (!playlistPointer) return of(undefined)

    if (isNeventPointer(playlistPointer)) {
      // nevent - get by ID
      return eventStore.event(playlistPointer.id)
    } else if (isNaddrPointer(playlistPointer)) {
      // naddr - get replaceable event
      return eventStore.replaceable(
        playlistPointer.kind,
        playlistPointer.pubkey,
        playlistPointer.identifier
      )
    }
    return of(undefined)
  }, [playlistPointer, eventStore])

  const playlistEvent = useObservableState(playlistObservable)
  const isLoadingPlaylist = playlistObservable && !playlistEvent

  const metadata = useProfile({ pubkey: playlistEvent?.pubkey || '' })
  const name = metadata?.display_name || metadata?.name || playlistEvent?.pubkey.slice(0, 8)

  // Parse playlist info and video references
  let playlistTitle = ''
  let playlistDescription = ''
  let videoRefs: { kind: number; id: string }[] = []
  if (playlistEvent) {
    playlistTitle =
      playlistEvent.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled Playlist'
    playlistDescription =
      playlistEvent.tags.find((t: string[]) => t[0] === 'description')?.[1] || ''
    videoRefs = playlistEvent.tags
      .filter((t: string[]) => t[0] === 'a')
      .map((t: string[]) => {
        const [kind, id] = t[1].split(':')
        return { kind: parseInt(kind, 10), id }
      })
  }

  // Get video events from EventStore
  const videoEvents = useMemo(() => {
    if (!videoRefs.length) return []

    const events = videoRefs.map(ref => eventStore.getEvent(ref.id)).filter(Boolean)

    return processEvents(events, readRelays, undefined, config.blossomServers)
  }, [videoRefs, eventStore, readRelays, config.blossomServers])

  const isLoadingVideos = playlistEvent && videoRefs.length > 0 && videoEvents.length === 0

  if (!playlistEvent) return <></>

  return (
    <div className="p-8 flex flex-col gap-8">
      <div className="flex">
        <h1 className="text-2xl font-bold flex-grow">{playlistTitle}</h1>

        <Link
          to={`/author/${nip19.npubEncode(playlistEvent.pubkey)}`}
          className="shrink-0 flex flex-row gap-2 items-center"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={imageProxy(metadata?.picture)} alt={name} />
            <AvatarFallback>{name?.charAt(0)}</AvatarFallback>
          </Avatar>
          {name}
        </Link>
      </div>

      {playlistDescription && (
        <div className="text-muted-foreground mt-2">{playlistDescription}</div>
      )}

      {isLoadingPlaylist ? (
        <Skeleton className="h-8 w-48 mb-4" />
      ) : !playlistEvent ? (
        <div className="text-center py-12 text-muted-foreground">Playlist not found</div>
      ) : (
        <VideoGrid videos={videoEvents} isLoading={isLoadingVideos} />
      )}
    </div>
  )
}
