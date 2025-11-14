# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`: UI parts in `components/`, feature hooks in `hooks/`, shared helpers in `lib/`, and nostr/worker logic under `nostr/` and `workers/`. Route-level views sit in `pages/`, while providers live in `providers/` and `contexts/`. Tests reside in `src/test` plus co-located `*.test.ts(x)`. Static assets are stored in `public/`, custom lint rules in `eslint-rules/`, and Vite writes bundles to `dist/`.

## Build, Test, and Development Commands
- `npm run dev` – optional install followed by the Vite dev server with hot reload.
- `npm run build` – optimized bundle plus `dist/404.html` copy for static hosting.
- `npm run test` – CI door: install, type-check (`tsc`), lint, run Vitest, and build.
- `npm run typecheck`, `npm run format`, and `npm run format:check` keep types and formatting clean.
- `npm run start` previews the built app locally on port 8080; `npm run deploy` publishes `dist/` via Surge.

## Coding Style & Naming Conventions
This is a TypeScript-first React 18 app using functional components, hooks, and Tailwind utilities. Maintain two-space indentation, prefer `const` and arrow functions, and keep components declarative. Components/providers use `PascalCase`, hooks use `useCamelCase`, and helpers in `lib/*` or `utils/*` stay lower camel case. Run `eslint` and `prettier` before every PR; both configs enforce import order and Tailwind class sorting.

## Testing Guidelines
Vitest with React Testing Library powers unit/UI tests; prioritize data transforms, upload logic, and relay interactions. Name files `*.test.ts` or `*.test.tsx` (e.g., `components/NoteContent.test.tsx`) and co-locate near the unit or add helpers under `src/test/`. Describe tests with user-focused language, mock network calls sparingly, and add coverage when touching uploads, caching, or rendering flows. Run `npm run test` locally before each PR.

## Commit & Pull Request Guidelines
Git history favors Conventional Commits (`feat:`, `fix:`, `chore:`). Keep subjects under ~72 chars and describe scope (“feat: improve playlist paging”). Each PR should include motivation, references to issues or nostr events, screenshots for UI changes (desktop + mobile when possible), and the tests executed. Avoid bundling unrelated tweaks; smaller diffs review faster.

## Security & Configuration Tips
Never log sensitive keys; development logs are gated by `import.meta.env.DEV` already. Inject relay/storage URLs through Vite env variables or Applesauce configs—do not hardcode them in shared modules. When handling uploads, reuse helpers in `lib/blossom-upload.ts` for chunking/signing and update relay allowlists in `nostr/` when new infrastructure is added.
