# Nostube

Monorepo for Nostube. Documentation: <https://flox1an.github.io/nostube/> (source in `docs/`).

| Path               | What it is                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`         | The Nostube web app (nostu.be), including the embed player and the Tauri desktop wrapper                                                |
| `apps/server`      | The self-hosted Rust server (relay, Blossom, admin); embeds the site and embed player (`scripts/build-server-web.sh`, then `cargo run`) |
| `apps/studio`      | The server's admin interface (appearance, instance settings, account), served under `/studio/`                                          |
| `apps/site`        | Skeleton of the self-hosted creator homepage (static Vite app, reads the server's `/api/config`)                                        |
| `packages/core`    | Shared logic without React: Nostr client, media URL ladder, HLS loader, instance config (`@nostube/core`, internal, not published)      |
| `packages/widgets` | Shared React components for the apps (`@nostube/widgets`, internal)                                                                     |
| `skills`           | Installable agent skills for external use; [installation and requirements](skills/README.md)                                            |

Architecture decisions are in `docs/adr/` and `apps/server/docs/adr/`.

Dependencies are installed once at the repository root (npm workspaces): `npm ci`, then `cd apps/web && npm run build`.
