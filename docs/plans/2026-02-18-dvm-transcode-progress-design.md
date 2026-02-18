# DVM Transcode Progress Redesign

## Problem

The current transcode progress UI shows a single progress bar with a percentage and a raw status log. Users cannot clearly see which phase the DVM is in (encoding vs uploading) or when their files are being copied to their own servers. The UX is unclear for multi-resolution transcodes.

## Design

### 3-Phase Progress Per Variant

Each resolution gets its own row with 3 clearly labeled phases:

1. **Re-encoding** - DVM is transcoding the video (messages starting with "Transcoding")
2. **Uploading** - DVM is uploading the result (messages starting with "Uploading")
3. **Copying** - We mirror the file to the user's configured blossom servers (status = 'mirroring')

### Visual Layout

```
720p
 [checkmark] Re-encoding --- [checkmark] Uploading --- [spinner] Copying
 [==============........]  65%  ~12s

480p
 [circle] Re-encoding --- [circle] Uploading --- [circle] Copying
 (waiting)

360p
 [circle] Re-encoding --- [circle] Uploading --- [circle] Copying
 (waiting)
```

### Step States

- **Waiting** (grey circle) - not started
- **Active** (blue spinner) - in progress, shows progress bar with percentage + ETA
- **Complete** (green checkmark) - finished

### Phase Detection

Parse DVM kind 7000 message text:

- Message starts with "Transcoding" -> phase = 'transcoding'
- Message starts with "Uploading" -> phase = 'uploading'
- Internal status = 'mirroring' -> phase = 'mirroring'

The `percentage` field applies to whichever phase is currently active.

### State Changes

Add `phase` field to `TranscodeState`:

```ts
phase?: 'transcoding' | 'uploading' | 'mirroring'
```

Add per-resolution phase tracking to `completedVideos` entries or a new `resolutionPhases` map.

### Component Structure

- `DvmTranscodeAlert` - parent, handles idle/discovering/bidding/error/complete states unchanged
- `TranscodeVariantProgress` - new sub-component, renders 3-step indicator + progress bar for one resolution
- `TranscodePhaseIndicator` - renders the connected step circles (checkmark/spinner/circle) with labels

### What Stays the Same

- Idle state (resolution checkboxes)
- Discovering/bidding state
- Error and complete states
- Status log (shared at bottom)
- Cancel button
