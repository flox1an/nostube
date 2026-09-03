# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Routine dependency audit: fixed a moderate `qs` DoS/array-limit-bypass advisory (transitive via `@modelcontextprotocol/sdk` → `express` → `body-parser`) with `npm audit fix`, resolving `qs` to 6.16.0; `npm audit` now reports 0 vulnerabilities; bumped `@cashu/cashu-ts`, `@types/node`, `eslint-plugin-react-refresh`, `globals`, `hls.js`, `i18next`, `lucide-react`, `mediabunny`, `nostr-tools`, `react-hook-form`, `react-i18next`, `react-router-dom`, and `typescript-eslint` to their latest in-range patch/minor versions; `@vitejs/plugin-react` (6.x) and `typescript` (7.x) major upgrades deliberately deferred
- `decryptNcryptsec` now passes an explicit unlimited length to `bech32.decodeToBytes` (matching the existing unlimited `bech32.encode` call), fixing NIP-49 `ncryptsec` decoding after `@scure/base` 2.4.0 started enforcing the default 90-character bech32 length cap on decode
- `useImageCascade` races the proxied thumbnail against its raw source: if the imgproxy preset/insecure request hasn't loaded within 900ms, the raw image is shown immediately while a hidden preloader keeps waiting for the proxied one in the background and swaps it back in once ready (already warm in the browser cache). Fixes a 2-3s skeleton-to-thumbnail delay on the home grid introduced by the unauthenticated-preset thumbnail switch, caused by per-image on-demand imgproxy transcoding with no fast bypass for slow origins or a degraded proxy
- Infinite scroll paging delay reduced from ~5s to ~300ms — early-complete now watches the processed video list instead of raw events; `loading` and `subscriptionActive` are released as soon as the first new videos appear in the rendered grid rather than waiting for relay EOSE or a safety timeout; relay request timeout reduced from 5 s to 2 s as a fallback for silent relays; `next()` uses refs for `loading`/`exhausted` so its callback reference is stable and the re-subscribe loop that caused the previous OOM fix cannot recur
- Image thumbnails, profile images, video posters, embeds, and preloads now resolve directly against imgproxy's fixed preset routes (`GET /v1/preset/{preset}/{sha256}[.{ext}]`) — no signing, authentication, mint request, batching, or expiry-aware caching; the previous NIP-98-authenticated `/v1/mint` flow is removed entirely; a personal, browser-local imgproxy endpoint can still override Nostube's built-in default; every preset request now includes the source Blossom server's bare hostname as an `xs` hint (derived from the media URL itself, no scheme) and, where the author's pubkey is known, an `as` hint for a relay-side server-list fallback
- `RichTextContent`'s inline image rendering (comment bodies, video/note descriptions, profile bios) now threads the rendering event's author pubkey through `CollapsibleText` as the `as` hint for preset thumbnail requests — wired from the comment author, video author, current user (for own notes/drafts), or viewed profile's pubkey at each call site
- Non-Blossom image and video URLs (arbitrary source URLs without a matching hash) now proxy through imgproxy's legacy unsigned `/insecure/f:webp/q:.../rs:.../plain/<url>` route, mirroring the same three preset output shapes (`feed-preview-v1`, `profile-avatar-v1`, `embed-card-v1`) as the Blossom-hash preset route; `useImageCascade` picks the route per source (preset for Blossom hashes, insecure directives otherwise) and falls back to the raw URL if the proxied request fails, same as the existing Blossom fallback; `VideoPlayer`'s poster and the embed player's content-warning poster now go through this same cascade instead of a one-shot preset lookup with no fallback

### Added

- Contribute variant flow — video pages can now re-encode an existing MP4 source in the browser, upload generated MP4 variants to selected Blossom servers, publish kind 1063 announcements, and merge discovered contributed variants into the player quality list
- HLS audio renditions are now tracked as separate streams throughout the upload pipeline: `HlsVariantStream` gains `type` and `language` fields; `browser-transcode-upload-manager` parses `#EXT-X-MEDIA:TYPE=AUDIO` entries from the master playlist, includes their segments in the upload segment grid, and pushes audio entries into `hlsVariants`; `VideoVariantsTable` renders audio rendition rows (with music icon, language column, "Audio Rendition" badge) separately from video variant rows
- Upload wizard now runs browser transcode/upload in the background while users fill details: the six-step flow is consolidated into Source, Details, and Review screens with a processing rail, readiness checklist, auto-generated thumbnails, and preserved draft/deep-link behavior
- Mute user from comment dropdown — "Mute user" option in comment burger menu adds the author's pubkey to a localStorage mute list; muted users' comments are hidden in video comment threads and their videos are excluded from all feeds via the same `useReportedPubkeys` filter used for preset-blocked and illegally-reported pubkeys

### Changed

- Updated all dependencies to latest compatible versions: applesauce-\* 5.x→6.x, blossom-client-sdk 4.x→5.x, @hono/node-server 1.x→2.x, hls.js, nostr-tools, react, react-router-dom, tailwindcss, and many others; TypeScript stays on 5.9.x and Vite on 7.x due to transitive dependency constraints
- Routine dependency audit: `npm audit` reports 0 vulnerabilities; bumped `@testing-library/react`, `@types/node`, `eslint-plugin-react-refresh`, `hono`, `lint-staged`, `lucide-react`, `mediabunny`, `react-intersection-observer`, and `terser` to their latest in-range patch/minor versions; `@vitejs/plugin-react` (6.x) and `typescript` (7.x) major upgrades deliberately deferred
- Migrated to applesauce v6 API: replaced `FactoryProvider`/`FactoryContext` with `ActionsProvider`/`ActionsContext` and `ActionRunner`; replaced `BlossomClient.createUploadAuth/createDeleteAuth` with standalone functions; updated `relayPool.req()` subscriber to handle `GroupReqMessage` (type-discriminated messages)
- ESLint config now explicitly lists only classic react-hooks rules (`rules-of-hooks`, `exhaustive-deps`) instead of spreading `recommended`, avoiding unintended React Compiler rules from eslint-plugin-react-hooks v7.1.1
- Vitest now excludes `.claude/` and `.worktrees/` directories to prevent picking up test files from git worktrees

### Changed

- Video debug dialog merges "Blossom Server Availability by Variant" and "HLS Stream" into a single tab view — HLS m3u8 variants are removed from the server-availability tab list; each HLS master playlist gets its own "HLS Stream" tab showing the full stream tree with per-node server checks

### Added

- HLS stream tree in the video debug dialog — for events with an HLS master playlist, a new section shows a two-column layout: left side is a tree of master → variant streams (lazy-fetched on expand) → init fragment + collapsible segment list; right side shows a direct HEAD check + per-configured-Blossom-server availability for the selected node

### Fixed

- URLs with a hash-looking filename nested under subdirectories are no longer mistaken for Blossom blobs — per the Blossom spec a blob lives directly at the server root (`/{sha256}[.{ext}]`), so e.g. `https://bbs.kawa-kun.com/media/2f/ff/ed/<hash>.webm` is an ordinary CDN URL and now routes through the imgproxy `/insecure/` directive route instead of the hash-preset route (which 404'd because the path prefix isn't a content hash)
- Grid thumbnails no longer regress from a loaded image back to a skeleton — `useImageCascade`'s 900ms proxied/raw race timer kept running after the proxied thumbnail had already decoded (its `onLoad` was a no-op), so every card in a grid flipped its `src` to the raw source 900ms after mount: a full-grid re-fetch storm (rate-limited on large shorts grids) plus a visible loaded-image → placeholder regression. `onLoad` now records the decoded candidate, which cancels the race, keeps the raw image on screen once it wins, and exposes `loaded`/`loadedSrc` so `VideoCard` and `VideoSuggestions` keep painting the last decoded thumbnail while the next candidate loads instead of dropping to blurhash/skeleton. Racing is also opt-out (`race: false`) and disabled for non-`priority` (lazy, off-screen) cards, whose `<img>` has not started fetching — measured on a 91-short profile grid: 297 → 86-164 image requests, and 32 painted thumbnails that previously vanished at ~2s now stay painted
- SmartHomePage no longer flashes `HomePage` before swapping to `SubscriptionsPage` on every hard reload for logged-in users — the route now waits for the kind-10020 follow set load (`followSetLoaded` from `useFollowSet`) before choosing a child page, eliminating the double thumbnail-grid fade-in (grid mounts once with the chosen page instead of mounting twice with two different timelines)
- Extracted `PageLoader` to `@/components/PageLoader` so `SmartHomePage` can reuse the same skeleton as the Suspense fallback; transition between Suspense fallback and the gate's own loader is visually seamless
- Contribute-variant dialog now reads its Blossom server list directly from `useAppContext` (config.blossomServers) instead of taking a `blossomServers` prop — the dialog and the NosTube settings stay in sync automatically; previously the dialog received a snapshot of the config at VideoPage render time, so newly added servers didn't appear without a re-mount
- Inline add-server UI in the contribute-variant dialog — an input + "Add" button below the server list lets users add a new Blossom server right from the dialog (writes to config.blossomServers, auto-selects the new server for the current contribution, validates against the blocked-server list and duplicates); a "Manage in settings" link opens `/settings/network#blossom` in a new tab for advanced editing (tags, removal)

- Video page blank (left side dark / not rendered) for events whose only video source is an HLS master playlist — `application/vnd.apple.mpegurl` was excluded by a `startsWith('video/')` filter in `processEvent`, so `video.urls` came out empty and the player returned `null`; HLS MIME types and `.m3u8` URLs are now accepted as valid video variants
- HLS variants no longer filtered out by the codec-compatibility layer on Chrome/Firefox — `canPlayType('application/vnd.apple.mpegurl')` returns empty string on non-Safari browsers (hls.js handles them), so the check now short-circuits to `true` for both `application/vnd.apple.mpegurl` and `application/x-mpegurl`

### Added

- Split publish button on the upload review step — the left side publishes as before; the right chevron opens a dropdown with a checkbox per configured write relay so users can target specific relays; button label updates to "Publish to N relays" when a subset is selected; falls back to a plain button when only one relay is configured

### Changed

- HLS segment and variant playlist uploads now run 2 at a time instead of sequentially — reduces total upload time roughly in half for typical streams

### Fixed

- HLS upload progress now shows uploaded / total MB alongside the file count ("3/42 files · 12.4 / 148.2 MB") — `uploadedBytes` and `totalBytes` were already tracked but not displayed

- Deleting a draft with HLS media now removes all uploaded files (segments, init fragments, variant playlists, and master playlist) from Blossom servers — previously only MP4 uploads were deleted because HLS blobs were not stored in the draft; all HLS blobs are now saved to `uploadedBlobs` during upload

- HLS browser transcode now uses HEVC for higher-resolution streams and H.264 only for the lowest stream — previously all HLS streams were encoded as H.264; the resolution picker now shows the correct codec label per stream, and the hint text reflects mixed-codec output when HEVC is supported

### Added

- Browser transcode UI now has a format toggle (MP4 / HLS Adaptive) and per-resolution checkboxes; selecting HLS encodes all checked resolutions into one adaptive multi-bitrate stream (H.264); selecting MP4 produces one file per resolution; default pre-selects the highest available resolution plus 480p fallback
- HLS preview button in the upload flow — after a browser HLS transcode and Blossom upload complete, a "Preview HLS" button appears that opens a player dialog (hls.js on Chrome/Firefox, native on Safari) showing the uploaded master playlist; makes it easy to verify the stream before publishing
- Play button in the HLS Streams header row of the video variants table — previews the master playlist directly, complementing the per-variant play buttons on each stream row

### Fixed

- HLS master playlist URL is now included in the published video event — the `inputMethod` was incorrectly set to `'file'` with empty `uploadedBlobs`, so `buildImetaTag` couldn't find the URL; changed to `'url'` so the master playlist is written to the `imeta` tag; master playlist URL is also logged to the console for debugging
- HLS upload progress bar now shows immediately at 0% when upload starts and displays file count (X/Y files) and percentage label next to the bar; previously the bar only appeared after the first segment completed and had no label, making progress invisible
- HLS upload progress bar now handles relative segment paths generated by mediabunny — variant playlists that reference segments as relative filenames (e.g. `segment-0.m4s` inside `variant-0.m3u8`) are correctly rewritten to absolute Blossom URLs; previously only full paths were matched, leaving the rewritten playlists with broken segment references
- Added dev-mode logging of raw and rewritten m3u8 content to aid debugging of HLS output
- HLS segment and init-file uploads now use `video/mp4` MIME type — mediabunny may emit `video/iso.segment` for CMAF segments which some Blossom servers reject; normalised to `video/mp4` in the upload pipeline
- `uploadFileToMultipleServersChunked` now throws the first server error when all uploads fail instead of silently returning an empty array; surfaces the real failure reason (e.g. auth error, CORS, server rejection) rather than a generic "Failed to upload" message
- Chunked upload fallback now triggers for **any** chunked-upload failure (previously only "does not support PATCH" and CORS errors); a `401` on PATCH now retries with a regular PUT, fixing HLS segment uploads to servers like `almond.slidestr.net` that accept PUT but return 401 for PATCH
- Regular PUT (BUD-01/02) is now the default upload method; BUD-10 PATCH chunked upload is only attempted for files > 100 MB where resumability is actually beneficial — fixes unnecessary PATCH auth failures for small files like HLS segments and init fragments
- Authorization tokens reverted to standard Base64 (with `=` padding) — BUD-01/NIP-98 require plain Base64, not Base64url; the earlier "Base64url without padding" change caused `Unauthorized: Failed to decode base64: Invalid padding` errors on all Blossom servers
- `uploadFileToMultipleServersChunked` now accepts a `skipExistenceCheck` option; HLS segment/init/playlist uploads set it to `true` since those files are freshly generated and cannot already exist — eliminates one HEAD request per file

- Browser transcoding UI now automatically selects "Keep original" when the source video is already optimised or no high-resolution transcode variants are produced; ensures the original video is always preserved as the primary source when no conversion is needed
- No loading indicator during Blossom upload when server does not support chunked uploads (BUD-10) — fallback regular upload never called `onProgress`, leaving the UI showing nothing between dropping the file and the upload completing; now shows a spinner with "Uploading…" text whenever `uploadState === 'uploading'` and no chunk progress is available yet

- Page crash (OOM / "Aw, Snap") when scrolling through 700+ videos on a profile page — the early-complete timer (500 ms) was setting `loading=false` while the relay subscription was still open; `useInfiniteScroll` immediately re-triggered `loadMore`, canceling and restarting the subscription in a tight loop, opening hundreds of WebSocket connections and exhausting browser memory; fixed by tracking `subscriptionActive` separately from `loading` and blocking re-triggers while the subscription is still running

### Added

- In-browser video transcoding before upload - when a file is dropped, NosTube probes the source codec, resolution, and bitrate, then offers to optimise it in-browser via WebCodecs/mediabunny before uploading to Blossom; produces an HEVC 1080p primary and H.264 480p fallback by default, remains skippable, uses a 15 Mbps re-encode threshold for compatible codecs, and falls back to direct upload when WebCodecs is unavailable
- DVM selector UI — when multiple transcoding DVMs are available, clicking "Create Selected" now shows a card list of available services with hardware type, estimated time per resolution, queue depth, and price; user can pick one before starting, or let the auto-selector choose the lowest-queue DVM when only one is present
- Structured progress parsing in `UploadManagerProvider` — reads `phase`, `speed`, `queue_position` tags from kind 7000 DVM feedback events (with fallback to string-detection for older DVMs); `speed` and `queuePosition` now exposed in `TranscodeProgress`
- DVM capability parsing in `useDvmTracker` — kind 31990 announcements now populate `hardware`, `speeds`, `maxConcurrent`, `queueLength`, `codecs`, and `rate` on `TrackedDvm`; auto-selection picks the DVM with lowest queue length
- `preferredDvmPubkey` parameter on `startTranscode` in `UploadManagerProvider` and `useDvmTranscodeManager` — pass a DVM pubkey to skip auto-selection and send a directed NIP-90 request to that specific service
- Payment flow for paid DVMs — `DvmPayment` component shown when a DVM sends a `payment-required` bid; supports Cashu wallet (selects existing proofs at the DVM's mint) and NWC (mints fresh tokens via Lightning then sends); payment event published as kind 7000 with Cashu token; `onPaymentRequired` callback threads from `startTranscode` through `processResolution` to the UI layer; `DvmTranscodeAlert` wires the callback and interrupts all other states to show the payment card until the user pays or cancels
- Context-aware transcode recommendation message — idle state of the transcode alert now shows a specific reason based on the video's codec (e.g. "Your video uses AV1, which isn't supported on all devices") or resolution (e.g. "Your video is 4K — most viewers watch at 720p or lower")
- DVM heartbeat monitor — during active transcoding, checks every 30s for DVM silence; warns after 90s and rejects the job with a user-friendly error after 3 minutes of no response

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
