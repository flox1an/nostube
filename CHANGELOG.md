# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Embed Test Suite**: Redesigned to load only one iframe at a time to prevent relay rate limiting. Features interactive dropdown selector with 23 test cases organized by category, Previous/Next navigation buttons, keyboard navigation (arrow keys), and detailed descriptions for each test scenario
- **Embed Player Branding**: Moved branding logo to top-right corner with auto-hide behavior. Displays Nostube SVG logo instead of text. Fades out after 3 seconds, reappears on hover/pause, matching title overlay behavior
- **NIP-19 nevent Encoding**: All nevent identifiers now include author pubkey for better relay hints and event discoverability

### Added

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
