# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Upload: publish date picker in step 5 allows scheduling video publish date/time (defaults to "now" for immediate publishing)
- Author page: added zap button to send sats directly to content creators (only shown if author has lightning address)
- Upload: added delete draft button (trash icon) with confirmation dialog next to save draft button; save draft button now shows save icon

### Changed

- Zaps: when no wallet is configured, clicking zap now shows a lightning invoice QR code instead of wallet setup dialog, with a "configure wallet" link for one-tap zaps; dialog auto-closes when payment is detected
- Zap button now only displayed when video author has a lightning address (lud16/lud06)
- Embed player: reordered title overlay to show title on top, author below
- Embed player: video now pauses when opening in nostube
- Embed player: author avatar/name now links to profile page in nostube
- Embed player: now uses author's blossom servers for video fallback URLs (same logic as main player)
- Video player: added 5-second stall detection to faster failover to next URL when loading stalls
- Video page: video player now sticks to top of screen on mobile portrait when scrolling
- Video page: reduced title font size on mobile for better readability
- Updated dependencies: applesauce-react 5.0.1, globals 17.0.0, i18next 25.7.4, immer 11.1.3, react-hook-form 7.70.0, react-i18next 16.5.1, react-resizable-panels 4.3.1, react-router-dom 7.12.0, typescript-eslint 8.52.0, vite 7.3.1, zod 4.3.5

### Fixed

- Upload: after successful video publish, draft is now deleted and app navigates to the video page
- Config: nsfwFilter now defaults to 'hide' when not set (migration for old configs without this setting)
- UI: fixed modal dialogs (dialog, alert-dialog, sheet, drawer) appearing below sticky video player by increasing z-index from 50 to 70
- Video page: fixed sticky video player not working due to overflow-auto on main container
- Video page: fixed sticky video player z-index to appear above header on mobile
- Video page: fixed sticky video player iOS notch handling - player now sticks at safe-area-inset-top with fixed background covering the notch area, drop shadow appears when stuck
- Video page: fixed duplicate video player mounting causing double audio on mobile (CSS hiding replaced with JS conditional rendering)
- Video player: fixed iOS home indicator staying visible during fullscreen by disabling continuous mouse move handler on mobile (touch handled separately by TouchOverlay)
- Video player: fixed progress bar scrubber lagging behind cursor/finger during drag (scrubber now uses preview position for immediate feedback, disabled transitions during drag, added will-change hints)
- Upload drafts: fixed excessive NIP-44 encrypt/decrypt calls when navigating to upload page (now only saves to localStorage when merging from Nostr, skips when no changes)
- Video page: fixed sticky video player filling entire screen on iPad landscape (sticky behavior now only activates in portrait orientation)
- Video page: fixed zap amount from previous video being displayed when navigating between videos (cached value now updates with eventId)

## [1.0.0] - 2025-01-08

### Added

- **Authentication**: Nostrconnect QR code login (NIP-46), persistent login sessions, NIP-07 extension support
- **Wallets**: Nostr Wallet Connect (NIP-47), Cashu wallet support (NIP-60) with multiple mints
- **Zaps**: Lightning zaps (NIP-57) with quick zap and custom amounts, zap notifications
- **Video Player**: Custom YouTube-style player with hls.js, keyboard shortcuts (J/K/L/C/T/F), theater mode, mobile gestures, subtitle support
- **Upload System**: Multi-step wizard, DVM transcoding (NIP-90), draft persistence (NIP-78), blurhash generation, subtitle upload
- **Content Discovery**: Category/hashtag browsing, infinite scroll pagination, NIP-50 search, people search
- **Social Features**: Comment reactions, video likes/dislikes (NIP-65 relay targeting), watch history
- **App Presets**: NIP-78 preset system for blocked pubkeys, NSFW filtering, default relays
- **Notifications**: Video comments and zaps with 7-day persistence
- **Embed Player**: Standalone embeddable player with branding and content warnings
- **Multi-Blob Mirroring**: Mirror videos, thumbnails, and subtitles to Blossom servers
- **Internationalization**: EN/DE/FR/ES translations
- **NIP-71 Video Events**: Full imeta support for kinds 21, 22, 34235, 34236

### Changed

- Settings page redesigned with menu-based navigation
- Migrated to applesauce-react `use$` hook (removed observable-hooks)
- Video player performance optimizations (React.memo, RAF polling)
- Mobile UX improvements (touch controls, button spacing, fullscreen)
- Applesauce v5.0.0 and related package updates

### Fixed

- Cashu mint dropdown click selection and unlock button visibility
- Playlist page infinite re-render loop
- Relay subscription leaks and NSFW filtering on browse pages
- Zap invoice encoding and receipt fetching
- iOS fullscreen, HEVC codec detection, mobile touch handling
- Various upload, draft, and notification system fixes
