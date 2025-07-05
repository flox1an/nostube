import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { nowInSecs } from '@/lib/utils';

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
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['playlists', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];

      const events = await nostr.query(
        [{
          kinds: [PLAYLIST_KIND],
          authors: [user.pubkey],
        }],
        { signal }
      );

      return events.map(event => {
        // Find the title from tags
        const titleTag = event.tags.find(t => t[0] === 'title');
        const descTag = event.tags.find(t => t[0] === 'description');
        const name = titleTag ? titleTag[1] : 'Untitled Playlist';
        const description = descTag ? descTag[1] : undefined;

        // Get video references from 'a' tags
        const videos: Video[] = event.tags
          .filter(t => t[0] === 'a' ) // TODO check kinds
          .map(t => ({
            kind: parseInt(t[1].split(':')[0], 10),
            id: t[1].split(':')[1], // Extract note ID from "1:&lt;note-id&gt;"
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
    },
    enabled: !!user?.pubkey,
  });

  const updatePlaylist = useMutation({
    mutationFn: async (playlist: Playlist) => {
      if (!user?.pubkey) throw new Error('User not logged in');

      // Create tags array following NIP-51 format
      const tags = [
        ['d', playlist.identifier],
        ['title', playlist.name],
        ['description', playlist.description || ''],
        // Add video references as 'a' tags
        ...playlist.videos.map(video => ([
          'a',
          `${video.kind}:${video.id}`, // Reference format for notes
          video.title || '',
          video.added_at.toString(),
        ])),
        ['client', 'nostube'],
      ];

      await publishEvent({
        kind: PLAYLIST_KIND,
        tags,
        content: '', // Content can be empty as per NIP-51
      });

      return playlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists', user?.pubkey] });
    },
  });

  const createPlaylist = async (name: string, description?: string) => {
    const playlist: Playlist = {
      eventId: undefined,
      identifier: crypto.randomUUID(),
      name,
      description,
      videos: [],
    };

    await updatePlaylist.mutateAsync(playlist);
  };

  const addVideo = async (playlistId: string, videoId: string, videoKind: number, videoTitle?: string) => {
    const playlist = query.data?.find(p => p.identifier === playlistId);
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

    await updatePlaylist.mutateAsync(updatedPlaylist);
  };

  const removeVideo = async (playlistId: string, videoId: string) => {
    const playlist = query.data?.find(p => p.identifier === playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const updatedPlaylist = {
      ...playlist,
      videos: playlist.videos.filter(video => video.id !== videoId),
    };

    await updatePlaylist.mutateAsync(updatedPlaylist);
  };

  const deletePlaylist = async (identifier: string) => {
    if (!user?.pubkey) throw new Error('User not logged in');

    await publishEvent({event: {
      kind: PLAYLIST_KIND,
      created_at: nowInSecs(),
      tags: [
        ['d', identifier],
      ],
      content: '',
    }});

    queryClient.invalidateQueries({ queryKey: ['playlists', user?.pubkey] });
  };

  return {
    playlists: query.data || [],
    isLoading: query.isLoading,
    createPlaylist,
    addVideo,
    removeVideo,
    deletePlaylist,
  };
}