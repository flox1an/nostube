import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import type { UploadDraft } from '@/types/upload-draft'
import { DraftCard } from './DraftCard'
import { DeleteDraftDialog } from './DeleteDraftDialog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { deleteBlobFromMultipleServers } from '@/lib/blossom-upload'

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

    // Collect all blob hashes and their server URLs
    const blobsToDelete: { hash: string; servers: string[] }[] = []

    // Add video blobs
    for (const video of draftToDelete.uploadInfo.videos) {
      for (const blob of video.uploadedBlobs) {
        // Extract server URL from blob URL
        const url = new URL(blob.url)
        const serverUrl = `${url.protocol}//${url.host}`

        blobsToDelete.push({
          hash: blob.sha256,
          servers: [serverUrl],
        })
      }

      // Add mirrored blobs
      for (const blob of video.mirroredBlobs) {
        const url = new URL(blob.url)
        const serverUrl = `${url.protocol}//${url.host}`

        // Check if we already have this hash
        const existing = blobsToDelete.find(b => b.hash === blob.sha256)
        if (existing) {
          if (!existing.servers.includes(serverUrl)) {
            existing.servers.push(serverUrl)
          }
        } else {
          blobsToDelete.push({
            hash: blob.sha256,
            servers: [serverUrl],
          })
        }
      }
    }

    // Add thumbnail blobs
    for (const blob of draftToDelete.thumbnailUploadInfo.uploadedBlobs) {
      const url = new URL(blob.url)
      const serverUrl = `${url.protocol}//${url.host}`

      const existing = blobsToDelete.find(b => b.hash === blob.sha256)
      if (existing) {
        if (!existing.servers.includes(serverUrl)) {
          existing.servers.push(serverUrl)
        }
      } else {
        blobsToDelete.push({
          hash: blob.sha256,
          servers: [serverUrl],
        })
      }
    }

    for (const blob of draftToDelete.thumbnailUploadInfo.mirroredBlobs) {
      const url = new URL(blob.url)
      const serverUrl = `${url.protocol}//${url.host}`

      const existing = blobsToDelete.find(b => b.hash === blob.sha256)
      if (existing) {
        if (!existing.servers.includes(serverUrl)) {
          existing.servers.push(serverUrl)
        }
      } else {
        blobsToDelete.push({
          hash: blob.sha256,
          servers: [serverUrl],
        })
      }
    }

    if (import.meta.env.DEV) {
      console.log('[DraftPicker] Deleting blobs:', blobsToDelete)
    }

    // Delete all blobs from their servers
    const deletionPromises = blobsToDelete.map(({ hash, servers }) =>
      deleteBlobFromMultipleServers(
        servers,
        hash,
        async draft => await user.signer.signEvent(draft)
      )
    )

    const results = await Promise.allSettled(deletionPromises)

    // Count successful deletions
    let totalSuccessful = 0
    let totalFailed = 0

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        totalSuccessful += result.value.successful.length
        totalFailed += result.value.failed.length
      } else {
        totalFailed++
      }
    })

    // Delete the draft
    onDeleteDraft(draftToDelete.id)

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
