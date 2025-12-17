import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUploadDrafts } from './useUploadDrafts'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('useUploadDrafts', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('starts with empty drafts', () => {
    const { result } = renderHook(() => useUploadDrafts())
    expect(result.current.drafts).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('creates a new draft with UUID', () => {
    const { result } = renderHook(() => useUploadDrafts())

    act(() => {
      const draft = result.current.createDraft()
      expect(draft.id).toBeTruthy()
      expect(draft.createdAt).toBeLessThanOrEqual(Date.now())
      expect(draft.updatedAt).toBeLessThanOrEqual(Date.now())
      expect(draft.title).toBe('')
      expect(draft.uploadInfo.videos).toEqual([])
    })

    expect(result.current.drafts).toHaveLength(1)
  })

  it('enforces max 10 drafts', () => {
    const { result } = renderHook(() => useUploadDrafts())

    // Create 10 drafts
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.createDraft()
      }
    })

    expect(result.current.drafts).toHaveLength(10)

    // Try to create 11th
    expect(() => {
      act(() => {
        result.current.createDraft()
      })
    }).toThrow('Maximum 10 drafts allowed')
  })

  it('updates draft and modifies updatedAt', async () => {
    const { result } = renderHook(() => useUploadDrafts())

    let draftId: string
    act(() => {
      const draft = result.current.createDraft()
      draftId = draft.id
    })

    const originalUpdatedAt = result.current.drafts[0].updatedAt

    // Wait a bit to ensure timestamp differs
    await new Promise(resolve => setTimeout(resolve, 10))

    act(() => {
      result.current.updateDraft(draftId, { title: 'Updated Title' })
    })

    expect(result.current.drafts[0].title).toBe('Updated Title')
    expect(result.current.drafts[0].updatedAt).toBeGreaterThan(originalUpdatedAt)
  })

  it('deletes draft', () => {
    const { result } = renderHook(() => useUploadDrafts())

    let draftId: string
    act(() => {
      const draft = result.current.createDraft()
      draftId = draft.id
    })

    expect(result.current.drafts).toHaveLength(1)

    act(() => {
      result.current.deleteDraft(draftId)
    })

    expect(result.current.drafts).toHaveLength(0)
  })

  it('persists to localStorage on create', () => {
    const { result } = renderHook(() => useUploadDrafts())

    act(() => {
      result.current.createDraft()
    })

    const stored = localStorage.getItem('nostube_upload_drafts')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.version).toBe('1')
    expect(parsed.drafts).toHaveLength(1)
  })

  it('loads from localStorage on mount', () => {
    // Pre-populate localStorage
    const draft = {
      id: 'test-id',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Stored Draft',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file' as const,
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated' as const
    }
    localStorage.setItem('nostube_upload_drafts', JSON.stringify({
      version: '1',
      lastModified: Date.now(),
      drafts: [draft]
    }))

    const { result } = renderHook(() => useUploadDrafts())

    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0].title).toBe('Stored Draft')
  })
})
