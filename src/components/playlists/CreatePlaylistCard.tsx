import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CreatePlaylistCardProps {
  onCreatePlaylist: (name: string, description?: string) => Promise<void>
}

export function CreatePlaylistCard({ onCreatePlaylist }: CreatePlaylistCardProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    try {
      await onCreatePlaylist(name.trim(), description.trim() || undefined)
      setDialogOpen(false)
      setName('')
      setDescription('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCardClick = () => {
    setDialogOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCardClick}
        className="group block rounded-lg overflow-hidden bg-card hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {/* Dashed border thumbnail area */}
        <div className="aspect-video flex items-center justify-center border-2 border-dashed border-muted-foreground/30 group-hover:border-muted-foreground/50 transition-colors rounded-t-lg m-1 mb-0">
          <Plus className="h-10 w-10 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        </div>

        {/* Card content */}
        <div className="p-3">
          <h3 className="font-medium text-muted-foreground">{t('playlists.create.newPlaylist')}</h3>
        </div>
      </button>

      {/* Create playlist dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('playlists.create.namePlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('playlists.create.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('playlists.create.descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || isSubmitting}>
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
    </>
  )
}
