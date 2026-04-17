# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Page crash (OOM / "Aw, Snap") when scrolling through 700+ videos on a profile page — the early-complete timer (500 ms) was setting `loading=false` while the relay subscription was still open; `useInfiniteScroll` immediately re-triggered `loadMore`, canceling and restarting the subscription in a tight loop, opening hundreds of WebSocket connections and exhausting browser memory; fixed by tracking `subscriptionActive` separately from `loading` and blocking re-triggers while the subscription is still running

### Added

- DVM selector UI — when multiple transcoding DVMs are available, clicking "Create Selected" now shows a card list of available services with hardware type, estimated time per resolution, queue depth, and price; user can pick one before starting, or let the auto-selector choose the lowest-queue DVM when only one is present
- Structured progress parsing in `UploadManagerProvider` — reads `phase`, `speed`, `queue_position` tags from kind 7000 DVM feedback events (with fallback to string-detection for older DVMs); `speed` and `queuePosition` now exposed in `TranscodeProgress`
- DVM capability parsing in `useDvmTracker` — kind 31990 announcements now populate `hardware`, `speeds`, `maxConcurrent`, `queueLength`, `codecs`, and `rate` on `TrackedDvm`; auto-selection picks the DVM with lowest queue length
- `preferredDvmPubkey` parameter on `startTranscode` in `UploadManagerProvider` and `useDvmTranscodeManager` — pass a DVM pubkey to skip auto-selection and send a directed NIP-90 request to that specific service

- Trust score badge (TrustBadge component) — shows a colored shield icon with score percentage next to usernames, with tooltip showing trust level (High/Medium/Low)
- Trust badge displayed next to comment author names in comment threads
- Trust badge displayed next to author display name on profile pages
- Trust badge displayed next to video author name on video page
- Trust badge displayed next to each user in the profile Following tab
- Clickable trust badges — clicking any trust score badge opens a dialog with full score breakdown including social distance, distance weight, and individual validator scores with descriptions
- IndexedDB caching for trust scores with 24-hour TTL — scores persist across page reloads and sessions
- Batched trust score requests — collects pubkeys over a 300ms window and fetches in groups of 50, so rendering 100 comments triggers 2 network requests instead of 100
- Two-tier trust score cache — in-memory Map for instant synchronous reads backed by IndexedDB for persistence
- NosTube user level system in trust score dialog — RPG-style ranks (Novice >0%, Apprentice >20%, Adept >50%, Master >75%, Grandmaster >90%) with colored progress bar and tier markers, replacing the plain global score percentage
- Trust badge tooltips now show RPG level name instead of High/Medium/Low
- Trust score filter on explore, category, and hashtag pages — small shield toggle button (green outline when active) hides videos from authors with personalized trust score below 40% or global NosTube score below 20%; enabled by default, click to toggle off and see all videos
- Reusable `useTrustFilter` hook and filter button — extracted from HomePage for consistent trust filtering across all feed pages
- Trust score filter on video recommendations sidebar — always on for logged-in users, same thresholds as explore (personal >= 40%, global >= 20%)
- Trust scores available when logged out — uses an ephemeral key so explore page filtering and recommendations work for anonymous visitors
- Per-relay timing logs in dev mode (`[relay] ⚡`, `✅`, `⏱ TIMEOUT`) on `relayPool.request` to diagnose slow relay response times
- Brand SVG icon components (`YoutubeIcon`, `InstagramIcon`, `TwitterIcon`, `FacebookIcon`) in `src/components/icons/brands.tsx` to replace removed lucide-react brand icons

### Changed

- Trust score filter now whitelists authors in the user's media follow set (kind 10020) — followed creators always pass the filter on explore, category, hashtag, and recommendation pages
- Hashtag page queries now search lowercase, Capitalized, and UPPERCASE variants of the tag — catches videos tagged with any casing convention
- Trust score cache uses stale-while-revalidate — always returns cached values instantly, refetches expired entries in the background; stale entries kept up to 7 days
- Contribute transformation alert requires author global NosTube score ≥ 20%; mirror to blossom alert requires ≥ 10%
- NSFW content filter in settings is locked to "Hide" when user's global NosTube trust score is below 20% or unavailable — shows info banner explaining the restriction
- NsfwTrustGate — automatically resets `nsfwFilter` config to "hide" on login or account switch when global trust score is below 20% or unavailable, so the filter is enforced even if a previous session stored a different value
- Moved broadcast button inline with the relay list in the debug dialog instead of a separate section
- Upgraded all dependencies to latest compatible versions; major upgrades include lucide-react 1.x, nostr-idb 5.x, react-dropzone 15.x, i18next 26.x, react-i18next 17.x

### Fixed

- Infinite scroll pagination no longer waits for all relays to finish before showing new results — `useInfiniteTimeline` now sets `loading=false` 500ms after the first event arrives, so results from fast relays appear immediately; slow relays continue streaming in the background and are re-queried correctly on the next page load
- Notification polling loop — `useNotifications` and `useZapNotifications` were depending on the `user` object in their polling `useEffect`, but `useCurrentUser` creates a new object reference on every render; switching to `user?.pubkey` (a stable string) stops the effect from re-triggering after each fetch completes
- Removed `ditto.pub/relay` from the default preset relay list — it was consistently taking 5+ seconds to send EOSE, blocking the Subscriptions and Explore page load for all users; all other preset relays complete in under 600ms
- Trust scores not loading — ContextVM relay changed to `wss://relay.contextvm.org` (was using wrong relays that couldn't reach the server)
- Trust score response parsing — server returns data in `structuredContent.trustScores` but parser only checked `content[].text`; now supports both formats
- Trust scores not appearing after login — pubkeys requested before login were silently dropped; now flushes pending batch when private key becomes available
- Trust scores not resetting on account switch — in-memory cache, IndexedDB, and ContextVM connection are now cleared only when switching between logged-in accounts; logout preserves cached scores so the ephemeral key can continue serving requests
- Trust score batch size reduced from 50 to 20 pubkeys per request — NIP-44 encrypted responses with 50 scores exceeded the 65535-byte plaintext limit, causing server-side encryption failures
- Trust scores resetting on every re-render — `useTrustScoreProvider` depended on the `user` object reference (new every render) instead of `user.pubkey` (stable string), causing all caches to clear on any config change
- NSFW filter locking to "hide" for high-score users — `isLoading` was false before the first fetch fired, so `globalScore === null` was treated as "unavailable" instead of "loading"; NsfwTrustGate and settings now wait for scores to finish loading before deciding whether to lock

## [0.2.29] - 2026-03-10

### Added

- Broadcast button in the video debug dialog — re-publishes the event to all user relays, default relays, and seen relays

## [0.2.28] - 2026-03-10

### Added

- Default video quality setting in General settings — choose between "Mid quality (720p)" (default) or "Highest available"; player remembers your preference across sessions

## [0.2.27] - 2026-03-10

### Fixed

- Blank pages after deployment caused by stale cached chunks — service worker no longer serves `index.html` for missing `/assets/` files, and a global error handler auto-reloads once on chunk load failures

## [0.2.26] - 2026-03-10

### Added

- Codec selection per resolution in DVM transcode card — each resolution shows a toggleable H.264/H.265 pill
- Default transcode variants changed to 720p H.265 + 360p H.264

### Changed

- Progress log now appears inside the active variant section instead of below all variants
- Transcode progress bar color changed from primary/purple to blue to match the alert theme

## [0.2.25] - 2026-03-10

### Changed

- DVM activity window increased from 10 to 30 minutes so announcements are detected more reliably

## [0.2.24] - 2026-03-10

### Changed

- DVM transcode card now always shows when a DVM is available, regardless of video resolution or codec — allows creating additional resolution variants for any video

## [0.2.23] - 2026-03-10

### Changed

- Embed thumbnail resolution now validates each candidate URL with HEAD requests, tries all `thumb`, `image`, and imeta `image` entries, and falls back to the author's blossom server list (kind 10063) if none are reachable

### Fixed

- Missing thumbnail in social media link previews — `og:image` and `twitter:image` now always present, falling back to the NosTube logo (`og-image.png`) when the video event has no thumbnail
- `og:image` and `twitter:image` not using video thumbnail — server-side meta extraction now reads `image` fields from imeta tags (where thumbnails are stored), not just standalone `thumb`/`image` tags
- Transcode progress view switching from structured multi-variant display to single-line view after ~1 second — stale React closure in DVM feedback handler was losing `resolutionQueue`, `completedResolutions`, and `statusMessages`; now uses `tasksRef` for fresh state in async subscription callbacks

## [0.2.22] - 2026-03-08

### Changed

- Server-side OG meta tag injection now applies to all requests (browsers and bots alike), removed browser-exclusion logic from both Vercel edge and standalone Hono server

## [0.2.21] - 2026-03-08

### Added

- Search bar now accepts npub/nprofile identifiers — pressing Enter navigates directly to the profile page
- Search bar now accepts hashtags (e.g. `#bitcoin`) — pressing Enter navigates to the hashtag page

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
