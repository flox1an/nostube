# Service Worker App Shell Caching — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache the app shell via a service worker so the app loads instantly and works offline.

**Architecture:** Use `vite-plugin-pwa` with Workbox `generateSW` mode. The plugin auto-generates a service worker at build time that precaches all Vite build output (JS, CSS, HTML, icons). Silent auto-update via `skipWaiting` + `clientsClaim`.

**Tech Stack:** vite-plugin-pwa, Workbox

---

### Task 1: Install vite-plugin-pwa

**Step 1: Install the dependency**

Run: `npm install -D vite-plugin-pwa`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vite-plugin-pwa dependency"
```

---

### Task 2: Configure VitePWA plugin in vite.config.ts

**Files:**

- Modify: `vite.config.ts`

**Step 1: Add VitePWA import and plugin**

Add import at top of `vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa'
```

Add `VitePWA()` to the plugins array (after `react()`):

```ts
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    // Precache all build assets
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    // Exclude embed entry point and build stats
    globIgnores: ['embed.html', 'stats.html', 'embed-*.html'],
    // SPA navigation fallback
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/embed/],
    // Silent auto-update
    skipWaiting: true,
    clientsClaim: true,
  },
  manifest: false, // Use existing manifest.webmanifest from public/
  injectRegister: 'auto',
}),
```

Key config choices:

- `registerType: 'autoUpdate'` — auto-registers SW and updates silently
- `manifest: false` — keeps existing `public/manifest.webmanifest` as-is (plugin won't generate one)
- `globPatterns` — matches all static assets by extension
- `globIgnores` — excludes embed pages and stats
- `navigateFallback` — SPA routing: all navigations serve `index.html`
- `navigateFallbackDenylist` — embed pages bypass the SW fallback

**Step 2: Build and verify SW is generated**

Run: `npm run build`

Expected: `dist/sw.js` and `dist/workbox-*.js` files exist alongside the normal build output.

Run: `ls dist/sw.js dist/workbox-*.js`

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: configure vite-plugin-pwa for app shell caching"
```

---

### Task 3: Remove manual manifest link from index.html

**Files:**

- Modify: `index.html`

**Step 1: Remove the manual manifest link**

The `vite-plugin-pwa` with `injectRegister: 'auto'` injects the SW registration script. However, since we set `manifest: false`, the existing `<link rel="manifest">` in `index.html` should stay — the plugin won't inject one.

**Actually — KEEP the manifest link.** Since `manifest: false` tells the plugin not to generate/inject a manifest, the existing manual `<link rel="manifest" href="/manifest.webmanifest" />` in `index.html` must remain.

No changes needed to `index.html`.

---

### Task 4: Verify the full build and SW behavior

**Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass (SW is build-time only, no test impact).

**Step 2: Build and preview**

Run: `npm run build && npm run start`

Open `http://localhost:8080` in Chrome. Open DevTools > Application > Service Workers.
Expected: A service worker is registered and active.

**Step 3: Verify precache**

In DevTools > Application > Cache Storage, look for a workbox cache entry.
Expected: Contains JS chunks, CSS, `index.html`, icons.
Expected NOT to contain: `embed.html`, `stats.html`.

**Step 4: Test offline**

In DevTools > Network tab, check "Offline". Reload the page.
Expected: App shell loads from cache. Nostr data won't load but app renders.

**Step 5: Update changelog and bump version**

Update `CHANGELOG.md` with a new entry under `[Unreleased]` or a new version:

```markdown
### Added

- Service worker for app shell caching — app loads instantly and works offline
```

**Step 6: Final commit**

```bash
git add CHANGELOG.md
git commit -m "feat: add service worker for offline app shell caching"
```
