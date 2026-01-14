# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Zaps: timestamped zaps - when zapping a video, the current play position is captured and included in the zap request via `['timestamp', '<seconds>']` tag; ZapDialog shows a checkbox "at play position X:XX" (checked by default) to optionally include the timestamp
- Zaps: added emoji picker to ZapDialog comment field for adding emoji reactions to zaps
- UI: extracted reusable EmojiPicker component (used by CommentInput and ZapDialog)
- Video player: SoundCloud-style timeline markers on progress bar showing zap activity; markers cluster to prevent overlap, display zapper avatars, and show tooltips with zap comment, author info, and zap amounts on hover; clicking a marker seeks to that position; uses actual video timestamp from zap request if available, falls back to seeded random position for zaps without timestamp; first zap has special golden highlight and "First Zap" badge in tooltip
- Video player: volume setting now persists across sessions (stored in localStorage)
- Video player: loop/replay toggle in settings menu with checkbox; setting persists across sessions (stored in localStorage)
- Comments: clicking "Replying to @user" badge in nested comments scrolls to and highlights the parent comment, auto-expanding collapsed ancestor threads
- Upload: file size now displayed for pasted video URLs (fetched via HEAD request for Content-Length header)
- i18n: added missing translations for upload dialog (video source, URL input, dropzone, subtitles, publish date, step indicators) in EN/DE/FR/ES
- SEO: added Open Graph and Twitter card meta tags for better social sharing previews (og:image, og:url, twitter:card)
- Upload: publish date picker in step 5 allows scheduling video publish date/time (defaults to "now" for immediate publishing)
- Author page: added zap button to send sats directly to content creators (only shown if author has lightning address)
- Upload: added delete draft button (trash icon) with confirmation dialog next to save draft button; offers option to delete uploaded media from servers; navigates to draft overview after deletion; save draft button now shows save icon

### Changed

- Comments: improved highlight animation for parent comment navigation - smoother 1.5s fade with multi-step keyframes and CSS transitions
- Comments: single replies are now auto-expanded (no expand button needed); expand/collapse button only shown when there are 2+ replies
- Comments: removed "Replying to @user" badge from nested comments for cleaner UI (visual threading makes context clear)
- Video cards: hide user avatar on portrait/shorts video cards for cleaner layout (author name still shown in metadata)
- Zaps: when no wallet is configured, clicking zap now shows a lightning invoice QR code instead of wallet setup dialog, with a "configure wallet" link for one-tap zaps; dialog auto-closes when payment is detected
- Zap button now only displayed when video author has a lightning address (lud16/lud06)
- Embed player: reordered title overlay to show title on top, author below
- Embed player: video now pauses when opening in nostube
- Embed player: author avatar/name now links to profile page in nostube
- Embed player: now uses author's blossom servers for video fallback URLs (same logic as main player)
- Embed player: added optional timeline markers showing zap activity (enabled by default, disable with `?zaps=0` URL parameter)
- Video player: added 5-second stall detection to faster failover to next URL when loading stalls
- Video player: mobile touch seek now requires double-tap to trigger (single tap on side zones no longer seeks); triple+ taps stack additional seek time
- Video page: reduced title font size on mobile for better readability
- Video page: limit title to 2 lines with ellipsis on mobile to prevent excessive vertical space
- Debug dialog: collapse Nostr event JSON by default; variant tabs stack vertically on mobile for better usability
- Video page: language badges now display with country flag emoji and shortcode (e.g., 🇺🇸 EN), merged into tag list without separate "Languages:" label
- Layout: hide mini icon sidebar on video and shorts pages for full-width video experience (consistent with mobile behavior)
- Video page: added horizontal padding to video info and sidebar sections in theater mode on desktop for better content spacing
- Video page: video suggestions now display in 2-column grid in theater mode on desktop (single column in normal mode)
- Video player: added explicit autoplay - calls play() when video is ready to ensure playback starts (fallback for browsers that block autoPlay attribute)
- Video player: timeline zap markers hidden on mobile for cleaner touch interaction
- Updated dependencies: applesauce-react 5.0.1, globals 17.0.0, i18next 25.7.4, immer 11.1.3, react-hook-form 7.70.0, react-i18next 16.5.1, react-resizable-panels 4.3.1, react-router-dom 7.12.0, typescript-eslint 8.52.0, vite 7.3.1, zod 4.3.5

### Fixed

- Notifications: replies to user comments now correctly show "replied to your comment" instead of "commented on your video"; video title is now properly resolved from root E/K tags (previously showed "Unknown video" for replies)
- Upload: after successful video publish, draft is now deleted and app navigates to the video page
- Config: nsfwFilter now defaults to 'hide' when not set (migration for old configs without this setting)
- UI: fixed modal dialogs (dialog, alert-dialog, sheet, drawer) appearing below video player by increasing z-index from 50 to 70
- Video page: fixed video player remounting when toggling theater mode (unified layout structure keeps player in same DOM position)
- Video player: fixed iOS home indicator staying visible during fullscreen by disabling continuous mouse move handler on mobile (touch handled separately by TouchOverlay)
- Video player: fixed progress bar scrubber lagging behind cursor/finger during drag (scrubber now uses preview position for immediate feedback, disabled transitions during drag, added will-change hints)
- Upload drafts: fixed excessive NIP-44 encrypt/decrypt calls when navigating to upload page (now only saves to localStorage when merging from Nostr, skips when no changes)
- Video page: fixed zap amount from previous video being displayed when navigating between videos (cached value now updates with eventId)
- Video page: fixed wrong loading skeleton (video grid) showing when lazy-loading video page module (now shows video player + sidebar skeleton)
- Build: fixed ESLint errors - empty interface in kbd.tsx (changed to type alias) and conditional useMemo hook in VideoPage.tsx (moved before early return)
- Comments: fixed L-shaped threading connector line not aligning with avatar center (changed height from h-5 to h-4)
- Video page: fixed tag/language badges wrapping on small screens (now scroll horizontally with flex-nowrap and whitespace-nowrap)

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
