# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Test Infrastructure Setup**:
  - Configured Vitest with jsdom environment for DOM testing
  - Added comprehensive test setup with browser API mocks (localStorage, indexedDB, IntersectionObserver, ResizeObserver, matchMedia)
  - Created complete unit test suite for CollapsibleText component
    - 16 test cases covering basic rendering, collapsible behavior, line clamping, edge cases, and accessibility
    - Mocked RichTextContent and nostr core dependencies for isolated testing
    - Tests validate className application, prop passing, click handlers, and text updates
  - Created comprehensive unit test suite for VideoGrid component
    - 22 test cases covering empty states, loading states, video rendering, layout modes, NSFW filtering, and edge cases
    - Tests validate auto/horizontal/vertical layout modes, skeleton rendering, video type separation
    - Tests handle 100+ videos, empty arrays, missing fields, and NSFW content filtering
    - Mocked VideoCard, useWindowWidth, and useAppContext for isolated testing
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

- **Tag Normalization**: All hashtags are now normalized to lowercase
  - Tag URLs always use lowercase format (e.g., `/tag/bitcoin` not `/tag/Bitcoin`)
  - Tag input in upload form automatically converts to lowercase and removes `#` prefix
  - Ensures consistent hashtag matching across the platform (Nostr spec uses lowercase tags)
- **Tag Display**: Hashtags now display with `#` prefix for better visual recognition
  - VideoInfoSection: Badges show `#tag` format with hover effect
  - AuthorPage: Tags tab shows `#tag` format with hover effect

### Technical Details

- Created `HashtagPage.tsx` component using similar pattern as `SubscriptionsPage`
- Uses Nostr `#t` tag filter for hashtag queries
- Leverages existing `VideoGrid` and `InfiniteScrollTrigger` components
- Implements reactive timeline loading with EventStore and relay subscriptions
