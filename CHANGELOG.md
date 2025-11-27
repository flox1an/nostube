# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Embeddable Video Player - Comprehensive Example Page (Phase 5)**: Created complete documentation and interactive demo page for the embed player
  - Created `public/embed-examples.html` with 14 example configurations and interactive builder
  - **Parameter Reference Section**: Complete table documenting all 11 embed parameters with types, defaults, and descriptions
  - **Basic Examples (6 examples)**: Default player, autoplay muted, no title overlay, no branding, start time, looping
  - **Advanced Examples (6 examples)**: Minimal player, custom color themes (red, blue, orange), background video mode, addressable event (naddr)
  - **Edge Cases (2 examples)**: Invalid video ID and missing video ID error states
  - **Interactive Embed Builder**: Live configuration form with real-time preview and generated embed code
    - All 11 parameters as form inputs (text, checkboxes, selects, number inputs)
    - Live preview iframe that updates as parameters change
    - Generated production-ready embed code with proper HTML formatting
    - Direct link to full embed URL for testing
    - Copy-to-clipboard functionality for generated code
  - **Best Practices Section**: Responsive design guide, lazy loading examples, accessibility recommendations
  - **22 Copy Buttons**: One-click copying for all code examples with success feedback
  - **Smooth Navigation**: Internal anchor links with smooth scrolling between sections
  - **Professional Design**: Modern, clean CSS with purple accent color matching Nostube branding
    - Responsive grid layouts (stacks on mobile)
    - Card-based example presentation with hover effects
    - Syntax-highlighted code blocks with dark background
    - Info boxes and warning boxes for tips and gotchas
    - 16:9 aspect ratio containers for all video embeds
  - **Self-Contained**: No external CSS frameworks or JavaScript libraries
  - **Production Ready**: File automatically included in build output at `dist/embed-examples.html`
  - Comprehensive documentation covering all embedding scenarios for developers
  - 1,427 lines of complete HTML, CSS, and JavaScript documentation

- **Embeddable Video Player - Title Overlay (Phase 4)**: Implemented video title and author information overlay for embedded videos
  - Created `TitleOverlay` module displaying video metadata at top and author info at bottom-left
  - Auto-hide behavior: initially visible for 3 seconds, then fades out during playback
  - Reappears on hover, stays visible when paused, hides when playing
  - Shows video title (truncated at 70 characters with ellipsis)
  - Displays author avatar and name (with fallback to formatted pubkey if name unavailable)
  - Default avatar SVG generated for profiles without custom avatars
  - Can be disabled via `title=0` URL parameter (enabled by default)
  - CSS transitions: 300ms fade in/out with smooth opacity changes
  - Mobile responsive: smaller text and avatar sizes on screens under 768px
  - Z-index management: overlay above video but below content warning (z-index: 10)
  - Pointer events disabled on overlay (clicks pass through to video)
  - Integrated into embed player initialization pipeline after ContentWarning
  - Added comprehensive unit tests (30 test cases) covering overlay creation, auto-hide behavior, event handling, and utility functions
  - All tests passing (186/186) including proper handling of jsdom video element limitations

- **Embeddable Video Player - Content Warning Overlay (Phase 4)**: Implemented sensitive content warning for embedded videos
  - Created `ContentWarning` module with automatic content warning detection from video events
  - Displays full-screen overlay with blurred poster background when `content-warning` tag is present
  - Shows warning icon, "Sensitive Content" heading, custom warning message, and "Click to reveal" button
  - Click-to-reveal interaction removes overlay and shows video controls
  - State persists after reveal (no re-blur on pause)
  - Keyboard accessible with Enter/Space key support
  - Mobile responsive design with appropriate touch targets
  - Safety feature: Content warnings cannot be bypassed via URL parameters
  - Added comprehensive unit tests (34 test cases) covering detection, overlay creation, and interaction behavior
  - Updated CSS with overlay styles including blurred background, dark semi-transparent layer, centered content
  - Integrated ContentWarning into embed player initialization pipeline
  - Videos without content warnings play normally with no overlay

- **Blossom Server Filtering**: Added automatic filtering of cdn.nostrcheck.me from all blossom server lists
  - cdn.nostrcheck.me re-encodes videos and serves low-quality content
  - Blocked server list defined in `BLOCKED_BLOSSOM_SERVERS` constant in `src/constants/relays.ts`
  - Filtering applied in multiple locations:
    - `useUserBlossomServers` hook filters user's NIP-63 servers at source
    - `BlossomServerSync` component filters when syncing user servers to config
    - `BlossomServersSection` settings UI prevents manual addition with toast notification
  - Added translation strings for blocked server messages in all 4 languages (en, de, es, fr)
  - Created `isBlossomServerBlocked()` helper function for consistent checking across the app

### Added

- **Video Notes Page**: New page for viewing and reposting videos from Kind 1 notes
  - Created `/video-notes` route to display all Kind 1 notes containing videos
  - `useVideoNotes` hook loads user's Kind 1 notes and extracts video URLs from content and imeta tags
  - Automatically detects video URLs (by extension or Blossom hash pattern)
  - Displays video thumbnails and preview player in modal dialog
  - Tracks which videos have already been reposted as proper video events (kinds 21, 22, 34235, 34236)
  - "Repost as video" button navigates to upload page with URL prefilled (`/upload?url=...`)
  - "Already reposted" badge and disabled button for videos that have been published
  - Shows video metadata: multiple video count, Blossom URL count, timestamps
  - Added "Video notes" link to sidebar navigation under Library section
  - Full internationalization support (EN, DE, FR, ES)

- **Video Upload URL Prefilling**: Upload page now accepts `url` and `description` query parameters
  - Users can navigate to `/upload?url=<video-url>&description=<text>` to auto-populate fields
  - Automatically switches to URL input method and processes the video
  - Description is prefilled with note content (video URLs automatically removed)
  - Enables seamless workflow from Video Notes page to video upload

- **Multi-Video Upload Support**: Upload dialog now supports uploading multiple quality variants of the same video
  - Created `VideoVariantsTable` component to display all uploaded video variants in a compact table format
  - Added "Add Another Quality/Resolution" button to upload the same video in different resolutions (e.g., 1080p, 720p, 480p)
  - Each video variant gets its own `imeta` tag in the published Nostr event
  - Extracted reusable video processing utilities to `lib/video-processing.ts` for handling video metadata extraction
  - Added quality label generation (4K, 1080p, 720p, 480p, 360p) based on video dimensions
  - **Codec Warnings**: Each video shows codec compatibility warnings as dedicated table rows below each video
    - Red alert for AV1/VP9 (not supported on iOS/Safari)
    - Yellow warning for H.265 hev1 (not on iOS)
    - Blue info for H.265 hvc1 (widely supported)
    - Green checkmark for H.264 (best compatibility)
    - Warnings displayed as full-width alert banners directly below each video row
  - **Compact Table Layout**: Optimized table design for clarity
    - Combined video and audio codec into single two-line cell (V: codec / A: codec)
    - Status column shows upload and mirror progress with tooltips
    - Green checkmark icon with count shows number of initial upload servers
    - Blue copy icon with count shows number of mirror servers
  - **Upload Progress**: Progress bar visible during chunked uploads (10MB chunks)
    - Shows percentage and current chunk progress during upload
    - Automatic mirroring to configured mirror servers after initial upload completes
  - **Video Preview**: Modal dialog for previewing uploaded videos
    - Click play button to open full-screen preview dialog
    - Video auto-plays in preview for immediate feedback
    - Clean modal interface with centered video player
  - Remove functionality to delete individual video variants (minimum one required)
  - Removed redundant "Uploaded to..." and "Mirrored to..." status display - all server information now shown in table status column
  - All videos share the same thumbnail (no additional thumbnail upload needed)
  - Added internationalization support for all new UI elements (EN, DE, FR, ES)
  - Comprehensive TypeScript interfaces: `VideoVariant` for individual videos, updated `UploadInfo` to array-based structure
  - Event creation now generates multiple `imeta` tags with proper dimensions, codecs, bitrate, size, and fallback URLs for each variant
  - Full backward compatibility maintained with single-video uploads

### Fixed

- **Thumbnail Variants Not Showing in Debug Dialog**: Fixed thumbnails not appearing in Debug dialog when images are defined in imeta tags
  - Root cause: `image` fields in imeta tags were collected but not converted into `VideoVariant` objects for `thumbnailVariants` array
  - Solution: Extract all `image` URLs from imeta tags and create thumbnail variants with first URL as primary and rest as fallbacks
  - Multiple `image` fields in the same imeta tag are now correctly treated as alternative URLs for the same thumbnail
  - Debug dialog now correctly shows thumbnail tabs with server availability and fallback URLs
  - Affects events with `image` fields in imeta tags (e.g., events with multiple thumbnail URLs on different servers)

- **Debug Dialog Infinite Checks**: Fixed server availability checks running continuously every second in Debug dialog
  - Root cause: `checkAllAvailability` function was recreated on every state update, triggering infinite useEffect loop
  - Solution: Store function in ref and only trigger check on dialog open transition (false → true)
  - Now checks run only once when dialog opens instead of continuously

### Added

- **Multiple Video Quality Variants Support**: Videos can now have multiple quality variants (e.g., 1080p, 720p, 480p)
  - Enhanced `VideoEvent` data model with `videoVariants` and `thumbnailVariants` arrays
  - Each variant includes URL, SHA256 hash, file size, dimensions, quality label, and fallback URLs
  - Created `VideoVariant` type with comprehensive metadata for each video quality
  - Automatic quality-based fallback: Player tries highest quality first, falls back to lower qualities if unavailable
  - Videos sorted by quality (highest first) for optimal playback experience
  - Supports multiple `imeta` tags in Nostr events for different quality variants
  - Debug Page enhanced with tabbed interface showing Blossom server availability for each variant
    - Separate tabs for each video variant (Video 1, Video 2, etc.) with quality labels
    - Dedicated tab for thumbnail variants
    - Each tab displays server availability, file metadata, and fallback URLs
    - Icons distinguish between video variants and thumbnails
  - Created `useMultiVideoServerAvailability` hook for parallel availability checking across all variants
  - Preserves backward compatibility with single-video events

- **Internationalization (i18n) Support**: Full internationalization implementation with 4 languages
  - Added `react-i18next` for translation management
  - Created comprehensive translation files in `src/i18n/locales/`:
    - `en.json` - English translations (default)
    - `de.json` - German translations
    - `fr.json` - French translations
    - `es.json` - Spanish translations
  - Language switcher added to Settings > General Settings with 4 language options
  - Language preference persisted in localStorage
  - Automatic language detection based on browser settings
  - All user-facing text externalized to translation files including:
    - Navigation menu items (Sidebar, Header)
    - Authentication flows (Login, Signup, Account Switcher)
    - Video components (VideoPage, VideoComments, ShareButton, MirrorVideoDialog)
    - Upload workflow (VideoUpload, FormFields, VideoMetadata, ThumbnailSection, ContentWarning)
    - Settings sections (General, Relays, Blossom Servers, Caching Servers, Cache Management, Missing Videos)
    - All page components (HomePage, ShortsPage, HistoryPage, LikedVideosPage, SearchPage, HashtagPage, AuthorPage, SubscriptionsPage, NotFound)
    - Playlist management (Playlists, CreatePlaylistDialog)
    - Common UI elements (buttons, errors, toasts, empty states)
  - Translation interpolation for dynamic values (counts, dates, usernames, etc.)
  - Organized translation keys by feature/component area for maintainability
  - 500+ translation strings covering the entire application in all 4 languages
  - **Date Localization**: Full date-fns locale support for all languages
    - Relative time formatting (e.g., "2 hours ago", "vor 2 Stunden", "il y a 2 heures", "hace 2 horas")
    - Created centralized `getDateLocale()` utility in `src/lib/date-locale.ts`
    - Supports English (`en`), German (`de`), French (`fr`), and Spanish (`es`)
    - Updated 6 components to use centralized utility: `VideoCard`, `VideoInfoSection`, `VideoComments`, `MissingVideosSection`, `VideoSuggestions`, `ShortsVideoPage`
    - Dates and relative times (e.g., "3 hours ago") now display in the user's selected language

### Fixed

- **HomePage Video Loading on Login**: Fixed videos not loading on HomePage after user login
  - Root cause: When user logs in, their NIP-65 relay list is fetched, changing relays and recreating the loader
  - The reset effect would trigger, but the trigger effect wouldn't run again since loader didn't change a second time
  - This left the page in a loading state with no videos displayed
  - Solution: Modified reset effect to call `next()` after reset completes when loader changes
  - Uses `queueMicrotask` to ensure reset state updates are applied before triggering the load
  - Fixes HomePage and all timeline pages that reload when relays change (e.g., after login, settings changes)

- **AuthorPage Video Loading**: Fixed AuthorPage videos not loading, with skeleton staying visible indefinitely
  - Root cause: Reset effect in `useInfiniteTimeline` triggered on initial mount when loader was first defined
  - The reset would cancel the initial load that was just started by the trigger effect
  - Solution: Changed initial mount check from `if (!loaderRef.current && !loader)` to `if (loaderRef.current === undefined)`
  - Now properly handles both cases: loader undefined or loader defined on first render
  - Only triggers reset when loader changes from a previous non-undefined value
  - Fixes AuthorPage and any other pages where loader is defined immediately on mount

### Changed

- **Play/Pause Overlay UX Improvement**: Made play/pause overlay smaller and appear faster
  - Reduced icon size from `w-20 h-20` (80px) to `w-14 h-14` (56px) - about 30% smaller
  - Reduced padding from `p-4` to `p-3` for more compact appearance
  - Reduced fade-out delay from 700ms to 400ms for faster appearance and disappearance
  - Improves video playback UX with more subtle, responsive visual feedback

- **Mirror Dialog Auto-Recheck**: Mirror Video dialog now automatically rechecks server availability after successful mirroring
  - Added `onMirrorComplete` callback prop to `MirrorVideoDialog`
  - Automatically triggers availability recheck after successful or partial mirror completion
  - Users can immediately see the video is now available on newly mirrored servers
  - Improves UX by confirming mirror operation worked without manual refresh

- **Debug Logging Throttling**: Reduced excessive console logging during video playback
  - `useUserBlossomServers` hook now throttles debug logs to prevent spam
  - Only logs when values actually change (server count, user pubkey) or once every 10 seconds
  - Moved logging to `useEffect` to comply with React's purity requirements
  - Eliminates console spam during video playback while preserving debug information

- **Reaction Buttons UX Improvement**: Enhanced video reaction buttons (upvote/downvote) to prevent duplicate reactions
  - Buttons are now marked with semi-transparent fill (`fill-current/80`) when the current user has already reacted
  - Both buttons are disabled after reacting (either up or down) to prevent changing reactions
  - Icon uses text color with 80% opacity fill when active, maintaining consistent theming
  - Added `useMemo` optimization to efficiently check user's reaction status
  - Applies to both inline layout (VideoPage) and vertical layout (ShortsPage)
  - User can only react once per video with either upvote or downvote

### Added

- **NIP-50 Full-Text Search**: Implemented global video search using NIP-50 protocol
  - Created `SearchPage` component with NIP-50 search filter for full-text search
  - Added `GlobalSearchBar` component in header for easy access to search
  - Created dedicated `useSearchVideos` hook with isolated RelayPool that **only** queries `wss://relay.nostr.band`
  - Search queries all video kinds (21, 22, 34235, 34236) using NIP-50 full-text search
  - Dedicated search pool ensures no other user-configured relays are used for search
  - **Search always uses loader directly**: Events collected from relay subscription in real-time, not from EventStore cache
    - Each search query fetches fresh results from relay instead of reading cached events
    - Events accumulated in local state via `setEvents` for immediate display
    - Events also added to EventStore for caching in other parts of the app
  - Results displayed in responsive video grid with infinite scroll
  - Added `/search` route with query parameter support (`/search?q=query`)
  - Empty state shown when no query provided
  - Document title updates to show search query
  - Comprehensive test coverage with 5 unit tests for SearchPage component

- **Media Caching Servers**: Separated caching/proxy servers from Blossom servers into dedicated configuration
  - Created new `CachingServer` interface (url and name only, no tags)
  - Added `cachingServers` configuration to AppConfig
  - Created new "Media Caching Servers" settings section in Settings page
  - Users can now manage caching servers independently from upload servers
  - Added `presetCachingServers` with default caching server (https://almond.slidestr.net)
  - Updated `generateMediaUrls` to use cachingServers instead of filtering by 'proxy' tag
  - Updated all types in AppContext and global.d.ts to support caching servers
  - Caching servers are used for faster video playback via proxy/caching without upload capabilities

- **Docker Deployment Support**: Added full Docker support with runtime environment configuration
  - Created multi-stage Dockerfile (builder + nginx runtime) optimizing image size (~50MB final)
  - Runtime environment variables injected at container startup (no rebuild needed for config changes)
  - Supports `RUNTIME_RELAYS`, `RUNTIME_BLOSSOM_SERVERS`, `RUNTIME_APP_TITLE`, `RUNTIME_DEBUG`, and `RUNTIME_CUSTOM_CONFIG`
  - Added nginx configuration with SPA routing, gzip compression, security headers, and health check endpoint
  - Created docker-compose.yml for easy deployment with docker-compose
  - Added entrypoint script that generates runtime-env.js exposing `window.__RUNTIME_ENV__` to the app
  - Created public/runtime-env.js fallback for local development (non-Docker)
  - Added comprehensive DOCKER.md documentation with deployment examples (Docker Compose, Kubernetes, CI/CD)
  - Added .dockerignore to optimize build context
  - Added .env.example showing available runtime configuration options
  - Updated README.md with Docker quick start instructions
  - Health check available at `/health` endpoint for container orchestration

- **Watch History Feature**: Implemented video watch history tracking and History page
  - Created `useVideoHistory` hook for tracking video plays in local storage
  - Videos are automatically tracked when loaded in VideoPage and ShortsVideoPage
  - Each history entry stores the full video event and timestamp
  - History is limited to 100 most recent videos (oldest removed first)
  - If the same video is watched again, timestamp updates and moves to front
  - Created new History page (`/history`) to display watch history
  - History page shows videos in a responsive grid layout with most recent first
  - Added "Clear History" button with confirmation dialog
  - Enabled History link in sidebar navigation (previously disabled)
  - History is stored per-device in local storage

- **Mirror Video Dialog Functionality**: Implemented actual Blossom mirror requests in the Mirror Video dialog
  - Users can now mirror videos to additional Blossom servers for improved redundancy and availability
  - Dialog shows currently hosting servers and allows selection of additional servers to mirror to
  - Integrated with existing `mirrorBlobsToServers()` function from blossom-upload.ts
  - Provides detailed feedback: success toast when all mirrors complete, warning toast for partial success with failure count, error toast when all mirrors fail
  - Mirror button is disabled when user is not logged in
  - Uses authenticated Nostr events for mirror authorization via user's signer
  - Automatically checks if files already exist on target servers before mirroring

### Changed

- **VideoPage Player Centering**: Centered video player horizontally in VideoPageLayout
  - Video player now centered horizontally in normal (non-cinema) mode
  - Uses flexbox with items-center for proper alignment
  - Video info section maintains full width below the player
  - Improves visual balance and professional appearance
  - Cinema mode layout remains unchanged

- **Shorts Comments Sheet Width**: Added max-width to comments sheet on desktop
  - Comments sheet in ShortsVideoPage now has a max-width of 2xl (42rem/672px)
  - Centered on desktop for better readability and focused layout
  - Mobile experience remains full-width as expected
  - Improves UX on wide desktop screens

- **Comments Pagination and Collapsible Replies**: Improved comments UX with pagination and expandable replies
  - Top-level comments now show 15 at a time with "Load more" button to show next 15
  - Replies are hidden by default with expandable toggle showing reply count (e.g., "▶ 5 replies")
  - Click to expand/collapse reply threads at any nesting level
  - Prevents overwhelming UI with hundreds of comments loading at once
  - Improves page performance and readability
  - Maintains full threading up to 5 levels deep

- **VideoPage Loading Experience**: Removed video player skeleton to eliminate flickering
  - Skeleton has been completely removed from VideoPage video player area
  - Previous video remains visible when switching videos instead of showing a skeleton
  - Smoother video navigation experience without loading flicker
  - Video info section and sidebar continue to update normally during video transitions

- **Video Poster Loading States**: Added skeleton loading state for video poster thumbnails on VideoPage
  - Both NativeVideoPlayer and HLSVideoPlayer now show a skeleton placeholder while the poster image loads
  - Uses the same pattern as VideoCard thumbnail loading for consistent UX
  - Preloads poster images and tracks loading state to determine when to hide the skeleton
  - Prevents empty/blank video player appearance while poster images are downloading
  - Uses `queueMicrotask` to defer state updates and avoid React's set-state-in-effect warning

- **Thumbnail Loading States**: Added placeholder background while thumbnails are loading
  - VideoCard now shows a skeleton/placeholder background while the thumbnail image loads
  - Provides visual feedback during image loading instead of showing empty space
  - Placeholder automatically disappears once the image has loaded
  - Improves perceived performance and visual polish in video grids

- **Blossom Server Tags**: Removed 'proxy' tag from Blossom server configuration
  - Blossom servers now only support 'mirror' and 'initial upload' tags
  - Proxy/caching functionality moved to dedicated Media Caching Servers section
  - Default blossom server (https://almond.slidestr.net) now has only 'initial upload' tag
  - Improves separation of concerns between upload servers and caching servers

- **Sidebar Menu Cleanup**: Removed "Your clips" menu item from the sidebar
  - Removed disabled "Your clips" item from the Library section
  - Removed unused Scissors icon import from lucide-react
  - Streamlines the navigation menu by removing non-functional placeholder items

- **Play/Pause Overlay Component**: Refactored animated play/pause overlay into reusable component
  - Created new `PlayPauseOverlay` component in `src/components/PlayPauseOverlay.tsx`
  - Extracted duplicate play/pause animation logic from `VideoPlayer` and `ShortsVideoPage`
  - Component handles play/pause event listeners, animation timing, and visual transitions
  - Reduces code duplication and improves maintainability
  - Uses same fade-in/fade-out animations with 700ms delay before fade-out
  - Automatically initializes paused state and cleans up event listeners on unmount

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

- **Major Package Updates**: Upgraded all packages to latest versions for improved performance and security
  - **React 19**: Upgraded from React 18.3.1 to React 19.2.0 (with react-dom)
    - Added npm overrides to force React 19 across all dependencies including applesauce-react
    - Full compatibility with shadcn/ui and all Radix UI components
    - All tests passing with new React 19 features and behavior
  - **Applesauce packages**: Updated core and relay from 4.2.0 to 4.4.2
  - **nostr-idb**: Upgraded from 3.0.0 to 4.0.1
  - **react-intersection-observer**: Upgraded from 9.16.0 to 10.0.0 (infinite scroll)
  - **vitest**: Upgraded from 3.2.4 to 4.0.10 (test runner)
  - **Minor updates**: Updated ~12 packages including @types/react, @types/react-dom, @vitejs/plugin-react, jsdom, lucide-react, react-hook-form, react-router-dom, and typescript-eslint
  - Added SECURITY_AUDIT_2025-11-17.md documenting full security audit and upgrade analysis
  - No security vulnerabilities found in npm audit
  - All builds and tests verified working after upgrades

### Changed

- **Thumbnail Error Handling**: Improved VideoCard error state when thumbnails fail to load
  - Immediately shows error state if no thumbnail URL is defined in the video event
  - Shows "Thumbnail unavailable" message with broken image icon instead of infinite skeleton loading
  - Tries fallback to video URL thumbnail generation before showing error state
  - Uses muted background with `ImageOff` icon and clear error message
  - Provides better user feedback when thumbnails are missing or fail to load

### Fixed

- **Comment Text Wrapping**: Fixed long comment text and URLs breaking layout
  - Changed `wrap-break-word` (invalid class) to standard Tailwind `break-words` class in VideoComments
  - Added `break-all` class to URL links in RichTextContent to force long URLs to wrap
  - Long URLs and unbreakable text in comments now wrap correctly instead of overflowing
  - Prevents horizontal scrolling caused by very long URLs in comment text

- **Timeline Pages Loading States**: Fixed timeline pages showing empty state flash or stuck in skeleton loading
  - **useInfiniteTimeline fix (HomePage, ShortsPage, HashtagPage)**:
    - Root cause: Previous fix changed `loading = true` initially but forgot to trigger the first load
    - The 24 skeleton cards pushed InfiniteScrollTrigger out of view, preventing automatic trigger
    - Solution: Added `useEffect` to call `next()` when loader becomes available
    - Uses `queueMicrotask` to defer state updates and avoid React's `set-state-in-effect` warning
    - Combines with existing `isFirstLoadRef` mechanism to allow first load when `loading=true`
  - **useTimelineLoader fix (SubscriptionsPage)**:
    - Root cause: Hook initialized with `loading = false`, causing empty state flash before loading effect
    - Solution: Initialize `loading = true` to show skeletons immediately instead of empty state
    - Also set `loading = true` during reload when `reloadDependency` changes for consistent UX
  - All timeline pages now show skeletons during initial load instead of empty state or being stuck

- **Blossom Server URL Double Slashes**: Fixed 404 errors caused by double slashes in Blossom server URLs
  - Updated `normalizeServerUrl()` function to preserve port numbers and remove trailing slashes
  - Added URL normalization at the entry point of all Blossom functions:
    - Upload functions: `customMirrorBlob`, `checkFileExists`, `getUploadCapabilities`, `uploadChunk`, `uploadFileChunked`, `uploadFileToSingleServer`
    - Media URL generation: `generateMirrorUrls`, `generateProxyUrls` (media-url-generator.ts)
    - HEAD request builder: `buildBlossomHeadUrls` (blossom-utils.ts)
    - BlobDescriptor creation: `createMockBlobDescriptor` (blossom-upload.ts)
  - Fixes GET/HEAD/POST/PUT/PATCH requests with double slashes (e.g., `https://server.com//hash` or `https://server.com//upload`)
  - Fixes blob URLs in upload dialog links (target="\_blank") showing double slashes
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
