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
apps/site      creator homepage (videos, profile, playlists), no discovery  [planned]
apps/studio    upload and management UI                                      [planned]
packages/core      headless Nostr/Blossom logic, no React                    [started: app config types]
packages/widgets   player, video card, comments, login, shadcn/ui base       [planned]
```

- **Extract on demand.** The web app moves unchanged into `apps/web`. Packages start empty and take a file only when `site`, `studio` or the embed needs it; `tsc` and lint confirm each move. `site` is built first as a thin slice (one creator, a grid, the player).
- **Internal packages, no publishing.** Apps import TypeScript source from workspace packages. No versioning or npm publish until an outside consumer needs it.
- **Core means "no React", not "no browser".** It keeps using IndexedDB (nostr-idb) and Web Workers and does not run in Node.
- **Config is injected.** Core builds its client from a passed-in config (`createNostubeClient(config)`). Site and studio get the config from the server and cannot override it from `localStorage`. Preset, trust and missing-video logic is injected policy, not an import of the timeline.
- **The embed player** is built as a single `embed.html` plus a transcode worker and one chunk; the server must serve these side by side with relative paths and must not send a CSP that blocks its inline scripts. The server hosts it on the instance's own origin.
- **SEO and link previews** stay a later stage. The web app is deployed from its Dockerfile (no Vercel); the server gets a static SPA first, and meta-tag injection later in Rust if needed.
- ADRs and domain glossaries stay per app. Root `docs/adr/` is for the web app and for decisions that span apps.

## Consequences

- Deploy targets must point at `apps/web` (Vercel Root Directory, Coolify base directory, workflow `working-directory`).
- The `@/` alias resolves to `apps/web/src`; files moved into a package need rewritten imports. Tailwind needs the widgets sources added to its content globs, and `components.json` aliases must be updated.
- A lint rule (`no-restricted-imports`) must keep core free of `react` and `@/components`.
- The AppContext types (`BlossomServer`, `NsfwFilter`, `VideoType`, `CachingServer`) move out of the React context file first; they block extraction of about seven `lib` files.
- The instance build in `apps/web` stays until `apps/site` can replace it; then ADR 0005 of the server is superseded.
