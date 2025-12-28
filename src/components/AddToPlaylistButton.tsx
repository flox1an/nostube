import { useState } from 'react'
import { Check, ListPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useCurrentUser, usePlaylists, useToast } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'

interface AddToPlaylistButtonProps {
  videoId: string
  videoKind: number
  videoTitle?: string
  asMenuItem?: boolean
}

export function AddToPlaylistButton({
  videoId,
  videoTitle,
  videoKind,
  asMenuItem = false,
}: AddToPlaylistButtonProps) {
  const { user } = useCurrentUser()
  const { playlists, isLoading, addVideo } = usePlaylists()
  const { toast } = useToast()
  const [isAdding, setIsAdding] = useState(false)
  const [open, setOpen] = useState(false)

  if (!user) return null

  if (isLoading) {
    return <Skeleton className="h-9 w-[140px]" />
  }

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    try {
      setIsAdding(true)
      await addVideo(playlistId, videoId, videoKind, videoTitle)
      toast({
        title: 'Video added to playlist',
        description: `Successfully added to "${playlistName}"`,
      })
      setOpen(false)
    } catch (error) {
      toast({
        title: 'Error adding to playlist',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to add video to playlist. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asMenuItem ? (
          <DropdownMenuItem onSelect={e => e.preventDefault()} disabled={isAdding}>
            <ListPlus className="w-5 h-5" />
            &nbsp; {isAdding ? 'Adding...' : 'Playlist'}
          </DropdownMenuItem>
        ) : (
          <Button variant="secondary" className="w-full justify-start" disabled={isAdding}>
            {isAdding ? <Skeleton className="mr-2 h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isAdding ? 'Adding...' : 'Playlist'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogDescription>Choose a playlist to add this video to.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandList>
            {playlists.length === 0 ? (
              <CommandEmpty>No playlists found. Create one first!</CommandEmpty>
            ) : (
              <CommandGroup>
                {playlists.map(playlist => {
                  const hasVideo = playlist.videos.some(v => v.id === videoId)
                  return (
                    <CommandItem
                      key={playlist.identifier}
                      disabled={hasVideo || isAdding}
                      onSelect={() => handleAddToPlaylist(playlist.identifier, playlist.name)}
                    >
                      {playlist.name}
                      {hasVideo && <Check className="ml-2 h-4 w-4" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
