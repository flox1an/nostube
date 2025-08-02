import { useEventStore, useObservableMemo } from 'applesauce-react/hooks';
import { useObservableState } from 'observable-hooks';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { nowInSecs } from '@/lib/utils';
import { useAppContext } from './useAppContext';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import { Event } from 'nostr-tools';
import { defer, map, merge, Observable, scan } from 'rxjs';

export interface Video {
  id: string;
  kind: number;
  title?: string;
  added_at: number;
}

export interface Playlist {
  eventId?: string;
  identifier: string;
  name: string;
  description?: string;
  videos: Video[];
}

// NIP-51 kind 30005 is for mutable lists including playlists
const PLAYLIST_KIND = 30005;

export function usePlaylists() {
  const eventStore = useEventStore();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { config } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);

  // Use EventStore timeline to get playlists for current user
  const playlistsObservable = eventStore.timeline(playlistFilter(user?.pubkey));

  const playlistEvents = useObservableState(playlistsObservable, []);

  const playlists = playlistEvents.map(event => {
    // Find the title from tags
    const titleTag = event.tags.find(t => t[0] === 'title');
    const descTag = event.tags.find(t => t[0] === 'description');
    const name = titleTag ? titleTag[1] : 'Untitled Playlist';
    const description = descTag ? descTag[1] : undefined;

    // Get video references from 'a' tags
    const videos: Video[] = event.tags
      .filter(t => t[0] === 'a') // TODO check kinds
      .map(t => ({
        kind: parseInt(t[1].split(':')[0], 10),
        id: t[1].split(':')[1], // Extract note ID from "1:<note-id>"
        title: t[2], // Optional title specified in tag
        added_at: parseInt(t[3] || '0', 10) || event.created_at,
      }));

    return {
      identifier: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name,
      description,
      videos,
      eventId: event.id, // Keep eventId for deletion
    };
  });

  const updatePlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!user?.pubkey) throw new Error('User not logged in');
      setIsLoading(true);

      try {
        // Create tags array following NIP-51 format
        const tags = [
          ['d', playlist.identifier],
          ['title', playlist.name],
          ['description', playlist.description || ''],
          // Add video references as 'a' tags
          ...playlist.videos.map(video => [
            'a',
            `${video.kind}:${video.id}`, // Reference format for notes
            video.title || '',
            video.added_at.toString(),
          ]),
          ['client', 'nostube'],
        ];

        await publishEvent({
          event: {
            kind: PLAYLIST_KIND,
            created_at: nowInSecs(),
            tags,
            content: '', // Content can be empty as per NIP-51
          },
        });

        return playlist;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.pubkey, publishEvent]
  );

  const createPlaylist = useCallback(
    async (name: string, description?: string) => {
      const playlist: Playlist = {
        eventId: undefined,
        identifier: 'nostube-' + crypto.randomUUID(),
        name,
        description,
        videos: [],
      };

      await updatePlaylist(playlist);
    },
    [updatePlaylist]
  );

  const addVideo = useCallback(
    async (playlistId: string, videoId: string, videoKind: number, videoTitle?: string) => {
      const playlist = playlists.find(p => p.identifier === playlistId);
      if (!playlist) throw new Error('Playlist not found');

      // Don't add if already exists
      if (playlist.videos.some(v => v.id === videoId)) {
        return;
      }

      const updatedPlaylist = {
        ...playlist,
        videos: [
          ...playlist.videos,
          {
            id: videoId,
            kind: videoKind,
            title: videoTitle,
            added_at: nowInSecs(),
          },
        ],
      };

      await updatePlaylist(updatedPlaylist);
    },
    [playlists, updatePlaylist]
  );

  const removeVideo = useCallback(
    async (playlistId: string, videoId: string) => {
      const playlist = playlists.find(p => p.identifier === playlistId);
      if (!playlist) throw new Error('Playlist not found');

      const updatedPlaylist = {
        ...playlist,
        videos: playlist.videos.filter(video => video.id !== videoId),
      };

      await updatePlaylist(updatedPlaylist);
    },
    [playlists, updatePlaylist]
  );

  const deletePlaylist = useCallback(
    async (eventId: string) => {
      if (!user?.pubkey) throw new Error('User not logged in');

      // NIP-9 delete event: kind 5, 'e' tag for eventId, 'k' tag for kind
      await publishEvent({
        event: {
          kind: 5,
          created_at: nowInSecs(),
          tags: [
            ['e', eventId],
            ['k', PLAYLIST_KIND.toString()],
          ],
          content: 'Deleted by author',
        },
        relays: config.relays.map(r => r.url),
      });
    },
    [user?.pubkey, publishEvent, config.relays]
  );

  return {
    playlists,
    isLoading,
    createPlaylist,
    addVideo,
    removeVideo,
    deletePlaylist,
    updatePlaylist,
  };
}

const playlistFilter = (pubkey?: string) => ({
  kinds: [PLAYLIST_KIND],
  authors: pubkey ? [pubkey] : [],
});

// Query playlists for any user by pubkey
export function useUserPlaylists(pubkey?: string) {
  const eventStore = useEventStore();
  const { pool, config } = useAppContext();

  const readRelays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);

  const playlistEvents = useObservableState(eventStore.timeline([playlistFilter(pubkey)]), []);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const loader = useMemo(() => createTimelineLoader(pool, readRelays, [playlistFilter(pubkey)]), [pool, readRelays]);

  useEffect(() => {
    const needLoad = playlistEvents.length === 0 && !!pubkey && !hasLoadedOnce;

    if (needLoad) {
      console.log('using loader');
      const load$ = loader();

      load$.subscribe(e => eventStore.add(e));
      setHasLoadedOnce(true);
    }
  }, [playlistEvents, pubkey, hasLoadedOnce, loader]);

  console.log(playlistEvents);

  const playlists = playlistEvents?.map(event => {
    const titleTag = event.tags.find(t => t[0] === 'title');
    const descTag = event.tags.find(t => t[0] === 'description');
    const name = titleTag ? titleTag[1] : 'Untitled Playlist';
    const description = descTag ? descTag[1] : undefined;
    const videos: Video[] = event.tags
      .filter(t => t[0] === 'a')
      .map(t => ({
        kind: parseInt(t[1].split(':')[0], 10),
        id: t[1].split(':')[1],
        title: t[2],
        added_at: parseInt(t[3] || '0', 10) || event.created_at,
      }));
    return {
      identifier: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name,
      description,
      videos,
      eventId: event.id,
    };
  });

  return {
    data: playlists,
    isLoading: false, // applesauce handles loading states internally
    enabled: !!pubkey,
  };
}
