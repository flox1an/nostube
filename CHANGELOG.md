# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comments: "Liked by creator" badge - when the video author likes a comment, their avatar with a red heart icon is displayed next to the reaction buttons (similar to YouTube)
- Refactoring: centralized video URL building in `src/utils/video-utils.ts` with `buildVideoPath`, `buildVideoUrl`, and `buildVideoUrlObject` functions; standardized all video URLs to use `/v/{link}` for widescreen and `/short/{link}` for portrait videos with optional playlist, timestamp, comment, and autoplay parameters
- Refactoring: centralized profile URL building in `src/lib/nprofile.ts` with `buildProfilePath`, `buildProfileUrl`, and `buildProfileUrlFromPubkey` functions; standardized all profile URLs to use `/p/{nprofile}` instead of `/author/{nprofile}`
- Refactoring: new `useDialogState` hook for managing dialog open/close state with data support (reduces boilerplate across 50+ components)
- Refactoring: new `src/lib/format-utils.ts` with `formatTimestamp`, `formatDateSimple`, `formatDateTime` functions
- Refactoring: new `src/lib/array-utils.ts` with `chunk`, `uniqueBy`, `groupBy`, `interleave` functions
- Refactoring: new `src/lib/language-flags.ts` with `languageToCountryCode` map, `countryCodeToFlag`, `getLanguageDisplay` functions
- Refactoring: new `src/constants/` directory with centralized storage keys, timing values, and UI constants
- Refactoring: reorganized `src/hooks/index.ts` with section comments by domain (auth, video, wallet, upload, relay, ui)
- Refactoring: split UploadManagerProvider (1,610 lines) into `src/providers/upload/` with types.ts, constants.ts, utils.ts modules
- Refactoring: split ShortsVideoPage (1,058 lines) into `src/pages/shorts/` with ShortVideoItem.tsx, ShortsVideoPage.tsx modules
- Refactoring: new `useVideoVariantSelector` hook for quality variant selection with position preservation
- Refactoring: added barrel export `src/components/player/hooks/index.ts` for all player hooks
- Refactoring: split VideoComments (692 lines) into `src/components/comments/` with types.ts, utils.ts, CommentItem.tsx, CommentSkeleton.tsx modules
- Zaps: timestamped zaps - when zapping a video, the current play position is captured and included in the zap request via `['timestamp', '<seconds>']` tag; ZapDialog shows a checkbox "at play position X:XX" (checked by default) to optionally include the timestamp
- Zaps: added emoji picker to ZapDialog comment field for adding emoji reactions to zaps
- UI: extracted reusable EmojiPicker component (used by CommentInput and ZapDialog)
- Video player: SoundCloud-style timeline markers on progress bar showing zap activity; markers cluster to prevent overlap, display zapper avatars, and show tooltips with zap comment, author info, and zap amounts on hover; clicking a marker seeks to that position; uses actual video timestamp from zap request if available, falls back to seeded random position for zaps without timestamp; first zap has special golden highlight and "First Zap" badge in tooltip
- Video player: volume setting now persists across sessions (stored in localStorage)
- Video player: loop/replay toggle in settings menu with checkbox; setting persists across sessions (stored in localStorage)
- Video player: blurhash placeholder shown while poster image loads for smoother perceived loading experience
- Comments: clicking "Replying to @user" badge in nested comments scrolls to and highlights the parent comment, auto-expanding collapsed ancestor threads
- Upload: file size now displayed for pasted video URLs (fetched via HEAD request for Content-Length header)
- i18n: added missing translations for upload dialog (video source, URL input, dropzone, subtitles, publish date, step indicators) in EN/DE/FR/ES
- SEO: added Open Graph and Twitter card meta tags for better social sharing previews (og:image, og:url, twitter:card)
- Upload: publish date picker in step 5 allows scheduling video publish date/time (defaults to "now" for immediate publishing)
- Author page: added zap button to send sats directly to content creators (only shown if author has lightning address)
- Upload: added delete draft button (trash icon) with confirmation dialog next to save draft button; offers option to delete uploaded media from servers; navigates to draft overview after deletion; save draft button now shows save icon
- Docs: added NIP-71 best practices guide (`docs/NIP-71-best-practices.md`) covering video event creation, imeta tags, multi-resolution support, thumbnails, content resilience, codec compatibility, and common pitfalls
- Video page: added "Edit Video" option for owners of replaceable video events (kinds 34235, 34236) allowing in-place editing of title, description, tags, language, and content warning; preserves all unknown tags for forward compatibility; publishes to all relays where video was seen; replaces "Label Video" option for video owners
- DVM transcoding: added NIP-04 encryption support for DVM job requests and responses; when signer supports NIP-04, transcode requests are encrypted to protect video URLs from public visibility; status and result events from DVM are automatically decrypted; falls back to unencrypted requests for signers without NIP-04 support
- DVM transcoding: added codec parameter support (h264/h265) for transcoding jobs
- SEO: added proper HTML page titles across all pages (Home, Shorts, Playlists, Liked Videos, Subscriptions, Video Notes, Upload, Settings, 404); dynamic titles for video pages, author pages, search results, playlists, categories, and hashtags were already present

### Changed

- Admin: renamed "Blossom Proxy" to "Media Cache Server" for clarity; ensured Media Cache Server and Thumbnail Resize Server URLs are normalized by removing trailing slashes in the preset editor and global settings
- Wallet: moved wallet configuration from settings page to user menu dropdown for easier access; wallet balance shown in menu when connected
- Video feeds: all timelines and feeds now sorted by `published_at` date (with `created_at` as fallback) for correct video ordering; video page shows "updated X ago" in parentheses when video was edited after publishing
- Video cards: hover effect changed from upward shift to centered zoom for smoother visual feedback
- Sidebar: hide Subscriptions and Playlists menu items in mini sidebar when not logged in (matches full sidebar behavior)
- Playlists: playlist manager now shows video thumbnails and titles for each video in the accordion list; missing video events are automatically loaded from relays
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
- Layout: hide mini icon sidebar on individual video pages (/video/, /short/) for full-width experience; shorts feed (/shorts) now shows sidebar like homepage
- Video page: added horizontal padding to video info and sidebar sections in theater mode on desktop for better content spacing
- Video page: video suggestions now display in 2-column grid in theater mode on desktop (single column in normal mode)
- Video player: added explicit autoplay - calls play() when video is ready to ensure playback starts (fallback for browsers that block autoPlay attribute)
- Video player: timeline zap markers hidden on mobile for cleaner touch interaction
- Comments: long URLs are now shortened for display (first 20 chars + "..." + last 4 chars) while keeping full URL in href and tooltip; prevents long links from breaking layout
- Video page: sidebar now appears as a sheet overlay on medium screens (1024-1280px) with a floating toggle button; two-column layout only kicks in at xl+ (1280px+) for better video viewing on smaller laptops
- Updated dependencies: applesauce-react 5.0.1, globals 17.0.0, i18next 25.7.4, immer 11.1.3, react-hook-form 7.70.0, react-i18next 16.5.1, react-resizable-panels 4.3.1, react-router-dom 7.12.0, typescript-eslint 8.52.0, vite 7.3.1, zod 4.3.5

### Fixed

- Admin: fixed `defaultThumbResizeServer` not being parsed when loading presets from Nostr events
- Admin: fixed relay URLs not being normalized when added in the preset editor
- Shorts: fixed spacebar not working in comment input field (global keyboard handler now skips input/textarea elements)
- Notifications: comments on kind 1 events (text notes) are now properly filtered out; only comments on video events (kinds 21, 22, 34235, 34236) trigger notifications
- Upload: fixed video quality detection using max dimension instead of height; a 1086x720 video was incorrectly labeled 480p instead of 720p (now uses shorter dimension which matches standard resolution naming)
- UI: fixed LanguageSelect dropdown appearing behind dialog by adding z-index to SelectContent
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
- Video player: fixed old video continuing to play/download when navigating between videos (added cleanup to pause video and abort pending downloads on unmount and URL change)
- Video cards: disabled hover video preview feature (causes unnecessary bandwidth usage); removed setting from General Settings
- Video player: improved autoplay reliability - now listens for multiple events (canplay, loadeddata) and triggers play immediately when HLS manifest is parsed
- Comments: fixed L-shaped threading connector line not aligning with avatar center (changed height from h-5 to h-4)
- Video page: fixed tag/language badges wrapping on small screens (now scroll horizontally with flex-nowrap and whitespace-nowrap)
- Home page: fixed loading skeleton layout mismatch - removed gap-4 from grid and matched wrapper/padding to actual page structure (max-w-560, sm:px-2)
- Home page: added category bar skeleton to loading state to prevent layout shift when categories appear
- Shorts: improved scroll performance - wrapped ShortVideoItem with React.memo and custom comparison function, changed getMaxWidth from useCallback to useMemo, increased IntersectionObserver throttle from 16ms to 100ms with simplified thresholds, added debounced URL updates with startTransition for non-blocking navigation, added GPU acceleration hints (will-change, translateZ) on scroll container
- VideoGrid: fixed O(n²) performance issue - replaced findIndex inside map loop with pre-computed Map for O(1) index lookup when rendering portrait/shorts videos
- Shorts grid: fixed inconsistent card sizes during loading - thumbnail container now has fixed aspect ratio regardless of thumbnail load state; skeleton, blurhash placeholder, error state, and thumbnail all use absolute positioning within the container
- Comments: fixed comments being lost when editing addressable video events (kinds 34235, 34236) - now uses NIP-22 address tags (`A`/`a`) for proper linking that persists across edits; also queries by both event ID and address for backwards compatibility
- Reactions/Zaps: fixed reactions and zaps being lost when editing addressable video events (kinds 34235, 34236) - now publishes with both `a` tag (address) and `e` tag (event ID) for NIP-25 reactions; queries zap receipts by both `#e` and `#a` filters; liked videos list now extracts both event IDs and addresses from reaction events

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
