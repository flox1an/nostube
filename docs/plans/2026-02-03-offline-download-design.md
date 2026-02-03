# Offline Download Feature Design

**Date:** 2026-02-03
**Status:** Draft
**Feature:** In-App Offline Video Library with Background Downloads

## Overview

nostube gets an in-app offline library. Users can save videos for offline playback via the three-dot menu on any video page. A Service Worker with the Cache API stores video blobs locally in the browser. The player plays offline videos seamlessly — the Service Worker intercepts fetch requests and responds from cache, requiring zero changes to the existing player. The offline library behaves like a playlist during playback (auto-advance, previous/next). A simple direct "Download" link is also available for saving files to disk.

## Goals

- **Offline playback**: Watch previously saved videos without internet connection
- **Background downloads**: Downloads happen in the background with progress tracking
- **Transparent caching**: Service Worker integrates into existing URL resolution — the player doesn't know or care if a video is local or remote
- **Quality selection**: Choose from available variants or request transcoding for lower resolutions
- **Storage awareness**: Users see how much space is used and get hints about PWA installation for more storage

## Non-Goals

- Bulk download (e.g., "download entire playlist")
- Automatic sync of download lists across devices via Nostr
- Client-side transcoding (WASM ffmpeg etc.)
- Automatic cache eviction (user has full control)

## Storage Architecture

### Video Blobs: Cache API via Service Worker

The Cache API is the primary storage for video files. It integrates naturally into the browser's fetch lifecycle — the Service Worker intercepts requests and responds from cache when available.

**Why Cache API over IndexedDB or OPFS:**

- Transparent integration with fetch — the player keeps using normal URLs
- No need to create object URLs or manage blob lifecycle
- Same API that YouTube, Spotify, and Twitter PWAs use for offline
- Works on all modern browsers including mobile (Chrome Android, Safari iOS 11.3+)

**Cache key strategy:** SHA256 hash of the video (already present in Blossom URLs and imeta tags). This deduplicates the same video served from different server URLs.

**What gets cached:**

- Video files (selected quality variant)
- Thumbnail images
- Subtitle tracks (VTT files)

### Metadata: IndexedDB

A separate IndexedDB table `offline-downloads` stores download metadata:

```typescript
interface OfflineDownload {
  id: string;                    // unique download ID
  videoEventId: string;          // Nostr event ID
  videoEventKind: number;        // 21, 22, 34235, 34236
  videoLink: string;             // naddr or nevent link for navigation
  variantUrl: string;            // chosen variant URL
  cacheKey: string;              // SHA256 hash
  quality: string;               // e.g., "720p", "480p"
  mimeType: string;              // e.g., "video/mp4"
  fileSize: number;              // bytes
  status: DownloadStatus;
  progress: number;              // 0-100
  dvmJobId?: string;             // if transcoding was requested
  createdAt: number;             // timestamp
  completedAt?: number;          // timestamp
  error?: string;                // error message if failed
  thumbnailCacheKey?: string;    // cached thumbnail hash
  subtitleCacheKeys?: string[];  // cached subtitle hashes
}

type DownloadStatus =
  | "pending"
  | "downloading"
  | "transcoding"       // waiting for DVM
  | "complete"
  | "error"
  | "paused";
```

### Nostr Events: Already Cached

Video event metadata is already cached in nostr-idb (the existing IndexedDB cache for Nostr events). If the user watched the video before downloading, the event is already available offline.

## Service Worker Integration

### Intercept Strategy

The Service Worker sits in front of all fetch requests. For video URLs, it checks the local cache first:

```
Request comes in
  → Is it a known Blossom URL or cached hash?
    → Yes: respond from cache (instant, works offline)
    → No: pass request to network normally
```

The existing URL resolution chain in `useMediaUrls()` remains unchanged. The Service Worker is a transparent layer underneath. The priority order becomes:

```
Local Cache (Service Worker) → Proxy → Original → Mirror → Fallback
```

### Cache Matching Logic

Blossom URLs contain the SHA256 hash in the path (e.g., `https://server.com/<sha256>`). The Service Worker extracts the hash from incoming request URLs and checks if that hash exists in the offline cache. This means a video cached from one server URL will also serve requests for the same hash on different server URLs.

## Download Flows

### Scenario A: Direct Download (Existing Variant)

1. User opens three-dot menu → "Save Offline"
2. Dialog shows available variants with quality labels and file sizes (e.g., "1080p — 480 MB", "720p — 210 MB")
3. User selects quality → download starts in background
4. Service Worker fetches the video and stores it in cache
5. Progress is tracked in IndexedDB and shown in UI (sidebar badge, downloads page)
6. On completion: entry moves from "Active Downloads" to "Offline Library"

### Scenario B: Transcoding Download (Non-Existing Resolution)

1. Same dialog, but with additional options marked as "Requires transcoding"
2. User selects e.g., 360p for a video that only has 1080p
3. DVM transcoding job is started (same mechanism as upload transcoding, NIP-90)
4. Status changes to "Transcoding..." with polling on DVM job status
5. Once DVM completes: result URL is received → normal download into cache
6. Transcoding result stays local

**Error handling:**

- Interrupted downloads are resumable via HTTP Range requests
- Failed downloads can be retried with a button
- Transcoding timeout/failure: fallback offer to download the original resolution

### Future Enhancement: Community Variants (kind 1063)

When a user transcodes a video to a new resolution, they could optionally publish the result as a kind 1063 event with an `e` tag referencing the original video event. This contributes the new variant to the community — other users can discover and use it. This is planned as a later enhancement, not part of V1.

## UI Design

### Download Trigger

Located in the **three-dot menu** on the video page: "Save Offline" menu item. Opens a dialog with quality selection.

### Quality Selection Dialog

```
┌─────────────────────────────────┐
│  Save Offline                   │
│                                 │
│  ○ 1080p — 480 MB              │
│  ● 720p  — 210 MB              │
│  ○ 480p  — 95 MB               │
│  ○ 360p  — 40 MB  ⟳ transcode │
│                                 │
│  [Cancel]          [Download]   │
└─────────────────────────────────┘
```

- Available variants from the video event are listed with actual file sizes
- Resolutions that require DVM transcoding are marked with a transcode indicator
- Default selection: highest resolution that fits comfortably in available storage (or a sensible default like 720p on mobile)

### Sidebar Entry

"Downloads" appears in the sidebar **only when at least one download exists** (running or complete). Shows a badge with count of active downloads or a progress indicator.

### Downloads Page

Two sections:

**Active Downloads (top)**

- Shown only when downloads are in progress
- Each entry: thumbnail, title, quality, progress bar, file size, pause/cancel buttons
- Transcoding jobs show a different progress state ("Transcoding..." with spinner)

**Offline Library (bottom)**

- Video grid layout (same cards as normal video feeds)
- Sorted by download date (newest first)
- Each card shows an "offline" badge and the cached quality
- Click plays the video in offline mode with auto-advance to next download
- Individual delete button on each card
- Storage usage bar at the bottom: "X MB of ~Y MB used"

### Playback Behavior

When playing a video from the offline library:

- Auto-advances to the next video in the library (like a playlist)
- Previous/Next navigation within the offline library
- Visual indicator that playback is from cache (small offline badge)
- If the user navigates to an offline video via normal browsing (not from downloads page), it still plays from cache transparently — no difference in behavior

## Storage Management

### Browser Limits

| Browser          | Typical Limit                        | Notes                                    |
| ---------------- | ------------------------------------ | ---------------------------------------- |
| Chrome (Desktop) | Up to 80% of disk                    | Very generous                            |
| Chrome (Android) | Up to 80% of disk                    | Very generous                            |
| Firefox          | Up to 50% of disk                    | Per-origin limit of 2 GB (configurable)  |
| Safari (iOS tab) | ~50 MB soft limit                    | Aggressive eviction after 7 days         |
| Safari (iOS PWA) | 1+ GB                                | Much more generous when installed         |
| Safari (macOS)   | Up to 80% of disk (recent versions)  | Reasonable                               |

### PWA Hint

When available storage is low or on Safari iOS in a normal tab, show a non-blocking hint:

> "For more offline storage, add nostube to your home screen."

### Manual Cleanup

- Each download can be individually deleted
- "Delete all" button on the downloads page
- No automatic eviction — user has full control
- `navigator.storage.estimate()` for storage usage display

## Technical Components

### New Files

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `src/workers/service-worker.ts`          | Service Worker with cache intercept logic         |
| `src/hooks/useOfflineDownload.ts`        | Hook: trigger download, track progress            |
| `src/hooks/useOfflineLibrary.ts`         | Hook: list downloads, storage stats               |
| `src/lib/offline-db.ts`                  | IndexedDB wrapper for offline-downloads table     |
| `src/lib/offline-cache.ts`              | Cache API operations (store, retrieve, delete)     |
| `src/pages/DownloadsPage.tsx`            | Downloads page with active/library sections       |
| `src/components/offline/DownloadDialog.tsx`   | Quality selection dialog                     |
| `src/components/offline/ActiveDownloads.tsx`  | Active downloads list with progress          |
| `src/components/offline/OfflineLibrary.tsx`   | Offline video grid                           |
| `src/components/offline/StorageBar.tsx`       | Storage usage indicator                      |

### Modified Files

| File                                     | Change                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `src/components/player/VideoPlayer.tsx`  | No changes needed (Service Worker is transparent) |
| `src/hooks/useMediaUrls.ts`             | No changes needed (Service Worker is transparent) |
| `src/components/layout/Sidebar.tsx`      | Add "Downloads" entry (conditional)               |
| `src/components/video/VideoActions.tsx`  | Add "Save Offline" to three-dot menu              |
| `src/AppRouter.tsx`                      | Add /downloads route                              |
| `vite.config.ts`                         | Service Worker registration setup                 |
| `index.html`                             | Service Worker registration script                |

### Dependencies

| Package                    | Purpose                              |
| -------------------------- | ------------------------------------ |
| `idb`                      | IndexedDB wrapper (or use raw API)   |
| `vite-plugin-pwa` (maybe)  | Service Worker build integration     |

## Implementation Phases

### Phase 1: Foundation

- Service Worker setup with Cache API
- IndexedDB offline-downloads table
- Direct download of existing variants (Scenario A)
- Basic downloads page with progress tracking
- Sidebar entry with conditional visibility

### Phase 2: Full Experience

- Transcoding download flow (Scenario B) via DVM
- Playlist-like playback from offline library (auto-advance)
- Storage management UI (usage bar, PWA hint)
- Thumbnail and subtitle caching
- Resume interrupted downloads (Range requests)

### Phase 3: Enhancements

- Optional kind 1063 publishing of transcoded variants
- "Download" direct link for save-to-disk (simple `<a download>`)
- Offline indicator in video cards throughout the app
- Smart default quality selection based on device/storage
