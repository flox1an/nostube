import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

export interface Video {
  id: string;
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
          .filter(t => t[0] === 'a' && t[1]?.startsWith('1:'))
          .map(t => ({
            id: t[1].split(':')[1], // Extract note ID from "1:&lt;note-id&gt;"
            title: t[2], // Optional title specified in tag
            added_at: parseInt(t[3] || '0', 10) || event.created_at,
          }));

        return {
          id: event.tags.find(t => t[0] === 'd')?.[1] || '',
          name,
          description,
          videos,
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
          `1:${video.id}`, // Reference format for notes
          video.title || '',
          video.added_at.toString(),
        ])),
      ];

      await publishEvent({
        kind: PLAYLIST_KIND,
        tags,
        content: '', // Content can be empty as per NIP-51
      });

      playlist.eventId = publishedEvent.id;
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

  const addVideo = async (playlistId: string, videoId: string, videoTitle?: string) => {
    const playlist = query.data?.find(p => p.id === playlistId);
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
          title: videoTitle,
          added_at: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await updatePlaylist.mutateAsync(updatedPlaylist);
  };

  const removeVideo = async (playlistId: string, videoId: string) => {
    const playlist = query.data?.find(p => p.id === playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const updatedPlaylist = {
      ...playlist,
      videos: playlist.videos.filter(video => video.id !== videoId),
    };

    await updatePlaylist.mutateAsync(updatedPlaylist);
  };

  const deletePlaylist = async (eventId: string) => {
    if (!user?.pubkey) throw new Error('User not logged in');

    await publishEvent({
      kind: PLAYLIST_KIND,
      tags: [
        ['d', playlistId],
      ],
      content: '',
    });

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