import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import type { UploadDraft } from '@/types/upload-draft'
import { VideoUpload } from '@/components/VideoUpload'
import { DraftPicker } from '@/components/upload/DraftPicker'
import { useToast } from '@/hooks/useToast'
import { appTitle, pageTitle } from '@nostube/core/instance-config'
import { useTranslation } from 'react-i18next'
import { useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export function UploadPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    document.title = pageTitle(`${t('upload.title')}`)
    return () => {
      document.title = appTitle()
    }
  }, [t])
  const { toast } = useToast()
  const {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraftInMemory,
    persistDraft,
    deleteDraft,
    refreshDrafts,
    flushNostrSync,
  } = useUploadDrafts()

  // Track ephemeral (not yet persisted) draft
  const ephemeralDraftRef = useRef<UploadDraft | null>(null)

  // When navigating back to draft picker, force a refresh to get latest data
  const prevDraftRef = useRef(currentDraft)
  useEffect(() => {
    if (prevDraftRef.current && !currentDraft) {
      // Only refresh when transitioning from editing a draft back to the picker
      refreshDrafts()
    }
    prevDraftRef.current = currentDraft
  }, [currentDraft, refreshDrafts])

  // Auto-select a draft from query param (e.g., /upload?draft=<id>)
  useEffect(() => {
    const draftId = searchParams.get('draft')
    if (draftId && !currentDraft) {
      const match = drafts.find(d => d.id === draftId)
      if (match) {
        setCurrentDraft(match)
        // Clean up draft param from URL (keep step if present)
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('draft')
        setSearchParams(newParams, { replace: true })
      }
    }
  }, [drafts, currentDraft, searchParams, setCurrentDraft, setSearchParams])

  // The page always shows a fresh form with the saved drafts underneath, so a video can be
  // dropped on arrival without picking a draft first. The form is an ephemeral (in-memory)
  // draft; it is persisted once the user takes a meaningful action.
  useEffect(() => {
    if (!currentDraft && !searchParams.get('draft')) {
      if (!ephemeralDraftRef.current) {
        ephemeralDraftRef.current = createDraftInMemory()
      }
      setCurrentDraft(ephemeralDraftRef.current)
    }
  }, [currentDraft, createDraftInMemory, setCurrentDraft, searchParams])

  // Persist an ephemeral draft to localStorage when user takes a meaningful action
  const handlePersist = useCallback(() => {
    if (ephemeralDraftRef.current) {
      try {
        persistDraft(ephemeralDraftRef.current)
      } catch {
        // All slots hold visible drafts: the upload continues, it just is not saved as a draft.
        toast({ title: t('upload.draft.maxDraftsReached'), variant: 'destructive', duration: 5000 })
      }
      ephemeralDraftRef.current = null
    }
  }, [persistDraft, toast, t])

  // Handle back navigation with Nostr sync flush
  const handleBack = useCallback(async () => {
    await flushNostrSync() // Wait for pending Nostr saves to complete
    ephemeralDraftRef.current = null // back starts a fresh form, the drafts stay listed below
    setCurrentDraft(null)
  }, [flushNostrSync, setCurrentDraft])

  // Show loading state while auto-creating draft
  if ((!drafts || drafts.length === 0) && !currentDraft) {
    return null
  }

  if (!currentDraft) {
    return null
  }

  return (
    <>
      <VideoUpload draft={currentDraft} onBack={handleBack} onPersist={handlePersist} />
      {drafts.some(draft => draft.id !== currentDraft.id) && (
        <DraftPicker
          drafts={drafts.filter(draft => draft.id !== currentDraft.id)}
          onSelectDraft={setCurrentDraft}
          onDeleteDraft={deleteDraft}
        />
      )}
    </>
  )
}
