# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Global Upload Manager Infrastructure**: Added foundation for background uploads and transcoding that will run in global state. Created `UploadManagerProvider` for managing upload tasks that persist across navigation, with localStorage persistence for task state. Unified notification system now supports both video comment notifications and upload notifications in the same bell dropdown. Upload notifications show completion/error status with icons. Includes i18n support for EN/DE/FR/ES (UploadManagerProvider.tsx, upload-manager-storage.ts, upload-manager.ts types, useUploadNotifications.ts, useAllNotifications.ts, UploadNotificationItem.tsx)
- **Adaptive Quality Switching**: Automatically downgrades video quality on slow networks. Triggers when 3+ buffering events occur within 30 seconds or buffer drops below 2 seconds while playing. Only applies to non-HLS videos with multiple quality variants. Includes 10-second cooldown between downgrades (useAdaptiveQuality.ts)
- **Accumulating Seek with Visual Feedback**: Arrow keys and touch gestures now accumulate seek time within 1 second window. Fast consecutive presses show "+5s", "+10s", "+15s" etc. with indicator positioned on right for forward seek, left for backward seek. Actual seek is debounced until input stops (useSeekAccumulator.ts, SeekIndicator.tsx)
- **Custom YouTube-Style Video Player**: Complete rewrite of the video player, replacing media-chrome and hls-video-element with a custom implementation. Features YouTube-inspired design with:
  - Auto-hiding controls with gradient overlay (3 second timeout while playing)
  - Progress bar that expands on hover with timestamp tooltip and draggable scrubber
  - Volume control with expandable slider on hover
  - Settings menu with nested submenus for quality and playback speed (0.25x to 2x)
  - Mobile touch gestures: double-tap left/right thirds for -10s/+10s seek with ripple animation
  - Direct hls.js integration for HLS streams (removes hls-video-element dependency)
  - PiP, captions, theater mode, and fullscreen controls
  - Play/pause overlay animation on click
  - Unified architecture: single video element for both native and HLS playback
  - New component structure in `src/components/player/` with dedicated hooks (useHls, usePlayerState, useControlsVisibility)
- **Video Quality Selector**: Quality menu in video player control bar for non-HLS videos with multiple quality variants. Displays available qualities (720p, 1080p, etc.) in a popup menu. Preserves playback position and play state when switching qualities. Only appears when video has 2+ variants (QualityMenu.tsx, VideoPlayer.tsx)
- **Upload Event Preview**: Collapsible preview below upload wizard showing the generated Nostr event JSON before publishing. Displays kind, content, and all tags with copy-to-clipboard functionality. Updates in real-time as form fields change (EventPreview.tsx, useVideoUpload.ts:buildVideoEvent)
- **DVM Video Transcoding**: Multi-resolution transcoding (1080p, 720p, 480p, 360p, 240p) for high-resolution or incompatible codec videos using NIP-90 Data Vending Machines. Shows alert in upload wizard with resolution checkboxes (720p selected by default), processing resolutions sequentially. Already-existing resolutions are disabled with "(exists)" label. Progress display shows current resolution, completion status for each, and overall queue progress with icons. Supports cancellation and automatic Blossom mirroring of transcoded videos. Transcode jobs are resumable—users can navigate away and return later; state is persisted to draft and resumes automatically. 12-hour timeout for expired jobs (useDvmTranscode.ts, useDvmAvailability.ts, DvmTranscodeAlert.tsx, upload-draft.ts:DvmTranscodeState, dvm-utils.ts:RESOLUTION_DIMENSIONS)
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

- **Video Card Hover Effect**: Added `p-2 hover:bg-accent rounded-lg transition-colors` to video cards and suggestion items. Removed all grid gaps from VideoGrid - spacing now comes from card padding (VideoCard.tsx, VideoGrid.tsx, VideoSuggestions.tsx)
- **Cinema Mode Aspect Ratio Preservation**: Video player in cinema/theater mode now preserves original aspect ratio with max-height of 85dvh. Container uses `max-h-[85dvh] flex items-center justify-center`, video element uses `max-h-[85dvh]` directly. Shows black bars on sides for tall videos instead of clipping top/bottom (VideoPlayer.tsx, VideoPage.tsx)
- **Video Player Settings Menu Alignment**: Changed settings menu selectable items (quality levels, playback speeds) to have check mark on the left side like YouTube. Main menu items now use whitespace-nowrap to prevent "Playback speed" from wrapping. Increased menu min-width from 200px to 240px for better fit (SettingsMenu.tsx)
- **Touch Overlay Simplified**: Changed from double-tap to single-tap for seeking on mobile. Tap left third to seek backward, right third to seek forward, center to play/pause. Works with seek accumulator for fast consecutive taps (TouchOverlay.tsx)
- **Player Keyboard Shortcuts Consolidated**: Moved keyboard handling (Space, M, F, arrow keys) into VideoPlayer component for proper integration with seek accumulator. Space toggles play/pause, M toggles mute, F toggles fullscreen, arrow keys seek with accumulation (VideoPlayer.tsx)
- **Video Player Controls Timing**: Reduced auto-hide delay from 3 seconds to 2 seconds for snappier feel, but increased fade-out animation from 300ms to 500ms for smoother transition (ControlBar.tsx, VideoPlayer.tsx)
- **Video Expiration Badge**: Videos with NIP-40 expiration tags now show an amber "Expires in X" badge next to the title, or a red "Expired" badge if already expired. Uses date-fns formatDistance for human-readable time (VideoInfoSection.tsx)
- **Play/Pause Overlay Animation**: Play icon now displays 2x longer (800ms) than pause icon (400ms) for better visual feedback. Uses `animation-fill-mode: forwards` to prevent animation cutoffs. Component is shared between VideoPlayer and ShortsVideoPage (PlayPauseOverlay.tsx)
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
- **Package Updates**: React 19.2.3, React Router 7.11.0, Vite 7.3.0, Vitest 4.0.16, nostr-tools 2.19.4, lucide-react 0.562.0, media-chrome 4.17.2, tailwindcss 4.1.18, zod 4.2.1, i18next 25.7.3, react-i18next 16.5.0, react-hook-form 7.69.0, recharts 3.6.0, TypeScript ESLint 8.50.1, ESLint 9.39.2, @html-eslint 0.52.0, Prettier 3.7.4
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
- **ESLint Git Worktrees Ignore**: Added `.worktrees` to ESLint ignores to prevent linting files in git worktree directories (eslint.config.js)

### Fixed

- **Video Player Resume Position Not Working**: Fixed resume from last play position (stored in localStorage) and `?t=` URL parameter not seeking to the correct time. Multiple fixes: (1) Initial position was set before video metadata loaded - now waits for `loadedmetadata` event. (2) The listener captured stale `initialPlayPos` value due to closure - now uses ref. (3) Changed storage format to JSON `{time, duration}` so videos without duration metadata in Nostr event can still use "near end" detection from previously stored duration. (4) Added `videoUrl` to effect dependencies so it re-runs when video element becomes available. Backward compatible with legacy string format. PlayProgressBar also updated to use new format with cache invalidation (VideoPlayer.tsx, useVideoPlayPosition.ts, PlayProgressBar.tsx)
- **Video Player Position Not Saving to localStorage**: Fixed play positions not being saved during playback. The `timeupdate` event listener wasn't being reattached after the video element was remounted (e.g., during URL failover). Now tracks the video element identity and resets `videoReady` state when the element changes, ensuring event listeners are properly reattached (usePlayerState.ts:54-96)
- **Mobile Touch Zones Overlapping Controls**: Fixed touch zones for seek (left/right thirds) overlapping with the control bar on mobile. Touch overlay now ends 48px above the bottom to leave space for player controls (TouchOverlay.tsx)
- **Video Player Time Display Not Updating**: Fixed time display showing 0:00 all the time. The usePlayerState hook's effect was running before the video element was mounted to the DOM, so event listeners were never attached. Now polls for video element availability using requestAnimationFrame and re-runs the effect when the element is ready (usePlayerState.ts:54-70)
- **Video Player Controls Not Auto-Hiding**: Fixed controls not fading out after 3 seconds of inactivity while playing. This was caused by the same issue as the time display - isPlaying state never updated because event listeners weren't attached (usePlayerState.ts)
- **Video Player Progress Bar Issues**: Fixed progress bar scrubber floating above the bar, inability to click to jump to position, and incorrect alignment. Changed transform handling to use inline styles for both X and Y translation, increased click area height (ProgressBar.tsx)
- **Video Player Volume Slider Not Showing Level**: Fixed volume slider not displaying current volume. Changed to flex layout with proper height and item centering (VolumeControl.tsx)
- **Video Server Availability HEAD Request Loop**: Fixed continuous HEAD requests to Blossom servers when checking video availability. The caching mechanism was broken because setting status to 'checking' would overwrite the `lastChecked` timestamp, causing the cache check to fail on subsequent calls. Now preserves `lastChecked` when transitioning to 'checking' status. Also uses stable empty array constant for `videoUrls` to prevent unnecessary hook dependency changes (useVideoServerAvailability.ts:243, VideoPage.tsx:282)
- **Logged Out Infinite Render Loop**: Fixed infinite render loop on video page when not logged in that caused the page to freeze and block all interactions (clicking suggestions, etc.). The `useUserBlossomServers` hook was creating a new empty array on every render with `|| []` fallback, causing dependency chain to break memoization in `useVideoServerAvailability`. Now uses stable empty array constant (useUserBlossomServers.ts)
- **Video Player Keyboard Shortcuts**: Fixed keyboard shortcuts not working consistently regardless of focus state. Consolidated all keyboard handling into a single global handler and disabled media-chrome's built-in hotkeys to prevent double-triggering of play/pause when pressing spacebar. Now Space, M, T, F, arrow keys, and comma/period work reliably regardless of which element has focus (useVideoKeyboardShortcuts.ts, VideoPlayer.tsx)
- **DraftPicker Test Missing Provider**: Fixed DraftPicker tests failing due to missing `AccountsProvider` context. Added `AccountsProvider` and `EventStoreProvider` to test wrapper, updated delete test to use new confirmation dialog flow with `DeleteDraftDialog`, and switched button queries to use role-based selectors for more robust matching (DraftPicker.test.tsx)
- **DVM Availability Hook State Initialization**: Fixed React compiler error about calling setState synchronously within useEffect. Now initializes state based on relay availability at component mount instead of setting state in effect body (useDvmAvailability.ts)
- **Video Transform Alert False Positive**: Fixed "Video Transformation Needed" alert incorrectly showing when a 720p variant exists but uses an incompatible codec (e.g., HEVC). Now uses `allVideoVariants` instead of filtered variants to check transformation needs (VideoPage.tsx:570-574)
- **Category/Tag Page Duplicate Videos**: Fixed duplicate videos appearing on category and hashtag pages when the same video is posted as both addressable (kind 34235/34236) and regular (kind 21/22) events. Now uses `deduplicateByIdentifier` to prefer addressable events (useCategoryVideos.ts, useHashtagVideos.ts)
- **Upload Wizard Form Submission**: Fixed videos publishing from step 1 when pressing Enter in input fields. Form submission now only works on step 4 (VideoUpload.tsx:handleSubmit)
- **Upload Title Enter Key Prevention**: Fixed pressing Enter in the title input field causing form submission even with step check. Now explicitly prevents Enter key from triggering form submit on the title field (FormFields.tsx:preventEnterSubmit). Added dev logging to track any future unexpected form submissions
- **Upload Wizard Step 4 Accidental Publish**: Fixed video auto-publishing when transitioning from step 3 to step 4. Added 500ms protection window after arriving at step 4 that blocks form submission, preventing accidental double-click publish. Also added Enter key prevention to ContentWarning input and explicit `type="button"` on Advanced button (VideoUpload.tsx:justArrivedAtStep4, ContentWarning.tsx:onKeyDown)
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
- **Video Availability Alert**: Fixed "Limited Availability" alert showing when a video is available on multiple servers but the event only lists one URL. Now checks server availability on page load and includes verified servers from user/config lists in the count. Also hides the alert while checking availability to prevent UI flashing (VideoPage.tsx)
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

### Removed

- **Unused Video Cache Worker**: Deleted `src/workers/videoCacheWorker.ts` which was dead code never integrated into the app. Video loading is handled by hooks like `useInfiniteTimeline`, `useCategoryVideos`, etc.
