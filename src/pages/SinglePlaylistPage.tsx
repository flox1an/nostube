import { Link, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { Skeleton } from '@/components/ui/skeleton';
import { processEvents } from '@/utils/video-event';
import { useAppContext } from '@/hooks/useAppContext';
import { VideoGrid } from '@/components/VideoGrid';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';

function isNeventPointer(ptr: unknown): ptr is { id: string } {
  return typeof ptr === 'object' && ptr !== null && 'id' in ptr;
}
function isNaddrPointer(ptr: unknown): ptr is { identifier: string; pubkey: string; kind: number } {
  return typeof ptr === 'object' && ptr !== null && 'identifier' in ptr && 'pubkey' in ptr && 'kind' in ptr;
}

export default function SinglePlaylistPage() {
  const { nip19: nip19param } = useParams<{ nip19: string }>();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url);

  // Decode nip19 (nevent or naddr)
  let playlistPointer: unknown = null;
  try {
    playlistPointer = nip19.decode(nip19param ?? '').data;
  } catch {
    // ignore
  }

  // Query for the playlist event
  const { data: playlistEvent, isLoading: isLoadingPlaylist } = useQuery({
    queryKey: ['playlist', nip19param],
    queryFn: async ({ signal }) => {
      if (!playlistPointer) return null;
      let filter;
      if (isNeventPointer(playlistPointer)) {
        // nevent
        filter = { ids: [playlistPointer.id] };
      } else if (isNaddrPointer(playlistPointer)) {
        // naddr
        filter = {
          kinds: [playlistPointer.kind],
          authors: [playlistPointer.pubkey],
          '#d': [playlistPointer.identifier],
        };
      } else {
        return null;
      }
      const events = await nostr.query([filter], { signal });
      return events[0] || null;
    },
    enabled: !!playlistPointer,
  });

  const author = useAuthor(playlistEvent?.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || playlistEvent?.pubkey.slice(0, 8);
  console.log({ author: author?.data, metadata, name });

  // Parse playlist info and video references
  let playlistTitle = '';
  let playlistDescription = '';
  let videoRefs: { kind: number; id: string }[] = [];
  if (playlistEvent) {
    playlistTitle = playlistEvent.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled Playlist';
    playlistDescription = playlistEvent.tags.find((t: string[]) => t[0] === 'description')?.[1] || '';
    videoRefs = playlistEvent.tags
      .filter((t: string[]) => t[0] === 'a')
      .map((t: string[]) => {
        const [kind, id] = t[1].split(':');
        return { kind: parseInt(kind, 10), id };
      });
  }

  // Query for the video events
  const { data: videoEvents = [], isLoading: isLoadingVideos } = useQuery({
    queryKey: ['playlist-videos', nip19param],
    queryFn: async ({ signal }) => {
      if (!videoRefs.length) return [];
      const ids = videoRefs.map(v => v.id);
      const kinds = videoRefs.map(v => v.kind);
      const events = await nostr.query(
        [
          {
            ids,
            kinds,
          },
        ],
        { signal, relays: readRelays }
      );
      return processEvents(events, readRelays);
    },
    enabled: !!playlistEvent && videoRefs.length > 0,
  });

  if (!playlistEvent) return <></>;

  return (
    <div className="p-8 flex flex-col gap-8">
      <div className="flex">
        <h1 className="text-2xl font-bold flex-grow">{playlistTitle}</h1>

        <Link
          to={`/author/${nip19.npubEncode(playlistEvent.pubkey)}`}
          className="shrink-0 flex flex-row gap-2 items-center"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={author.data?.metadata?.picture} alt={name} />
            <AvatarFallback>{name?.charAt(0)}</AvatarFallback>
          </Avatar>
          {name}
        </Link>
      </div>

      {playlistDescription && <div className="text-muted-foreground mt-2">{playlistDescription}</div>}

      {isLoadingPlaylist ? (
        <Skeleton className="h-8 w-48 mb-4" />
      ) : !playlistEvent ? (
        <div className="text-center py-12 text-muted-foreground">Playlist not found</div>
      ) : (
        <VideoGrid videos={videoEvents} isLoading={isLoadingVideos} />
      )}
    </div>
  );
}
