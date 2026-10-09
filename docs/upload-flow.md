# Upload Flow

This describes how the current upload experience works for viewers/uploader decisions, how Blossom servers and relays are configured, and the code-level conditions that run from dropping a file/URL until the video event is published.

## Shared Upload Widgets

Web and Studio use the same `@nostube/widgets/components/*` implementations:
`TagInput` (`tag-input`), `FileDropzone`, `ContentWarning`, `ThumbnailSection`,
`SubtitleSection`, `SubtitlesTable`, and `LanguageSelect` (`language-select`).
The language list is available through `@nostube/widgets/languages`; upload
translations are registered with `registerWidgetTranslations`.

- `TagInput` accepts controlled tags and an optional autocomplete search callback.
  Web supplies its event-store tag index; Studio needs no event-store provider for tags.
- `ThumbnailSection` selects a video frame, image file, or imported image URL.
  Uploads remain app-owned: Web supplies its server-status display and toast handler;
  Studio retains the selected image locally until “Upload and publish”.
- `SubtitleSection` supports multiple VTT/SRT files, language selection, and removal.
  Both apps use `@nostube/core/subtitle-utils` to infer languages and convert SRT to
  WebVTT before upload. Published captions use `text-track` tags with a URL and language.
- Studio keeps its signer and creator/writer checks, instance-only Blossom uploads,
  and sequential retryable job. Completed video and unchanged subtitle uploads
  survive a retry; changed thumbnail or subtitle files invalidate their own results.

## User-Facing Flow and Choices

- **Pre-reqs:** User must be logged in; otherwise the upload UI is replaced with a login prompt (`src/components/VideoUpload.tsx:665`).
- **Server awareness:** The banner above the form shows how many Blossom servers will be used for the initial upload vs. mirroring and links to Settings to adjust them (`src/components/VideoUpload.tsx:672-686`).
- **Configure servers:** Settings → Blossom Servers lets users add/remove servers and toggle tags `mirror`, `initial upload`, `proxy` (`src/components/settings/BlossomServersSection.tsx:1-140`). Defaults come from `presetBlossomServers` (currently an initial-upload+proxy server) (`src/constants/relays.ts:17-21`).
- **Relays for publish:** Video events are sent only to relays tagged `write` in Settings → Relays.
- **Pick source:** On the upload page users choose “Upload File” vs. “From URL” (`src/components/video-upload/InputMethodSelector.tsx:7-34`).
- **Provide media:** File dropzone accepts one video; URL mode takes a direct video URL and has a “Process” action (`packages/widgets/src/components/FileDropzone.tsx`, `apps/web/src/components/video-upload/UrlInputSection.tsx`).
- **Preview & metadata:** After processing, the video element and extracted dimensions/duration/codecs are shown (`src/components/video-upload/VideoPreview.tsx:11-54`).
- **Thumbnail:** Users can keep the generated thumbnail, select another video frame, upload a custom image, or import an image URL (`packages/widgets/src/components/ThumbnailSection.tsx`).
- **Details:** Title, description, language, tags, and optional content warning are filled after an upload/URL is processed (`apps/web/src/components/video-upload/FormFields.tsx`, `packages/widgets/src/components/ContentWarning.tsx`).
- **Publish action:** “Publish video” becomes enabled once a video source, thumbnail, and title are set; clicking publishes the Nostr video event.

## Configuration Requirements

- **Initial upload servers:** File uploads require at least one Blossom server tagged `initial upload`; otherwise the dropzone is replaced with guidance to configure one (`src/components/VideoUpload.tsx:718-743`).
- **Mirror servers:** Optional servers tagged `mirror` are used for redundancy for both uploaded files and Blossom URLs (`src/components/VideoUpload.tsx:63-68`, `423-507`, `328-362`).
- **Relays:** Publish targets are the configured relays filtered to `write` tags (`src/components/VideoUpload.tsx:205-208`).

## Code Decisions in the Upload Dialog

- **Mode gating:** `inputMethod` drives validation—file mode requires a selected file and initial servers; URL mode requires a non-empty URL (`src/components/VideoUpload.tsx:71-125`).
- **File uploads:**
  - Uses BUD-10 chunked uploads with 10 MB chunks and two concurrent uploads; progress updates feed the UI (`src/components/VideoUpload.tsx:423-508`).
  - Before uploading, the file hash is streamed; servers that already have the hash are skipped (`src/lib/blossom-upload.ts:606-664`).
  - If a server does not support PATCH chunking or fails CORS, it falls back to PUT upload (`src/lib/blossom-upload.ts:640-654`, `670-700`).
  - After upload, duration/dimensions are read from a video element; codec/bitrate via `getCodecsFromFile` (`src/components/VideoUpload.tsx:469-496`).
  - Mirroring kicks in when mirror servers are configured, using the first uploaded blob as the source (`src/components/VideoUpload.tsx:498-507`).
- **URL ingestion:** Processing creates a video element to read metadata and tries to extract codecs. If the URL looks like a Blossom URL (hash in path) it mirrors that blob to mirror servers using the current signer (`src/components/VideoUpload.tsx:298-376`).
- **Thumbnail handling:**
  - Default is auto-generated from the uploaded/URL video via a hidden video element and canvas; blob URL is memoized and cleaned up (`src/components/VideoUpload.tsx:561-645`).
  - Generated thumbnails are converted to Files and uploaded (with optional mirroring) right before publishing; custom thumbnails are uploaded immediately when dropped (`src/components/VideoUpload.tsx:79-118`, `384-414`).
- **Form visibility:** Metadata fields, thumbnail choice, and content warning only appear after a video has started uploading/processing (`src/components/VideoUpload.tsx:785-825`).
- **Reset path:** The trash button wipes local state, reverts to file mode, and clears uploads/thumbnails (`src/components/VideoUpload.tsx:647-663`, `828-863`).

## Publishing the Video Event

- **Event kind:** Determined by aspect ratio—landscape → kind 34235, portrait → kind 34236 (addressable NIP-71 video events).
- **IMeta construction:** Includes dimensions, primary URL (uploaded blob or provided URL), hash/mime for uploaded files, bitrate (if present), thumbnail URLs (uploaded + mirrored), and fallback URLs for additional uploads/mirrors (file mode only) (`src/components/VideoUpload.tsx:130-166`).
- **Tags:** Adds title, alt (description), published_at, duration, optional `content-warning`, user tags (`t`), language tags (`L` with scheme and `l` with language), and client tag (`src/components/VideoUpload.tsx:168-185`).
- **Relays:** Published via `useNostrPublish`, which signs with the user signer and sends to relays tagged `write` (or all if none filtered) (`src/hooks/useNostrPublish.ts:9-53`, `src/components/VideoUpload.tsx:205-208`).
- **Post-publish:** Navigates home and clears form state (`src/components/VideoUpload.tsx:210-220`).

## Quick End-to-End Outline

1. User sets Blossom servers and write relays in Settings; logs in.
2. Chooses file or URL. File path requires at least one `initial upload` server.
3. System uploads (or processes URL), extracts metadata, mirrors when possible, generates thumbnail.
4. User fills title/description/tags/language, picks/adjusts thumbnail, optional content warning.
5. On Publish, thumbnail is ensured uploaded, IMeta/fallbacks and caption tags are built, the NIP-71 event (kind 34235/34236) is signed and sent to write relays, then UI resets.
