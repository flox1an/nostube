import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Loader2, Lock } from 'lucide-react'
import { nip19 } from 'nostr-tools'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { PlaylistThumbnailCollage } from './PlaylistThumbnailCollage'
import type { Playlist } from '@/hooks/usePlaylist'
import { useCurrentUser } from '@/hooks'

interface PlaylistCardProps {
  playlist: Playlist
  userPubkey: string
  writeRelays: string[]
  onDelete: (eventId: string) => Promise<void>
  onUpdate: (playlist: Playlist) => Promise<Playlist | void>
}

export function PlaylistCard({
  playlist,
  userPubkey,
  writeRelays,
  onDelete,
  onUpdate,
}: PlaylistCardProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(playlist.name)
  const [editDescription, setEditDescription] = useState(playlist.description || '')
  const [editIsPrivate, setEditIsPrivate] = useState(playlist.isPrivate || false)

  const hasNip44 = Boolean(user?.signer?.nip44)

  const playlistNaddr = nip19.naddrEncode({
    kind: 30005,
    pubkey: userPubkey,
    identifier: playlist.identifier,
    relays: writeRelays.slice(0, 3),
  })

  const videoIds = playlist.videos.map(v => v.id)

  const handleDelete = async () => {
    if (!playlist.eventId) return
    setIsDeleting(true)
    try {
      await onDelete(playlist.eventId)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsEditing(true)
    try {
      await onUpdate({
        ...playlist,
        name: editName,
        description: editDescription,
        isPrivate: editIsPrivate,
      })
      setEditDialogOpen(false)
    } finally {
      setIsEditing(false)
    }
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditName(playlist.name)
    setEditDescription(playlist.description || '')
    setEditIsPrivate(playlist.isPrivate || false)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDeleteDialogOpen(true)
  }

  return (
    <>
      <Link
        to={`/playlist/${playlistNaddr}`}
        className="group block rounded-lg overflow-hidden bg-card hover:scale-105 transition-transform duration-200"
      >
        {/* Thumbnail area with hover overlay */}
        <div className="relative">
          <PlaylistThumbnailCollage videoIds={videoIds} />

          {/* Hover overlay with action buttons */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white"
              onClick={handleEditClick}
              aria-label={t('playlists.edit')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white"
              onClick={handleDeleteClick}
              aria-label={t('playlists.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Card content */}
        <div className="p-3">
          <h3 className="font-medium line-clamp-1 flex items-center gap-1.5">
            {playlist.isPrivate && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {playlist.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {playlist.videos.length} {playlist.videos.length === 1 ? 'video' : 'videos'}
          </p>
        </div>
      </Link>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('playlists.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('playlists.deleteConfirm.description', { name: playlist.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('playlists.deleteConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit playlist dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('playlists.editDialog.title')}</DialogTitle>
            <DialogDescription>{t('playlists.editDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t('playlists.create.name')}</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">{t('playlists.create.descriptionLabel')}</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="edit-private-toggle">{t('playlists.private.label')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('playlists.private.description')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="edit-private-toggle"
                  checked={editIsPrivate}
                  onCheckedChange={setEditIsPrivate}
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
              <Button type="submit" disabled={!editName.trim() || isEditing}>
                {isEditing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-2 h-4 w-4" />
                )}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
