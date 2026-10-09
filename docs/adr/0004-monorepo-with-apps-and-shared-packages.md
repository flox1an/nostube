# ADR 0004: One monorepo with apps and shared packages

**Date:** 2026-10-08  
**Status:** Accepted (layout); extraction of packages is incremental

## Context

Nostube started as one web app. A second product now exists: a self-hosted Nostube Server (a Rust server in `apps/server`) that serves one creator's video homepage and a creator studio from its own relay and Blossom storage, with no discovery. It currently embeds the web app as an "instance build" that is patched by a config flag (see `apps/server/docs/adr/0005`). That keeps the discovery UI and needs a fail-closed overlay to switch its defaults off.

The history of the web repo had also grown to 523 MB from accidentally committed build output and a video. It was cleaned before the move (history kept, blobs removed, one leaked key redacted).

## Decision

One repository with npm workspaces (`apps/web`, `packages/*`; one root `package-lock.json`, `overrides` in the root `package.json`). The Docker build context is the repository root (`/Dockerfile`):

```
apps/web       Nostube (discovery UI, nostu.be), including the embed player
apps/server    Rust server; embeds the built site, studio and embed
apps/site      creator homepage (videos, profile, playlists), no discovery  [skeleton: profile + video grid + player]
apps/studio    upload and management UI                                      [planned]
packages/core      headless Nostr/Blossom logic, no React                    [started: media URL, HLS, video event, instance config]
packages/widgets   player, video card, comments, login, shadcn/ui base       [skeleton: VideoCard, VideoGrid, VideoPlayer]
```

- **Extract on demand.** The web app moves unchanged into `apps/web`. Packages start empty and take a file only when `site`, `studio` or the embed needs it; `tsc` and lint confirm each move. `site` is built first as a thin slice (one creator, a grid, the player).
- **Internal packages, no publishing.** Apps import TypeScript source from workspace packages. No versioning or npm publish until an outside consumer needs it.
- **Core means "no React", not "no browser".** It keeps using IndexedDB (nostr-idb) and Web Workers and does not run in Node.
- **Core is imported by subpath** (`@nostube/core/media-url-generator`), not through a barrel. Only the type-only modules `app-config` and `preset` are exported from the package root. A barrel would evaluate the whole cluster (including `hls.js`) on the first import and could break the instance boot order, where `setInstanceConfig` must run before the app modules.
- **Known exceptions to injected config:** `createNostubeClient(config)` (`@nostube/core/client`) takes relays, instance policy, cache and debug as arguments and reads no environment. Other core modules still read `import.meta.env.VITE_NSFW_SAFETY` (`content-safety`), `VITE_INSTANCE_BUILD` (`instance-config`) and `DEV` (debug logging), so core runs only in Vite-built apps until these move to injected config. The relay allowlist and the registered instance config stay module-global (`setInstanceConfig`, `allowSignerRelays`); a client with an `instance` refuses to start unless that instance is the registered one.
- **Config is injected.** Core builds its client from a passed-in config (`createNostubeClient(config)`). Site and studio get the config from the server and cannot override it from `localStorage`. Preset, trust and missing-video logic is injected policy, not an import of the timeline.
- **The embed player** is built as a single `embed.html` plus a transcode worker and one chunk; the server must serve these side by side with relative paths and must not send a CSP that blocks its inline scripts. The server hosts it on the instance's own origin.
- **SEO and link previews** stay a later stage. The web app is deployed from its Dockerfile (no Vercel); the server gets a static SPA first, and meta-tag injection later in Rust if needed.
- ADRs and domain glossaries stay per app. Root `docs/adr/` is for the web app and for decisions that span apps.

## Consequences

- The Docker build context is the repository root (`/Dockerfile`, Coolify base directory `/`); every workspace manifest must be copied before `npm ci`. Vercel is no longer used.
- The `@/` alias resolves to `apps/web/src`; files moved into a package need rewritten imports (subpath imports, see above). `components.json` aliases must be updated when web moves onto the widgets.
- ESLint (`no-restricted-imports`) keeps core free of React and `@/`, and widgets free of `@/` and app code.
- The instance build in `apps/web` stays until `apps/site` can replace it; then ADR 0005 of the server is superseded.

## Status of the first slice

- `apps/site` is a skeleton: it loads `/api/config` (contract v1), registers it with `setInstanceConfig`, builds a client with `createNostubeClient` and shows the start creator's profile and videos with the widgets. It is not wired into the Rust server or the Docker image yet.
- The widgets are new, small components. `apps/web` has its own card and player and does not share them yet; moving web onto the widgets is a separate step.
- Widgets use Tailwind utility classes, like web (Tailwind v4). An app that consumes them adds `@source '../../../packages/widgets/src'` to its CSS.
- **Config injection is half done.** `createNostubeClient(config)` exists and web uses it. The preset, trust and missing-video logic is still imported directly by `apps/web/src/nostr/useTimeline.ts`; turning it into an injected policy is the next step, and `useTimeline` cannot move into core before that.
- **The site has no content-warning or 18+ gate.** Web's NSFW safety is on by default. The site is not deployed yet; the gate must exist before it is.
- **The widgets `VideoPlayer` is a placeholder** (native `<video>`, hls.js, the core `PlaybackUrlLadder` with the creator's Blossom servers). It is deleted once the player of `apps/web` moves into `packages/widgets`; the site then uses that one, so both apps play videos the same way. The same applies to `createPlaybackLadder`.
- **Host context.** `@nostube/widgets/host` defines `NostubeHost` (config subset, relay pool, lookup relays) with `NostubeHostProvider`, `useNostubeHost` (throws without a provider) and `useNostubeHostSafe`. The shared hooks (`useProfile`, `useBatchedProfiles`, `useEventZaps`, `useMediaUrls`, `useImageCascade`, `useIsMobile`) live in `@nostube/widgets/hooks/*` and read it. `apps/web` fills it from `AppContext` in `NostubeHostBridge` (app and embed); `apps/site` will fill it from the instance config. `url-discovery` in core takes the pool as an argument.
- **The embed no longer bundles `nostr/core`** (it used the web singleton for URL discovery): `embed.html` shrank from 3.27 MB to 2.47 MB. Discovery now runs on the embed's own relay pool.
