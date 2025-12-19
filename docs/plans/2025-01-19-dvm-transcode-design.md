# DVM Video Transcoding Design

## Overview

Add automatic transcoding of high-resolution or incompatible videos to 720p MP4 using a NIP-90 Data Vending Machine (DVM).

## Trigger Conditions

After video upload completes, offer transcoding if:

- Resolution is 1080p or higher (max dimension >= 1920)
- Video codec is problematic: `hev1`, `av01`, `vp09`, `vp9`

Compatible codecs that don't trigger: `avc1` (H.264), `hvc1` (HEVC variant that works on iOS)

## Detection Logic

```typescript
function shouldOfferTranscode(video: VideoVariant): { needed: boolean; reason: string } {
  const [width, height] = video.dimension.split('x').map(Number)
  const resolution = Math.max(width, height)

  if (resolution >= 1920) {
    return { needed: true, reason: 'Video is 1080p or higher' }
  }

  const codec = video.videoCodec?.toLowerCase() || ''
  const problematicCodecs = ['hev1', 'av01', 'vp09', 'vp9']
  if (problematicCodecs.some(c => codec.startsWith(c))) {
    return { needed: true, reason: 'Video codec may not play on all devices' }
  }

  return { needed: false, reason: '' }
}
```

## DVM Discovery

Query relays for `kind:31990` (NIP-89 handler info):

- `#k: ["5207"]` - supports video transform jobs
- `#d: ["video-transform-hls"]` - DVM identifier

Use the first DVM found. If none available, show error.

## DVM Job Request (kind:5207)

```json
{
  "kind": 5207,
  "content": "",
  "tags": [
    ["i", "<input-video-url>", "url"],
    ["p", "<dvm-pubkey>"],
    ["param", "mode", "mp4"],
    ["param", "resolution", "720p"],
    ["relays", "wss://relay1", "wss://relay2"]
  ]
}
```

## Subscription

Subscribe to DVM responses:

- `kind:7000` - Job feedback (status updates, ETA)
- `kind:6207` - Job result

Filter: `authors: [dvmPubkey]`, `#e: [requestEventId]`

## DVM Result (kind:6207)

```json
{
  "content": "{\"type\":\"mp4\",\"urls\":[\"https://...\"],\"resolution\":\"720p\",\"size_bytes\":15481815,\"mimetype\":\"video/mp4; codecs=\\\"hvc1,mp4a.40.2\\\"\"}",
  "tags": [
    ["e", "<request-event-id>"],
    ["p", "<requester-pubkey>"]
  ]
}
```

Parse codecs from mimetype field.

## Blossom Mirroring

After DVM completes:

1. Create BlobDescriptor from DVM result URL
2. Mirror to user's upload servers (becomes primary URLs)
3. Mirror to user's mirror servers
4. Build final VideoVariant with user's Blossom URLs

## UI Component: DvmTranscodeAlert

Location: Step 1 of upload wizard, below VideoVariantsTable

States:

- **idle**: Prompt with "Create 720p Version" and "Skip" buttons
- **discovering**: "Finding transcoding service..."
- **transcoding**: Progress bar + status message + ETA + Cancel button
- **mirroring**: "Copying to your servers..." + Cancel button
- **error**: Error message + Retry + Dismiss buttons
- **complete**: Triggers onComplete callback, component unmounts

## Publish Button Blocking

Disable publish button while `status` is `transcoding` or `mirroring`.

## Cancellation

- Cancel button calls `abortController.abort()`
- Closes relay subscription
- Optionally publishes `kind:5` delete event for job request

## New Files

- `src/hooks/useDvmTranscode.ts` - Main hook managing the flow
- `src/components/video-upload/DvmTranscodeAlert.tsx` - UI component
- `src/lib/dvm-utils.ts` - Helper functions (shouldOfferTranscode, parseCodecsFromMimetype)

## Modified Files

- `src/components/VideoUpload.tsx` - Add DvmTranscodeAlert, track transcode state
- `src/hooks/useVideoUpload.ts` - Add handler for transcoded video variant
