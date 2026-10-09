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
packages/widgets   player, video card, comments, login, shadcn/ui base       [player, hooks, UI primitives, VideoCard, VideoGrid]
```

- **Extract on demand.** The web app moves unchanged into `apps/web`. Packages start empty and take a file only when `site`, `studio` or the embed needs it; `tsc` and lint confirm each move. `site` is built first as a thin slice (one creator, a grid, the player).
- **Internal packages, no publishing.** Apps import TypeScript source from workspace packages. No versioning or npm publish until an outside consumer needs it.
- **Core means "no React", not "no browser".** It keeps using IndexedDB (nostr-idb) and Web Workers and does not run in Node.
- **Core is imported by subpath** (`@nostube/core/media-url-generator`), not through a barrel. Only the type-only modules `app-config` and `preset` are exported from the package root. A barrel would evaluate the whole cluster (including `hls.js`) on the first import and could break the instance boot order, where `setInstanceConfig` must run before the app modules.
- **Known exceptions to injected config:** `createNostubeClient(config)` (`@nostube/core/client`) takes relays, instance policy, cache and debug as arguments and reads no environment. Other core modules still read `import.meta.env.VITE_NSFW_SAFETY` (`content-safety`), `VITE_INSTANCE_BUILD` (`instance-config`) and `DEV` (debug logging), so core runs only in Vite-built apps until these move to injected config. The relay allowlist and the registered instance config stay module-global (`setInstanceConfig`, `allowSignerRelays`); a client with an `instance` refuses to start unless that instance is the registered one.
- **Config is injected.** Core builds its client from a passed-in config (`createNostubeClient(config)`). Site and studio get the config from the server and cannot override it from `localStorage`. Preset, report and missing-video logic is injected policy (`TimelineProvider`), not an import of the timeline.
- **The embed player** is built as a single `embed.html` plus a transcode worker and one chunk; the server must serve these side by side with relative paths and must not send a CSP that blocks its inline scripts. The server hosts it on the instance's own origin.
- **SEO and link previews** stay a later stage. The web app is deployed from its Dockerfile (no Vercel); the server gets a static SPA first, and meta-tag injection later in Rust if needed.
- ADRs and domain glossaries stay per app. Root `docs/adr/` is for the web app and for decisions that span apps.

## Consequences

- The Docker build context is the repository root (`/Dockerfile`, Coolify base directory `/`); every workspace manifest must be copied before `npm ci`. Vercel is no longer used.
- The `@/` alias resolves to `apps/web/src`; files moved into a package need rewritten imports (subpath imports, see above). `components.json` aliases must be updated when web moves onto the widgets.
- **UI primitives live in widgets.** The generic shadcn primitives (alert, alert-dialog, accordion, aspect-ratio, badge, button, card, checkbox, collapsible, dialog, dropdown-menu, hover-card, input, label, popover, progress, radio-group, scroll-area, select, separator, skeleton, slider, switch, table, tabs, textarea, toggle, toggle-group) moved to `@nostube/widgets/components/*`. `*-variants.ts` files resolve through their own export pattern (`./components/*-variants`). Primitives that depend on app code stay in `apps/web/src/components/ui/` (people-picker, tag-input, toaster, sonner, language-select, collapsible-text, sidebar, form, command, and the ones nothing in the site needs yet: calendar, carousel, chart, drawer, menubar, navigation-menu, pagination, resizable, sheet, context-menu, breadcrumb, input-otp). `apps/web/components.json` still points the shadcn CLI at `components/ui`, so new shared primitives are added to widgets by hand.
- ESLint (`no-restricted-imports`) keeps core free of React and `@/`, and widgets free of `@/` and app code.
- `apps/server` now embeds the site, not the instance build: `scripts/build-server-web.sh` builds `apps/site` and the embed player (`embed.html`) into `apps/server/web/dist`, which RustEmbed bakes in at compile time. Run it before `cargo build`/`cargo check`; the `Server` workflow does the same. The instance build in `apps/web` (`build:instance`) is no longer used by the server and stays only until the site is verified in production; then it is removed and ADR 0005 of the server is superseded.

## Status of the first slice

- `apps/site` is a skeleton: it loads `/api/config` (contract v1), registers it with `setInstanceConfig`, builds a client with `createNostubeClient` and shows the start creator's profile and videos with the widgets. It loads videos with the same `useTimeline` as nostube (policy: only the creator's Blossom servers) and has a "Load more" button. It is not wired into the Rust server or the Docker image yet.
- `VideoCard` and `VideoGrid` are new, small components; `apps/web` keeps its own card. The player is the one from `apps/web`.
- Widgets use Tailwind utility classes, like web (Tailwind v4). An app that consumes them adds `@source '../../../packages/widgets/src'` to its CSS.
- **Timeline policy is injected.** `useTimeline` reads the client and the viewer's filter policy (blocked authors, preset NSFW authors, reported events, Blossom servers, YouTube/audio switches, missing videos) from `TimelineProvider` (`@nostube/widgets/timeline`, strict `useTimelineContext`). `apps/web` fills it in `TimelineBridge`, mounted around the router and in `TestApp`, never in the embed (it would pull `nostr/core` back into the embed bundle). Trust-score filtering is not part of it: callers apply it (`useTrustFilter`).
- **The site has the same content-warning gate as the embed.** A video with a content warning (explicit tag or NSFW platform attributes) is a locked card until the viewer confirms being 18+ (stored in the browser); the player then still asks before it plays. It uses `getEffectiveNsfwFilter` and `getVideoPlayback` from core, and `VITE_NSFW_SAFETY=off` disables it like in web. Not covered yet: designating whole authors as NSFW (web uses the preset's `nsfwPubkeys`; a site has no preset, so an operator-level setting would have to come from the instance config).
- **The player lives in `@nostube/widgets/player`** (moved from `apps/web`, with its hooks and engines), together with the UI primitives it needs (`components/*`), the host context, the platform context (`NativeWindow` for the desktop shell, `DesktopPlayerControlsContext`), the theme tokens (`theme.css`, imported by every app) and its translations (`i18n`, three keys per language, merged with `registerWidgetTranslations`). Web and the site play videos the same way. A host that renders it needs: `EventStoreProvider`, `NostubeHostProvider`, `TooltipProvider`, i18next with the widget translations, and the theme CSS.
- **Host context.** `@nostube/widgets/host` defines `NostubeHost` (config subset, relay pool, lookup relays) with `NostubeHostProvider`, `useNostubeHost` (throws without a provider) and `useNostubeHostSafe`. The shared hooks (`useProfile`, `useBatchedProfiles`, `useEventZaps`, `useMediaUrls`, `useImageCascade`, `useIsMobile`) live in `@nostube/widgets/hooks/*` and read it. `apps/web` fills it from `AppContext` in `NostubeHostBridge` (app and embed); `apps/site` fills it from the instance config and the creator's Blossom server list. `url-discovery` in core takes the pool as an argument.
- **The embed no longer bundles `nostr/core`** (it used the web singleton for URL discovery): `embed.html` shrank from 3.27 MB to 2.47 MB. Discovery now runs on the embed's own relay pool.
