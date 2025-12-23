# Multi-Resolution DVM Transcoding Design

## Overview

Extend the DVM video transcoding feature to support multiple resolution options (1080p, 720p, 480p, 320p) with a resolution selector UI in the upload dialog.

## Decisions

- **Processing**: Sequential - one transcode at a time, each completes before next starts
- **UI**: Checkboxes with 720p pre-selected as default
- **Resolution visibility**: Show all resolutions regardless of source video resolution
- **Placement**: Replace single button with resolution checkboxes + "Create Selected" button
- **Progress**: Combined display showing overall + individual progress
- **Existing resolutions**: Disabled with "Already exists" indicator

## UI Design

### Idle State (Resolution Selection)

```
┌─────────────────────────────────────────────────────────────┐
│ 🪄 Create Additional Versions?                              │
│                                                             │
│ Creating smaller versions improves playback compatibility.  │
│                                                             │
│ ☐ 1080p    ☑ 720p (default)    ☐ 480p    ☐ 320p            │
│                                                             │
│ [Create Selected]  [Skip]                                   │
└─────────────────────────────────────────────────────────────┘
```

- Checkboxes in horizontal row
- 720p pre-selected by default
- Existing resolutions show as disabled: `▣ 720p (exists)`
- "Create Selected" button disabled when nothing selected

### Progress State (Sequential Transcoding)

```
┌─────────────────────────────────────────────────────────────┐
│ ⏳ Transcoding video...                                     │
│                                                             │
│ Resolution 2 of 3: 720p                                     │
│ [████████████░░░░░░░░░░░░░░░░] 45%                          │
│                                                             │
│ ✓ 1080p complete • 720p in progress • 480p waiting         │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 14:32:01  Transcoding to 720p MP4...                    │ │
│ │ 14:32:15  Processing (~2m remaining)                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Cancel]                                                    │
└─────────────────────────────────────────────────────────────┘
```

- Header shows current resolution and position (2 of 3)
- Progress bar for current transcode
- Status line shows all resolutions with icons: ✓ complete, ⏳ in progress, ○ waiting
- Existing scrollable status log preserved
- Cancel stops remaining transcodes (completed ones stay)

## Data Changes

### Resolution Dimensions Mapping

```typescript
const RESOLUTION_DIMENSIONS: Record<string, string> = {
  '1080p': '1920x1080',
  '720p': '1280x720',
  '480p': '854x480',
  '320p': '568x320',
}
```

### Extended DvmTranscodeState

```typescript
export interface DvmTranscodeState {
  requestEventId: string
  dvmPubkey: string
  inputVideoUrl: string
  originalDuration?: number
  startedAt: number
  status: 'transcoding' | 'mirroring'
  lastStatusMessage?: string
  lastPercentage?: number
  // NEW fields for multi-resolution
  resolutionQueue: string[] // All resolutions to process
  completedResolutions: string[] // Already finished
  currentResolution: string // Currently processing
}
```

### Updated Hook Interface

```typescript
interface UseDvmTranscodeResult {
  status: TranscodeStatus
  progress: TranscodeProgress
  error: string | null
  startTranscode: (
    inputVideoUrl: string,
    originalDuration?: number,
    resolutions?: string[] // NEW: defaults to ['720p']
  ) => Promise<void>
  resumeTranscode: (state: PersistableTranscodeState) => Promise<void>
  cancel: () => void
  transcodedVideo: VideoVariant | null
  // NEW fields
  queue: {
    resolutions: string[]
    currentIndex: number
    completed: string[]
  }
}
```

### Updated Component Props

```typescript
interface DvmTranscodeAlertProps {
  video: VideoVariant
  existingResolutions: string[] // NEW: to disable checkboxes
  onComplete: (transcodedVideo: VideoVariant) => void
  onAllComplete?: () => void // NEW: when queue finishes
  onStatusChange?: (status: TranscodeStatus) => void
  initialTranscodeState?: DvmTranscodeState
  onTranscodeStateChange?: (state: DvmTranscodeState | null) => void
}
```

## Flow

1. User uploads 4K video
2. Alert appears with checkboxes (720p pre-selected)
3. User selects 1080p and 480p additionally, clicks "Create Selected"
4. Hook queues `['1080p', '720p', '480p']` (sorted high-to-low)
5. Each completion calls `onComplete` → video added to variants table
6. User sees new rows appear as each resolution finishes
7. When queue empty, `onAllComplete` fires, alert hides

## Files to Modify

### Core Changes

| File                                                | Changes                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `src/hooks/useDvmTranscode.ts`                      | Add resolution queue, sequential processing, updated state |
| `src/components/video-upload/DvmTranscodeAlert.tsx` | Resolution checkboxes, combined progress display           |
| `src/types/upload-draft.ts`                         | Extend `DvmTranscodeState` with queue fields               |
| `src/lib/dvm-utils.ts`                              | Add `RESOLUTION_DIMENSIONS` mapping                        |

### Minor Updates

| File                             | Changes                             |
| -------------------------------- | ----------------------------------- |
| `src/hooks/useVideoUpload.ts`    | Pass `existingResolutions` to alert |
| `src/components/VideoUpload.tsx` | Wire up new props                   |

## Scope

~200 lines changed across 6 files. No new files needed.
