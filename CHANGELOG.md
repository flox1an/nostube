# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Bunker URIs no longer persist the `secret` query parameter to localStorage — the secret is only needed during the initial NIP-46 handshake; the client key alone restores sessions
- Stripped `secret` from `nostube:last-bunker` localStorage entry and from QR-code login persistence
- Auth token fragment logging in `blossom-upload.ts` now gated behind `import.meta.env.DEV` — previously leaked first 50 chars of Nostr auth tokens to the console in production
- nsec input field now uses `type="password"` to prevent shoulder surfing
- Added `autocomplete="off"` to nsec and bunker URI inputs to prevent browser credential caching
- nsec is now cleared from React state in SignupDialog after successful login (was already done in LoginDialog)

### Fixed

- Follow import dialog flashing briefly on page load — now waits for the kind 10020 follow set query to complete (EOSE) before deciding whether to show the import prompt

## [0.2.20] - 2026-03-08

### Added

- Re-enabled OG meta tags, Twitter Player Cards, and oEmbed for video pages using Vercel Edge Runtime — bots get injected meta, browsers get the unmodified SPA
- Edge-compatible nostr relay fetching (`api/_nostr.ts`) with 5s timeout and graceful fallback to SPA on any failure

### Changed

- Subscription/home page auto layout now shows 2 rows of long-form videos per 1 row of vertical/short videos (was 1:1 interleaving)
- Reduced ESLint warnings from 86 to 35 (remaining are `no-explicit-any` in mp4box-atoms.ts/Mp4DebugPage.tsx): replaced `any` with proper types across 14 files, fixed 20 `react-hooks/exhaustive-deps` warnings, suppressed 9 `react-refresh/only-export-components` in context/provider files; removed `noInlineConfig: true` from ESLint config to allow inline directives
- Refactored embed server code: `api/_nostr.ts` now imports shared `decodeIdentifier`, `fetchEvent`, `parsePageUrl`, `buildPageUrl` from `server/nostr.ts` instead of duplicating them; oembed URL parsing extracted into reusable `parsePageUrl` helper
- BUD-11 compliance: authorization tokens now use Base64url encoding without padding (instead of standard Base64) as required by the spec
- BUD-11 compliance: all upload, mirror, and delete auth tokens now include `server` tags scoped to the target domain, preventing token replay on other servers
- Mirror operations now create per-server auth tokens instead of reusing one unscoped token across all servers
- Reduced ESLint warnings from 131 to 86: wrapped `use$() ?? []` fallbacks in `useMemo` to stabilize deps (12+ hooks/components), fixed `prefer-const`, removed dead `eslint-disable` comments and unused `discoverDvm` callback, fixed `consistent-type-imports`, wrapped `signer` conditional and `getEffectiveMode` in memoized hooks

### Fixed

- oEmbed discovery URL in `<link>` tag contained a doubled naddr identifier because Vercel rewrites append matched path params as query parameters — now constructs canonical page URL from known parts instead of using `request.url` (fixed in both Vercel edge and standalone Hono server)
- Embed URLs in OG/oEmbed meta tags used `#` fragment instead of `?v=` query parameter, so the embed player couldn't read the video ID
- Author page not showing latest videos due to stale IDB cache — added 4-hour TTL filter to `cacheRequest` so timeline loaders always fetch fresh data from relays

## [0.2.19] - 2026-03-07

### Changed

- Disabled Vercel serverless routes (`/v/`, `/short/`, `/playlist/`, `/oembed`) — function kept timing out despite multiple fixes; routes now fall through to SPA

## [0.2.18] - 2026-03-07

### Added

- Social media embed support: Open Graph meta tags, Twitter Player Cards, and oEmbed endpoint for rich video link previews on Twitter/X, Discord, Slack, WhatsApp, Telegram, etc.
- Hono server layer (`server/`) that injects meta tags for crawler bots while serving the unmodified SPA to regular users
- `/oembed?url=...` JSON endpoint for oEmbed-compatible consumers (WordPress, Medium, etc.)
- Standalone server mode (`npm run server:dev`) for self-hosted deployments with embed support
- Vercel serverless function (`api/index.ts`) routes `/v/`, `/short/`, `/playlist/` through bot detection

### Changed

- Hide "Transformation Needed" alert for small H.264 files (< 50 MB) since the codec is already widely compatible

## [0.2.17] - 2026-03-06

### Changed

- Hide Subscriptions nav entry when user has no follows (Sidebar, MiniSidebar, MobileBottomNav)

## [0.2.16] - 2026-03-06

### Added

- Bunker login input now remembers the last used value in localStorage, so returning users can connect with one click

## [0.2.15] - 2026-03-05

### Fixed

- `.well-known/nostr.json` not served on Vercel — excluded `.well-known/` from SPA catch-all rewrite and service worker navigate fallback, added CORS headers

## [0.2.14] - 2026-03-05

### Fixed

- Bunker auth URL popup now opens automatically on non-iOS platforms; manual "Open Authorization" link is only needed on iOS where popups are blocked

## [0.2.13] - 2026-03-05

### Added

- NIP-05 address support in bunker login — enter `user@domain` or just `domain` (e.g. `bunker.slidestr.net`) to resolve pubkey and relays via `.well-known/nostr.json` and connect automatically

### Fixed

- Bunker login auth URL popup blocked on iOS Safari and PWA — now shows a tappable "Open Authorization" link instead of using `window.open()`

## [0.2.12] - 2026-03-03

### Added

- Media Session API integration for background audio playback on iOS and lock screen / Control Center media controls (play, pause, seek, next/previous track in playlists)

## [0.2.11] - 2026-03-03

### Removed

- "Available offline" badge from video page

### Fixed

- Share URL relay hints now include all discovered relays (not just the first relay that responded)

## [0.2.10] - 2026-03-02

### Fixed

- Relay hints in naddr/nevent links now use only seen + hint relays (capped at 3) instead of all configured relays
- Video page now queries the author's NIP-65 outbox relays when loading events, so videos on personal relays are discoverable

## [0.2.8] - 2026-03-01

### Added

- "Available offline" badge on video page when video is cached on a configured streaming server (excludes redirected responses)
- Second-pass comment loading to discover replies from external clients that only tag the parent comment
- Updated streaming server help text with bullet point use cases across all locales
- Pre-filled streaming server input with `http://127.0.0.1:24242`

### Changed

- Login button is now primary (filled) instead of outline when logged out
- Improved settings section spacing with `divide-y` separators and larger headings

### Fixed

- "Available offline" badge no longer shows when caching server redirects to origin
- "Set as thumbnail" button not working at video position 0
- Maximum update depth exceeded crash when deleting an upload draft

## [0.2.7] - 2026-03-01

### Added

- Availability indicator (green/red dot) next to each caching server in settings, with HEAD request check and 5s timeout

### Changed

- Improved settings section spacing: larger headings (`h3`), `divide-y` separators, and more vertical padding between sections in General settings

### Fixed

- Maximum update depth exceeded crash when deleting an upload draft (infinite re-render loop in UploadPage)
- "Set as thumbnail" button not working at video position 0 in thumbnail generation from video

## [0.2.6] - 2026-02-25

### Changed

- Reorganized user menu for better usability: Profile & Wallet first, followed by Content (Playlists, Upload), then Settings, and Account Management last
- Updated "Playlists" icon in user menu to `ListVideo` for better visual indication
- Added "Add account" button directly to the account switcher menu

## [0.2.5] - 2026-02-25

### Changed

- Home page (`/`) now shows Subscriptions feed when logged in with follows, Global feed otherwise
- Navigation order adapts: Subscriptions first when user has follows, Home first otherwise
- Added `/explore` route for Global feed access when Subscriptions is the home view
- Auto-close sidebar when navigating to a video page

### Fixed

- Reply to kind 1 notes now uses kind 1 (NIP-10) instead of kind 1111, so replies are visible in all clients

## [0.2.4] - 2026-02-24

### Added

- Generic `useDraftPersistence<T>` hook for localStorage + NIP-78 Nostr sync with debounced saves, milestone detection, and encrypted backup
- Generic `useFileUpload` hook wrapping blossom upload/mirror/delete pipeline with progress tracking

### Changed

- Refactored `useUploadDrafts` to thin wrapper around `useDraftPersistence<UploadDraft>`, reducing ~460 lines to ~100 lines
- Migrated `UploadManagerProvider` draft management to `useDraftPersistence`, eliminating ~220 lines of duplicated sync logic
- Refactored `useVideoUpload` to use `useFileUpload` for video, thumbnail, and subtitle uploads
- Slimmed `draft-storage.ts` to upload-specific helpers only (`createEmptyDraft`, `isMilestoneUpdate`)
- Added backward-compatible `drafts` key reading for legacy localStorage data migration

## [0.2.3] - 2026-02-24

### Added

- Online/offline connectivity indicator banner below header with animated slide-in and "Back online" toast

## [0.2.2] - 2026-02-23

### Fixed

- Like/dislike button padding (px-4) and memoized AppContext value to reduce unnecessary re-renders

## [0.2.1] - 2026-02-23

### Changed

- Sidebar and mini sidebar now highlight the current page with `bg-accent` background
- Mini sidebar items have rounded right corners
- Removed "Watch Later" from sidebar (disabled/unused feature)

## [0.2.0] - 2026-02-23

### Added

- Service worker for app shell caching — app loads instantly and works offline (vite-plugin-pwa)

## [0.1.6] - 2026-02-23

### Fixed

- Even padding on like/dislike buttons in video page (pr-0 → px-2)
- Upload thumbnail "Generate from video" tab now works when videos are uploaded via blossom (falls back to uploaded variant URL)
- Removed redundant thumbnail preview section; "Set as thumbnail" button sits below the slider and waits for video frame capture

### Changed

- Added upload button to user dropdown menu on mobile
- Hidden "Previous", "Next", and "Save Draft" text labels on mobile upload navigation (icon-only)
- Hidden thumbnail tab labels on mobile (icon-only)
- Reordered thumbnail tabs: Generate from video (default) → Upload → Enter URL

## [0.1.5] - 2026-02-23

### Fixed

- Zap notifications incorrectly displayed as comment notifications by adding explicit `notificationType` discriminator to notification type guards
- Filter zap notifications to only show zaps on video events (kinds 21, 22, 34235, 34236), ignoring zaps on comments or other event types
- Increased gap between reaction icons and counts in video page (gap-1 → gap-2)
