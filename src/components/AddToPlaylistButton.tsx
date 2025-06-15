import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlaylists } from '@/hooks/usePlaylist';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';

interface AddToPlaylistButtonProps {
  videoId: string;
  videoTitle?: string;
}

export function AddToPlaylistButton({ videoId, videoTitle }: AddToPlaylistButtonProps) {
  const { user } = useCurrentUser();
  const { playlists, isLoading, addVideo } = usePlaylists();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  if (isLoading) {
    return <Skeleton className="h-9 w-[140px]" />;
  }

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    try {
      setIsAdding(true);
      await addVideo(playlistId, videoId, videoTitle);
      toast({
        title: 'Video added to playlist',
        description: `Successfully added to "${playlistName}"`,
      });
      setOpen(false);
    } catch (e) {
      toast({
        title: 'Error adding to playlist',
        description: 'Failed to add video to playlist. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => handleAddToPlaylist(playlists[0].id, playlists[0].name)}
          disabled={isAdding}
        >
          {isAdding ? (
            <Skeleton className="mr-2 h-4 w-4" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {isAdding ? 'Adding...' : 'Add to Playlist'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogDescription>
            Choose a playlist to add this video to.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandList>
            {playlists.length === 0 ? (
              <CommandEmpty>No playlists found. Create one first!</CommandEmpty>
            ) : (
              <CommandGroup>
                {playlists.map((playlist) => {
                  const hasVideo = playlist.videos.some(v => v.id === videoId);
                  return (
                    <CommandItem
                      key={playlist.id}
                      disabled={hasVideo || isAdding}
                      onSelect={() => handleAddToPlaylist(playlist.id, playlist.name)}
                    >
                      {playlist.name}
                      {hasVideo && <Check className="ml-2 h-4 w-4" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}