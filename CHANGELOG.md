# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Blossom Mirror Request Headers**: Modified mirror requests to exclude X-SHA-256 header
  - Implemented custom `customMirrorBlob()` function to replace `BlossomClient.mirrorBlob()`
  - Mirror requests to `/mirror` endpoint now only send `Content-Type` and `Authorization` headers
  - X-SHA-256 header is still sent for upload requests (PUT/PATCH to `/upload`) as required
  - Improves compatibility with Blossom servers that don't require SHA-256 hash for mirror operations

- **Button Component Standardization**: Replaced all standard HTML button elements with shadcn/ui Button components
  - Converted AccountSwitcher to use `<Button variant="outline">` instead of custom-styled `<button>` element
  - Simplified LoginArea Button to use `variant="outline"` prop instead of custom className
  - Added `cursor-pointer` class to all Button components for consistent hover behavior
  - Improved consistency and maintainability across the codebase
  - All interactive elements now use the standardized Button component with proper variants

- **Upload Button Authentication**: Upload button in header now only displays when user is logged in
  - Added conditional rendering based on authentication state using `useCurrentUser` hook
  - Anonymous users no longer see the upload button, reducing confusion
  - Improves UX by showing upload option only when it's actually available

### Fixed

- **Blossom Server URL Double Slashes**: Fixed 404 errors caused by double slashes in Blossom server URLs
  - Updated `normalizeServerUrl()` function to preserve port numbers and remove trailing slashes
  - Added URL normalization at the entry point of all Blossom functions:
    - Upload functions: `customMirrorBlob`, `checkFileExists`, `getUploadCapabilities`, `uploadChunk`, `uploadFileChunked`, `uploadFileToSingleServer`
    - Media URL generation: `generateMirrorUrls`, `generateProxyUrls` (media-url-generator.ts)
    - HEAD request builder: `buildBlossomHeadUrls` (blossom-utils.ts)
    - BlobDescriptor creation: `createMockBlobDescriptor` (blossom-upload.ts)
  - Fixes GET/HEAD/POST/PUT/PATCH requests with double slashes (e.g., `https://server.com//hash` or `https://server.com//upload`)
  - Fixes blob URLs in upload dialog links (target="_blank") showing double slashes
  - Ensures all server URLs follow format: `protocol://host:port` (no trailing slash, no path)
  - Affects all Blossom operations: uploads, mirrors, blob fetching, size checks, and UI display

- **Infinite Re-render in useUserBlossomServers**: Fixed infinite loop causing performance issues during video playback
  - Root cause: Hook was creating new arrays and objects on every render without memoization
  - Solution: Added `useMemo` to memoize `serverUrls` array and result object
  - Hook now only re-computes when `blossomServers` or `user` actually change
  - Eliminates console spam and performance degradation during video playback

- **Video Loading with naddr URLs**: Fixed VideoPage and ShortsVideoPage to properly load addressable video events (kinds 34235, 34236) via naddr URLs
  - Root cause: Both pages were using `decodeEventPointer()` which only handles nevent/note, returning null for naddr
  - Solution: Updated both pages to use `decodeVideoEventIdentifier()` which handles both nevent and naddr types
  - Added both `eventLoader` and `addressLoader` to handle regular and addressable events respectively
  - For naddr events, uses `eventStore.replaceable(kind, pubkey, identifier)` instead of `eventStore.event(id)`
  - Added regression tests in `lib/nip19.test.ts` verifying decoder functions work correctly
  - Videos with naddr URLs now load correctly instead of showing "Video Not Found" error
  - Also fixed relay extraction in ShortVideoItem component to handle naddr links

- **Addressable Event URL Encoding**: Fixed addressable video events (kinds 34235, 34236) to use `naddr` encoding instead of `nevent`
  - Regular video events (kinds 21, 22) continue to use `nevent` encoding
  - Addressable events now generate NIP-19 `naddr` links with kind+pubkey+identifier for proper addressable reference
  - Added `generateEventLink` helper function in `video-event.ts` to determine correct encoding based on event kind
  - Added test coverage with 3 new tests verifying naddr generation for addressable events
  - Added `decodeVideoEventIdentifier` helper in `lib/nip19.ts` to decode both nevent and naddr identifiers

### Added

- **NIP-71 Addressable Video Event Support**: Full support for addressable video events (kinds 34235, 34236)
  - Extracts `d` tag (identifier) from both imeta format and old format addressable events
  - Supports new `origin` tag for tracking imported content from legacy platforms
    - Format: `["origin", "<platform>", "<external-id>", "<original-url>", "<optional-metadata>"]`
    - Preserves original platform identifiers and URLs when migrating content
  - Added `VideoOrigin` type with platform, externalId, originalUrl, and metadata fields
  - Comprehensive test coverage with 39 test cases including addressable event scenarios
  - Enables updateable video metadata while maintaining addressable references

- **Automatic NIP-63 Blossom Server Loading**: User's published blossom servers (kind 10063) now automatically sync to app configuration
  - Fetches and merges user's NIP-63 blossom servers when logged in
  - Only adds new servers not already in config (URL-based deduplication)
  - Preserves existing server configurations including manual tags
  - New servers from NIP-63 are added without tags
  - Syncs on every login, keeping config up-to-date with user's published preferences

- **Test Infrastructure Setup**:
  - Configured Vitest with jsdom environment for DOM testing
  - Added comprehensive test setup with browser API mocks (localStorage, IntersectionObserver, ResizeObserver, matchMedia)
  - Mocked `nostr-idb` module to prevent IndexedDB initialization errors in tests (IDB is only used as a cache)
  - Created complete unit test suite for CollapsibleText component
    - 16 test cases covering basic rendering, collapsible behavior, line clamping, edge cases, and accessibility
    - Mocked RichTextContent and nostr core dependencies for isolated testing
    - Tests validate className application, prop passing, click handlers, and text updates
  - Created comprehensive unit test suite for VideoGrid component
    - 22 test cases covering empty states, loading states, video rendering, layout modes, NSFW filtering, and edge cases
    - Tests validate auto/horizontal/vertical layout modes, skeleton rendering, video type separation
    - Tests handle 100+ videos, empty arrays, missing fields, and NSFW content filtering
    - Mocked VideoCard, useWindowWidth, and useAppContext for isolated testing
  - Created unit test suite for NoteContent component
    - 5 test cases covering URL linkification, nostr references, hashtags, and user mentions
    - Tests validate deterministic name generation and correct styling for profile mentions
  - Tests run automatically in GitHub Actions on push to main and pull requests

- **Phase 3 Refactoring - Extract Utility Functions**:
  - Created `lib/blossom-utils.ts` with Blossom-specific utilities
    - `formatFileSize`: Format bytes to human-readable size (MB/GB)
    - `normalizeServerUrl`: Normalize server URLs consistently
    - `parseNumericSize`: Parse values to numeric sizes
    - `getSizeFromVideoEvent`: Extract video size from Nostr events
    - `parseDescriptorSize`: Parse Blossom-Descriptor headers
    - `buildBlossomHeadUrls`: Build HEAD request URLs
    - `fetchVideoSizeFromBlossom`: Fetch video size from servers
    - Extracted ~180 lines from MirrorVideoDialog to reusable utilities
- **Phase 2 Refactoring - Timeline & Form Hooks**:
  - `useTimelineLoader`: Encapsulates timeline loading pattern with EventStore and relay queries
    - Eliminates ~100 lines of duplicate code from HashtagPage and SubscriptionsPage
    - Provides reactive updates via EventStore subscription
    - Built-in pagination support with `loadMore` function
    - Automatic reload on dependency changes
  - `useFormDialog`: Manages form state in dialogs with validation and error handling
    - Applied to CreatePlaylistDialog, reducing form boilerplate
    - Provides `updateField`, `handleSubmit`, `resetForm` utilities
    - Automatic toast notifications on success/error
    - Built-in validation support
- **Phase 1 Refactoring - Reusable Components**:
  - `VideoTimelinePage`: Combines VideoGrid + InfiniteScrollTrigger with consistent layout
  - `useStableRelays`: Prevents unnecessary re-renders from relay array reference changes
  - `useAsyncAction`: Handles async operations with loading state and toast notifications

- **Hashtag Search Feature**: New hashtag search page accessible at `/tag/:tag`
  - Global search across all videos with a specific hashtag
  - Supports all video kinds (regular videos and shorts)
  - Uses infinite scroll for pagination
  - Displays results in responsive grid layout
- **Clickable Hashtags**: Hashtags are now clickable throughout the app
  - Video page: Tags below video description now link to hashtag search
  - Author page: Tags in the "Tags" tab now link to hashtag search
  - All hashtag links navigate to `/tag/:tag` route

### Changed

- **ESLint Build Integration**: ESLint now runs during `npm run build` and will fail the build if errors are detected
  - Ensures code quality standards are enforced before production builds
  - Matches the same validation used in `npm run test`
  - Build pipeline order: TypeScript type checking → ESLint validation → Vite build
- **TypeScript Configuration Alignment**: Build and test now use consistent TypeScript settings
  - Both `build` and `typecheck` scripts now use `tsconfig.app.json` for type checking
  - Ensures unused variables and parameters are caught before production builds
  - Previously, tests caught errors that builds didn't due to different TypeScript configurations
  - `noUnusedLocals` and `noUnusedParameters` now enforced consistently across all checks
- **Tag Normalization**: All hashtags are now normalized to lowercase
  - Tag URLs always use lowercase format (e.g., `/tag/bitcoin` not `/tag/Bitcoin`)
  - Tag input in upload form automatically converts to lowercase and removes `#` prefix
  - Ensures consistent hashtag matching across the platform (Nostr spec uses lowercase tags)
- **Tag Display**: Hashtags now display with `#` prefix for better visual recognition
  - VideoInfoSection: Badges show `#tag` format with hover effect
  - AuthorPage: Tags tab shows `#tag` format with hover effect
- **VideoCardSkeleton Alignment**: Improved skeleton loader alignment to better match actual video cards
  - Added `shrink-0` wrapper around avatar skeleton to prevent shrinking
  - Changed spacing from uniform `space-y-2` to explicit `mt-1` margins matching real card layout
  - Adjusted skeleton heights: title (h-5), author (h-4), date (h-3) to better match text sizes
  - Fixed visual width flash: changed title width from `w-3/4` to `w-full` to eliminate perception of narrower grid
  - Updated skeleton text widths to more natural proportions: author (w-2/3), date (w-1/3)
- **Default Relay & Blossom Server Configuration**: New users now start with optimized defaults
  - Added `wss://relay.divine.video` as the primary relay for new users (positioned first in preset list)
  - Added `https://almond.slidestr.net` as default Blossom server with 'proxy' and 'initial upload' tags enabled
  - Applies to first-time visitors, anonymous users, and users logging in for the first time
  - Existing users retain their saved configurations unchanged

### Fixed

- **Timeline Observable Subscription Issue**: Fixed videos not displaying in pages using `useTimelineLoader`
  - Root cause: Observable was being recreated when dependencies like `relays`, `blockedPubkeys`, or `config.blossomServers` changed
  - `eventStore.timeline()` doesn't emit existing events to new subscribers, only emits on new event additions
  - Solution: Separated EventStore subscription from processing logic
    - Use `useObservableState` with default value for stable timeline subscription
    - Only recreate observable when filters change (not when processing dependencies change)
    - Apply `processEvents` transformation in separate `useMemo` that depends on processing parameters
  - Ensures videos remain visible when blocked users list or other config changes

- **Infinite Loop in HomePage and ShortsPage**: Fixed skeleton flashing endlessly
  - Root cause: Loader function was being recreated on every render
  - Each new loader triggered reset in `useInfiniteTimeline`, causing infinite loop
  - Solution: Wrap `videoTypeLoader()` call in `useMemo` with `relays` dependency
  - HomePage, ShortsPage, and AuthorPage now properly memoize their loaders

### Technical Details

- Created `HashtagPage.tsx` component using similar pattern as `SubscriptionsPage`
- Uses Nostr `#t` tag filter for hashtag queries
- Leverages existing `VideoGrid` and `InfiniteScrollTrigger` components
- Implements reactive timeline loading with EventStore and relay subscriptions
- Fixed `useTimelineLoader` by switching from `useObservableMemo` to `useObservableState` pattern
