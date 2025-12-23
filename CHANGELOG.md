# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Blurhash Thumbnail Placeholders**: Blurred LQIP placeholders while thumbnails load using imeta blurhash tags
- **Unified Draft & Upload Manager**: Single source of truth for task and draft state with debounced Nostr sync
- **Background Transcoding**: DVM transcode jobs continue when navigating away, auto-resume on app start
- **Adaptive Quality Switching**: Auto-downgrades video quality on slow networks after buffering events
- **Accumulating Seek**: Arrow keys/touch gestures accumulate seek time with visual feedback (+5s, +10s, etc.)
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
- **NIP-71 Addressable Events**: Support for kinds 34235/34236
- **NIP-40 Video Expiration**: Optional expiration (1 day to 1 year) in upload wizard
- **Docker Deployment**: Multi-stage Dockerfile with runtime env vars

### Changed

- **Embed Player Rewrite**: Replaced vanilla JS embed with React-based embed using shared VideoPlayer component, Vite multi-entry build
- **Video Player Performance**: React.memo on all components, RAF-only polling, memoized callbacks
- **Upload Form Wizard**: 4-step wizard with validation, responsive two-column layout
- **Draft Deletion UX**: Confirmation dialog with option to delete media from Blossom servers
- **Video Card Hover**: Added hover background effect with card padding
- **Cinema Mode**: Preserves aspect ratio with max-height 85dvh
- **Touch Overlay**: Single-tap for seeking instead of double-tap
- **Controls Timing**: 2s auto-hide delay, 500ms fade-out animation
- **Video Expiration Badge**: Amber "Expires in X" / red "Expired" badges
- **Play/Pause Overlay**: Play icon displays 2x longer than pause
- **Page Max-Width**: Consistent max-w-560 across all pages
- **Ultra-Wide Detection**: Increased cinema mode threshold to 10% above 16:9
- **Blossom URL Utils**: Consolidated detection/parsing, NON_BLOSSOM_SERVERS list
- **Package Updates**: React 19.2.3, Vite 7.3.0, nostr-tools 2.19.4, tailwindcss 4.1.18, and more

### Fixed

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
