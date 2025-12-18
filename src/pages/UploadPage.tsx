import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { VideoUpload } from '@/components/VideoUpload'
import { DraftPicker } from '@/components/upload/DraftPicker'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { useEffect, useCallback } from 'react'

export function UploadPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    deleteDraft,
    refreshDrafts,
    flushNostrSync,
  } = useUploadDrafts()

  // When navigating back to draft picker, force a refresh to get latest data
  useEffect(() => {
    if (!currentDraft) {
      refreshDrafts()
    }
  }, [currentDraft, refreshDrafts])

  // Handle back navigation with Nostr sync flush
  const handleBack = useCallback(() => {
    flushNostrSync() // Flush any pending Nostr saves
    setCurrentDraft(null)
  }, [flushNostrSync, setCurrentDraft])

  // Handle max drafts error
  const handleNewUpload = () => {
    try {
      const newDraft = createDraft()
      setCurrentDraft(newDraft)
    } catch {
      toast({
        title: t('upload.draft.maxDraftsReached'),
        variant: 'destructive',
        duration: 5000,
      })
    }
  }

  // 0 drafts → new empty form
  if (drafts.length === 0) {
    const newDraft = createDraft()
    return <VideoUpload draft={newDraft} />
  }

  // 1 draft → auto-resume
  //if (drafts.length === 1) {
  //    return <VideoUpload draft={drafts[0]} />
  //  }

  // 2+ drafts → picker or form
  if (!currentDraft) {
    return (
      <DraftPicker
        drafts={drafts}
        onSelectDraft={setCurrentDraft}
        onNewUpload={handleNewUpload}
        onDeleteDraft={deleteDraft}
      />
    )
  }

  return <VideoUpload draft={currentDraft} onBack={handleBack} />
}
