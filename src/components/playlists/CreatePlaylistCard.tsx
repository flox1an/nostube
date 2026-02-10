import { useState } from 'react'
import { Plus, Loader2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCurrentUser } from '@/hooks'

interface CreatePlaylistCardProps {
  onCreatePlaylist: (name: string, description?: string, isPrivate?: boolean) => Promise<void>
}

export function CreatePlaylistCard({ onCreatePlaylist }: CreatePlaylistCardProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hasNip44 = Boolean(user?.signer?.nip44)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    try {
      await onCreatePlaylist(name.trim(), description.trim() || undefined, isPrivate)
      setDialogOpen(false)
      setName('')
      setDescription('')
      setIsPrivate(false)
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="private-toggle">{t('playlists.private.label')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('playlists.private.description')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="private-toggle"
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                  disabled={!hasNip44}
                />
              </div>
              {!hasNip44 && (
                <p className="text-xs text-yellow-600">
                  {t('playlists.private.noEncryptionSupport')}
                </p>
              )}
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
