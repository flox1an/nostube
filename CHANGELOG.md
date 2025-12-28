# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Video Zaps Hook**: useVideoZaps hook to load zap receipts (kind 9735) for videos. Provides totalSats, zapCount, and zaps array with deduplication by bolt11 invoice.
- **Zap Hook**: useZap hook for complete zap flow - fetches author profile, creates signed zap request (kind 9734), requests LNURL invoice, and pays via NWC wallet connection.
- **NWC Wallet Context**: WalletContext and useWallet hook for NIP-47 Nostr Wallet Connect integration. Manages wallet connection state, balance, and payment methods with localStorage persistence for connection restoration.
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
- **Package Updates**: @types/node 25.0.3, immer 11.1.0, react-resizable-panels 4.0.15, and more

### Fixed

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

### Removed

- **Unused Video Cache Worker**: Deleted dead code `videoCacheWorker.ts`
