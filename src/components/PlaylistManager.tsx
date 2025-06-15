import { useMemo, useState } from 'react';
import { type Playlist, type Video, usePlaylists } from '@/hooks/usePlaylist';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2 } from 'lucide-react';

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface VideoListProps {
  videos: Video[];
  onRemove: (videoId: string) => Promise<void>;
}

function VideoList({ videos, onRemove }: VideoListProps) {
  if (videos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No videos in this playlist yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {videos.map((video) => (
        <div
          key={video.id}
          className="flex items-center justify-between py-2 border-b last:border-0"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {video.title || 'Untitled Video'}
            </p>
            <p className="text-xs text-muted-foreground">
              Added {formatDate(video.added_at)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(video.id)}
            className="ml-2 flex-shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function PlaylistManager() {
  const { user } = useCurrentUser();
  const { playlists, isLoading, createPlaylist, deletePlaylist, removeVideo } = usePlaylists();
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatePlaylistDialogOpen, setIsCreatePlaylistDialogOpen] = useState(false);

  const handleDelete = async () => {
    if (playlistToDelete?.eventId) {
      setIsDeleting(true);
      await deletePlaylist(playlistToDelete.eventId);
      setPlaylistToDelete(null);
      setIsDeleting(false);
    }
  };

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) => b.videos.length - a.videos.length);
  }, [playlists]);

  if (!user) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <p className="text-muted-foreground">
              Please log in to manage your playlists
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (sortedPlaylists.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <CreatePlaylistDialog
            onCreatePlaylist={createPlaylist}
            onClose={() => setIsCreatePlaylistDialogOpen(false)}
          />
        </div>
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <p className="text-muted-foreground">
                No playlists yet. Create your first playlist to start organizing your favorite videos!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreatePlaylistDialog
          onCreatePlaylist={createPlaylist}
          onClose={() => setIsCreatePlaylistDialogOpen(false)}
        />
      </div>
      
      <Accordion type="multiple" className="w-full">
        {sortedPlaylists.map((playlist) => (
          <AccordionItem key={playlist.identifier} value={playlist.identifier}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex-1 flex items-center justify-between mr-4">
                <div>
                  <h3 className="text-base font-semibold">{playlist.name}</h3>
                  {playlist.description && (
                    <p className="text-sm text-muted-foreground">{playlist.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">
                    {playlist.videos.length} video{playlist.videos.length !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaylistToDelete(playlist);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <VideoList
                videos={playlist.videos}
                onRemove={(videoId) => removeVideo(playlist.identifier, videoId)}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <AlertDialog open={!!playlistToDelete} onOpenChange={() => setPlaylistToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{playlistToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Playlist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}