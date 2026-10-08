# Nostube

Monorepo for Nostube.

| Path | What it is |
|---|---|
| `apps/web` | The Nostube web app (nostu.be), including the embed player and the Tauri desktop wrapper |

More apps and shared packages (`core`, `widgets`, `site`, `studio`, the Rust `server`) follow; see `docs/adr/`.

Each app is self-contained for now: `cd apps/web && npm ci && npm run build`.
