import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import type { UploadDraft } from '@/types/upload-draft'
import { DraftCard } from './DraftCard'

interface DraftPickerProps {
  drafts: UploadDraft[]
  onSelectDraft: (draft: UploadDraft) => void
  onNewUpload: () => void
  onDeleteDraft: (draftId: string) => void
}

export function DraftPicker({ drafts, onSelectDraft, onNewUpload, onDeleteDraft }: DraftPickerProps) {
  const { t } = useTranslation()
  const { toast, dismiss } = useToast()
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const deleteTimeoutRef = useRef<NodeJS.Timeout>()

  const handleDelete = (draftId: string) => {
    setDeletingDraftId(draftId)

    const { id } = toast({
      title: t('upload.draft.deleted'),
      description: t('upload.draft.deletedDescription'),
      action: (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleUndo(id)}
        >
          {t('upload.draft.undo')}
        </Button>
      ),
      duration: 5000
    })

    deleteTimeoutRef.current = setTimeout(() => {
      onDeleteDraft(draftId)
      setDeletingDraftId(null)
    }, 5000)
  }

  const handleUndo = (toastId: string) => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current)
    }
    setDeletingDraftId(null)
    dismiss(toastId)
  }

  const visibleDrafts = drafts.filter(d => d.id !== deletingDraftId)

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Button onClick={onNewUpload} size="lg" className="w-full mb-6">
        {t('upload.draft.newUpload')}
      </Button>

      <h2 className="text-2xl font-bold mb-4">
        {t('upload.draft.yourDrafts', { count: visibleDrafts.length })}
      </h2>

      <div className="space-y-4">
        {visibleDrafts.map(draft => (
          <DraftCard
            key={draft.id}
            draft={draft}
            onSelect={() => onSelectDraft(draft)}
            onDelete={() => handleDelete(draft.id)}
          />
        ))}
      </div>
    </div>
  )
}
