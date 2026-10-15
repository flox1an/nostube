## Releases

A server release is one commit `chore(server): release <version>` that bumps `version` in `Cargo.toml` and `Cargo.lock` (`cargo update -p nostube-server --offline`). Tag that commit `server-v<version>` and push the tag with it (`git push origin main server-v<version>`): the tag makes `server-image.yml` publish the image as `:<version>` next to `:main`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `flox1an/nostube`, managed with `gh` — same tracker as the rest of the monorepo. See `docs/agents/issue-tracker.md` at the repository root.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `apps/server/docs/agents/triage-labels.md`.

### Domain docs

Single context within `apps/server`: `apps/server/CONTEXT.md` + `apps/server/docs/adr/`. See `apps/server/docs/agents/domain.md`. (The monorepo root has a `CONTEXT-MAP.md` listing this and the web context.)
