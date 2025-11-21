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
import { useTranslation } from 'react-i18next'

interface CreatePlaylistDialogProps {
  onClose: () => void
  onCreatePlaylist: (name: string, description?: string) => Promise<void>
}

export function CreatePlaylistDialog({ onClose, onCreatePlaylist }: CreatePlaylistDialogProps) {
  const { t } = useTranslation()

  const { data, updateField, isSubmitting, handleSubmit } = useFormDialog({
    initialData: { name: '', description: '' },
    onSubmit: async data => await onCreatePlaylist(data.name, data.description),
    onClose,
    successMessage: t('playlists.create.successMessage'),
    validate: data => (!data.name.trim() ? t('playlists.create.emptyNameError') : undefined),
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('playlists.create.button')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('playlists.create.title')}</DialogTitle>
          <DialogDescription>{t('playlists.create.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('playlists.create.name')}</Label>
              <Input
                id="name"
                value={data.name}
                onChange={e => updateField('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('playlists.create.descriptionLabel')}</Label>
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
              {t('playlists.create.button')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
