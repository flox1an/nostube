# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Migrated to applesauce-react use$ hook**: Replaced `useObservableMemo` and `useObservableState` (from `observable-hooks`) with the new unified `use$` hook from `applesauce-react`. This simplifies React integration by combining observable subscription management and state updates into a single hook. Updated 18 files including hooks (`useProfile`, `useEventZaps`, `useLikedEvents`, `useCommentCount`, `useReports`, `usePlaylist`, `useEventStats`, `useVideoTimeline`, `useMyPreset`, `useUserRelays`, `usePresets`, `useTimelineLoader`, `usePlaylistDetails`) and components (`PresetContext`, `ShortsVideoPage`, `VideoSuggestions`, `VideoComments`). Removed `observable-hooks` dependency entirely.

### Added

- **Nostrconnect QR Code Login**: New primary login method using NIP-46 nostrconnect flow. Displays a QR code that can be scanned with mobile signer apps like Amber or Nostrudel. The app generates a `nostrconnect://` URI, displays it as a QR code, and automatically detects when the remote signer connects. Session persists across browser reloads via bunker URI storage. Includes copy-to-clipboard button for manually pasting the URI into signer apps.
- **Infinite Scroll on Category/Hashtag Pages**: Category and hashtag pages now support infinite scroll pagination. Automatically loads more videos when scrolling to the bottom, with proper exhaustion detection to stop loading when no more videos are available. Uses `until` parameter for timestamp-based pagination.
- **People Search in Global Search Bar**: Search bar now supports searching for Nostr users via Primal relay (NIP-50). Shows matching profiles with avatars in a dropdown, clicking navigates to author page. Keyboard navigation with arrow keys, Enter to select, Escape to close. Video search option always available at bottom of dropdown.
- **User Avatar Fallback**: New `UserAvatar` component generates unique dicebear avatars for users without profile pictures. Falls back to a colorful avatar based on user's pubkey instead of a plain character, providing better visual identity across the app.
- **App Presets System**: NIP-78 based preset system (kind 30078) for app-wide configuration. Admins can manage blocked pubkeys, NSFW authors, default relays, blossom proxy, and thumbnail resize server via `/admin` route. Users can browse and select presets via `/settings/presets`. Selected preset stored in localStorage, with 1-hour cache for performance. Default preset: `npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc`.
- **Thumbnail Resize Server Preset**: Presets can now include a `defaultThumbResizeServer` URL (e.g., `https://imgproxy.nostu.be/`) for resizing thumbnail images.
- **Settings Page Sections**: Settings page now has menu-based navigation with routes (`/settings/<section>`). Sections: General, Presets, Wallet, Relays, Blossom Servers, Caching Servers, Cache, Missing Videos. Presets moved from standalone `/presets` route into settings.
- **Two-Step Settings Navigation**: Settings page redesigned from sidebar layout to two-step menu. First select category, then view settings with back button. Improved mobile usability with cleaner, focused screens.
- **Comment Reactions**: Thumbs up/down and zap buttons on comments matching video reactions UX. Ghost buttons with small font, counts shown when ≥1, quick zap on click, custom amount on long-press/right-click. Reactions published to comment author's inbox relays (NIP-65).
- **Unified Event Stats Cache**: New `useEventStats` hook combines zaps and reaction counts with localStorage caching (1-hour TTL). Shows cached values instantly on page load, fetches fresh data in background. Used by both video and comment reactions for consistent caching behavior.
- **Lightning Zaps**: Send zaps to video creators with NIP-57 support. Quick zap (21 sats) on click, custom amount on long-press/right-click with preset amounts (21, 100, 500, 1000, 5000) and optional comment. Shows total sats received on videos with formatted display (e.g., "21.5k"). Zaps are published to author's inbox relays (NIP-65) and the relays where the video was seen.
- **Nostr Wallet Connect**: NIP-47 wallet integration via `applesauce-wallet-connect`. Connect wallet in Settings or on first zap attempt. Shows wallet balance and supports Alby and other NWC-compatible wallets.
- **NIP-65 Relay Targeting for Reactions**: Likes and dislikes are now published to the video author's inbox relays in addition to the user's write relays and the relays where the video was seen, ensuring better delivery.
- **Persistent Login Sessions**: Account login persists across browser reloads using localStorage. Extension accounts wait up to 3 seconds for NIP-07 extension to inject before restoration. Bunker accounts store connection URI for automatic reconnection.
- **Multi-Blob Mirror Dialog**: Mirror dialog now detects all blobs (videos, thumbnails, subtitles) from a video event, matching debug dialog's detection. Shared blob extraction utility (`blossom-blob-extractor.ts`) consolidates deduplication logic between both dialogs. Select/deselect individual files to mirror with server availability counts.
- **Mark All Notifications as Read**: Button in notification dropdown to mark all notifications as read at once
- **Seek Keyboard Shortcuts**: Press 'J' to seek backward 10s, 'L' to seek forward 10s (stacks with rapid presses like arrow keys)
- **Play/Pause Keyboard Shortcut**: Press 'K' to toggle play/pause (Space also works)
- **Player Control Tooltips with Shortcuts**: All player control buttons show instant shadcn tooltips on hover with name and keyboard shortcut (e.g., "Play (K)", "Mute (M)", "Captions (C)", "Theater mode (T)", "Fullscreen (F)")
- **Theater Mode Keyboard Shortcut**: Press 'T' to toggle theater/cinema mode
- **Subtitle Toggle Keyboard Shortcut**: Press 'C' to toggle subtitles/captions on and off
- **Video Debug Info Subtitles**: Debug dialog now shows subtitle files in Blossom Server Availability tabs with Captions icon
- **Thumbnail Deduplication in Debug**: Consolidates thumbnails with same URL or hash in debug display to reduce clutter
- **Volume Slider Keyboard Accessibility**: Volume slider now reachable via Tab key, expands on focus with keyboard controls (Arrow Up/Down/Left/Right for 5% steps, Shift+Arrow for 10%, Home/End for min/max), proper ARIA attributes for screen readers
- **Subtitle Upload Step**: New step 4 in upload wizard for VTT/SRT subtitle files with auto-detected language from filename, manual language override, Blossom upload and mirroring, and NIP-71 text-track tag generation
- **Subtitle Language Selector**: Settings menu now includes a subtitle language picker when multiple subtitle tracks are available, with CC button toggling the selected language on/off
- **Subtitle URL Validation**: Validates subtitle track URLs before displaying, with automatic blossom server fallback for 404s - only shows subtitles that are actually available
- **Auto-Fullscreen on Orientation**: Automatically enters fullscreen when rotating to landscape while playing, exits on portrait
- **Blurhash Thumbnail Placeholders**: Blurred LQIP placeholders while thumbnails load using imeta blurhash tags
- **Unified Draft & Upload Manager**: Single source of truth for task and draft state with debounced Nostr sync
- **Background Transcoding**: DVM transcode jobs continue when navigating away, auto-resume on app start
- **Adaptive Quality Switching**: Auto-downgrades video quality on slow networks after buffering events
- **Accumulating Seek**: Arrow keys/touch gestures accumulate seek time in 5s increments with visual feedback (+5s, +10s, etc.)
- **Custom Video Player**: YouTube-style player with auto-hiding controls, settings menu, quality/speed selection, mobile gestures, hls.js integration
- **DVM Video Transcoding**: Multi-resolution transcoding via NIP-90 DVMs with progress display and Blossom mirroring
- **Upload Draft Persistence**: NIP-78 drafts with localStorage + Nostr sync, NIP-44 encryption, 30-day cleanup
- **NIP-51 Follow Sets**: Migrated from NIP-2 contact lists with auto-import dialog
- **Blossom Server Onboarding**: Two-step onboarding with follow import and server configuration
- **Video Comment Notifications**: Bell icon dropdown with 7-day persistence
- **Zap Notifications**: Receive notifications when someone zaps your videos. Shows zapper's avatar, display name, amount in sats, optional zap comment, and video title. Notifications polled from popular zap relays (damus, primal, nos.lol) every 2.5 minutes with 7-day retention and localStorage caching.
- **Category/Hashtag Browsing**: 9 categories and `/tag/:tag` routes with clickable hashtags
- **Share Dialog Embed Tab**: Copy iframe embed code with optional timestamp
- **Embed Player**: Standalone player with branding, content warnings, profile fetching, event caching
- **NIP-50 Search**: Full-text search via relay.nostr.band
- **Watch History**: Track last 100 watched videos
- **Multi-Video Upload**: Upload multiple quality variants (4K/1080p/720p/etc)
- **Internationalization**: EN/DE/FR/ES with 500+ translations
- **NIP-71 Video Events**: Full support for imeta-based video format on all event kinds (21, 22, 34235, 34236) with legacy format fallback
- **Addressable Video Events**: Upload now creates addressable events (kinds 34235/34236) using draft UUID as the `d` tag, enabling video metadata updates
- **Blurhash Generation on Upload**: Automatically generates blurhash placeholders for thumbnails during upload, included in imeta tags (NIP-92 compliant)
- **NIP-40 Video Expiration**: Optional expiration (1 day to 1 year) in upload wizard
- **Docker Deployment**: Multi-stage Dockerfile with runtime env vars

### Changed

- **Required Preset Loading**: App now blocks rendering until the preset configuration is loaded from Nostr relays. Shows loading spinner while fetching and error state with retry button if loading fails. Cached presets allow instant startup while fresh data loads in background. This ensures NSFW filtering and blocked pubkeys are always enforced.
- **Mobile Video Page Playlist Button**: Playlist button moved into dropdown menu on mobile to reduce button bar clutter.
- **Mobile Reaction Button Spacing**: Reduced internal spacing (icon to count) in reaction and zap buttons on mobile (`ml-1` vs `ml-2`).
- **useIsMobile Reactivity**: Hook now listens for resize events and media query changes, updating state when DevTools mobile toggle is used.
- **Zap Component Performance**: Added `React.memo` and `useCallback` to ZapButton, ZapDialog, and WalletConnectDialog components to prevent unnecessary re-renders.
- **Self Reaction Display**: Like/dislike and zap buttons on own content now render as static icon+count instead of disabled buttons for cleaner appearance.
- **Logged-Out Reaction Display**: Like/dislike counts and zap amounts now visible to logged-out users as static display (no buttons), allowing everyone to see engagement metrics.
- **Fullscreen Mode**: Theater/cinema mode has no effect in fullscreen, and the theater mode button is hidden when in fullscreen
- **Debug Dialog Layout**: Wider dialog with two-column layout - variant list (Video, Thumbnail, Subtitle) on left, details on right
- **Settings Menu Auto-Close**: Selecting quality, speed, or subtitle option now closes the settings menu immediately
- **ESLint Config**: Added `src-tauri` to ESLint ignores to prevent linting generated Tauri build artifacts
- **Consolidated Video Parser**: Embed player now uses the main video-event.ts parser, eliminating duplicate parsing logic and ensuring consistent NIP-71 support across main app and embeds
- **Video Player Poster**: Use full-resolution thumbnail without resize proxy, with blossom server fallback support for 404s
- **Mobile Progress Bar**: Touch-enabled scrubbing with larger handle (7x7 active, 5x5 idle), debounced seeking (only seeks on touch end), increased touch target area, and controls stay visible while seeking
- **Cinema Mode Icon**: Changed theater mode button icon from MonitorPlay to MoveHorizontal for better visual clarity
- **Touch Overlay Zones**: Changed seek zones from 1/3 to 1/4 width, giving center play/pause area 50% of screen width
- **Mobile Video Player**: Removed rounded corners when video player is full-width on mobile portrait mode
- **Mobile Controls**: Hide Picture-in-Picture button on mobile devices
- **Comment Tree Structure**: Threaded replies with small avatars (h-6) for nested comments, large avatars (h-10) for root comments, indentation-based nesting
- **YouTube-Style Comment Input**: Collapsible comment input with small avatar when unfocused, larger avatar + emoji picker + cancel/submit buttons when focused
- **Progress Bar Scrubber**: Always-visible position dot that grows on hover along with thicker bar, hover preview highlighting up to mouse position
- **Embed Player Rewrite**: Replaced vanilla JS embed with React-based embed using shared VideoPlayer component, Vite multi-entry build
- **Video Player Performance**: React.memo on all components, RAF-only polling, memoized callbacks
- **Upload Form Wizard**: 4-step wizard with validation, responsive two-column layout
- **Draft Deletion UX**: Confirmation dialog with option to delete media from Blossom servers
- **Video Suggestions Hover**: Solid color with opacity fade-in/fade-out effect on hover
- **Video Card Hover**: Added hover background effect with card padding
- **Cinema Mode**: Preserves aspect ratio with max-height 80dvh
- **Touch Overlay**: Single-tap for seeking instead of double-tap
- **Controls Timing**: 2s auto-hide delay, 500ms fade-out animation
- **Video Expiration Badge**: Amber "Expires in X" / red "Expired" badges
- **Play/Pause Overlay**: Play icon displays 2x longer than pause
- **Page Max-Width**: Consistent max-w-560 across all pages
- **Ultra-Wide Detection**: Increased cinema mode threshold to 10% above 16:9
- **Blossom URL Utils**: Consolidated detection/parsing, NON_BLOSSOM_SERVERS list
- **Unified Event Loader**: Replaced `createAddressLoader` with `createEventLoaderForStore` from applesauce-loaders v5 in core.ts. This unified loader handles both EventPointer (by id) and AddressPointer (by kind/pubkey/d-tag) lookups automatically, with support for relay hints and IDB caching.
- **Package Updates**: Applesauce v5.0.0 (accounts, core, loaders, react, relay, signers, wallet-connect), applesauce-common v5.0.0 (new package for models and blueprints), @types/node 25.0.3, immer 11.1.0, react-resizable-panels 4.0.15, and more

### Fixed

- **Nostrconnect Abort Error**: Fixed "Aborted" error appearing when switching away from QR code login tab or regenerating the code. Now properly detects and silently ignores abort signals.
- **Data URL Thumbnail Handling**: Data URLs (e.g., `data:image/png;base64,...`) are now displayed directly without any imgproxy resizing, blossom server lookups, or fallback logic. Updated `imageProxyVideoThumbnail`, `generateMediaUrls`, `extractBlossomHash`, `validateMediaUrl`, and `findValidUrl` to detect and pass through data URLs immediately.
- **Infinite Scroll Relay Fetching**: Fixed `loadMore` pagination in `useCategoryVideos`, `useHashtagVideos`, and `useSearchVideos` not actually fetching new events from relays. The RxJS subscription was a local variable that got garbage collected immediately. Now stored in a ref to keep it alive until events arrive from relays.
- **NSFW Filtering on Category/Hashtag/Search Pages**: Fixed preset NSFW author filtering not being applied on category, hashtag, search, playlist, and timeline pages. Added `useSelectedPreset` hook and `nsfwPubkeys` parameter to `processEvent`/`processEvents` calls in `useCategoryVideos`, `useHashtagVideos`, `useSearchVideos`, `useTimelineLoader`, `useVideoTimeline`, and `usePlaylistDetails` hooks.
- **Codec Detection for Large Moov Atoms**: Increased chunk size from 1MB to 2MB to handle videos with large moov atoms (e.g., VP9/Opus files with 1.6MB metadata). Added streaming fallback for Blossom servers that don't support HTTP Range requests (return 200 instead of 206), allowing codec detection to work by reading partial response via streaming then cancelling.
- **Default Preset Pubkey**: Fixed incorrect default preset pubkey that prevented preset from loading in incognito mode. The pubkey in the code didn't match the actual preset event pubkey.
- **Author Page Relay Discovery in Incognito**: Added indexer relays (index.hzrd149.com, relay.noswhere.com, relay.snort.social) to NIP-65 relay list discovery in `useUserRelays`. Previously, author pages in incognito mode with no configured relays couldn't find author's outbox relays for video loading.
- **VideoPage Subscription Leak**: Fixed relay subscriptions not being closed when navigating away from video pages. Changed from RxJS `finalize()` to explicit `useEffect` cleanup to guarantee subscription closure on unmount. Added `take(1)` to complete observables after initial load.
- **Zap Invoice Request Encoding**: Fixed double URL-encoding of zap request causing 400 errors from LNURL endpoints. `URLSearchParams.set()` auto-encodes values, so manual `encodeURIComponent()` was redundant.
- **Zap Receipt Fetching**: Added relay subscription to fetch kind 9735 zap receipts from popular relays (damus, primal, nos.lol). Previously only reading from eventStore without fetching.
- **Zap Count Caching**: Added localStorage cache for zap totals with 1-hour TTL. Shows cached amounts immediately on page load, updates in background when fresh data arrives.
- **Mirror Dialog Missing Blobs**: Fixed blob extraction filtering out thumbnails and subtitles that don't have standard blossom hash URLs - now shows all variants matching debug dialog
- **HEVC Codec Detection**: Allow hvc1/hev1 codecs through without relying on unreliable canPlayType detection (hardware decoding works even when browser reports no support)
- **Mobile Detection**: Improved useIsMobile hook to use user agent, touch capability, and screen width for reliable mobile detection
- **Mobile Touch Play/Pause**: Fixed double-trigger of play/pause on touch (was firing both touchend and synthetic click)
- **iOS Fullscreen**: Use webkit fullscreen API on video element for iOS Safari compatibility
- **Embed Player Styles**: Added missing theme CSS variables and removed unlayered inline CSS that was overriding Tailwind utilities
- **Embed Player**: Fixed crash when VideoPlayer used useAppContext outside AppProvider (useAppContextSafe fallback)
- **Embed Player Tooltip**: Added missing TooltipProvider wrapper to embed entry point, fixing "Tooltip must be used within TooltipProvider" error
- **Video Player**: Resume position, time display, controls auto-hide, progress bar, volume slider, keyboard shortcuts
- **DVM Transcoding**: Race conditions, mirroring to user's servers, state cleanup, progress messages, queue undefined access
- **Upload Wizard**: Form submission prevention, Enter key handling, accidental publish protection
- **Draft System**: Nostr sync debouncing, deletion sync, thumbnail extensions, infinite re-render loops
- **Video Deduplication**: Prefer addressable events when same video posted as both kinds
- **Availability Alerts**: Fixed false positives, HEAD request loops, checking state
- **Infinite Render Loops**: Fixed in useUserBlossomServers, video page when logged out
- **Touch Zones**: Fixed overlap with control bar on mobile
- **Tag Handling**: Deduplication on paste, state consistency, React key collisions
- **Notification System**: Draft deletion removes notifications, duplicate prevention
- **Build Warnings**: Fixed ESLint/TypeScript warnings across codebase
- **Build Errors**: Removed unused eslint-disable comment in global.d.ts, fixed synchronous setState in VideoPage effect by using queueMicrotask

### Removed

- **Unused Video Cache Worker**: Deleted dead code `videoCacheWorker.ts`
