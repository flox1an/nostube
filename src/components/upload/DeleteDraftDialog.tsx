import { type MouseEvent, useState } from 'react'
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
import { Progress } from '@/components/ui/progress'
import { useTranslation } from 'react-i18next'
import type { UploadDraft } from '@/types/upload-draft'
import { countBlobDeletionTargets, type DeleteBlobsProgress } from '@/lib/blossom-upload'

interface DeleteDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: UploadDraft | null
  onDeleteDraftOnly: () => void
  onDeleteWithMedia: (onProgress: (progress: DeleteBlobsProgress) => void) => Promise<void>
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
  const [deleteProgress, setDeleteProgress] = useState<DeleteBlobsProgress | null>(null)

  const handleDeleteWithMedia = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDeleting(true)
    setDeleteProgress({
      completed: 0,
      total: mediaFileCount,
      successful: 0,
      failed: 0,
    })
    try {
      await onDeleteWithMedia(setDeleteProgress)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to delete media:', error)
    } finally {
      setIsDeleting(false)
      setDeleteProgress(null)
    }
  }

  const handleDeleteDraftOnly = () => {
    onDeleteDraftOnly()
    onOpenChange(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting && !nextOpen) return
    onOpenChange(nextOpen)
  }

  if (!draft) return null

  // Check if draft has any uploaded media
  const mediaBlobs = [
    ...draft.uploadInfo.videos.flatMap(v => [...v.uploadedBlobs, ...v.mirroredBlobs]),
    ...draft.thumbnailUploadInfo.uploadedBlobs,
    ...draft.thumbnailUploadInfo.mirroredBlobs,
    ...(draft.subtitles ?? []).flatMap(subtitle => [
      ...subtitle.uploadedBlobs,
      ...subtitle.mirroredBlobs,
    ]),
  ]
  const mediaFileCount = countBlobDeletionTargets(mediaBlobs)
  const hasMedia = mediaFileCount > 0
  const progressValue = deleteProgress
    ? Math.round((deleteProgress.completed / Math.max(deleteProgress.total, 1)) * 100)
    : 0

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('upload.draft.deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasMedia
              ? t('upload.draft.deleteDialog.descriptionWithMedia')
              : t('upload.draft.deleteDialog.descriptionNoMedia')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasMedia && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">
                {t('upload.draft.deleteDialog.mediaFileCount', {
                  count: mediaFileCount,
                  defaultValue: '{{count}} media files will be deleted',
                })}
              </span>
              {isDeleting && deleteProgress && (
                <span className="text-muted-foreground">
                  {deleteProgress.completed}/{deleteProgress.total}
                </span>
              )}
            </div>
            {isDeleting && deleteProgress && (
              <div className="mt-3 space-y-2">
                <Progress value={progressValue} />
                <p className="text-xs text-muted-foreground">
                  {t('upload.draft.deleteDialog.deleteProgress', {
                    completed: deleteProgress.completed,
                    total: deleteProgress.total,
                    defaultValue: 'Deleting {{completed}} of {{total}} media files...',
                  })}
                </p>
              </div>
            )}
          </div>
        )}
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
