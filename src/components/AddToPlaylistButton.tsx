import { useState } from 'react'
import { ArrowLeft, Check, ListPlus, Loader2, Lock, Plus } from 'lucide-react'
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
  CommandSeparator,
} from '@/components/ui/command'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser, usePlaylists, useToast } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from 'react-i18next'

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
  const { playlists, isLoading, addVideo, createPlaylist } = usePlaylists()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [isAdding, setIsAdding] = useState(false)
  const [open, setOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  if (!user) return null

  if (isLoading) {
    return <Skeleton className="h-9 w-[140px]" />
  }

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    try {
      setIsAdding(true)
      await addVideo(playlistId, videoId, videoKind, videoTitle)
      toast({
        title: t('addToPlaylist.added'),
        description: t('addToPlaylist.addedDescription', { name: playlistName }),
      })
      setOpen(false)
    } catch (error) {
      toast({
        title: t('addToPlaylist.error'),
        description: error instanceof Error ? error.message : t('addToPlaylist.errorDescription'),
        variant: 'destructive',
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleCreateAndAdd = async () => {
    const name = newPlaylistName.trim()
    if (!name) return

    try {
      setIsCreating(true)
      await createPlaylist(name)
      // Find the newly created playlist by name to get its identifier
      // The createPlaylist function publishes to relays and eventStore updates reactively,
      // but we can construct the identifier the same way the hook does (nanoid-based).
      // Instead, we'll just add the video after a short delay to let the store update.
      // A simpler approach: create the playlist, close the create form, and let the user
      // select it from the updated list.
      toast({
        title: t('playlists.create.successMessage'),
      })
      setNewPlaylistName('')
      setShowCreateForm(false)
      // The playlists array will reactively update with the new playlist
    } catch (error) {
      toast({
        title: t('addToPlaylist.createError'),
        description:
          error instanceof Error ? error.message : t('addToPlaylist.createErrorDescription'),
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setShowCreateForm(false)
      setNewPlaylistName('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {asMenuItem ? (
          <DropdownMenuItem onSelect={e => e.preventDefault()} disabled={isAdding}>
            <ListPlus className="w-5 h-5" />
            &nbsp; {isAdding ? t('addToPlaylist.adding') : t('addToPlaylist.playlist')}
          </DropdownMenuItem>
        ) : (
          <Button variant="secondary" className="w-full justify-start" disabled={isAdding}>
            {isAdding ? <Skeleton className="mr-2 h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isAdding ? t('addToPlaylist.adding') : t('addToPlaylist.playlist')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('addToPlaylist.title')}</DialogTitle>
          <DialogDescription>
            {showCreateForm
              ? t('addToPlaylist.createDescription')
              : t('addToPlaylist.chooseDescription')}
          </DialogDescription>
        </DialogHeader>

        {showCreateForm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playlist-name">{t('playlists.create.name')}</Label>
              <Input
                id="playlist-name"
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                placeholder={t('playlists.create.namePlaceholder')}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newPlaylistName.trim()) {
                    e.preventDefault()
                    handleCreateAndAdd()
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false)
                  setNewPlaylistName('')
                }}
                disabled={isCreating}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('addToPlaylist.back')}
              </Button>
              <Button
                size="sm"
                onClick={handleCreateAndAdd}
                disabled={!newPlaylistName.trim() || isCreating}
                className="ml-auto"
              >
                {isCreating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                {t('playlists.create.button')}
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandList>
              {playlists.length === 0 ? (
                <CommandEmpty>{t('addToPlaylist.noPlaylists')}</CommandEmpty>
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
                        {playlist.isPrivate && (
                          <Lock className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {playlist.name}
                        {hasVideo && <Check className="ml-2 h-4 w-4" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={() => setShowCreateForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addToPlaylist.createNew')}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  )
}
