# Nostube

Monorepo for Nostube.

| Path | What it is |
|---|---|
| `apps/web` | The Nostube web app (nostu.be), including the embed player and the Tauri desktop wrapper |
| `apps/server` | The self-hosted Rust server (relay, Blossom, admin) |
| `packages/core` | Shared types and logic without React (`@nostube/core`, internal, not published) |

More packages and apps (`widgets`, `site`, `studio`) follow; see `docs/adr/`.

Dependencies are installed once at the repository root (npm workspaces): `npm ci`, then `cd apps/web && npm run build`.
