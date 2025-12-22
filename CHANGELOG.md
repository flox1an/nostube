# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Upload Event Preview**: Collapsible preview below upload wizard showing the generated Nostr event JSON before publishing. Displays kind, content, and all tags with copy-to-clipboard functionality. Updates in real-time as form fields change (EventPreview.tsx, useVideoUpload.ts:buildVideoEvent)
- **DVM Video Transcoding**: Automatic 720p transcoding for high-resolution (1080p+) or incompatible codec videos using NIP-90 Data Vending Machines. Shows alert in upload wizard Step 1 with Create/Skip options only when a DVM handler is available (queries NIP-89 announcements) and hides automatically when a 720p variant already exists. Supports progress tracking with scrollable status message log, cancellation, and automatic Blossom mirroring of transcoded videos. Blocks publish button during transcoding/mirroring. Transcode jobs are resumable—users can navigate away and return later; state is persisted to draft and resumes automatically, querying for existing results or resubscribing to DVM feedback. 12-hour timeout for expired jobs (useDvmTranscode.ts, useDvmAvailability.ts, DvmTranscodeAlert.tsx, upload-draft.ts:DvmTranscodeState)
- **Video Variant Deletion with Server Cleanup**: Delete button on video variants in upload dialog now shows confirmation dialog with options to either remove from form only or delete from all Blossom servers where the video was uploaded/mirrored. Uses Nostr-authenticated DELETE requests to remove blobs from servers (DeleteVideoDialog.tsx, useVideoUpload.ts:handleRemoveVideoWithBlobs)
- **Upload Draft Persistence**: NIP-78 based draft system with localStorage + Nostr sync. Up to 10 drafts, auto-save, 30-day cleanup, NIP-44 encryption
- **Upload Draft Encryption**: Drafts encrypted with NIP-44 for privacy. Backward compatible with unencrypted drafts
- **NIP-51 Follow Sets**: Migrated from NIP-2 contact lists to NIP-51 follow sets with auto-import dialog
- **Blossom Server Onboarding**: Two-step onboarding with follow import and Blossom server configuration
- **Video Comment Notifications**: Bell icon with dropdown showing comment notifications, 7-day persistence
- **Category Browsing**: 9 categories with `/category/:category` routes
- **NSFW Author Filtering**: Automatic content warnings for specific authors
- **Share Dialog Embed Tab**: Copy iframe embed code with optional timestamp
- **Embed Player Features**: Pulsating logo, clickable title/author links, timestamp preservation, content warning overlay, play/pause indicator, event caching, profile fetching
- **NIP-50 Full-Text Search**: Search videos via relay.nostr.band
- **Media Caching Servers**: Separate caching/proxy configuration
- **Watch History**: Track last 100 watched videos
- **Mirror Video Dialog**: Mirror videos to additional Blossom servers
- **Multi-Video Upload**: Upload multiple quality variants (4K/1080p/720p/etc)
- **Internationalization**: EN/DE/FR/ES support with 500+ translations
- **NIP-71 Addressable Events**: Support for kinds 34235/34236
- **Hashtag Search**: `/tag/:tag` routes with clickable hashtags
- **Video Notes Page**: View and repost videos from Kind 1 notes
- **Docker Deployment**: Multi-stage Dockerfile with runtime env vars
- **NIP-40 Video Expiration**: Optional expiration setting in upload wizard (1 day, 7 days, 1 month, 1 year). Videos expire at specified time and are deleted by relays

### Changed

- **Page Max-Width Consistency**: All pages now have consistent `max-w-560` max-width constraint for better readability on ultra-wide displays. Applies to HomePage, SearchPage, ShortsPage, CategoryPage, HashtagPage, AuthorPage, SubscriptionsPage, LikedVideosPage, HistoryPage, SinglePlaylistPage, and VideoPageLayout
- **Upload Form Wizard**: Redesigned upload form as 4-step wizard with prev/next navigation. Step 1: Video upload with full VideoVariantsTable, Step 2: Form fields (title, description, tags, language), Step 3: Thumbnail selection, Step 4: Additional settings (content warning, expiration). Validation prevents proceeding without required fields (video for step 2, title for step 3, thumbnail for step 4). "Save Draft" button on lower right instead of top "Back to Drafts" button. Required fields marked with asterisk (\*) and each step shows description explaining requirements
- **Upload Hints Removed**: Removed tip text about MP4/H.264 and quick start hint about input method selection from upload wizard for cleaner UI
- **Upload Description Textarea**: Increased height from default to 10 rows for better visibility when entering longer descriptions
- **Upload Thumbnail UX**: When a custom thumbnail is uploaded, shows the image preview with a delete button (trashcan icon) instead of the drop area. Deleting removes blobs from Blossom servers and shows the drop area again
- **Debug Dialog Multi-Variant Support**: Improved video debug dialog to better distinguish multiple video variants. Tab labels now show quality/dimensions (e.g., "Video 1 (1080p)", "Video 2 (720p)"). Variant details show full SHA256 hash, quality, dimensions, size, MIME type with codec info, and hash from x tag. Now shows ALL video variants including incompatible codecs (e.g., HEVC on non-supporting browsers) for debugging purposes
- **Upload Page Advanced Button**: Opens Blossom dialog instead of navigating to settings
- **Onboarding Separation**: Moved Blossom config from login to upload page
- **Embed Player Performance**: Faster load times, reduced timeouts, fewer relays
- **Video Grid Skeletons**: 2 rows of loading placeholders during pagination
- **Label Button**: Moved to burger menu, beta users only
- **Shorts Hashtags**: Now clickable links
- **Video Page Auth**: Report/Mirror require login
- **Blossom Onboarding UI**: Cleaner two-column layout
- **Embed Player Branding**: Logo in top-right, auto-hide
- **Shorts Comments**: Max-width 2xl, centered
- **Comments Pagination**: 15 per page, collapsible replies
- **Play/Pause Overlay**: Smaller icon, faster fade
- **Button Standardization**: Using shadcn/ui components
- **Upload Button**: Only shows when logged in
- **Package Updates**: React 19.2.0, Applesauce 4.4.2, Vitest 4.0.10
- **Tag Normalization**: All hashtags lowercase
- **Default Config**: relay.divine.video relay, almond.slidestr.net Blossom server

### Changed

- **Draft Deletion UX**: Replaced 5-second undo toast with confirmation dialog offering three options: Cancel, Delete draft only, or Delete draft + media files from Blossom servers. Dialog shows context-aware descriptions based on whether draft contains uploaded media. Includes real-time deletion progress feedback and partial success/failure reporting (DeleteDraftDialog.tsx, DraftPicker.tsx)
- **Draft Picker Layout**: Moved "New Upload" button below draft list, centered with secondary styling for better visual hierarchy
- **Upload Dialog Layout**: Redesigned with responsive two-column layout. Left column (350px) shows video quality summary and thumbnail section. Right column shows form fields (title, description, tags, language, content warning). Single column on mobile (VideoUpload.tsx:343-424)
- **Video Quality Display**: Simplified video quality display with expandable details. Shows quality badges, dimensions, duration, total size, upload/mirror counts, and codec warnings in collapsed state. Click "Show Details" to expand full VideoVariantsTable with all technical details (VideoVariantsSummary.tsx)
- **Blossom Blob Deletion Consolidation**: Refactored blob deletion code into common `deleteBlobsFromServers` utility function in blossom-upload.ts. Eliminates duplicate deletion logic across thumbnail deletion, video variant deletion, and draft cleanup. Groups blobs by hash to avoid duplicate server requests (blossom-upload.ts, useVideoUpload.ts, DraftPicker.tsx)
- **Ultra-Wide Video Detection Threshold**: Increased cinema mode auto-trigger threshold from 5% to 10% above 16:9 aspect ratio. Videos now need to be at least ~1.96:1 to trigger automatic cinema mode (useUltraWideVideo.ts)
- **Blossom URL Utilities Consolidation**: Unified all Blossom URL detection, parsing, and validation into `src/lib/blossom-url.ts`. Added `NON_BLOSSOM_SERVERS` list (video.nostr.build, cdn.nostrcheck.me) for servers that resize/re-encode videos and don't preserve SHA256 hashes. These URLs are no longer treated as Blossom URLs for mirroring purposes (blossom-url.ts, media-url-generator.ts, useVideoUpload.ts, constants/relays.ts)

### Fixed

- **DVM Availability Hook Rendering**: Fixed synchronous setState within useEffect causing potential cascading renders in DVM availability check. Now uses queueMicrotask to defer state updates (useDvmAvailability.ts)
- **Video Transform Alert False Positive**: Fixed "Video Transformation Needed" alert incorrectly showing when a 720p variant exists but uses an incompatible codec (e.g., HEVC). Now uses `allVideoVariants` instead of filtered variants to check transformation needs (VideoPage.tsx:570-574)
- **Category/Tag Page Duplicate Videos**: Fixed duplicate videos appearing on category and hashtag pages when the same video is posted as both addressable (kind 34235/34236) and regular (kind 21/22) events. Now uses `deduplicateByIdentifier` to prefer addressable events (useCategoryVideos.ts, useHashtagVideos.ts)
- **Upload Wizard Form Submission**: Fixed videos publishing from step 1 when pressing Enter in input fields. Form submission now only works on step 4 (VideoUpload.tsx:handleSubmit)
- **DVM Progress Messages**: Fixed DVM feedback parsing to read status from `content` tag and ETA from `eta` tag. Now shows actual transcode progress like "Transcoding to 720p MP4 (~3m 23s remaining)" instead of generic "Processing video..." (useDvmTranscode.ts)
- **DVM Transcode Mirroring**: Fixed transcoded videos using temp DVM URL instead of user's Blossom servers. Now extracts SHA256 from Blossom URL format and mirrors to configured upload/mirror servers. Includes full codec information, size, bitrate, duration, and SHA256 hash in the imeta tag for transcoded videos (useDvmTranscode.ts, useVideoUpload.ts)
- **DVM Transcode State Cleanup**: Fixed transcode state not being cleared from draft when transcoding completes or when a transcoded 720p variant is deleted. The `dvmTranscodeState` is now properly persisted immediately on clearing, preventing unwanted resume attempts when reopening a draft (useUploadDrafts.ts:51, useVideoUpload.ts:702-703,719-720)
- **Tag Deduplication on Paste**: Fixed duplicate tags being added when pasting text containing the same tag multiple times (e.g., "tag1 tag2 tag1"). Now uses Set to deduplicate within pasted text before adding (useVideoUpload.ts:277)
- **Tag State Consistency**: Fixed stale closure bugs in tag add/remove functions causing incorrect tag state. Now uses functional state updates (prevTags => ...) to ensure operations always use the latest state (useVideoUpload.ts:280-285,305)
- **Duplicate Tag Handling**: Fixed React key collision when duplicate tags existed, preventing tag deletion from working. Tags are now deduplicated when loading from draft, and unique keys are used for rendering (useVideoUpload.ts:200-204, FormFields.tsx:83-85)
- **Last Draft Deletion**: Fixed deleting the last draft showing an empty draft in the picker. Now properly creates a new draft and directly opens the upload form using useEffect instead of calling createDraft during render (UploadPage.tsx:28-34)
- **Deleted Drafts Reappearing**: Fixed deleted drafts reappearing after page refresh due to Nostr sync restoring old data. The merge logic now compares Nostr event timestamp with localStorage lastModified to prevent restoring drafts that were deleted locally (useUploadDrafts.ts:311-346)
- **Duplicate Video Deduplication**: Videos posted as both kind 21 and kind 34235 (or 22 and 34236) with the same `d` tag are now deduplicated in timelines and suggestions. Prefers addressable events (34235/34236) over regular events (21/22). Same-kind duplicates keep the newer event (video-event.ts:220-268, filter-video-suggestions.ts)
- **Draft Upload State Initialization**: Fixed "Add another quality" button not appearing when opening a draft with existing videos. The uploadState now correctly initializes to 'finished' when a draft contains videos, ensuring the additional variant upload UI is visible. Also fixes unnecessary input method selector and URL input showing when videos already exist (useVideoUpload.ts:49-51)
- **Draft Nostr Sync Debouncing**: Fixed draft changes publishing to Nostr on every form field change. Split useVideoUpload's useEffect into two separate hooks: one for form fields (title, description, tags, etc.) that triggers debounced sync (5-second delay), and one for upload milestones (uploadInfo, thumbnailUploadInfo) that triggers immediate sync. Previously, all changes included uploadInfo which triggered immediate sync (useVideoUpload.ts:681-720, useUploadDrafts.ts:244)
- **Draft Generated Thumbnails**: Drafts with generated thumbnails now show video thumbnail in draft list using image proxy
- **Draft Thumbnail Extensions**: Fixed image proxy failing to load thumbnails from Blossom blob URLs without file extensions. Added `ensureFileExtension()` helper that appends appropriate extensions (.jpg, .png, .mp4, etc.) based on MIME types before passing URLs to image proxy (utils.ts:177-205, DraftCard.tsx:23-47)
- **Publish Button**: Now works with generated thumbnails after draft restore
- **Upload Draft Loop**: Fixed infinite re-render in draft persistence
- **Draft Title Persistence**: Draft changes now appear immediately in picker
- **Draft Nostr Sync**: Encrypts and publishes even on quick navigation
- **Draft Deletion Sync**: Deletions now sync to Nostr immediately
- **Dialog Context Errors**: Fixed component hierarchy issues
- **Onboarding Bugs**: Dialog closing, showing for existing users
- **Build Issues**: Vercel deployment, ESLint errors
- **Video Availability Alert**: Only shows for Blossom videos
- **Shorts Performance**: Reduced IntersectionObserver calls 50-70%
- **NSFW Filtering**: Videos with content warnings filtered from suggestions
- **Grid Performance**: Removed console logs, added caching, memoization
- **Embed Player**: Test suite, branding position, nevent encoding
- **Video Loading**: Fixed timeline loading on login, reset logic
- **Blossom URLs**: Normalized to prevent double slashes
- **Infinite Renders**: Fixed in useUserBlossomServers, HomePage, ShortsPage
- **naddr Support**: Video pages now handle both nevent and naddr
- **Addressable Events**: Using naddr encoding for kinds 34235/34236
- **Thumbnail Loading**: Shows placeholder, handles errors
- **Comment Wrapping**: Fixed text overflow issues
- **Pagination Loading**: Fixed skeleton display
- **iOS Autoplay**: Fixed after multiple videos
- **Mobile Sidebar**: Safe area padding
