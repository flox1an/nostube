import { useState, useEffect, useCallback } from 'react'
import type { UploadDraft, UploadDraftsData } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'

const STORAGE_KEY = 'nostube_upload_drafts'
const MAX_DRAFTS = 10

export function useUploadDrafts() {
  const [drafts, setDrafts] = useState<UploadDraft[]>([])
  const [currentDraft, setCurrentDraft] = useState<UploadDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed: UploadDraftsData = JSON.parse(stored)
        const cleaned = removeOldDrafts(parsed.drafts, 30)
        setDrafts(cleaned)

        // Save cleaned version if we removed any
        if (cleaned.length !== parsed.drafts.length) {
          saveToLocalStorage(cleaned)
        }
      } catch (error) {
        console.error('Failed to load drafts from localStorage:', error)
      }
    }
    setIsLoading(false)
  }, [])

  const saveToLocalStorage = useCallback((draftsToSave: UploadDraft[]) => {
    const data: UploadDraftsData = {
      version: '1',
      lastModified: Date.now(),
      drafts: draftsToSave
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [])

  const createDraft = useCallback((): UploadDraft => {
    const newDraft: UploadDraft = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated'
    }

    setDrafts(prev => {
      if (prev.length >= MAX_DRAFTS) {
        throw new Error('Maximum 10 drafts allowed')
      }

      const updated = [...prev, newDraft]
      saveToLocalStorage(updated)
      return updated
    })

    return newDraft
  }, [saveToLocalStorage])

  const updateDraft = useCallback((draftId: string, updates: Partial<UploadDraft>) => {
    setDrafts(prev => {
      const updated = prev.map(d =>
        d.id === draftId
          ? { ...d, ...updates, updatedAt: Date.now() }
          : d
      )
      saveToLocalStorage(updated)
      return updated
    })
  }, [saveToLocalStorage])

  const deleteDraft = useCallback((draftId: string) => {
    setDrafts(prev => {
      const updated = prev.filter(d => d.id !== draftId)
      saveToLocalStorage(updated)
      return updated
    })
  }, [saveToLocalStorage])

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    isLoading
  }
}
