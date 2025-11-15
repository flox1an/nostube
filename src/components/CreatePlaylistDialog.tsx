import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { useFormDialog } from '@/hooks'
import { Label } from '@/components/ui/label'

interface CreatePlaylistDialogProps {
  onClose: () => void
  onCreatePlaylist: (name: string, description?: string) => Promise<void>
}

export function CreatePlaylistDialog({ onClose, onCreatePlaylist }: CreatePlaylistDialogProps) {
  const { data, updateField, isSubmitting, handleSubmit } = useFormDialog({
    initialData: { name: '', description: '' },
    onSubmit: async data => await onCreatePlaylist(data.name, data.description),
    onClose,
    successMessage: 'Your new playlist has been created successfully.',
    validate: data => (!data.name.trim() ? 'Playlist name cannot be empty.' : undefined),
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
          <DialogDescription>
            Enter a name and optional description for your new playlist.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={data.name}
                onChange={e => updateField('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={data.description}
                onChange={e => updateField('description', e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!data.name.trim() || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Playlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
