# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Zap button now only displayed when video author has a lightning address (lud16/lud06)
- Embed player: reordered title overlay to show title on top, author below
- Embed player: video now pauses when opening in nostube
- Embed player: author avatar/name now links to profile page in nostube
- Embed player: now uses author's blossom servers for video fallback URLs (same logic as main player)
- Video player: added 5-second stall detection to faster failover to next URL when loading stalls
- Video page: video player now sticks to top of screen on mobile portrait when scrolling

### Fixed

- Video page: fixed sticky video player not working due to overflow-auto on main container
- Video page: fixed sticky video player z-index to appear above header on mobile

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
