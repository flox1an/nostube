import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { VideoUpload } from '@/components/VideoUpload'
import { DraftPicker } from '@/components/upload/DraftPicker'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { useEffect, useCallback } from 'react'

export function UploadPage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = `${t('upload.title')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
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

  // Auto-create and select a draft when there are no drafts
  useEffect(() => {
    if (drafts.length === 0 && !currentDraft) {
      const newDraft = createDraft()
      setCurrentDraft(newDraft)
    }
  }, [drafts.length, currentDraft, createDraft, setCurrentDraft])

  // Handle back navigation with Nostr sync flush
  const handleBack = useCallback(async () => {
    await flushNostrSync() // Wait for pending Nostr saves to complete
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

  // Show loading state while auto-creating draft
  if (drafts.length === 0 && !currentDraft) {
    return null
  }

  // Show draft picker if no draft is selected
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
