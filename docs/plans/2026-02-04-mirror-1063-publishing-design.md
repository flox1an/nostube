# Mirror Announcement via Kind 1063 File Metadata

**Date:** 2026-02-04
**Status:** Draft
**Feature:** Publish NIP-94 kind 1063 events after successful mirror operations

## Overview

When a user mirrors video content to their Blossom servers, nostube publishes a kind 1063 (NIP-94 File Metadata) event for each mirrored blob. This announces the new file locations to the network. Other viewers discover these events via the existing `url-discovery.ts` system (`#x` SHA256 lookup), gaining additional fallback URLs for playback.

Today the mirror dialog and automatic upload-time mirroring copy files to servers, but nobody announces the copies. The discovery system (`useMediaUrls` + `url-discovery.ts`) is already wired to find kind 1063 events — it just never finds any because none are published. This feature closes that loop.

## Goals

- Announce mirrored file locations so other viewers benefit from redundancy
- Work for any logged-in user mirroring any video (not just the author)
- Include enough metadata (`dim`, `m`, `size`) for clients to make playback decisions
- Reference the source video event via `e`/`a` tags for attribution and future UI

## Non-Goals

- Republishing or editing the original video event's imeta tags
- Publishing 1063 events for transcoded/derived files (separate feature, uses `ox` tag)
- Mirror support for Shorts pages (future work)
- Batch "mirror all my videos" flow (future work)

## Event Structure

One kind 1063 event per blob (video file, thumbnail, or subtitle track). Each event lists all successfully mirrored URLs for that specific file hash.

### Tags

| Tag        | Required | Description                                              |
| ---------- | -------- | -------------------------------------------------------- |
| `url`      | Yes      | Primary mirror URL (first successful mirror server)      |
| `fallback` | No       | One tag per additional mirror URL (zero or more)         |
| `x`        | Yes      | SHA256 hex hash of the file                              |
| `m`        | Yes      | MIME type (e.g., `video/mp4`, `image/webp`, `text/vtt`)  |
| `size`     | Yes      | File size in bytes                                       |
| `dim`      | When known | Dimensions as `<width>x<height>` (video and thumbnails) |
| `e`        | Yes      | Video event ID + relay hint                              |
| `a`        | Addressable only | Address for kinds 34235/34236 (`<kind>:<pubkey>:<d-tag>`) |
| `k`        | Addressable only | Kind of the referenced video event                |

### Tags NOT included

- `ox` — No transformation happened, `ox === x`, omit to avoid confusion
- `blurhash`, `thumb`, `image` — Not relevant for mirror announcements
- `magnet`, `i`, `service` — Not applicable

### Example: Video blob mirrored to 2 servers (addressable event)

```json
{
  "kind": 1063,
  "content": "",
  "tags": [
    ["url", "https://my-server-1.com/abc123def456.mp4"],
    ["fallback", "https://my-server-2.com/abc123def456.mp4"],
    ["x", "abc123def456..."],
    ["m", "video/mp4"],
    ["size", "210000000"],
    ["dim", "1920x1080"],
    ["e", "<event-id>", "wss://relay.example.com"],
    ["a", "34235:<author-pubkey>:<d-tag>", "wss://relay.example.com"],
    ["k", "34235"]
  ]
}
```

### Example: Thumbnail mirrored to 1 server (non-addressable event)

```json
{
  "kind": 1063,
  "content": "",
  "tags": [
    ["url", "https://my-server-1.com/def789.webp"],
    ["x", "def789..."],
    ["m", "image/webp"],
    ["size", "48000"],
    ["dim", "1280x720"],
    ["e", "<event-id>", "wss://relay.example.com"]
  ]
}
```

## Architecture

### Separation of concerns

`mirrorBlobsToServers()` in `blossom-upload.ts` stays pure — it handles HTTP file copying only and returns results. The callers handle kind 1063 publishing after successful mirror. This matches the existing pattern where upload functions don't publish Nostr events.

### New module: `src/lib/mirror-announcements.ts`

A single function that takes mirror results and publishes kind 1063 events:

```typescript
interface MirrorAnnouncementOptions {
  blob: BlossomBlob              // The mirrored blob (hash, variant metadata)
  mirrorResults: BlobDescriptor[] // Successful mirror results with URLs
  videoEvent: {                   // Source video event info
    id: string
    kind: number
    pubkey: string
    dTag?: string                 // For addressable events
  }
  relayHint: string               // Best relay hint for e/a tags
  signer: Signer
  publishRelays: string[]         // Where to publish the 1063
}

function buildFileMetadataEvent(options: MirrorAnnouncementOptions): EventTemplate

async function publishMirrorAnnouncements(
  blobs: MirrorAnnouncementOptions[],
  signer: Signer,
  publishRelays: string[]
): Promise<void>
```

### Callers

Two places call `mirrorBlobsToServers()` today. Both get updated to publish 1063 events after:

**1. `MirrorVideoDialog` (manual mirror)**

After `handleMirror()` completes successfully:
- Has full access to the `VideoEvent` object (video event ID, kind, pubkey, d-tag)
- Has the blob metadata from `extractAllBlossomBlobs()`
- Has the mirror results (which servers succeeded)
- Calls `publishMirrorAnnouncements()` before showing the success toast

**2. `UploadManagerProvider` (automatic mirror during upload)**

After automatic mirroring completes in `publishEvent()`:
- Has the video event that was just published (ID, kind, pubkey, d-tag)
- Has the blob descriptors from upload/mirror results
- Calls `publishMirrorAnnouncements()` as a non-blocking follow-up
- Errors are logged but don't fail the publish (same pattern as current mirror errors)

### Relay selection

Publish to the union of:
- User's write relays (from NIP-65 relay list)
- Video event relays (relays where the video event was seen/published)

No indexer relays — the user's write relays and video event relays are sufficient for discoverability.

## Discovery Side Changes

### `url-discovery.ts`

Currently `extractUrlFromEvent()` only reads the `url` tag. Update to also extract `fallback` tags:

```typescript
function extractUrlsFromEvent(event: NostrEvent): string[] {
  const urls: string[] = []

  // Primary URL
  const urlTag = event.tags.find(t => t[0] === 'url')
  if (urlTag?.[1]) urls.push(urlTag[1])

  // Fallback URLs
  for (const tag of event.tags) {
    if (tag[0] === 'fallback' && tag[1]) {
      urls.push(tag[1])
    }
  }

  return urls
}
```

The `DiscoveredUrl` interface and `discoverUrls()` function are updated to return multiple URLs per event. The rest of the pipeline (`useMediaUrls`, `generateMediaUrls`) stays unchanged — discovered URLs are appended to the failover chain as before.

## Error Handling

- If 1063 publishing fails, the mirror itself already succeeded. Log a warning but don't show an error to the user — the files are safely copied regardless.
- If some mirror servers failed but others succeeded, only include successful mirror URLs in the 1063 event.
- If zero mirrors succeeded, don't publish any 1063 event (nothing to announce).

## Files Changed

| File | Change |
| ---- | ------ |
| `src/lib/mirror-announcements.ts` | **New.** Build and publish kind 1063 events |
| `src/lib/url-discovery.ts` | Extract `fallback` tags in addition to `url` |
| `src/components/MirrorVideoDialog.tsx` | Call `publishMirrorAnnouncements()` after successful mirror |
| `src/providers/upload/UploadManagerProvider.tsx` | Call `publishMirrorAnnouncements()` after automatic mirror |

## Testing

- Unit test `buildFileMetadataEvent()`: verify tag structure for addressable vs non-addressable events, verify `url`/`fallback` ordering, verify metadata tags included when available
- Unit test `extractUrlsFromEvent()`: verify extraction of `url` + multiple `fallback` tags
- Integration: manual test mirror dialog → check relay for published 1063 → verify discovery picks it up on another client
