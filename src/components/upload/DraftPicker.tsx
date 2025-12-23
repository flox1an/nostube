import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import type { UploadDraft } from '@/types/upload-draft'
import { DraftCard } from './DraftCard'
import { DeleteDraftDialog } from './DeleteDraftDialog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { deleteBlobsFromServers } from '@/lib/blossom-upload'
import { useUploadNotifications } from '@/hooks/useUploadNotifications'

interface DraftPickerProps {
  drafts: UploadDraft[]
  onSelectDraft: (draft: UploadDraft) => void
  onNewUpload: () => void
  onDeleteDraft: (draftId: string) => void
}

export function DraftPicker({
  drafts,
  onSelectDraft,
  onNewUpload,
  onDeleteDraft,
}: DraftPickerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { user } = useCurrentUser()
  const { removeByDraftId } = useUploadNotifications()
  const [draftToDelete, setDraftToDelete] = useState<UploadDraft | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  if (import.meta.env.DEV) {
    console.log('[DraftPicker] Rendering with drafts:', drafts)
  }

  const handleDeleteClick = (draft: UploadDraft) => {
    setDraftToDelete(draft)
    setShowDeleteDialog(true)
  }

  const handleDeleteDraftOnly = () => {
    if (draftToDelete) {
      onDeleteDraft(draftToDelete.id)
      removeByDraftId(draftToDelete.id) // Also remove related notifications
      toast({
        title: t('upload.draft.deleted'),
        description: t('upload.draft.deletedDescription'),
        duration: 3000,
      })
    }
  }

  const handleDeleteWithMedia = async () => {
    if (!draftToDelete || !user?.signer) {
      throw new Error('No draft to delete or user not logged in')
    }

    // Collect all blobs from videos and thumbnails
    const allBlobs = [
      ...draftToDelete.uploadInfo.videos.flatMap(v => [...v.uploadedBlobs, ...v.mirroredBlobs]),
      ...draftToDelete.thumbnailUploadInfo.uploadedBlobs,
      ...draftToDelete.thumbnailUploadInfo.mirroredBlobs,
    ]

    // Delete all blobs from their servers
    const { totalSuccessful, totalFailed } = await deleteBlobsFromServers(
      allBlobs,
      async draft => await user.signer.signEvent(draft)
    )

    // Delete the draft and related notifications
    onDeleteDraft(draftToDelete.id)
    removeByDraftId(draftToDelete.id)

    // Show result toast
    if (totalSuccessful > 0 && totalFailed === 0) {
      toast({
        title: t('upload.draft.deletedWithMedia'),
        description: t('upload.draft.deletedWithMediaDescription', { count: totalSuccessful }),
        duration: 3000,
      })
    } else if (totalSuccessful > 0 && totalFailed > 0) {
      toast({
        title: t('upload.draft.deletedPartial'),
        description: t('upload.draft.deletedPartialDescription', {
          successful: totalSuccessful,
          failed: totalFailed,
        }),
        duration: 5000,
      })
    } else {
      toast({
        title: t('upload.draft.deletedMediaFailed'),
        description: t('upload.draft.deletedMediaFailedDescription'),
        variant: 'destructive',
        duration: 5000,
      })
      // Still delete the draft even if media deletion failed
    }
  }

  return (
    <>
      <div className="container mx-auto py-8 max-w-4xl">
        <h2 className="text-2xl font-bold mb-4">
          {t('upload.draft.yourDrafts', { count: drafts.length })}
        </h2>

        <div className="space-y-4 mb-8">
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onSelect={() => onSelectDraft(draft)}
              onDelete={() => handleDeleteClick(draft)}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <Button onClick={onNewUpload} variant="secondary" size="lg">
            + {t('upload.draft.newUpload')}
          </Button>
        </div>
      </div>

      <DeleteDraftDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        draft={draftToDelete}
        onDeleteDraftOnly={handleDeleteDraftOnly}
        onDeleteWithMedia={handleDeleteWithMedia}
      />
    </>
  )
}
