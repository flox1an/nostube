# Context Map

This repository has two domain contexts. Read the ones relevant to the topic.

| Context | Glossary | ADRs |
|---|---|---|
| Nostube web app (`apps/web`) | `CONTEXT.md` (repo root) | `docs/adr/0001` to `0003` |
| Nostube Server (`apps/server`) | `apps/server/CONTEXT.md` | `apps/server/docs/adr/` (own numbering) |

System-wide decisions that span both live in `docs/adr/` (starting with `0004`, the monorepo layout).

The server context uses the web app's concepts (video, Blossom, relay) through its own vocabulary; when a term appears in both glossaries, the server's `CONTEXT.md` wins for server code.
