# Development setup

Nostube is one repository with npm workspaces and a Rust server ([ADR 0004](https://github.com/flox1an/nostube/blob/main/docs/adr/0004-monorepo-with-apps-and-shared-packages.md)).

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `apps/web` | `nostube` | The web app behind nostu.be, the embed player, a Node server for the oEmbed and playlist APIs, and the Tauri desktop wrapper |
| `apps/server` | (Cargo) | Nostube Server: the self-hosted Rust server with relay, Blossom (Almond) and admin API. It embeds the site, the Studio and the embed player |
| `apps/site` | `@nostube/site` | The creator homepage the server serves; reads `/api/config` |
| `apps/studio` | `@nostube/studio` | The server's admin interface, served under `/studio/` |
| `packages/core` | `@nostube/core` | Shared logic without React: Nostr client, media URL ladder, HLS loader, video event parsing, instance config, browser transcoding |
| `packages/widgets` | `@nostube/widgets` | Shared React components: player, video card, UI primitives |
| `docs` | `nostube-docs` | This documentation (VitePress, with its own `package.json`) |

The packages are internal and not published. Apps import their TypeScript source by subpath, for example `@nostube/core/media-url-generator`, never through a barrel file. ESLint keeps `packages/core` free of React and app code.

## Prerequisites

- Node.js 22 (the version CI uses) and npm
- A Rust toolchain (stable), only for `apps/server`

Install all workspace dependencies once, from the repository root:

```sh
npm ci
```

## Running the apps

### Web app

```sh
cd apps/web
npm run dev
```

Vite serves the app on port 8080. To try the Node server, run `npm run build` and then `npm run server:dev`. It serves `dist/` together with the oEmbed and playlist APIs on `PORT` (default 8080, so stop Vite first).

### Site

The site needs an instance config. In development it either proxies `/api/config` to a running Nostube Server or builds one from environment variables:

```sh
# against a running server
NOSTUBE_SERVER_URL=https://localhost:8443 npm run dev --workspace @nostube/site

# or without a server: one creator, read from public relays
NOSTUBE_DEV_CREATOR=<64-hex pubkey> NOSTUBE_DEV_RELAYS=wss://relay.example,wss://nos.lol \
  npm run dev --workspace @nostube/site
```

`NOSTUBE_DEV_SEARCH=local` turns on the site search.

### Studio

The Studio talks to the admin API of a running server. `NOSTUBE_SERVER_URL` forwards `/api`, `/admin` and `/upload` to it:

```sh
NOSTUBE_SERVER_URL=https://localhost:8443 npm run dev --workspace @nostube/studio
```

### Server

The server embeds the built site, Studio and embed player at compile time (from `apps/server/web/dist`). Build them first, then run the server:

```sh
scripts/build-server-web.sh
cargo run --manifest-path apps/server/Cargo.toml -- --data ./data --port 8443 --http-port 0
```

Without `--origin`, the first start uses the `local-ca` TLS mode: the server creates a private CA and serves HTTPS itself. local-ca currently runs only on macOS; on Linux, start with `--tls proxy --origin https://<host>` behind a TLS proxy. Run `scripts/build-server-web.sh` again after changing the site, Studio or embed player. First start, setup and TLS modes are described in [Getting started](/server/) and [HTTPS and networks](/server/tls).

### Documentation

```sh
cd docs
npm ci
npm run docs:dev
```

`npm run docs:build` fails on dead links.

## Tests and checks

| Workspace | Command (from the repository root) |
| --- | --- |
| core, widgets, site, studio | `npm run lint --workspace @nostube/core` (likewise `typecheck`, `test`; repeat `--workspace` for several) |
| web | `cd apps/web && npm run test` (typecheck, ESLint, Vitest and production build) |
| server | `scripts/build-server-web.sh`, then `cd apps/server && cargo test` |

The web app also has `npm run typecheck`, `npm run format` and `npm run format:check`. A pre-commit hook (Husky, installed by `npm ci`) runs lint-staged and the web, core, widgets and site checks.

## Desktop releases

The desktop release workflow runs only when a version tag matching `v*.*.*` is pushed. It builds a GitHub Release from that tag with macOS DMGs (Apple Silicon and Intel), a Windows x64 NSIS installer and a Linux x64 AppImage and Debian package. macOS builds are ad-hoc signed (`signingIdentity: "-"`), not signed with an Apple Developer ID or notarized.

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`) with subjects of at most 72 characters, for example `feat: improve playlist paging`.
- Pull requests explain the motivation, link relevant issues or Nostr events, include desktop and mobile screenshots for UI changes, and list the tests you ran. Keep changes small and scoped.
- Issues live in [GitHub Issues](https://github.com/flox1an/nostube/issues).

## Architecture notes and glossaries

- [`CONTEXT-MAP.md`](https://github.com/flox1an/nostube/blob/main/CONTEXT-MAP.md) lists the two domain contexts and their glossaries: [`CONTEXT.md`](https://github.com/flox1an/nostube/blob/main/CONTEXT.md) for the web app and [`apps/server/CONTEXT.md`](https://github.com/flox1an/nostube/blob/main/apps/server/CONTEXT.md) for the server.
- Architecture decision records are in `docs/adr/` (web app and cross-app) and `apps/server/docs/adr/` (server, separate numbering). See [Architecture decisions](/developers/architecture).
- [`AGENTS.md`](https://github.com/flox1an/nostube/blob/main/AGENTS.md) and [`apps/server/AGENTS.md`](https://github.com/flox1an/nostube/blob/main/apps/server/AGENTS.md) hold the coding conventions.
