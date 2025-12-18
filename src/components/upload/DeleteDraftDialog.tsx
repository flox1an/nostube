import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import type { UploadDraft } from '@/types/upload-draft'

interface DeleteDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: UploadDraft | null
  onDeleteDraftOnly: () => void
  onDeleteWithMedia: () => Promise<void>
}

export function DeleteDraftDialog({
  open,
  onOpenChange,
  draft,
  onDeleteDraftOnly,
  onDeleteWithMedia,
}: DeleteDraftDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteWithMedia = async () => {
    setIsDeleting(true)
    try {
      await onDeleteWithMedia()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to delete media:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteDraftOnly = () => {
    onDeleteDraftOnly()
    onOpenChange(false)
  }

  if (!draft) return null

  // Check if draft has any uploaded media
  const hasUploadedVideos = draft.uploadInfo.videos.some(v => v.uploadedBlobs.length > 0)
  const hasUploadedThumbnails = draft.thumbnailUploadInfo.uploadedBlobs.length > 0
  const hasMedia = hasUploadedVideos || hasUploadedThumbnails

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('upload.draft.deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasMedia
              ? t('upload.draft.deleteDialog.descriptionWithMedia')
              : t('upload.draft.deleteDialog.descriptionNoMedia')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={handleDeleteDraftOnly}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            {t('upload.draft.deleteDialog.deleteDraftOnly')}
          </Button>
          {hasMedia && (
            <AlertDialogAction onClick={handleDeleteWithMedia} disabled={isDeleting}>
              {isDeleting
                ? t('common.deleting')
                : t('upload.draft.deleteDialog.deleteVideoAndThumbnails')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
