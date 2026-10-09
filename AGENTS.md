# Repository Guidelines

## Monorepo Layout

This repository holds several apps. The sections from "Project Overview & Stack" through "Security & Configuration Tips" describe the web app in `apps/web`: their paths such as `src/`, `public/` and `eslint-rules/`, and all `npm run ...` commands, are relative to `apps/web`. Run them from there. The "Agent skills" section at the end is relative to the repository root.

| Path | What it is |
|---|---|
| `apps/web` | The Nostube web app (nostu.be): embed player, Node server for the oEmbed/playlist APIs, Tauri desktop wrapper |
| `apps/server` | The self-hosted Rust server (relay, Blossom, admin) that embeds a web build. It has its own `CONTEXT.md`, `AGENTS.md` and `docs/adr/` |

Root `docs/adr/` holds ADRs for the whole repo and for the web app; `apps/server/docs/adr/` holds the server's ADRs (their numbering is independent). `packages/core` (`@nostube/core`, TypeScript source, no build step) holds the React-free logic shared by the apps (app config types, media URL ladder, HLS loader, video event parsing, instance config). Import it by subpath (`@nostube/core/media-url-generator`), never through a barrel; core must not import React or `@/` app code (ESLint enforces it, run `npm run lint --workspace @nostube/core`). Core tests run with `npm test --workspace @nostube/core`. `packages/widgets` (`@nostube/widgets`) holds shared React components (VideoCard, VideoGrid, VideoPlayer), styled with Tailwind utilities and consumed by `apps/site`; `apps/web` does not use them yet. `apps/site` is the skeleton of the self-hosted creator homepage (static Vite app reading `/api/config`); it is not wired into the Rust server or the Docker image. Run `npm run dev --workspace @nostube/site` with `NOSTUBE_SERVER_URL` or `NOSTUBE_DEV_CREATOR` and `NOSTUBE_DEV_RELAYS` set. `apps/studio` is planned (ADR 0004). Install dependencies once at the root with `npm ci` (npm workspaces, one root `package-lock.json`); `overrides` live in the root `package.json`.


## Project Overview & Stack

nostube is a Nostr-based video platform built with React 18, TypeScript, TailwindCSS, Vite, and shadcn/ui. Applesauce (core, relay, loaders, accounts, factory, signers) provides Nostr storage, relay pools, and signing. React Router powers navigation and Observable hooks manage Applesauce streams. Keep a single `EventStore` and `RelayPool` instance (see `src/nostr`), and wrap the app with `AccountsProvider → EventStoreProvider → FactoryProvider` as shown below:

```tsx
<AccountsProvider manager={accountManager}>
  <EventStoreProvider eventStore={eventStore}>
    <FactoryProvider factory={factory}>{children}</FactoryProvider>
  </EventStoreProvider>
</AccountsProvider>
```

## Project Structure & Modules

`src/components/` hosts UI, with reusable primitives in `components/ui/`. Hooks live in `src/hooks/`, shared helpers in `src/lib/`, and nostr-specific logic in `src/nostr/` plus background work in `src/workers/`. Routing is in `AppRouter.tsx` and `src/pages/`, state providers in `src/providers/` and `src/contexts/`. Tests sit in `src/test/` and alongside modules as `*.test.ts(x)`. Static assets live under `public/`, custom ESLint rules under `eslint-rules/`, and production bundles go to `dist/`.

## Applesauce Patterns & Custom Hooks

Use `createTimelineLoader`, `createEventLoader`, or `createAddressLoader` for relay queries and always observe via `useObservableMemo` to auto-dispose subscriptions. Favor built hooks such as `useEventStore`, `useCurrentUser`, `useAuthor`, `useUploadFile`, `useNostrPublish`, and `useUserBlossomServers`. Cache-first loading and singleton access keep relay usage predictable; avoid spinning up redundant pools or stores. For profile data, rely on `eventStore.profile(pubkey)` plus a blurhash fallback, and for uploads call `useUploadFile` so Blossom auth, chunking, and mirroring stay centralized.

## MCP & Reference Docs

Context7 indexes Applesauce docs (111k+ tokens) and exposes them over MCP for in-editor lookup.

```bash
# Remote (recommended)
claude mcp add --transport http context7 https://mcp.context7.com/mcp

# Local with API key (higher rate limit)
claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key YOUR_API_KEY
```

Key references:

- Applesauce package browser: https://context7.com/hzrd149/applesauce
- Project docs: https://hzrd149.github.io/applesauce/

## Build, Test & Development Commands

Run from `apps/web`.

- `npm run dev` – installs if needed and launches Vite with HMR.
- `npm run build` – optimized bundle plus `dist/404.html` copy for static hosts.
- `npm run build:instance` – nostube-server instance build into `dist-instance/` (reads `/api/config` at startup; see `packages/core/src/instance-config.ts`).
- `npm run test` – installs, runs `tsc --noEmit`, ESLint, Vitest, and a production build.
- `npm run typecheck`, `npm run format`, `npm run format:check` – targeted verifications.
- `npm run start` previews the build on port 8080; `npm run deploy` publishes via Surge.

## Coding Style & Naming

Use two-space indentation, TypeScript + JSX, and Tailwind utilities. Components/providers are `PascalCase`, hooks follow `useCamelCase`, helpers in `lib/` or `utils/` stay in lower camel case. Prefer `const`, arrow functions, and pure render logic. Run ESLint (`eslint.config.js` + `eslint-rules/`) and Prettier before pushing to keep imports ordered and Tailwind classes normalized.

## Testing Guidelines

Vitest with React Testing Library backs unit and interaction tests. Place files next to the code under test (`*.test.tsx`) or in `src/test/` for shared helpers. Focus on upload flows, relay interactions, cache invalidation, and rendering edge cases. Use user-focused test names, mock network calls sparingly, and run `npm run test` before every PR; `vitest --watch` is ideal for local iteration.

## Commit & Pull Request Guidelines

Follow Conventional Commits (`feat:`, `fix:`, `chore:`) with ≤72 char subjects (“feat: improve playlist paging”). PRs should explain motivation, link relevant issues or nostr events, attach desktop/mobile screenshots for UI tweaks, and list the tests executed. Keep changes scoped—small, reviewable diffs merge faster.

## Security & Configuration Tips

Never log secrets; debug output is already gated by `import.meta.env.DEV`. Inject relay/storage endpoints via Vite env vars or Applesauce config rather than hardcoding them in shared modules. Use helpers such as `lib/blossom-upload.ts` for chunking and signing, update relay allowlists under `src/nostr/` when infra changes, and ensure mirroring honors existing hash + size metadata before uploading.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `flox1an/nostube`, managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the canonical five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Uses a multi-context layout: see `CONTEXT-MAP.md` at the repository root (web app and server each have their own glossary), plus system-wide ADRs in `docs/adr/`. See `docs/agents/domain.md`.
