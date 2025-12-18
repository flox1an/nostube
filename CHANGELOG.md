# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Upload Draft Encryption**: Upload drafts synced to Nostr (kind 30078) are now encrypted with NIP-44 for privacy. Draft content is encrypted to the user's own public key using the signer's `nip44.encrypt()` method. Backward compatible: can read both encrypted (new) and unencrypted (legacy) drafts. Silent fallback when decryption fails. Requires signer with NIP-44 support (all Applesauce signers).
- **Upload Draft Persistence**: NIP-78 based draft system allowing users to resume upload workflows across page refreshes and devices. Features: dual-persistence (localStorage + Nostr sync), up to 10 concurrent drafts, auto-save on video upload milestones and debounced form field saves (3s), rich draft picker with thumbnails and smart status messages, 30-day auto-cleanup, delete with 5-second undo. Components: `DraftPicker`, `DraftCard`, `useUploadDrafts` hook. Conditional rendering: 0 drafts → new form, 1 draft → auto-resume, 2+ drafts → picker. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-17-upload-draft-persistence-design.md`

- **NIP-51 Follow Sets Migration**: Migrated subscription system from NIP-2 (kind 3 contact lists) to NIP-51 (kind 30000 follow sets) with identifier `d=nostube-follows`. Features: automatic follow import onboarding dialog for existing users, seamless follow/unfollow functionality, localStorage-based onboarding tracking. Components: `FollowImportDialog`, `useFollowSet` hook. Updated: `useFollowedAuthors`, `FollowButton`, `SubscriptionsPage`. Dialog appears on first login for users with kind 3 follows but no kind 30000 follow set. Non-dismissable dialog with "Import Follows" and "Skip for Now" options. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-09-nip51-follow-sets-migration.md`

- **Blossom Server Onboarding**: Extended onboarding dialog with beginner-friendly Blossom server configuration as Step 2. Multi-step dialog architecture: Step 1 (Follow Import) → Step 2 (Blossom Server Configuration). Features: pre-selected defaults (1 upload server: almond.slidestr.net, 2 mirror servers: blossom.primal.net and 24242.io), scrollable server lists with moderate info display (status, payment tier, file size limits, retention, CDN provider), separate sections for upload and mirror servers with checkboxes, validation requiring at least one upload server, automatic closure and config save. Components: `OnboardingDialog`, `OnboardingDialogContent`, `BlossomServerConfigStep`, `FollowImportStep` (extracted), `ServerCard`. Data: `src/lib/blossom-servers.ts` with 6 recommended servers. i18n support for EN/DE/FR/ES. localStorage tracking with `nostube_onboarding_blossom_config` key. Design document: `docs/plans/2025-12-09-blossom-onboarding-design.md`

- **Video Comment Notifications**: Bell icon in header with dropdown showing notifications when someone comments on your videos. Features: localStorage persistence with 7-day cleanup, polling every 2.5 minutes, dot indicator for unread notifications, click-to-navigate with comment highlighting, multi-tab synchronization. Components: `NotificationBell`, `NotificationDropdown`, `NotificationItem`. Hooks: `useNotifications`, `useLoginTimeTracking`, `useCommentHighlight`. i18n support for EN/DE/FR/ES

- **Category Browsing**: Added category-based video discovery with 9 predefined categories (Bitcoin, Nostr, Music, Social Media, Entertainment, Technology & Innovation, Photography & Art, Politics & Economics, Travel & Nature). Features horizontal scrollable category button bar on HomePage and CategoryPage, new `/category/:category` route with URL-safe slugs (e.g., `/category/music`, `/category/technology-and-innovation`), and efficient OR query across all category hashtags in a single Nostr filter. Components: `CategoryButtonBar`, `CategoryPage`, `useCategoryVideos` hook. Data structure in `src/lib/tag-categories.ts`. i18n support for all four languages (EN/DE/FR/ES)

- **Shared Language Select Component**: Created unified `LanguageSelect` component (`src/components/ui/language-select.tsx`) with comprehensive language list (39 languages) including flag emojis, native language names, and ISO 639-1 codes in parentheses. Replaces duplicate language dropdowns in upload form and label video dialog. Language names are NOT translated - they appear in their native form (e.g., "Deutsch" not "German")

- **NSFW Author Filtering**: Automatic content warning for videos from specific authors. Created `src/lib/nsfw-authors.ts` with hardcoded NSFW author pubkeys (3 authors) and `isNSFWAuthor()` helper function. Videos from these authors are automatically marked with `contentWarning: 'NSFW'` in `processEvent()`. Existing content-warning tags are preserved. Includes comprehensive test suite with 9 unit tests for NSFW detection and 6 integration tests in video-event processing. Default NSFW filter setting changed from 'warning' to 'hide' for better content moderation out of the box

- **Share Dialog Embed Option**: Added tabbed interface to share dialog with "Link" and "Embed" tabs. Users can now choose between sharing a direct link or copying iframe embed code. Embed code automatically includes video ID and optional timestamp. Features copy-to-clipboard functionality and help text. Supports all four languages (EN/DE/FR/ES)

### Changed

- **Upload Draft Encryption**: Upload drafts synced to Nostr (kind 30078) are now encrypted with NIP-44 for privacy. Draft content is encrypted to the user's own public key using the signer's `nip44.encrypt()` method. Backward compatible: can read both encrypted (new) and unencrypted (legacy) drafts. Silent fallback when decryption fails. Requires signer with NIP-44 support (all Applesauce signers). Draft data remains private even when synced across devices via public Nostr relays (useUploadDrafts.ts:103-103,227-234)

- **Upload Page Advanced Button**: Changed "Advanced" button in VideoUpload component to open Blossom onboarding dialog instead of navigating to settings page. Users can now configure upload and mirror servers directly from the upload page via a modal dialog. The dialog displays the full `BlossomOnboardingStep` component with server selection and validation, pre-populated with existing configured servers for easy modification. Improves UX by keeping users on the upload page while configuring Blossom servers (VideoUpload.tsx, BlossomOnboardingStep.tsx)

- **Onboarding Separation**: Moved Blossom server configuration from login modal to upload page as full-screen prerequisite step. Login modal now only shows Follow Import. Upload page checks `nostube_upload_onboarding_complete` localStorage key and displays server configuration before first upload. Components: `BlossomOnboardingStep` (full-screen card with upload/mirror sections), `BlossomServerPicker` (unified dialog with single-select and custom URL support). ServerCard updated with `selectable` and `onRemove` props. Validation requires ≥1 upload server, mirrors optional. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-10-upload-page-blossom-onboarding.md`

- **Embed Player Loading Indicator**: Replaced spinning hourglass emoji with pulsating Nostube logo during video loading. Uses the same purple gradient logo as the branding link and reuses the existing CSS pulse animation for consistency

- **Embed Player Title Link**: Video title is now a clickable link to the Nostube video page, matching the logo behavior. Shows underline on hover for visual feedback

- **Embed Player Author Link**: Author avatar and name are now clickable links to the author's Nostube profile using nprofile encoding with relay hints. Hover effects include slight avatar scale and name underline. Reduced bottom positioning for better alignment when native video controls are hidden

- **Embed Player Timestamp Links**: Video title and branding logo links in the embed player now include the current video timestamp in the URL (`?t=<seconds>`). When users click these links, the main Nostube page opens at the same playback position. Timestamp is rounded to the nearest second and only added when greater than zero. Includes 10 unit tests (5 in `title-overlay.test.js`, 5 in `branding.test.js`)

- **Embed Player Load Performance**: Significantly improved initial load time with multiple optimizations:
  - Subscribe to relays as each connects (no longer waits for all connections)
  - Early return for addressable events: returns immediately after first EOSE with data
  - Reduced connection timeout from 10s to 5s for faster failure detection
  - Reduced overall timeout from 10s to 6s
  - Reduced default relays from 3 to 2 (prioritizing relay.divine.video)
  - 200ms grace period after first event to collect newer versions from fast relays

- **Video Grid Loading Skeletons**: Enhanced pagination loading UX by adding 2 rows of skeleton placeholders at the bottom of video grids while loading more videos. Responsive skeleton count adjusts based on grid layout (auto/horizontal/vertical mode) and screen width. Prevents empty appearance during pagination and provides visual feedback to users that more content is loading

- **Label Video Button UX**: Moved label video button from standalone position to burger menu (three-dot menu) in VideoInfoSection. Updated LabelVideoDialog component to support controlled open state via optional `open` and `onOpenChange` props while maintaining backward compatibility with uncontrolled mode. Menu item only appears for beta users when logged in

- **Shorts Page Clickable Hashtags**: Hashtags displayed on short videos are now clickable links that navigate to the hashtag page (`/tag/:tag`). Added hover underline effect for visual feedback

- **Video Page Authentication Requirements**: Report and Mirror functionality now restricted to logged-in users only. Both menu items in VideoInfoSection require `userPubkey` to be present, following the same authentication pattern as reactions and playlist features (VideoInfoSection.tsx:217,227)

- **Blossom Onboarding Redesign**: Redesigned upload page Blossom server configuration with cleaner, more beginner-friendly UI. Two-column layout (upload/mirror servers side-by-side on desktop), centered primary-style plus buttons for adding additional servers (only visible after first server is added), clickable empty states with dashed borders, hover-based X buttons on server cards, mirror server picker now only shows servers that support mirroring, server picker modal shows all details immediately (removed hover reveal for clarity), non-fullscreen modal with single-click selection, collapsible custom URL input. Components: `BlossomOnboardingStep`, `BlossomServerPicker`, `ServerCard`. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-14-blossom-onboarding-redesign.md`

### Fixed

- **Publish Button Disabled with Generated Thumbnails**: Fixed publish button remaining disabled when using generated thumbnails after restoring a draft. The button was checking the wrong state variable (`thumbnail` instead of `thumbnailBlob`) for generated thumbnails. Now correctly checks `thumbnailSource` to determine which state variable to validate, enabling publication when either custom uploaded or auto-generated thumbnails are present (VideoUpload.tsx:356-361)
- **Upload Draft Infinite Update Loop**: Fixed infinite re-render loop in upload draft persistence. The `onDraftChange` callback in VideoUpload was recreating on every draft update, causing the useEffect in useVideoUpload to trigger infinitely. Solution: Used a ref to store the callback in useVideoUpload and removed it from the useEffect dependency array, breaking the circular dependency while maintaining functionality (useVideoUpload.ts:68-74,682-715, VideoUpload.tsx:37-42)
- **Upload Draft Title Not Persisting on Navigation**: Fixed draft title and form field changes not appearing in draft picker after navigation. Refactored `useUploadDrafts` to use localStorage as the source of truth instead of React state. All draft reads now fetch fresh data from localStorage, ensuring UI always reflects the latest saved data. Draft mutations (create/update/delete/merge) operate on localStorage directly and trigger re-renders via version counter. Maintains immediate localStorage persistence with debounced Nostr sync (kind 30078) for optimal performance (useUploadDrafts.ts:55-246)
- **BlossomOnboardingStep React Context Error**: Fixed `DialogTitle must be used within Dialog` error on upload page. Component was refactored to be a standalone card but was still using Dialog components (`DialogHeader`, `DialogTitle`, `DialogDescription`). Replaced with Card equivalents (`CardHeader`, `CardTitle`, `CardDescription`) that don't require Dialog context (BlossomOnboardingStep.tsx:3,48-51)
- **Onboarding Dialog Not Closing**: Fixed issue where clicking the "Continue" button in Blossom server configuration step (Step 2) would not close the dialog. Added state management to trigger re-render when onboarding is completed, allowing the dialog to properly detect the localStorage flag and close automatically (OnboardingDialog.tsx:75,79,103-105)
- **Onboarding Dialog Not Showing for Existing Users**: Fixed logic bug where users with existing follow sets or default Blossom servers would never see the onboarding dialog. Dialog now prioritizes localStorage completion keys over presence of servers, ensuring Step 2 (Blossom configuration) displays until explicitly completed. Simplified logic removes `hasBlossomServers` check and uses only completion flags and follow set status (OnboardingDialog.tsx:78-102)
- **Vercel Deployment Build Failure**: Fixed `Cannot find module '@rollup/rollup-linux-x64-gnu'` error on Vercel by removing platform-specific `optionalDependencies` that locked macOS ARM64 bindings. Rollup now auto-installs correct platform bindings during npm install
- **Build Errors**: Fixed ESLint build errors by renaming unused `eoseCount` variable to `_eoseCount` in `useNotifications.ts:114` and fixing `prefer-const` error for `lang` variable in `video-event.ts:357`
- **Video Availability Alert for Non-Blossom Videos**: Fixed "Limited Availability" alert appearing for videos hosted on non-Blossom servers. Alert now only shows when the video has at least one Blossom URL (blossomServerCount > 0) and fewer than 2 servers, preventing false warnings for videos hosted on traditional CDNs (VideoAvailabilityAlert.tsx:23)
- **Shorts Video Page Performance Optimizations**: Major performance improvements for ShortsVideoPage based on Chrome DevTools trace analysis (3,277 IntersectionObserver calls, UpdateLayoutTree events up to 4.67ms):
  - **IntersectionObserver throttling**: Added ~60fps (16ms) throttle to intersection callbacks to reduce computation frequency from ~109/s to ~30/s (~70% reduction)
  - **Reduced IntersectionObserver thresholds**: Changed from `[0.4, 0.6, 0.8, 1]` to `[0.5, 0.8]` for 50% fewer callback triggers
  - **CSS containment**: Added `contain: layout style paint` and `contentVisibility: auto` to video containers to isolate layout calculations and reduce UpdateLayoutTree propagation
  - **Optimized relay computations**: Extracted preset relay URLs to module level to avoid recreation on every render, reducing unnecessary array allocations
  - **Reduced render window on mobile**: Changed from ±3 videos (7 total) to ±2 videos (5 total) on devices < 768px width, reducing DOM size by ~28%
  - Expected overall impact: 50-70% reduction in IntersectionObserver calls, 20-30% reduction in UpdateLayoutTree events, lower memory usage, smoother scrolling
  - Performance analysis documented in `PERFORMANCE_OPTIMIZATIONS.md` with detailed trace analysis and implementation rationale

- **Video Suggestions NSFW Filtering**: VideoSuggestions component now filters out all videos with content warnings (NSFW, violence, etc.). Created reusable `filterVideoSuggestions()` helper function in `src/lib/filter-video-suggestions.ts` that handles filtering by content warning, blocked authors, current video, and duplicates. Includes comprehensive test suite with 7 unit tests

- **Grid Rendering Performance Optimizations**: Significantly improved video grid rendering performance with multiple optimizations:
  - Removed production `console.log` statements (gated behind `import.meta.env.DEV`) in VideoCard and VideoGrid components to eliminate unnecessary function calls
  - Added localStorage caching to PlayProgressBar component to avoid repeated reads for the same video (Map-based cache reduces I/O overhead)
  - Memoized expensive computations in VideoGrid: `gridColsClass` function, `chunk` callback, and video type filtering to prevent recalculation on every render
  - Added CSS containment (`contain: layout style paint`) to VideoCard wrapper to reduce layout recalculation scope and improve paint performance
  - Optimized IntersectionObserver by reducing `rootMargin` from 800px to 400px in `useInfiniteScroll` hook, minimizing observer computation frequency
  - These changes should significantly reduce the ~2,262 IntersectionObserver computations and ~1,196 UpdateLayoutTree events observed in performance traces
- **Label Video Button Beta Access**: Label video button now restricted to beta users only. Centralized beta user configuration in `src/lib/beta-users.ts` with `isBetaUser()` helper function used across Sidebar and VideoInfoSection components
- **Embed Test Suite**: Redesigned to load only one iframe at a time to prevent relay rate limiting. Features interactive dropdown selector with 23 test cases organized by category, Previous/Next navigation buttons, keyboard navigation (arrow keys), and detailed descriptions for each test scenario
- **Embed Player Branding**: Moved branding logo to top-right corner with auto-hide behavior. Displays Nostube SVG logo instead of text. Fades out after 3 seconds, reappears on hover/pause, matching title overlay behavior
- **NIP-19 nevent Encoding**: All nevent identifiers now include author pubkey for better relay hints and event discoverability

- **Embed Player Play/Pause Overlay**: Animated play/pause indicator appears when video playback state changes. Shows play icon (triangle) or pause icon (two bars) with smooth fade-in/fade-out animation. Icon appears centered with semi-transparent background, visible for 400ms before fading out. Matches main VideoPlayer component behavior. Includes 19 unit tests

- **Embed Player Event Caching**: Video events now cached in localStorage with 1-hour TTL to reduce relay load and improve performance for frequently accessed videos. Supports both nevent (by event ID) and naddr (by kind:pubkey:identifier key) identifiers. Includes cache statistics, manual clearing, and automatic expiration. Comprehensive test suite with 23 tests

- **Embed Player Profile Fetching**: Embed player now fetches and displays author profile information (avatar and display name) from Nostr kind 0 events. Features: localStorage caching with 24-hour TTL, 5-second timeout, parallel fetch for naddr (when pubkey is known), sequential fetch for nevent, live overlay updates when profile data arrives, silent fallback to default avatar and formatted pubkey on errors. Includes comprehensive test suite with 19 tests

- **Embed Player Documentation**: Comprehensive README (`public/embed-README.md`, 959 lines) covering parameters, examples, troubleshooting, browser compatibility, security, accessibility, and integration guides for WordPress/React/Vue.js

- **Embeddable Video Player - Example Page (Phase 5)**: Interactive demo page (`public/embed-examples.html`, 1,427 lines) with 14 configurations, live embed builder, parameter reference, and best practices. Self-contained with no external dependencies

- **Embeddable Video Player - Comprehensive Test Suite**: Consolidated test page (`public/embed-test-suite.html`) combining all embed testing scenarios with organized navigation, parameter reference table, standard aspect ratios (16:9, 4:3, 1:1, 9:16, 21:9), fixed sizes (240×135 to 640×360), branding tests, configuration tests, and advanced features. Professional dark theme UI with smooth anchor navigation

- **Embeddable Video Player - Title Overlay (Phase 4)**: Auto-hiding overlay showing video title and author. Visible for 3 seconds, reappears on hover/pause. Mobile responsive, can be disabled via `title=0` parameter. Includes 30 unit tests

- **Embeddable Video Player - Content Warning Overlay (Phase 4)**: Full-screen blurred overlay for videos with `content-warning` tag. Click-to-reveal with keyboard support. Cannot be bypassed via URL parameters. Includes 34 unit tests

- **Blossom Server Filtering**: Automatic filtering of cdn.nostrcheck.me (re-encodes videos, serves low quality). Blocked across hooks, components, and settings UI with i18n support

- **Video Notes Page**: New `/video-notes` route to view and repost videos from Kind 1 notes. Extracts video URLs from content/imeta tags, shows preview modal, tracks reposted videos, and enables one-click repost workflow to `/upload?url=...`

- **Video Upload URL Prefilling**: Upload page accepts `url` and `description` query parameters for seamless workflow from Video Notes page

- **Multi-Video Upload Support**: Upload multiple quality variants (4K/1080p/720p/480p/360p) with `VideoVariantsTable` component. Shows codec warnings (AV1/VP9/H.265/H.264), upload/mirror progress, and preview modal. Generates multiple `imeta` tags. Backward compatible with single-video uploads

### Fixed

- **Pagination Skeleton Loading**: Fixed pagination skeletons not appearing when loading more videos. VideoTimelinePage now passes the actual `loading` state to VideoGrid instead of only `isLoadingInitial`, enabling skeletons to display immediately during both initial load and pagination. Affects HomePage, ShortsPage, CategoryPage, and other pages using VideoTimelinePage (src/components/VideoTimelinePage.tsx:56)
- **Video Availability Alert Showing When Logged Out**: Fixed VideoAvailabilityAlert appearing for non-logged-in users. Changed check from `!currentUser` to `!currentUser.user` since `useCurrentUser()` always returns an object with a `user` property that is `undefined` when logged out
- **Shorts Video Position Reset on Swipe**: Fixed jarring video position reset when scrolling away from partially-watched videos. Videos now only reset to position 0 if they've ended or are at the start. When scrolling away, videos pause at their current position instead of resetting, providing smoother scrolling UX
- **iOS Shorts Autoplay After Multiple Videos**: Fixed autoplay failure after ~5 videos on iOS Safari by triggering play() within user gesture context. Added touchend and scrollend event listeners that call play() directly during swipe gestures, ensuring iOS recognizes each play as user-initiated. Videos start muted (iOS requirement), then unmute after playback begins. This prevents iOS from exhausting its autoplay budget and ensures reliable autoplay across all videos in the feed
- **Shorts Autoplay on Slow Loading**: Fixed issue where slow-loading short videos wouldn't autoplay when swiped to. Added `onLoadedData` event handler as additional safeguard to ensure videos start playing once they've loaded enough data, even if they load after becoming active
- **Mobile Sidebar Safe Area**: Fixed sidebar menu overlapping with phone status bar in fullscreen mode. Added safe-area-inset-top padding to prevent content from reaching into the status bar area on mobile devices
- **Embed Build Script**: Fixed `outfile` configuration pointing to directory instead of file. Now correctly outputs to `public/embed.js`
- **Thumbnail Variants Not Showing in Debug Dialog**: Fixed `image` fields in imeta tags not converted to `VideoVariant` objects. Now extracts all image URLs and creates thumbnail variants
- **Debug Dialog Infinite Checks**: Stored `checkAllAvailability` in ref to prevent infinite useEffect loop. Checks now run only once on dialog open

### Added

- **Multiple Video Quality Variants Support**: Enhanced `VideoEvent` model with `videoVariants` and `thumbnailVariants` arrays. Automatic quality-based fallback (tries highest first). Debug page with tabbed interface for each variant. `useMultiVideoServerAvailability` hook for parallel checking. Backward compatible

- **Internationalization (i18n)**: Full support for EN/DE/FR/ES with `react-i18next`. 500+ translation strings covering all UI. Language switcher in Settings. Date localization with `date-fns` and centralized `getDateLocale()` utility

### Fixed

- **HomePage Video Loading on Login**: Reset effect now calls `next()` when loader changes to fix videos not loading after relay list updates
- **AuthorPage Video Loading**: Fixed reset effect triggering on initial mount. Changed check to `loaderRef.current === undefined` to handle loader defined on first render

### Changed

- **Play/Pause Overlay UX**: Reduced icon size from 80px to 56px and fade-out delay from 700ms to 400ms
- **Mirror Dialog Auto-Recheck**: Added `onMirrorComplete` callback to automatically recheck server availability after mirroring
- **Debug Logging Throttling**: `useUserBlossomServers` now throttles logs to once per 10 seconds or on value changes
- **Reaction Buttons UX**: Buttons show semi-transparent fill when active and disable after reacting to prevent duplicates

### Added

- **NIP-50 Full-Text Search**: `SearchPage` with dedicated `useSearchVideos` hook querying `wss://relay.nostr.band`. Searches all video kinds with real-time results from relay. `GlobalSearchBar` in header. Includes 5 unit tests
- **Media Caching Servers**: Separated caching/proxy from Blossom servers. New `CachingServer` interface and settings section. Default: `https://almond.slidestr.net`
- **Docker Deployment**: Multi-stage Dockerfile (~50MB). Runtime env vars for relays/servers/config. nginx with SPA routing, gzip, security headers. Includes docker-compose.yml, DOCKER.md, and `/health` endpoint
- **Watch History**: `useVideoHistory` hook tracks plays in localStorage (100 most recent). New `/history` page with clear history button
- **Mirror Video Dialog**: Mirror videos to additional Blossom servers. Shows hosting servers, uses authenticated Nostr events, checks file existence, provides detailed feedback

### Changed

- **VideoPage Player Centering**: Centered video player horizontally with flexbox in normal mode. Cinema mode unchanged
- **Shorts Comments Sheet Width**: Max-width 2xl (672px) on desktop, centered for readability
- **Comments Pagination**: Show 15 top-level comments at a time with "Load more" button. Replies hidden by default with expandable toggle
- **VideoPage Loading**: Removed video player skeleton. Previous video remains visible when switching for smoother experience
- **Video Poster Loading States**: Added skeleton placeholder while poster images load. Uses `queueMicrotask` to defer state updates
- **Thumbnail Loading States**: VideoCard shows skeleton/placeholder background during image loading
- **Blossom Server Tags**: Removed 'proxy' tag. Servers now only support 'mirror' and 'initial upload' tags
- **Sidebar Menu Cleanup**: Removed disabled "Your clips" menu item
- **Play/Pause Overlay Component**: Extracted into reusable `PlayPauseOverlay` component
- **Blossom Mirror Headers**: Custom `customMirrorBlob()` excludes X-SHA-256 header for better server compatibility
- **Button Standardization**: Replaced HTML buttons with shadcn/ui Button components
- **Upload Button Authentication**: Only displays when user is logged in
- **Major Package Updates**: React 19.2.0, Applesauce 4.4.2, nostr-idb 4.0.1, react-intersection-observer 10.0.0, vitest 4.0.10. All tests passing, no security vulnerabilities
- **Thumbnail Error Handling**: Shows "Thumbnail unavailable" with ImageOff icon instead of infinite skeleton loading. Tries video URL fallback first

### Fixed

- **Comment Text Wrapping**: Changed `wrap-break-word` to `break-words` in VideoComments. Added `break-all` to URL links in RichTextContent
- **Timeline Pages Loading**: Added `useEffect` to call `next()` in `useInfiniteTimeline`. Initialize `loading = true` in `useTimelineLoader` to show skeletons immediately
- **Blossom Server URL Double Slashes**: Updated `normalizeServerUrl()` to preserve ports and remove trailing slashes. Normalized at entry point of all Blossom functions
- **Infinite Re-render in useUserBlossomServers**: Added `useMemo` to memoize `serverUrls` array and result object
- **Video Loading with naddr URLs**: Updated pages to use `decodeVideoEventIdentifier()` which handles both nevent and naddr. Added `eventLoader` and `addressLoader`
- **Addressable Event URL Encoding**: Addressable events (34235, 34236) now use `naddr` encoding. Added `generateEventLink` helper and tests

### Added

- **NIP-71 Addressable Video Event Support**: Extracts `d` tag from kinds 34235/34236. Supports `origin` tag for imported content. Includes 39 test cases
- **Automatic NIP-63 Blossom Server Loading**: User's published servers (kind 10063) auto-sync to config on login. URL-based deduplication preserves existing configs
- **Test Infrastructure**: Vitest with jsdom, browser API mocks. Test suites for CollapsibleText (16 tests), VideoGrid (22 tests), NoteContent (5 tests). Runs in GitHub Actions
- **Phase 3 Refactoring**: Created `lib/blossom-utils.ts` with 7 utility functions (~180 lines extracted from MirrorVideoDialog)
- **Phase 2 Refactoring**: `useTimelineLoader` hook (~100 lines saved), `useFormDialog` for form state management
- **Phase 1 Refactoring**: `VideoTimelinePage` component, `useStableRelays`, `useAsyncAction` hooks
- **Hashtag Search**: New `/tag/:tag` route with infinite scroll. Clickable hashtags in VideoPage and AuthorPage

### Changed

- **ESLint Build Integration**: ESLint now runs during build and fails on errors. Pipeline: TypeScript → ESLint → Vite
- **TypeScript Configuration Alignment**: Both `build` and `typecheck` use `tsconfig.app.json`. `noUnusedLocals` and `noUnusedParameters` enforced consistently
- **Tag Normalization**: All hashtags normalized to lowercase. Tag input auto-converts and removes `#` prefix
- **Tag Display**: Hashtags display with `#` prefix in VideoInfoSection and AuthorPage
- **VideoCardSkeleton Alignment**: Improved skeleton alignment with `shrink-0`, explicit margins, and natural text widths
- **Default Configuration**: New users get `wss://relay.divine.video` relay and `https://almond.slidestr.net` Blossom server

### Fixed

- **Timeline Observable Subscription**: Separated EventStore subscription from processing logic. Use `useObservableState` for stable subscription, only recreate when filters change
- **Infinite Loop in HomePage/ShortsPage**: Wrapped `videoTypeLoader()` in `useMemo` with `relays` dependency to prevent loader recreation
