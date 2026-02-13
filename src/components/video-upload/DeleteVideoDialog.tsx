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
import type { VideoVariant } from '@/lib/video-processing'

interface DeleteVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  video: VideoVariant | null
  onDeleteFromFormOnly: () => void
  onDeleteWithBlobs: () => Promise<unknown>
}

export function DeleteVideoDialog({
  open,
  onOpenChange,
  video,
  onDeleteFromFormOnly,
  onDeleteWithBlobs,
}: DeleteVideoDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteWithBlobs = async () => {
    setIsDeleting(true)
    try {
      await onDeleteWithBlobs()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to delete video blobs:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteFromFormOnly = () => {
    onDeleteFromFormOnly()
    onOpenChange(false)
  }

  if (!video) return null

  // Check if video has any uploaded blobs
  const hasUploadedBlobs = (video.uploadedBlobs?.length ?? 0) > 0
  const hasMirroredBlobs = (video.mirroredBlobs?.length ?? 0) > 0
  const hasBlobs = hasUploadedBlobs || hasMirroredBlobs
  const totalServers = (video.uploadedBlobs?.length ?? 0) + (video.mirroredBlobs?.length ?? 0)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('upload.deleteVideoDialog.title', { defaultValue: 'Delete Video Variant' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasBlobs
              ? t('upload.deleteVideoDialog.descriptionWithBlobs', {
                  defaultValue:
                    'This video ({{quality}}) has been uploaded to {{count}} server(s). What would you like to do?',
                  quality: video.qualityLabel || video.dimension,
                  count: totalServers,
                })
              : t('upload.deleteVideoDialog.descriptionNoBlobs', {
                  defaultValue:
                    'Are you sure you want to remove this video ({{quality}}) from your upload?',
                  quality: video.qualityLabel || video.dimension,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <AlertDialogCancel disabled={isDeleting}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          {hasBlobs && (
            <Button
              variant="outline"
              onClick={handleDeleteFromFormOnly}
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              {t('upload.deleteVideoDialog.removeFromForm', {
                defaultValue: 'Remove from Form Only',
              })}
            </Button>
          )}
          <AlertDialogAction
            onClick={hasBlobs ? handleDeleteWithBlobs : handleDeleteFromFormOnly}
            disabled={isDeleting}
          >
            {isDeleting
              ? t('common.deleting', { defaultValue: 'Deleting...' })
              : hasBlobs
                ? t('upload.deleteVideoDialog.deleteFromServers', {
                    defaultValue: 'Delete from Servers',
                  })
                : t('upload.deleteVideoDialog.remove', { defaultValue: 'Remove' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
