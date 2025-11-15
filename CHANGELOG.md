# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
