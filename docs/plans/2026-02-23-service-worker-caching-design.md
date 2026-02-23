# Service Worker App Shell Caching

## Goal

Cache the app shell (JS, CSS, HTML, icons, fonts) via a service worker so the app loads instantly and works offline. Videos and Nostr data are NOT cached by the SW — IndexedDB already handles Nostr query caching, and video file caching is out of scope.

## Approach

Use `vite-plugin-pwa` with Workbox `generateSW` mode. The plugin generates a service worker at build time that precaches all Vite build output with content-hash-based versioning.

## Service Worker Config

- **Mode:** `generateSW` (no manual SW file)
- **Registration:** Auto-register on app load
- **Update strategy:** `skipWaiting: true` + `clientsClaim: true` — silent auto-update, user gets latest code on next navigation
- **Navigation fallback:** All navigations fall back to `index.html` for SPA routing
- **Navigation denylist:** `/embed*` paths excluded (separate entry point)

## What Gets Precached

All Vite build output from `dist/`: JS chunks, CSS, `index.html`, fonts, icons, static images from `public/`.

### Excluded from precache

- `embed.html` and its inlined assets
- `stats.html` (build visualizer)
- `manifest.webmanifest` (referenced separately)
- Any files exceeding a reasonable size threshold

## Runtime Caching

None. Nostr relay data lives in IndexedDB. Video files are external URLs served by blossom servers.

## Files Changed

1. `vite.config.ts` — add `VitePWA()` plugin
2. `index.html` — remove manual `<link rel="manifest">` (plugin injects it)

## Offline Experience

- App shell loads from cache (instant, no network needed)
- Nostr relay connections fail gracefully (app already handles loading states)
- IndexedDB data may render previously-loaded content
- Videos won't play (external URLs, not cached)
