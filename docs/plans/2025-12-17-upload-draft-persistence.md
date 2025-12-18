# Upload Draft Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement NIP-78 based upload draft persistence allowing users to resume upload workflows across page refreshes and devices.

**Architecture:** Dual-persistence strategy with localStorage as primary storage and NIP-78 Nostr sync for multi-device support. Draft picker shows when 2+ drafts exist, auto-resumes single draft, creates new draft when none exist.

**Tech Stack:** React 19, TypeScript, Applesauce, NIP-78, localStorage, react-i18next, shadcn/ui

---

## Phase 1: Core Infrastructure

### Task 1: Create TypeScript Interfaces

**Files:**

- Create: `src/types/upload-draft.ts`

**Step 1: Create UploadDraft interface**

Create the file with complete type definitions:

```typescript
import type { BlobDescriptor } from 'blossom-client-sdk'

export interface UploadDraft {
  id: string
  createdAt: number
  updatedAt: number

  // Form fields
  title: string
  description: string
  tags: string[]
  language: string

  // Content warning
  contentWarning: {
    enabled: boolean
    reason: string
  }

  // Input method
  inputMethod: 'file' | 'url'
  videoUrl?: string

  // Uploaded content (blob descriptors only)
  uploadInfo: {
    videos: VideoVariant[]
  }

  thumbnailUploadInfo: {
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
  }

  // Metadata
  thumbnailSource: 'generated' | 'upload'
}

export interface UploadDraftsData {
  version: string
  lastModified: number
  drafts: UploadDraft[]
}

// Import VideoVariant from existing type
import type { VideoVariant } from '@/lib/video-processing'
```

**Step 2: Verify imports work**

Run: `npm run typecheck`
Expected: No errors related to upload-draft.ts

**Step 3: Commit**

```bash
git add src/types/upload-draft.ts
git commit -m "feat: add UploadDraft TypeScript interfaces"
```

---

### Task 2: Create Utility Functions with Tests

**Files:**

- Create: `src/lib/upload-draft-utils.ts`
- Create: `src/lib/upload-draft-utils.test.ts`

**Step 1: Write test for getSmartStatus**

```typescript
import { describe, it, expect } from 'vitest'
import { getSmartStatus } from './upload-draft-utils'
import type { UploadDraft } from '@/types/upload-draft'

describe('getSmartStatus', () => {
  it('returns addVideo when no videos', () => {
    const draft: UploadDraft = {
      id: 'test',
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
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addVideo')
  })

  it('returns addTitle when video but no title', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: {
        uploadedBlobs: [
          {
            url: 'http://test.com/thumb',
            sha256: 'def',
            size: 10,
            type: 'image/jpeg',
            uploaded: Date.now(),
          },
        ],
        mirroredBlobs: [],
      },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addTitle')
  })

  it('returns addThumbnail when video and title but no thumbnail', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'My Video',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addThumbnail')
  })

  it('returns ready when complete', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'My Video',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: {
        uploadedBlobs: [
          {
            url: 'http://test.com/thumb',
            sha256: 'def',
            size: 10,
            type: 'image/jpeg',
            uploaded: Date.now(),
          },
        ],
        mirroredBlobs: [],
      },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.ready')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: FAIL with "Cannot find module './upload-draft-utils'"

**Step 3: Implement getSmartStatus**

Create `src/lib/upload-draft-utils.ts`:

```typescript
import type { UploadDraft } from '@/types/upload-draft'

export function getSmartStatus(draft: UploadDraft): string {
  if (draft.uploadInfo.videos.length === 0) {
    return 'upload.draft.status.addVideo'
  }

  if (!draft.title || draft.title.trim() === '') {
    return 'upload.draft.status.addTitle'
  }

  if (draft.thumbnailUploadInfo.uploadedBlobs.length === 0) {
    return 'upload.draft.status.addThumbnail'
  }

  return 'upload.draft.status.ready'
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/upload-draft-utils.ts src/lib/upload-draft-utils.test.ts
git commit -m "feat: add getSmartStatus utility with tests"
```

---

### Task 3: Add Video Quality Info Utility

**Files:**

- Modify: `src/lib/upload-draft-utils.ts`
- Modify: `src/lib/upload-draft-utils.test.ts`

**Step 1: Add test for getVideoQualityInfo**

Append to test file:

```typescript
describe('getVideoQualityInfo', () => {
  it('returns empty string when no videos', () => {
    const draft: UploadDraft = {
      id: 'test',
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
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('')
  })

  it('formats single quality correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 450,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('1080p • 450 MB')
  })

  it('formats multiple qualities correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1280x720',
            duration: 120,
            sizeMB: 200,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 450,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('720p, 1080p • 650 MB')
  })

  it('converts MB to GB correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '3840x2160',
            duration: 120,
            sizeMB: 2048,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('4K • 2.0 GB')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: FAIL with "getVideoQualityInfo is not a function"

**Step 3: Implement getVideoQualityInfo**

Add to `src/lib/upload-draft-utils.ts`:

```typescript
export function getVideoQualityInfo(draft: UploadDraft): string {
  if (draft.uploadInfo.videos.length === 0) return ''

  const qualities = draft.uploadInfo.videos.map(v => {
    const [, height] = v.dimension.split('x').map(Number)
    if (height >= 2160) return '4K'
    if (height >= 1440) return '1440p'
    if (height >= 1080) return '1080p'
    if (height >= 720) return '720p'
    if (height >= 480) return '480p'
    return '360p'
  })

  const totalSizeMB = draft.uploadInfo.videos.reduce((sum, v) => sum + (v.sizeMB || 0), 0)
  const sizeStr =
    totalSizeMB > 1024 ? `${(totalSizeMB / 1024).toFixed(1)} GB` : `${Math.round(totalSizeMB)} MB`

  return `${qualities.join(', ')} • ${sizeStr}`
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/lib/upload-draft-utils.ts src/lib/upload-draft-utils.test.ts
git commit -m "feat: add getVideoQualityInfo utility with tests"
```

---

### Task 4: Add Relative Time Utility

**Files:**

- Modify: `src/lib/upload-draft-utils.ts`
- Modify: `src/lib/upload-draft-utils.test.ts`

**Step 1: Add test for getRelativeTime**

Append to test file:

```typescript
describe('getRelativeTime', () => {
  it('returns justNow for < 1 minute', () => {
    const timestamp = Date.now() - 30000 // 30 seconds ago
    expect(getRelativeTime(timestamp)).toBe('upload.draft.time.justNow')
  })

  it('returns minutes ago for < 1 hour', () => {
    const timestamp = Date.now() - 5 * 60000 // 5 minutes ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.minutesAgo', { count: 5 }])
  })

  it('returns hours ago for < 24 hours', () => {
    const timestamp = Date.now() - 3 * 3600000 // 3 hours ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.hoursAgo', { count: 3 }])
  })

  it('returns days ago for < 30 days', () => {
    const timestamp = Date.now() - 5 * 86400000 // 5 days ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.daysAgo', { count: 5 }])
  })

  it('returns months ago for >= 30 days', () => {
    const timestamp = Date.now() - 60 * 86400000 // 60 days ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.monthsAgo', { count: 2 }])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: FAIL with "getRelativeTime is not a function"

**Step 3: Implement getRelativeTime**

Add to `src/lib/upload-draft-utils.ts`:

```typescript
export function getRelativeTime(timestamp: number): string | [string, { count: number }] {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'upload.draft.time.justNow'
  if (minutes < 60) return ['upload.draft.time.minutesAgo', { count: minutes }]
  if (hours < 24) return ['upload.draft.time.hoursAgo', { count: hours }]
  if (days < 30) return ['upload.draft.time.daysAgo', { count: days }]
  return ['upload.draft.time.monthsAgo', { count: Math.floor(days / 30) }]
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: PASS (13 tests)

**Step 5: Commit**

```bash
git add src/lib/upload-draft-utils.ts src/lib/upload-draft-utils.test.ts
git commit -m "feat: add getRelativeTime utility with tests"
```

---

### Task 5: Add Draft Cleanup Utility

**Files:**

- Modify: `src/lib/upload-draft-utils.ts`
- Modify: `src/lib/upload-draft-utils.test.ts`

**Step 1: Add test for removeOldDrafts**

Append to test file:

```typescript
describe('removeOldDrafts', () => {
  it('removes drafts older than 30 days', () => {
    const now = Date.now()
    const drafts: UploadDraft[] = [
      {
        id: '1',
        createdAt: now - 31 * 86400000, // 31 days ago
        updatedAt: now,
        title: 'Old',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
      {
        id: '2',
        createdAt: now - 5 * 86400000, // 5 days ago
        updatedAt: now,
        title: 'Recent',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
    ]
    const result = removeOldDrafts(drafts, 30)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('keeps all recent drafts', () => {
    const now = Date.now()
    const drafts: UploadDraft[] = [
      {
        id: '1',
        createdAt: now - 1 * 86400000,
        updatedAt: now,
        title: 'Draft 1',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
      {
        id: '2',
        createdAt: now - 2 * 86400000,
        updatedAt: now,
        title: 'Draft 2',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
    ]
    const result = removeOldDrafts(drafts, 30)
    expect(result).toHaveLength(2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: FAIL with "removeOldDrafts is not a function"

**Step 3: Implement removeOldDrafts**

Add to `src/lib/upload-draft-utils.ts`:

```typescript
export function removeOldDrafts(drafts: UploadDraft[], maxAgeDays = 30): UploadDraft[] {
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  return drafts.filter(d => d.createdAt > cutoffTime)
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- upload-draft-utils.test.ts`
Expected: PASS (15 tests)

**Step 5: Commit**

```bash
git add src/lib/upload-draft-utils.ts src/lib/upload-draft-utils.test.ts
git commit -m "feat: add removeOldDrafts utility with tests"
```

---

### Task 6: Create useUploadDrafts Hook (localStorage only)

**Files:**

- Create: `src/hooks/useUploadDrafts.ts`
- Create: `src/hooks/useUploadDrafts.test.tsx`

**Step 1: Write test for basic CRUD operations**

Create test file:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUploadDrafts } from './useUploadDrafts'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
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
      thumbnailSource: 'generated' as const,
    }
    localStorage.setItem(
      'nostube_upload_drafts',
      JSON.stringify({
        version: '1',
        lastModified: Date.now(),
        drafts: [draft],
      })
    )

    const { result } = renderHook(() => useUploadDrafts())

    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0].title).toBe('Stored Draft')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- useUploadDrafts.test.tsx`
Expected: FAIL with "Cannot find module './useUploadDrafts'"

**Step 3: Implement useUploadDrafts hook (localStorage only)**

Create `src/hooks/useUploadDrafts.ts`:

```typescript
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
      drafts: draftsToSave,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [])

  const createDraft = useCallback((): UploadDraft => {
    if (drafts.length >= MAX_DRAFTS) {
      throw new Error('Maximum 10 drafts allowed')
    }

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
      thumbnailSource: 'generated',
    }

    const updated = [...drafts, newDraft]
    setDrafts(updated)
    saveToLocalStorage(updated)

    return newDraft
  }, [drafts, saveToLocalStorage])

  const updateDraft = useCallback(
    (draftId: string, updates: Partial<UploadDraft>) => {
      setDrafts(prev => {
        const updated = prev.map(d =>
          d.id === draftId ? { ...d, ...updates, updatedAt: Date.now() } : d
        )
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage]
  )

  const deleteDraft = useCallback(
    (draftId: string) => {
      setDrafts(prev => {
        const updated = prev.filter(d => d.id !== draftId)
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage]
  )

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    isLoading,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- useUploadDrafts.test.tsx`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/hooks/useUploadDrafts.ts src/hooks/useUploadDrafts.test.tsx
git commit -m "feat: add useUploadDrafts hook with localStorage persistence"
```

---

## Phase 2: Draft Picker UI

### Task 7: Add Translation Keys (EN only)

**Files:**

- Modify: `public/locales/en/translation.json`

**Step 1: Add draft-related translation keys**

Add to the `upload` section:

```json
{
  "upload": {
    // ... existing keys ...
    "draft": {
      "newUpload": "New Upload",
      "yourDrafts": "Your Drafts ({{count}})",
      "untitled": "Untitled",
      "backToDrafts": "Back to Drafts",
      "status": {
        "addVideo": "Add video to start",
        "addTitle": "Add title to publish",
        "addThumbnail": "Add thumbnail to publish",
        "ready": "Ready to publish"
      },
      "delete": "Delete",
      "deleted": "Draft deleted",
      "deletedDescription": "Draft will be permanently deleted in 5 seconds",
      "undo": "Undo",
      "maxDraftsReached": "Maximum 10 drafts reached. Please complete or delete existing drafts.",
      "time": {
        "justNow": "Just now",
        "minutesAgo": "{{count}} minute ago",
        "minutesAgo_plural": "{{count}} minutes ago",
        "hoursAgo": "{{count}} hour ago",
        "hoursAgo_plural": "{{count}} hours ago",
        "daysAgo": "{{count}} day ago",
        "daysAgo_plural": "{{count}} days ago",
        "monthsAgo": "{{count}} month ago",
        "monthsAgo_plural": "{{count}} months ago"
      },
      "loadFailed": "Failed to load drafts. Using local drafts only.",
      "saveFailed": "Failed to sync draft to Nostr. Changes saved locally.",
      "syncFailed": "Draft sync failed. Your work is safe locally.",
      "notFound": "Draft not found",
      "notFoundDescription": "This draft may have been deleted or expired."
    }
  }
}
```

**Step 2: Verify JSON is valid**

Run: `npm run build`
Expected: No JSON parse errors

**Step 3: Commit**

```bash
git add public/locales/en/translation.json
git commit -m "feat: add English translations for draft feature"
```

---

### Task 8: Create DraftCard Component

**Files:**

- Create: `src/components/upload/DraftCard.tsx`
- Create: `src/components/upload/DraftCard.test.tsx`

**Step 1: Write test for DraftCard**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftCard } from './DraftCard'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

const mockDraft: UploadDraft = {
  id: 'test-id',
  createdAt: Date.now() - 2 * 3600000, // 2 hours ago
  updatedAt: Date.now() - 2 * 3600000,
  title: 'My Test Video',
  description: 'Test description',
  tags: ['test'],
  language: 'en',
  contentWarning: { enabled: false, reason: '' },
  inputMethod: 'file',
  uploadInfo: {
    videos: [{
      inputMethod: 'file',
      dimension: '1920x1080',
      duration: 120,
      sizeMB: 450,
      uploadedBlobs: [{ url: 'http://test.com/video', sha256: 'abc', size: 100, type: 'video/mp4', uploaded: Date.now() }],
      mirroredBlobs: []
    }]
  },
  thumbnailUploadInfo: {
    uploadedBlobs: [{ url: 'http://test.com/thumb.jpg', sha256: 'def', size: 10, type: 'image/jpeg', uploaded: Date.now() }],
    mirroredBlobs: []
  },
  thumbnailSource: 'generated'
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

describe('DraftCard', () => {
  it('renders title', () => {
    render(
      <DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('My Test Video')).toBeInTheDocument()
  })

  it('renders "Untitled" when no title', () => {
    const draftNoTitle = { ...mockDraft, title: '' }
    render(
      <DraftCard draft={draftNoTitle} onSelect={vi.fn()} onDelete={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('renders thumbnail when available', () => {
    render(
      <DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />,
      { wrapper }
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'http://test.com/thumb.jpg')
  })

  it('renders placeholder when no thumbnail', () => {
    const draftNoThumb = {
      ...mockDraft,
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] }
    }
    render(
      <DraftCard draft={draftNoThumb} onSelect={vi.fn()} onDelete={vi.fn()} />,
      { wrapper }
    )
    // Should have placeholder div with ImageOff icon
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(
      <DraftCard draft={mockDraft} onSelect={onSelect} onDelete={vi.fn()} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('My Test Video'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn()
    render(
      <DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={onDelete} />,
      { wrapper }
    )
    const deleteBtn = screen.getByRole('button')
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('displays video quality info', () => {
    render(
      <DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText(/1080p • 450 MB/)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- DraftCard.test.tsx`
Expected: FAIL with "Cannot find module './DraftCard'"

**Step 3: Implement DraftCard component**

Create `src/components/upload/DraftCard.tsx`:

```typescript
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ImageOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UploadDraft } from '@/types/upload-draft'
import { getSmartStatus, getVideoQualityInfo, getRelativeTime } from '@/lib/upload-draft-utils'

interface DraftCardProps {
  draft: UploadDraft
  onSelect: () => void
  onDelete: () => void
}

export function DraftCard({ draft, onSelect, onDelete }: DraftCardProps) {
  const { t } = useTranslation()
  const thumbnailUrl = draft.thumbnailUploadInfo.uploadedBlobs[0]?.url
  const smartStatus = getSmartStatus(draft)
  const qualityInfo = getVideoQualityInfo(draft)
  const relativeTime = getRelativeTime(draft.updatedAt)

  const timeText = typeof relativeTime === 'string'
    ? t(relativeTime)
    : t(relativeTime[0], relativeTime[1])

  return (
    <Card
      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors group"
      onClick={onSelect}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={draft.title || t('upload.draft.untitled')}
              className="w-32 h-20 object-cover rounded"
            />
          ) : (
            <div className="w-32 h-20 bg-muted rounded flex items-center justify-center">
              <ImageOff className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">
            {draft.title || t('upload.draft.untitled')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {qualityInfo || '—'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t(smartStatus)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {timeText}
          </p>
        </div>

        {/* Delete button */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- DraftCard.test.tsx`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/components/upload/DraftCard.tsx src/components/upload/DraftCard.test.tsx
git commit -m "feat: add DraftCard component with tests"
```

---

### Task 9: Create DraftPicker Component

**Files:**

- Create: `src/components/upload/DraftPicker.tsx`
- Create: `src/components/upload/DraftPicker.test.tsx`

**Step 1: Write test for DraftPicker**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DraftPicker } from './DraftPicker'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

const mockDrafts: UploadDraft[] = [
  {
    id: 'draft-1',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    title: 'Draft 1',
    description: '',
    tags: [],
    language: 'en',
    contentWarning: { enabled: false, reason: '' },
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    thumbnailSource: 'generated'
  },
  {
    id: 'draft-2',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    title: 'Draft 2',
    description: '',
    tags: [],
    language: 'en',
    contentWarning: { enabled: false, reason: '' },
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    thumbnailSource: 'generated'
  }
]

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

describe('DraftPicker', () => {
  it('renders "New Upload" button', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('New Upload')).toBeInTheDocument()
  })

  it('displays correct draft count', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('Your Drafts (2)')).toBeInTheDocument()
  })

  it('renders all draft cards', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('Draft 1')).toBeInTheDocument()
    expect(screen.getByText('Draft 2')).toBeInTheDocument()
  })

  it('calls onNewUpload when New Upload clicked', () => {
    const onNewUpload = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={onNewUpload}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('New Upload'))
    expect(onNewUpload).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectDraft when draft card clicked', () => {
    const onSelectDraft = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={onSelectDraft}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Draft 1'))
    expect(onSelectDraft).toHaveBeenCalledWith(mockDrafts[0])
  })

  it('shows undo toast on delete', async () => {
    const onDeleteDraft = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={onDeleteDraft}
      />,
      { wrapper }
    )

    // Find delete button (first one)
    const deleteButtons = screen.getAllByRole('button')
    const firstDeleteBtn = deleteButtons.find(btn => btn.querySelector('svg'))

    if (firstDeleteBtn) {
      fireEvent.click(firstDeleteBtn)
      await waitFor(() => {
        expect(screen.getByText('Draft deleted')).toBeInTheDocument()
      })
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- DraftPicker.test.tsx`
Expected: FAIL with "Cannot find module './DraftPicker'"

**Step 3: Implement DraftPicker component**

Create `src/components/upload/DraftPicker.tsx`:

```typescript
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/use-toast'
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
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- DraftPicker.test.tsx`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/components/upload/DraftPicker.tsx src/components/upload/DraftPicker.test.tsx
git commit -m "feat: add DraftPicker component with delete undo"
```

---

## Phase 3: Integration

### Task 10: Refactor useVideoUpload to Accept Draft

**Files:**

- Modify: `src/hooks/useVideoUpload.ts`

**Step 1: Update useVideoUpload signature**

Modify the function signature and state initialization:

```typescript
export function useVideoUpload(
  initialDraft?: UploadDraft,
  onDraftChange?: (updates: Partial<UploadDraft>) => void
) {
  const [title, setTitle] = useState(initialDraft?.title || '')
  const [description, setDescription] = useState(initialDraft?.description || '')
  const [tags, setTags] = useState<string[]>(initialDraft?.tags || [])
  const [language, setLanguage] = useState(initialDraft?.language || 'en')
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>(initialDraft?.inputMethod || 'file')
  const [videoUrl, setVideoUrl] = useState(initialDraft?.videoUrl || '')
  const [uploadInfo, setUploadInfo] = useState<UploadInfo>(initialDraft?.uploadInfo || { videos: [] })
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<ThumbnailUploadInfo>(
    initialDraft?.thumbnailUploadInfo || { uploadedBlobs: [], mirroredBlobs: [], uploading: false }
  )
  const [contentWarningEnabled, setContentWarningEnabled] = useState(initialDraft?.contentWarning.enabled || false)
  const [contentWarningReason, setContentWarningReason] = useState(initialDraft?.contentWarning.reason || '')
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>(initialDraft?.thumbnailSource || 'generated')

  // ... rest of existing state
```

**Step 2: Add sync effect**

Add near the end of the hook, before the return statement:

```typescript
// Sync changes back to draft
useEffect(() => {
  if (onDraftChange) {
    onDraftChange({
      title,
      description,
      tags,
      language,
      inputMethod,
      videoUrl,
      uploadInfo,
      thumbnailUploadInfo,
      contentWarning: { enabled: contentWarningEnabled, reason: contentWarningReason },
      thumbnailSource,
      updatedAt: Date.now(),
    })
  }
}, [
  title,
  description,
  tags,
  language,
  inputMethod,
  videoUrl,
  uploadInfo,
  thumbnailUploadInfo,
  contentWarningEnabled,
  contentWarningReason,
  thumbnailSource,
  onDraftChange,
])
```

**Step 3: Add import at top of file**

```typescript
import type { UploadDraft } from '@/types/upload-draft'
```

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/hooks/useVideoUpload.ts
git commit -m "refactor: add draft initialization and sync to useVideoUpload"
```

---

### Task 11: Refactor VideoUpload to UploadForm Component

**Files:**

- Modify: `src/components/VideoUpload.tsx`

**Step 1: Add imports and props interface**

Add at top of file:

```typescript
import type { UploadDraft } from '@/types/upload-draft'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { useCallback } from 'react'

interface UploadFormProps {
  draft: UploadDraft
  onBack?: () => void
}
```

**Step 2: Update component signature**

Change from:

```typescript
export function VideoUpload() {
```

To:

```typescript
export function VideoUpload({ draft, onBack }: UploadFormProps) {
```

**Step 3: Add draft integration logic**

Add after the existing hook calls:

```typescript
const { updateDraft, deleteDraft } = useUploadDrafts()

const handleDraftChange = useCallback(
  (updates: Partial<UploadDraft>) => {
    updateDraft(draft.id, updates)
  },
  [draft.id, updateDraft]
)
```

**Step 4: Update useVideoUpload call**

Change from:

```typescript
const {
  // ... destructured values
} = useVideoUpload()
```

To:

```typescript
const videoUploadState = useVideoUpload(draft, handleDraftChange)
const {
  // ... destructured values
} = videoUploadState
```

**Step 5: Wrap handleSubmit to delete draft on success**

After the existing handleSubmit, wrap it:

```typescript
const originalHandleSubmit = handleSubmit

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  try {
    await originalHandleSubmit(e)
    // On success, delete the draft
    deleteDraft(draft.id)
  } catch (error) {
    // Keep draft on error
    console.error('Publish failed:', error)
  }
}
```

**Step 6: Add back button to UI**

Add before the Card content:

```typescript
  return (
    <>
      <Card className="max-w-4xl mx-auto">
        {onBack && (
          <div className="p-4 border-b">
            <Button onClick={onBack} variant="ghost">
              ← {t('upload.draft.backToDrafts')}
            </Button>
          </div>
        )}

        {/* Existing Card content */}
        <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2 mb-4">
```

**Step 7: Verify types compile**

Run: `npm run typecheck`
Expected: No errors

**Step 8: Commit**

```bash
git add src/components/VideoUpload.tsx
git commit -m "refactor: convert VideoUpload to accept draft prop and integrate with useUploadDrafts"
```

---

### Task 12: Create UploadPage with Conditional Rendering

**Files:**

- Modify: `src/pages/UploadPage.tsx` (if exists, otherwise create it)
- Modify: `src/AppRouter.tsx`

**Step 1: Create/update UploadPage component**

```typescript
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { VideoUpload } from '@/components/VideoUpload'
import { DraftPicker } from '@/components/upload/DraftPicker'
import { useToast } from '@/hooks/use-toast'
import { useTranslation } from 'react-i18next'

export default function UploadPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { drafts, currentDraft, setCurrentDraft, createDraft, deleteDraft } = useUploadDrafts()

  // Handle max drafts error
  const handleNewUpload = () => {
    try {
      const newDraft = createDraft()
      setCurrentDraft(newDraft)
    } catch (error) {
      toast({
        title: t('upload.draft.maxDraftsReached'),
        variant: 'destructive',
        duration: 5000
      })
    }
  }

  // 0 drafts → new empty form
  if (drafts.length === 0) {
    const newDraft = createDraft()
    return <VideoUpload draft={newDraft} />
  }

  // 1 draft → auto-resume
  if (drafts.length === 1) {
    return <VideoUpload draft={drafts[0]} />
  }

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

  return (
    <VideoUpload
      draft={currentDraft}
      onBack={() => setCurrentDraft(null)}
    />
  )
}
```

**Step 2: Update AppRouter if needed**

Check `src/AppRouter.tsx` to ensure UploadPage is properly imported and routed. If the current route uses VideoUpload directly, update it to use UploadPage.

**Step 3: Verify app compiles**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Test in browser**

Run: `npm run dev`
Navigate to /upload
Expected: Creates a draft and shows upload form

**Step 5: Commit**

```bash
git add src/pages/UploadPage.tsx src/AppRouter.tsx
git commit -m "feat: add conditional rendering logic to UploadPage"
```

---

### Task 13: Add Debounced Auto-Save Logic

**Files:**

- Modify: `src/hooks/useUploadDrafts.ts`

**Step 1: Add debounce utility**

At the top of the file, add:

```typescript
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}
```

**Step 2: Add milestone detection helper**

```typescript
function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs
  )
}
```

**Step 3: Update updateDraft to use debouncing**

Create separate functions:

```typescript
const saveDraftsImmediate = useCallback(
  (draftsToSave: UploadDraft[]) => {
    saveToLocalStorage(draftsToSave)
  },
  [saveToLocalStorage]
)

const debouncedSaveDrafts = useCallback(
  debounce((draftsToSave: UploadDraft[]) => {
    saveToLocalStorage(draftsToSave)
  }, 3000),
  [saveToLocalStorage]
)

const updateDraft = useCallback(
  (draftId: string, updates: Partial<UploadDraft>) => {
    setDrafts(prev => {
      const updated = prev.map(d =>
        d.id === draftId ? { ...d, ...updates, updatedAt: Date.now() } : d
      )

      // Immediate save for milestones, debounced for form fields
      if (isMilestoneUpdate(updates)) {
        saveDraftsImmediate(updated)
      } else {
        debouncedSaveDrafts(updated)
      }

      return updated
    })
  },
  [saveDraftsImmediate, debouncedSaveDrafts]
)
```

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/hooks/useUploadDrafts.ts
git commit -m "feat: add debounced auto-save for form fields and immediate save for milestones"
```

---

## Phase 4: Nostr Sync (Optional for MVP)

### Task 14: Add NIP-78 Event Publishing

**Files:**

- Modify: `src/hooks/useUploadDrafts.ts`

**Step 1: Add imports**

```typescript
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { useAppContext } from './useAppContext'
import { nowInSecs } from '@/lib/utils'
```

**Step 2: Add hooks**

At the start of useUploadDrafts:

```typescript
const { user } = useCurrentUser()
const { publish } = useNostrPublish()
const { config } = useAppContext()
```

**Step 3: Implement saveToNostr**

```typescript
const saveToNostr = useCallback(
  async (draftsToSave: UploadDraft[]) => {
    if (!user) return

    try {
      const event = {
        kind: 30078,
        content: JSON.stringify({
          version: '1',
          lastModified: Date.now(),
          drafts: draftsToSave,
        }),
        created_at: nowInSecs(),
        tags: [['d', 'nostube-uploads']],
      }

      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

      await publish({ event, relays: writeRelays })
    } catch (error) {
      console.error('Failed to sync to Nostr:', error)
      // Silent failure - localStorage has the data
    }
  },
  [user, publish, config.relays]
)
```

**Step 4: Update save functions to sync to Nostr**

```typescript
const saveDraftsImmediate = useCallback(
  (draftsToSave: UploadDraft[]) => {
    saveToLocalStorage(draftsToSave)
    saveToNostr(draftsToSave)
  },
  [saveToLocalStorage, saveToNostr]
)

const debouncedSaveDrafts = useCallback(
  debounce((draftsToSave: UploadDraft[]) => {
    saveToLocalStorage(draftsToSave)
    saveToNostr(draftsToSave)
  }, 3000),
  [saveToLocalStorage, saveToNostr]
)
```

**Step 5: Verify compiles**

Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/hooks/useUploadDrafts.ts
git commit -m "feat: add NIP-78 Nostr event publishing for drafts"
```

---

### Task 15: Add NIP-78 Event Loading and Subscription

**Files:**

- Modify: `src/hooks/useUploadDrafts.ts`

**Step 1: Add more imports**

```typescript
import { useEventStore } from 'applesauce-react/hooks'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
```

**Step 2: Add EventStore hook**

```typescript
const eventStore = useEventStore()
const { pool } = useAppContext()
```

**Step 3: Add subscription effect**

```typescript
// Subscribe to NIP-78 event changes
useEffect(() => {
  if (!user?.pubkey) return

  const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

  const loader = createAddressLoader(pool)
  const sub = loader({
    kind: 30078,
    pubkey: user.pubkey,
    identifier: 'nostube-uploads',
    relays: readRelays,
  }).subscribe(event => {
    if (event) {
      try {
        const parsed = JSON.parse(event.content)
        const nostrDrafts = parsed.drafts || []
        mergeDraftsFromNostr(nostrDrafts)
      } catch (error) {
        console.error('Failed to parse NIP-78 event:', error)
      }
    }
  })

  return () => sub.unsubscribe()
}, [user?.pubkey, pool, config.relays])
```

**Step 4: Implement merge function**

```typescript
const mergeDraftsFromNostr = useCallback(
  (nostrDrafts: UploadDraft[]) => {
    setDrafts(prevLocal => {
      const draftMap = new Map<string, UploadDraft>()

      // Add local drafts first
      prevLocal.forEach(d => draftMap.set(d.id, d))

      // Nostr drafts win on conflict (newer updatedAt)
      nostrDrafts.forEach(d => {
        const existing = draftMap.get(d.id)
        if (!existing || d.updatedAt > existing.updatedAt) {
          draftMap.set(d.id, d)
        }
      })

      // Sort by updatedAt descending
      const merged = Array.from(draftMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)

      // Save merged result to localStorage
      saveToLocalStorage(merged)

      return merged
    })
  },
  [saveToLocalStorage]
)
```

**Step 5: Verify compiles**

Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/hooks/useUploadDrafts.ts
git commit -m "feat: add NIP-78 event subscription and merge logic"
```

---

## Phase 5: Polish

### Task 16: Add Translations for DE/FR/ES

**Files:**

- Modify: `public/locales/de/translation.json`
- Modify: `public/locales/fr/translation.json`
- Modify: `public/locales/es/translation.json`

**Step 1: Add German translations**

In `public/locales/de/translation.json`, add to upload section:

```json
{
  "upload": {
    "draft": {
      "newUpload": "Neuer Upload",
      "yourDrafts": "Ihre Entwürfe ({{count}})",
      "untitled": "Ohne Titel",
      "backToDrafts": "Zurück zu Entwürfen",
      "status": {
        "addVideo": "Video hinzufügen zum Starten",
        "addTitle": "Titel hinzufügen zum Veröffentlichen",
        "addThumbnail": "Miniaturansicht hinzufügen zum Veröffentlichen",
        "ready": "Bereit zum Veröffentlichen"
      },
      "delete": "Löschen",
      "deleted": "Entwurf gelöscht",
      "deletedDescription": "Entwurf wird in 5 Sekunden dauerhaft gelöscht",
      "undo": "Rückgängig",
      "maxDraftsReached": "Maximal 10 Entwürfe erreicht. Bitte vorhandene Entwürfe abschließen oder löschen.",
      "time": {
        "justNow": "Gerade eben",
        "minutesAgo": "vor {{count}} Minute",
        "minutesAgo_plural": "vor {{count}} Minuten",
        "hoursAgo": "vor {{count}} Stunde",
        "hoursAgo_plural": "vor {{count}} Stunden",
        "daysAgo": "vor {{count}} Tag",
        "daysAgo_plural": "vor {{count}} Tagen",
        "monthsAgo": "vor {{count}} Monat",
        "monthsAgo_plural": "vor {{count}} Monaten"
      },
      "syncFailed": "Entwurf-Synchronisierung fehlgeschlagen. Ihre Arbeit ist lokal sicher."
    }
  }
}
```

**Step 2: Add French translations**

In `public/locales/fr/translation.json`:

```json
{
  "upload": {
    "draft": {
      "newUpload": "Nouveau téléchargement",
      "yourDrafts": "Vos brouillons ({{count}})",
      "untitled": "Sans titre",
      "backToDrafts": "Retour aux brouillons",
      "status": {
        "addVideo": "Ajouter une vidéo pour commencer",
        "addTitle": "Ajouter un titre pour publier",
        "addThumbnail": "Ajouter une miniature pour publier",
        "ready": "Prêt à publier"
      },
      "delete": "Supprimer",
      "deleted": "Brouillon supprimé",
      "deletedDescription": "Le brouillon sera définitivement supprimé dans 5 secondes",
      "undo": "Annuler",
      "maxDraftsReached": "Maximum de 10 brouillons atteint. Veuillez terminer ou supprimer les brouillons existants.",
      "time": {
        "justNow": "À l'instant",
        "minutesAgo": "il y a {{count}} minute",
        "minutesAgo_plural": "il y a {{count}} minutes",
        "hoursAgo": "il y a {{count}} heure",
        "hoursAgo_plural": "il y a {{count}} heures",
        "daysAgo": "il y a {{count}} jour",
        "daysAgo_plural": "il y a {{count}} jours",
        "monthsAgo": "il y a {{count}} mois"
      },
      "syncFailed": "Échec de la synchronisation du brouillon. Votre travail est en sécurité localement."
    }
  }
}
```

**Step 3: Add Spanish translations**

In `public/locales/es/translation.json`:

```json
{
  "upload": {
    "draft": {
      "newUpload": "Nueva subida",
      "yourDrafts": "Tus borradores ({{count}})",
      "untitled": "Sin título",
      "backToDrafts": "Volver a borradores",
      "status": {
        "addVideo": "Agregar video para comenzar",
        "addTitle": "Agregar título para publicar",
        "addThumbnail": "Agregar miniatura para publicar",
        "ready": "Listo para publicar"
      },
      "delete": "Eliminar",
      "deleted": "Borrador eliminado",
      "deletedDescription": "El borrador se eliminará permanentemente en 5 segundos",
      "undo": "Deshacer",
      "maxDraftsReached": "Máximo de 10 borradores alcanzado. Por favor complete o elimine los borradores existentes.",
      "time": {
        "justNow": "Justo ahora",
        "minutesAgo": "hace {{count}} minuto",
        "minutesAgo_plural": "hace {{count}} minutos",
        "hoursAgo": "hace {{count}} hora",
        "hoursAgo_plural": "hace {{count}} horas",
        "daysAgo": "hace {{count}} día",
        "daysAgo_plural": "hace {{count}} días",
        "monthsAgo": "hace {{count}} mes",
        "monthsAgo_plural": "hace {{count}} meses"
      },
      "syncFailed": "Falló la sincronización del borrador. Tu trabajo está seguro localmente."
    }
  }
}
```

**Step 4: Verify JSON is valid**

Run: `npm run build`
Expected: No JSON parse errors

**Step 5: Commit**

```bash
git add public/locales/de/translation.json public/locales/fr/translation.json public/locales/es/translation.json
git commit -m "feat: add DE/FR/ES translations for draft feature"
```

---

### Task 17: Update CHANGELOG

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add entry to Unreleased section**

Add to the top of the `## [Unreleased]` section:

```markdown
### Added

- **Upload Draft Persistence**: NIP-78 based draft system allowing users to resume upload workflows across page refreshes and devices. Features: dual-persistence (localStorage + Nostr sync), up to 10 concurrent drafts, auto-save on video upload milestones and debounced form field saves (3s), rich draft picker with thumbnails and smart status messages, 30-day auto-cleanup, delete with 5-second undo. Components: `DraftPicker`, `DraftCard`, `useUploadDrafts` hook. Conditional rendering: 0 drafts → new form, 1 draft → auto-resume, 2+ drafts → picker. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-17-upload-draft-persistence-design.md`
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for upload draft persistence feature"
```

---

### Task 18: Final Testing and Verification

**Files:**

- None (testing only)

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run type checking**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run linter**

Run: `npm run lint`
Expected: No errors (warnings OK)

**Step 4: Build production bundle**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Manual testing checklist**

Start dev server: `npm run dev`

Test the following:

- [ ] Navigate to /upload with no drafts → creates new draft, shows form
- [ ] Upload a video → auto-saves immediately
- [ ] Type in title field → auto-saves after 3 seconds
- [ ] Refresh page → draft persists, form reloads with data
- [ ] Create second draft → picker appears with 2 cards
- [ ] Click draft card → loads that draft in form
- [ ] Click "Back to Drafts" → returns to picker
- [ ] Click delete on draft → shows undo toast
- [ ] Click undo → draft restored
- [ ] Wait 5 seconds after delete → draft permanently removed
- [ ] Publish video → draft deleted, redirects to video page
- [ ] Test with 10 drafts → 11th shows error toast
- [ ] Switch languages (EN/DE/FR/ES) → all text translates

**Step 6: Create final commit if any fixes needed**

If bugs found, fix them and commit:

```bash
git add <fixed-files>
git commit -m "fix: <description of fix>"
```

**Step 7: Done!**

The upload draft persistence feature is complete and ready for deployment.

---

## Summary

**Total Tasks:** 18
**Estimated Time:** 4-6 hours (with testing)

**Key Files Created:**

- `src/types/upload-draft.ts`
- `src/lib/upload-draft-utils.ts` + tests
- `src/hooks/useUploadDrafts.ts` + tests
- `src/components/upload/DraftCard.tsx` + tests
- `src/components/upload/DraftPicker.tsx` + tests
- `src/pages/UploadPage.tsx`

**Key Files Modified:**

- `src/hooks/useVideoUpload.ts`
- `src/components/VideoUpload.tsx`
- `src/AppRouter.tsx`
- Translation files (EN/DE/FR/ES)
- `CHANGELOG.md`

**Testing Coverage:**

- 15 utility function tests
- 8 hook tests
- 7 DraftCard tests
- 5 DraftPicker tests
- Manual integration testing

**Architecture Highlights:**

- Dual persistence: localStorage (primary) + NIP-78 (sync)
- Debounced auto-save (3s) for form fields
- Immediate save for upload milestones
- Conflict resolution: Nostr wins by updatedAt
- 10 draft limit with error toast
- 30-day auto-cleanup
- Delete with 5-second undo
