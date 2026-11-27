import { useState } from 'react'
import { Plus, Loader2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import { Label } from '@nostube/widgets/components/label'
import { Switch } from '@nostube/widgets/components/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { useCurrentUser } from '@/hooks'
import { usePrivateRelays } from '@/contexts/PrivateRelaysContext'

interface CreatePlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreatePlaylist: (name: string, description?: string, isPrivate?: boolean) => Promise<void>
}

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreatePlaylist,
}: CreatePlaylistDialogProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { relays: privateRelays } = usePrivateRelays()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hasNip44 = Boolean(user?.signer?.nip44)
  const canCreatePrivate = hasNip44 && privateRelays.length > 0

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      await onCreatePlaylist(name.trim(), description.trim() || undefined, isPrivate)
      onOpenChange(false)
      setName('')
      setDescription('')
      setIsPrivate(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('playlists.create.title')}</DialogTitle>
          <DialogDescription>{t('playlists.create.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cdp-name">{t('playlists.create.name')}</Label>
              <Input
                id="cdp-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('playlists.create.namePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cdp-description">{t('playlists.create.descriptionLabel')}</Label>
              <Textarea
                id="cdp-description"
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
                  <Label htmlFor="cdp-private">{t('playlists.private.label')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('playlists.private.description')}
                  </p>
                </div>
              </div>
              <Switch
                id="cdp-private"
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                disabled={!canCreatePrivate}
              />
            </div>
            {!canCreatePrivate && (
              <p className="text-xs text-yellow-600">
                {hasNip44
                  ? 'Configure a private relay in Network settings to create private playlists.'
                  : t('playlists.private.noEncryptionSupport')}
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
  )
}
