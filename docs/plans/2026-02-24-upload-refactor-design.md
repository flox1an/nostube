# Upload Refactor: Extract Reusable Hooks

## Problem

The upload system (~8,500 lines) has two areas of significant duplication:

1. **Draft persistence** (~300 lines duplicated): localStorage + NIP-78 sync + conflict resolution logic is repeated between `useUploadDrafts.ts` and `UploadManagerProvider.tsx`. The logic is entirely schema-agnostic.

2. **File upload pipeline** (repeated 3x): The upload→mirror→delete pattern is inlined separately for videos, thumbnails, and subtitles inside `useVideoUpload.ts` (1,163 lines). The existing `useVideoFileUpload` hook was meant to be reusable but the main flow doesn't use it.

## Extraction 1: `useDraftPersistence<T>`

**File:** `src/hooks/useDraftPersistence.ts`

### Interface

```typescript
interface DraftPersistenceOptions<T extends { id: string; updatedAt: number }> {
  storageKey: string // e.g. "nostube_upload_drafts"
  nostrIdentifier: string // NIP-78 'd' tag value
  isMilestone?: (updates: Partial<T>) => boolean
  debounceMs?: number // default 5000
}

interface DraftPersistence<T> {
  items: T[]
  getItem(id: string): T | undefined
  createItem(item: T): void
  updateItem(id: string, updates: Partial<T>): void
  deleteItem(id: string): void
  flushSync(): Promise<void>
  lastModified: number
}
```

### What moves in

- localStorage read/write with versioned wrapper (`{ version, lastModified, drafts }`)
- NIP-78 kind 30078 encrypt/save/load (NIP-44)
- Merge-by-timestamp conflict resolution (Nostr vs local)
- Debounced Nostr sync with flush capability
- Milestone detection (calls `isMilestone` callback for immediate sync)
- Cross-tab `StorageEvent` listener

### What stays in `useUploadDrafts`

- `isMilestoneUpdate()` function (passed as callback)
- `createEmptyDraft()` factory with upload-specific defaults
- Ephemeral-to-persisted transition logic
- Thin wrapper composing `useDraftPersistence<UploadDraft>` with upload defaults

### Migration

- `useUploadDrafts.ts` becomes a thin wrapper around `useDraftPersistence<UploadDraft>`
- `UploadManagerProvider.tsx` switches to the same hook, eliminating its duplicate implementation
- No API changes to consumers — `useUploadDrafts` keeps its current interface

## Extraction 2: `useFileUpload`

**File:** `src/hooks/useFileUpload.ts`

### Interface

```typescript
interface FileUploadOptions {
  initialServers: string[]
  mirrorServers?: string[]
  signer: NostrSigner
  onProgress?: (progress: ChunkedUploadProgress) => void
}

interface FileUploadResult {
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
  sha256: string
}

interface FileUpload {
  upload(file: File): Promise<FileUploadResult>
  uploadFromUrl(url: string): Promise<FileUploadResult>
  deleteBlobs(blobs: BlobDescriptor[]): Promise<void>
  progress: ChunkedUploadProgress | null
  uploading: boolean
  error: string | null
  reset(): void
}
```

### What moves in

- `uploadFileToMultipleServersChunked` → `mirrorBlobsToServers` pipeline
- Progress tracking state
- Error handling and reset
- URL-based upload (fetch → upload → mirror)

### What stays in `blossom-upload.ts`

Everything — it remains the low-level library. `useFileUpload` is a React wrapper.

### How `useVideoUpload` changes

Instead of calling blossom functions directly 3 times, it composes three instances:

```typescript
const videoUpload = useFileUpload({ initialServers, mirrorServers, signer })
const thumbnailUpload = useFileUpload({ initialServers, mirrorServers, signer })
const subtitleUpload = useFileUpload({ initialServers, mirrorServers, signer })
```

`useVideoUpload` retains: form state, `processUploadedVideo()`, `buildVideoEvent()`, publish orchestration. Expected reduction from ~1,163 to ~700-800 lines.

### Replaces `useVideoFileUpload`

The existing `useVideoFileUpload.ts` is superseded. `ReplaceVideoFlow` switches to `useFileUpload` + video-specific processing.

## Out of Scope

- `ThumbnailPicker` extraction (deferred — can use `useFileUpload` later)
- `blossom-upload.ts` restructuring (already well-organized as low-level lib)
- UI component changes (wizard steps stay as-is)

## Testing

- Unit tests for `useDraftPersistence` (localStorage CRUD, merge logic, milestone detection)
- Unit tests for `useFileUpload` (upload + mirror pipeline, progress, error states)
- Existing upload flow should work identically after refactor
