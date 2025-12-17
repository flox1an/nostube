# Upload Draft Persistence Design

**Date:** 2025-12-17
**Status:** Approved
**Feature:** NIP-78 Upload Draft Persistence with Multi-Device Sync

## Overview

Implement persistent upload state using NIP-78 application-specific settings (kind 30078, `d=nostube-uploads`) to allow users to resume upload workflows at any time, even after page refresh or across devices. Uses dual-persistence strategy: localStorage as primary with Nostr sync for multi-device support.

## Goals

- **Resume interrupted uploads**: Users can close the page and resume where they left off
- **Multi-device sync**: Start upload on desktop, finish on mobile via Nostr sync
- **Concurrent uploads**: Support multiple paused uploads (up to 10 drafts)
- **Never lose expensive work**: Video/thumbnail uploads persist immediately
- **Offline-first**: Works offline with localStorage, syncs when online

## Non-Goals

- Real-time collaborative editing (last write wins on conflicts)
- Unlimited draft storage (10 draft hard limit)
- Upload history/archive (drafts auto-delete after 30 days or on publish)

## Architecture Overview

### Dual-Persistence Strategy

1. **localStorage** (Primary):
   - Synchronous, instant saves
   - Works offline
   - Single source of truth for current device
   - Key: `nostube_upload_drafts`

2. **NIP-78 Nostr Event** (Sync):
   - Asynchronous, multi-device sync
   - Kind 30078, identifier `nostube-uploads`
   - Falls back gracefully if network fails
   - Nostr wins on merge conflicts (by `updatedAt` timestamp)

### Core Components

1. **`useUploadDrafts` hook** - Draft CRUD, persistence, auto-save
2. **`DraftPicker` component** - Rich preview cards, draft selection
3. **`DraftCard` component** - Individual draft card with thumbnail, status
4. **`UploadForm` component** - Refactored to accept draft prop
5. **`useVideoUpload` hook** - Refactored to load/save draft state

### Data Flow

```
User action
  → Update draft state
  → Save to localStorage (immediate)
  → Save to NIP-78 (debounced or immediate based on trigger)

On load:
  Fetch NIP-78 event
  → Load localStorage
  → Merge (Nostr wins conflicts)
  → Apply 30-day cleanup
  → Save cleaned result back to both stores
```

## Data Schema

### NIP-78 Event Structure

```typescript
{
  kind: 30078,
  content: JSON.stringify({
    version: "1",
    lastModified: 1734567890,
    drafts: [
      {
        id: "uuid-string",
        createdAt: 1734567890,
        updatedAt: 1734567890,

        // Form fields
        title: string,
        description: string,
        tags: string[],
        language: string,

        // Content warning
        contentWarning: {
          enabled: boolean,
          reason: string
        },

        // Input method
        inputMethod: "file" | "url",
        videoUrl?: string,

        // Uploaded content (blob descriptors only)
        uploadInfo: {
          videos: VideoVariant[] // includes uploadedBlobs, mirroredBlobs
        },

        thumbnailUploadInfo: {
          uploadedBlobs: BlobDescriptor[],
          mirroredBlobs: BlobDescriptor[]
        },

        // Metadata
        thumbnailSource: "generated" | "upload"
      }
    ]
  }),
  tags: [["d", "nostube-uploads"]],
  created_at: timestamp,
  pubkey: user.pubkey
}
```

### localStorage Schema

Key: `nostube_upload_drafts`

```typescript
{
  version: "1",
  lastModified: 1734567890,
  drafts: [...] // Same structure as NIP-78 content.drafts
}
```

### What's NOT Persisted

- `File` objects (can't serialize)
- `Blob` objects (thumbnailBlob)
- Upload progress state (uploadProgress)
- Transient UI state (uploadState, isDirty)

Videos and thumbnails are uploaded immediately to Blossom servers, so only BlobDescriptors (URLs, hashes, metadata) need persistence.

## Draft Lifecycle

### Creation

**When:** User enters `/upload` page

**Logic:**
- 0 drafts → Create new empty draft, show upload form
- 1 draft → Auto-load that draft in upload form
- 2+ drafts → Show draft picker

**Draft Initialization:**
```typescript
{
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
```

### Auto-Save Behavior

**Immediate saves** (no debounce):
- Video upload completes
- Video mirroring completes
- Thumbnail upload completes
- Thumbnail mirroring completes
- Draft deleted
- Video variant removed

**Debounced saves** (3 seconds):
- Title changed
- Description changed
- Tag added/removed
- Language changed
- Content warning toggled/modified
- Input method changed

**Page unload save:**
- `beforeunload` event triggers final save if dirty

### Publish and Cleanup

**On successful publish:**
1. Delete draft from list
2. Save updated list to localStorage
3. Sync to Nostr (without published draft)
4. Redirect to video page

**30-day auto-cleanup:**
- Applied on load
- Removes drafts where `createdAt < (now - 30 days)`
- Syncs cleaned list to both stores

**Hard limit:**
- Maximum 10 concurrent drafts
- Shows error toast if user tries to create 11th

## UI/UX Flow

### Draft Picker (2+ drafts)

**Layout:**
```
┌─────────────────────────────────────┐
│ [+] New Upload                      │
└─────────────────────────────────────┘

Your Drafts (3)

┌─────────────────────────────────────┐
│ [Thumbnail]  My Podcast Episode #5  │
│              1080p • 450 MB         │
│              ✓ Ready to publish     │
│              2 hours ago   [Delete] │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ [Thumbnail]  Untitled               │
│              720p, 1080p • 1.2 GB   │
│              Add title to publish   │
│              1 day ago     [Delete] │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ [No thumb]   Untitled               │
│              —                       │
│              Add video to start     │
│              3 days ago    [Delete] │
└─────────────────────────────────────┘
```

**Draft Card Content:**
- Thumbnail preview (or placeholder with ImageOff icon)
- Title (or "Untitled")
- Video quality info: "1080p • 450 MB" or "720p, 1080p • 1.2 GB"
- Smart status message (next action needed)
- Relative timestamp: "2 hours ago", "1 day ago"
- Delete button (visible on hover)
- Click anywhere to select draft

**Ordering:** Most recently modified first (by `updatedAt` descending)

### Upload Form

**Back Button:**
- Shows "← Back to Drafts" when opened from picker (2+ drafts scenario)
- Hidden when 0 or 1 draft (no picker shown)

**Form State:**
- Loads all persisted state from draft
- Auto-saves on changes
- Shows unsaved indicator if dirty

### Smart Status Messages

```typescript
// No videos yet
if (draft.uploadInfo.videos.length === 0) {
  return "Add video to start"
}

// Has videos but no title
if (!draft.title || draft.title.trim() === '') {
  return "Add title to publish"
}

// Has videos and title but no thumbnail
if (draft.thumbnailUploadInfo.uploadedBlobs.length === 0) {
  return "Add thumbnail to publish"
}

// Ready to publish
return "Ready to publish"
```

### Delete with Undo

1. User clicks delete on draft card
2. Draft visually removed from list
3. Toast appears: "Draft deleted" with "Undo" button
4. 5-second countdown
5. If undo clicked → restore draft, dismiss toast
6. If timeout → permanently delete, sync to Nostr

## Component Architecture

### useUploadDrafts Hook

**Location:** `src/hooks/useUploadDrafts.ts`

**Responsibilities:**
- Load drafts on mount (merge localStorage + Nostr)
- CRUD operations (create, update, delete)
- Persistence (localStorage + Nostr sync)
- Auto-cleanup (30 days)
- Conflict resolution (Nostr wins)

**API:**
```typescript
interface UseUploadDraftsReturn {
  drafts: UploadDraft[]
  currentDraft: UploadDraft | null
  setCurrentDraft: (draft: UploadDraft | null) => void
  createDraft: () => UploadDraft
  updateDraft: (draftId: string, updates: Partial<UploadDraft>) => void
  deleteDraft: (draftId: string) => void
  isLoading: boolean
}
```

**Key Functions:**

```typescript
// Load and merge
const loadDrafts = async (): Promise<UploadDraft[]> => {
  const localDrafts = loadFromLocalStorage()
  const nostrDrafts = await fetchFromNostr()
  const merged = mergeDrafts(localDrafts, nostrDrafts)
  const cleaned = removeOldDrafts(merged, 30)

  saveToLocalStorage(cleaned)
  if (cleaned.length !== merged.length) {
    await saveToNostr(cleaned)
  }

  return cleaned
}

// Merge with conflict resolution
const mergeDrafts = (local: UploadDraft[], nostr: UploadDraft[]): UploadDraft[] => {
  const map = new Map<string, UploadDraft>()

  local.forEach(d => map.set(d.id, d))
  nostr.forEach(d => {
    const existing = map.get(d.id)
    if (!existing || d.updatedAt > existing.updatedAt) {
      map.set(d.id, d)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

// Save with dual persistence
const saveDraftsImmediate = (drafts: UploadDraft[]) => {
  saveToLocalStorage(drafts)
  saveToNostr(drafts).catch(error => {
    console.error('Nostr sync failed:', error)
    // Silent failure - localStorage has the data
  })
}

const debouncedSaveDrafts = debounce(saveDraftsImmediate, 3000)
```

### DraftPicker Component

**Location:** `src/components/upload/DraftPicker.tsx`

```typescript
interface DraftPickerProps {
  drafts: UploadDraft[]
  onSelectDraft: (draft: UploadDraft) => void
  onNewUpload: () => void
  onDeleteDraft: (draftId: string) => void
}
```

**Features:**
- "New Upload" prominent button at top
- "Your Drafts (N)" heading
- List of DraftCard components
- Delete with undo (5s timeout)
- Toast notifications

### DraftCard Component

**Location:** `src/components/upload/DraftCard.tsx`

```typescript
interface DraftCardProps {
  draft: UploadDraft
  onSelect: () => void
  onDelete: () => void
}
```

**Features:**
- Thumbnail or placeholder
- Title or "Untitled"
- Video quality + size
- Smart status
- Relative timestamp
- Hover delete button

### UploadPage Component

**Location:** `src/pages/UploadPage.tsx` (refactored)

**Conditional Rendering:**

```typescript
export default function UploadPage() {
  const { drafts, currentDraft, setCurrentDraft, createDraft } = useUploadDrafts()

  // 0 drafts → new empty form
  if (drafts.length === 0) {
    const newDraft = createDraft()
    return <UploadForm draft={newDraft} />
  }

  // 1 draft → auto-resume
  if (drafts.length === 1) {
    return <UploadForm draft={drafts[0]} />
  }

  // 2+ drafts → picker or form
  if (!currentDraft) {
    return (
      <DraftPicker
        drafts={drafts}
        onSelectDraft={setCurrentDraft}
        onNewUpload={() => setCurrentDraft(createDraft())}
        onDeleteDraft={deleteDraft}
      />
    )
  }

  return <UploadForm draft={currentDraft} onBack={() => setCurrentDraft(null)} />
}
```

### UploadForm Component

**Location:** `src/components/VideoUpload.tsx` (refactored)

**Changes:**
1. Accept `draft` and `onBack` props
2. Initialize state from draft
3. Sync changes back to draft via callback
4. Show back button when `onBack` provided
5. Delete draft on successful publish

```typescript
interface UploadFormProps {
  draft: UploadDraft
  onBack?: () => void
}

export function UploadForm({ draft, onBack }: UploadFormProps) {
  const { updateDraft, deleteDraft } = useUploadDrafts()

  const handleDraftChange = useCallback((updates: Partial<UploadDraft>) => {
    updateDraft(draft.id, updates)
  }, [draft.id, updateDraft])

  const videoUploadHook = useVideoUpload(draft, handleDraftChange)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await videoUploadHook.handleSubmit(e)
      deleteDraft(draft.id) // Success - remove draft
    } catch (error) {
      // Keep draft on error
    }
  }

  return (
    <Card className="max-w-4xl mx-auto">
      {onBack && (
        <Button onClick={onBack} variant="ghost" className="mb-4">
          ← {t('upload.draft.backToDrafts')}
        </Button>
      )}
      {/* Existing upload form UI */}
    </Card>
  )
}
```

### useVideoUpload Hook Refactor

**Location:** `src/hooks/useVideoUpload.ts`

**Changes:**

```typescript
export function useVideoUpload(
  initialDraft?: UploadDraft,
  onDraftChange?: (updates: Partial<UploadDraft>) => void
) {
  // Initialize state from draft
  const [title, setTitle] = useState(initialDraft?.title || '')
  const [description, setDescription] = useState(initialDraft?.description || '')
  const [tags, setTags] = useState<string[]>(initialDraft?.tags || [])
  const [uploadInfo, setUploadInfo] = useState<UploadInfo>(
    initialDraft?.uploadInfo || { videos: [] }
  )
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<ThumbnailUploadInfo>(
    initialDraft?.thumbnailUploadInfo || { uploadedBlobs: [], mirroredBlobs: [], uploading: false }
  )
  // ... other state

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
        updatedAt: Date.now()
      })
    }
  }, [title, description, tags, /* ... all dependencies */])

  // Existing upload logic unchanged
}
```

**Milestone Detection:**

```typescript
const isMilestoneUpdate = (updates: Partial<UploadDraft>): boolean => {
  return !!(
    updates.uploadInfo?.videos.length !== undefined ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs
  )
}

// In updateDraft:
if (isMilestoneUpdate(updates)) {
  saveDraftsImmediate(updatedDrafts)
} else {
  debouncedSaveDrafts(updatedDrafts)
}
```

## Utility Functions

### Smart Status

**Location:** `src/lib/upload-draft-utils.ts`

```typescript
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

### Video Quality Info

```typescript
export function getVideoQualityInfo(draft: UploadDraft): string {
  if (draft.uploadInfo.videos.length === 0) return ''

  const qualities = draft.uploadInfo.videos.map(v => {
    const [_, height] = v.dimension.split('x').map(Number)
    if (height >= 2160) return '4K'
    if (height >= 1440) return '1440p'
    if (height >= 1080) return '1080p'
    if (height >= 720) return '720p'
    if (height >= 480) return '480p'
    return '360p'
  })

  const totalSizeMB = draft.uploadInfo.videos.reduce((sum, v) => sum + (v.sizeMB || 0), 0)
  const sizeStr = totalSizeMB > 1024
    ? `${(totalSizeMB / 1024).toFixed(1)} GB`
    : `${Math.round(totalSizeMB)} MB`

  return `${qualities.join(', ')} • ${sizeStr}`
}
```

### Relative Time

```typescript
export function getRelativeTime(timestamp: number): string {
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

### Old Draft Cleanup

```typescript
export function removeOldDrafts(drafts: UploadDraft[], maxAgeDays = 30): UploadDraft[] {
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
  return drafts.filter(d => d.createdAt > cutoffTime)
}
```

## Error Handling

### Maximum Drafts

```typescript
const createDraft = (): UploadDraft => {
  if (drafts.length >= 10) {
    toast({
      title: t('upload.draft.maxDraftsReached'),
      variant: "destructive",
      duration: 5000
    })
    throw new Error('Maximum 10 drafts allowed')
  }
  // Create draft...
}
```

### Offline/Network Failure

```typescript
const saveToNostr = async (drafts: UploadDraft[]) => {
  try {
    await publish({ event, relays })
  } catch (error) {
    console.error('Failed to sync to Nostr:', error)
    // Silent failure - localStorage has the data
    toast({
      title: t('upload.draft.syncFailed'),
      variant: "default",
      duration: 3000
    })
  }
}
```

### Page Unload Warning

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  return () => window.removeEventListener('beforeunload', handleBeforeUnload)
}, [isDirty])
```

### Draft Not Found

```typescript
// Direct link to invalid draft ID
const draftFromParam = searchParams.get('draft')
if (draftFromParam) {
  const found = drafts.find(d => d.id === draftFromParam)
  if (!found) {
    toast({
      title: t('upload.draft.notFound'),
      variant: "destructive"
    })
    // Fall back to picker or new draft
  }
}
```

## Translation Keys (i18n)

### Draft Picker

```typescript
"upload.draft.newUpload": "New Upload"
"upload.draft.yourDrafts": "Your Drafts ({{count}})"
"upload.draft.untitled": "Untitled"
"upload.draft.backToDrafts": "Back to Drafts"
```

### Smart Status Messages

```typescript
"upload.draft.status.addVideo": "Add video to start"
"upload.draft.status.addTitle": "Add title to publish"
"upload.draft.status.addThumbnail": "Add thumbnail to publish"
"upload.draft.status.ready": "Ready to publish"
```

### Delete and Actions

```typescript
"upload.draft.delete": "Delete"
"upload.draft.deleted": "Draft deleted"
"upload.draft.deletedDescription": "Draft will be permanently deleted in 5 seconds"
"upload.draft.undo": "Undo"
"upload.draft.maxDraftsReached": "Maximum 10 drafts reached. Please complete or delete existing drafts."
```

### Relative Time

```typescript
"upload.draft.time.justNow": "Just now"
"upload.draft.time.minutesAgo": "{{count}} minute ago"
"upload.draft.time.minutesAgo_plural": "{{count}} minutes ago"
"upload.draft.time.hoursAgo": "{{count}} hour ago"
"upload.draft.time.hoursAgo_plural": "{{count}} hours ago"
"upload.draft.time.daysAgo": "{{count}} day ago"
"upload.draft.time.daysAgo_plural": "{{count}} days ago"
"upload.draft.time.monthsAgo": "{{count}} month ago"
"upload.draft.time.monthsAgo_plural": "{{count}} months ago"
```

### Error Messages

```typescript
"upload.draft.loadFailed": "Failed to load drafts. Using local drafts only."
"upload.draft.saveFailed": "Failed to sync draft to Nostr. Changes saved locally."
"upload.draft.syncFailed": "Draft sync failed. Your work is safe locally."
"upload.draft.notFound": "Draft not found"
"upload.draft.notFoundDescription": "This draft may have been deleted or expired."
```

**Total:** ~22 keys with plural forms. Translations needed for DE/FR/ES following existing i18n patterns.

## Testing Strategy

### Unit Tests

**useUploadDrafts Hook** (`src/hooks/useUploadDrafts.test.ts`):
- ✓ Create draft increments count and assigns UUID
- ✓ Max 10 drafts enforcement shows error
- ✓ Update draft modifies updatedAt timestamp
- ✓ Delete draft removes from list
- ✓ 30-day cleanup removes old drafts only
- ✓ Merge logic prefers Nostr when updatedAt is newer
- ✓ Merge logic prefers localStorage when updatedAt is newer
- ✓ Sort by updatedAt descending

**Draft Utilities** (`src/lib/upload-draft-utils.test.ts`):
- ✓ `getSmartStatus()` returns "Add video" when empty
- ✓ `getSmartStatus()` returns "Add title" when video but no title
- ✓ `getSmartStatus()` returns "Add thumbnail" when video+title but no thumb
- ✓ `getSmartStatus()` returns "Ready" when complete
- ✓ `getVideoQualityInfo()` formats single quality correctly
- ✓ `getVideoQualityInfo()` formats multiple qualities correctly
- ✓ `getVideoQualityInfo()` converts MB to GB correctly
- ✓ `getRelativeTime()` returns correct relative strings
- ✓ `removeOldDrafts()` filters drafts older than 30 days
- ✓ `removeOldDrafts()` keeps recent drafts

**DraftPicker Component** (`src/components/upload/DraftPicker.test.tsx`):
- ✓ Renders "New Upload" button
- ✓ Displays correct draft count in heading
- ✓ Shows draft cards in correct order (updatedAt desc)
- ✓ Delete shows toast with undo button
- ✓ Undo within 5s restores draft
- ✓ No undo after 5s deletes permanently
- ✓ Calls onSelectDraft when card clicked

**DraftCard Component** (`src/components/upload/DraftCard.test.tsx`):
- ✓ Displays thumbnail when available
- ✓ Shows placeholder when no thumbnail
- ✓ Shows title or "Untitled"
- ✓ Renders quality info correctly
- ✓ Shows smart status message
- ✓ Displays relative timestamp
- ✓ Delete button visible on hover

### Integration Tests

**Upload Flow with Drafts** (`src/test/upload-draft-flow.test.tsx`):
- ✓ Create new draft → upload video → saves draft → resume from picker
- ✓ Draft auto-saves immediately on video upload complete
- ✓ Draft auto-saves debounced on title change
- ✓ Publish deletes draft and redirects
- ✓ 2+ drafts show picker
- ✓ 1 draft auto-resumes in form
- ✓ 0 drafts create new and show form

**Persistence Tests** (`src/test/upload-draft-persistence.test.ts`):
- ✓ Save to localStorage works
- ✓ Load from localStorage works
- ✓ Save to Nostr publishes kind 30078 with correct tags
- ✓ Load from Nostr parses event correctly
- ✓ Merge prefers Nostr when Nostr updatedAt > local updatedAt
- ✓ Merge prefers local when local updatedAt > Nostr updatedAt
- ✓ Offline mode saves to localStorage, shows toast
- ✓ Network failure doesn't break localStorage save

### Manual Testing Checklist

- [ ] Create 10 drafts, verify 11th shows error toast
- [ ] Delete draft with undo, click undo within 5s, verify restored
- [ ] Delete draft, wait 5s, verify permanent deletion and Nostr sync
- [ ] Upload video to draft, refresh page, verify draft persisted with video
- [ ] Type in title field, wait 3s, verify debounced auto-save
- [ ] Open upload in two browser tabs, modify same draft in both, verify last write wins
- [ ] Publish video, verify draft deleted from both localStorage and Nostr
- [ ] Create draft with createdAt 31 days ago, load page, verify auto-cleanup
- [ ] Disconnect internet, create draft, verify localStorage-only save with toast
- [ ] Reconnect internet, modify draft, verify sync to Nostr
- [ ] Verify all i18n strings for EN/DE/FR/ES
- [ ] Test thumbnail placeholder when no thumbnail uploaded
- [ ] Test back button returns to picker when 2+ drafts
- [ ] Test URL param `/upload?draft=invalid-id` shows error
- [ ] Test page unload warning when draft has unsaved changes

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create `UploadDraft` TypeScript interface
2. Implement `useUploadDrafts` hook with localStorage only
3. Add utility functions (getSmartStatus, getVideoQualityInfo, getRelativeTime)
4. Write unit tests for utils and hook

### Phase 2: Draft Picker UI

1. Create `DraftCard` component
2. Create `DraftPicker` component
3. Implement delete with undo
4. Add i18n translation keys (EN only initially)

### Phase 3: Integration

1. Refactor `useVideoUpload` to accept draft and callback
2. Refactor `VideoUpload` component to `UploadForm` with props
3. Update `UploadPage` with conditional rendering logic
4. Wire up auto-save triggers

### Phase 4: Nostr Sync

1. Add NIP-78 event publishing to `useUploadDrafts`
2. Add NIP-78 event loading and subscription
3. Implement merge logic with conflict resolution
4. Add error handling and offline fallback

### Phase 5: Polish

1. Add translations for DE/FR/ES
2. Add integration tests
3. Manual testing and bug fixes
4. Update CHANGELOG.md

## Open Questions

None - design approved and ready for implementation.

## References

- NIP-78: Application-specific data - https://github.com/nostr-protocol/nips/blob/master/78.md
- NIP-51: Lists (follow sets reference) - https://github.com/nostr-protocol/nips/blob/master/51.md
- Existing follow set implementation: `src/hooks/useFollowSet.ts`
- Existing app config: `src/contexts/AppContext.ts`
