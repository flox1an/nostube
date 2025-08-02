import { useParams } from 'react-router-dom';
import { useEventStore } from 'applesauce-react/hooks';
import { useObservableState } from 'observable-hooks';
import { VideoCard } from '@/components/VideoCard';
import { FollowButton } from '@/components/FollowButton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Link } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAppContext } from '@/hooks/useAppContext';
import { processEvents } from '@/utils/video-event';
import { nip19 } from 'nostr-tools';
import { CollapsibleText } from '@/components/ui/collapsible-text';
import { useEffect, useMemo, useState } from 'react';
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys';
import { useUserPlaylists, type Playlist } from '@/hooks/usePlaylist';
import { processEvent } from '@/utils/video-event';
import type { NostrEvent } from 'nostr-tools';
import { useProfile } from '@/hooks/useProfile';
import { createTimelineLoader } from 'applesauce-loaders/loaders';

interface AuthorStats {
  videoCount: number;
  totalViews: number;
  joinedDate: Date;
}

type Tabs = 'videos' | 'shorts' | 'tags';

function AuthorProfile({ pubkey, joinedDate }: { pubkey: string; joinedDate: Date }) {
  const profile = useProfile({ pubkey });

  if (!profile) {
    return (
      <div className="flex items-center gap-6">
        <Skeleton className="h-32 w-32 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-96" />
        </div>
      </div>
    );
  }

  const name = profile?.name || pubkey.slice(0, 8);

  return (
    <div className="flex  items-start gap-6">
      <Avatar className="h-32 w-32">
        <AvatarImage src={profile?.picture} />
        <AvatarFallback className="text-4xl">{name[0]}</AvatarFallback>
      </Avatar>

      <div className="space-y-4 flex-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{profile?.display_name || name}</h1>
            {profile?.nip05 && <p className="text-muted-foreground">{profile.nip05}</p>}
          </div>
          <FollowButton pubkey={pubkey} />
        </div>

        {profile?.about && <CollapsibleText text={profile.about} className="text-muted-foreground" />}

        <div className="flex items-center gap-4">
          {profile?.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              <Link className="h-4 w-4" />
              Website
            </a>
          )}
          <div className="text-sm">
            <span className="text-muted-foreground">Joined</span>
            <span className="ml-2">{formatDistanceToNow(joinedDate, { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthorPage() {
  const { npub } = useParams<{ npub: string }>();
  const eventStore = useEventStore();
  const { config, pool } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tabs>('videos');

  const pubkey = nip19.decode(npub ?? '').data as string;

  // Fetch playlists for this author
  const { data: playlists = [] } = useUserPlaylists(pubkey);

  // State for selected playlist videos
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, NostrEvent[]>>({});
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null);

  // Helper to fetch full video events for a playlist
  const fetchPlaylistVideos = async (playlist: Playlist) => {
    if (!playlist || !playlist.videos?.length) return [];
    setLoadingPlaylist(playlist.identifier);
    const ids = playlist.videos.map(v => v.id);

    // Get events from EventStore
    const events = ids.map(id => eventStore.getEvent(id)).filter(Boolean) as NostrEvent[];

    setPlaylistVideos(prev => ({ ...prev, [playlist.identifier]: events }));
    setLoadingPlaylist(null);
    return events;
  };

  const blockedPubkeys = useReportedPubkeys();

  const readRelays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);

  const videoFilter = useMemo(
    () => ({
      kinds: [34235, 34236, 21, 22],
      authors: pubkey ? [pubkey] : [],
      limit: 500,
    }),
    [pubkey]
  );

  // Use EventStore timeline to get author's videos
  const videosObservable = eventStore.timeline([videoFilter]);

  const videoEvents = useObservableState(videosObservable, []);
console.log(videoEvents);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
console.log(readRelays);
  const loader = useMemo(() => createTimelineLoader(pool, readRelays, [videoFilter]), [pool, readRelays, videoFilter]);
  
  useEffect(() => {
    const needLoad = videoEvents.length === 0 && !!pubkey && !hasLoadedOnce;

    if (needLoad) {
      console.log('using loader');
      const load$ = loader()

      load$.subscribe(e=>eventStore.add(e));
      setHasLoadedOnce(true);
    }

  }, [videoEvents, pubkey, hasLoadedOnce, loader]);

  const isLoadingVideos = videoEvents.length === 0 && pubkey !== undefined;

  // Process the video events
  const allVideos = useMemo(() => {
    if (!pubkey || !videoEvents.length || blockedPubkeys === undefined) return [];

    const uniqueEvents = Array.from(new Map(videoEvents.map(event => [event.id, event])).values());
    return processEvents(Array.from(uniqueEvents.values()), readRelays, blockedPubkeys);
  }, [pubkey, videoEvents, blockedPubkeys, readRelays]);

  // Get unique tags from all videos
  const uniqueTags = useMemo(
    () =>
      Array.from(new Set(allVideos.flatMap(video => video.tags)))
        .filter(Boolean)
        .sort(),
    [allVideos]
  );

  const shorts = useMemo(() => allVideos.filter(v => v.type == 'shorts'), [allVideos]);

  const videos = useMemo(() => allVideos.filter(v => v.type == 'videos'), [allVideos]);

  useEffect(() => {
    if (videos.length > shorts.length) {
      setActiveTab('videos');
    } else {
      setActiveTab('shorts');
    }
  }, [shorts, videos]);

  const authorMeta = useProfile({ pubkey });
  const authorName = authorMeta?.display_name || authorMeta?.name || pubkey?.slice(0, 8) || pubkey;

  useEffect(() => {
    if (authorName) {
      document.title = `${authorName} - nostube`;
    } else {
      document.title = 'nostube';
    }
    return () => {
      document.title = 'nostube';
    };
  }, [authorName]);

  // Get author stats
  const stats: AuthorStats = {
    videoCount: allVideos.length,
    totalViews: 0, // Could be implemented with NIP-78 view counts
    joinedDate: allVideos.length > 0 ? new Date(Math.min(...allVideos.map(v => v.created_at * 1000))) : new Date(),
  };

  if (!pubkey) return null;

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
                      await fetchPlaylistVideos(playlist);
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
              {isLoadingVideos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="w-full aspect-video" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {videos.map(video => (
                    <VideoCard key={video.id} video={video} hideAuthor format="horizontal" />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">No videos uploaded yet</div>
              )}
            </TabsContent>

            <TabsContent value="shorts" className="mt-6">
              {isLoadingVideos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="w-full aspect-video" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : shorts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                  {shorts
                    .filter(v => v.type)
                    .map(video => (
                      <VideoCard key={video.id} video={video} hideAuthor format="vertical" />
                    ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">No videos uploaded yet</div>
              )}
            </TabsContent>

            <TabsContent value="tags" className="mt-6">
              <ScrollArea className="h-[400px]">
                <div className="flex flex-wrap gap-2">
                  {uniqueTags.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Playlist tabs */}
            {playlists.map(playlist => (
              <TabsContent key={playlist.identifier} value={playlist.identifier} className="mt-6">
                <h2 className="text-xl font-semibold mb-4">{playlist.name}</h2>
                {playlist.description && <div className="mb-2 text-muted-foreground">{playlist.description}</div>}
                {loadingPlaylist === playlist.identifier ? (
                  <div className="text-center py-12 text-muted-foreground">Loading playlist...</div>
                ) : playlistVideos[playlist.identifier]?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {playlistVideos[playlist.identifier]
                      .map(event => processEvent(event, readRelays))
                      .filter((v): v is NonNullable<typeof v> => !!v)
                      .map(video => (
                        <VideoCard key={video.id} video={video} hideAuthor format="horizontal" />
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">No videos in this playlist</div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
