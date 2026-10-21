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

## Supporting projects

Related projects with their own repositories and documentation:

| Project                                                            | Role                                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [Almond](https://github.com/flox1an/almond)                        | Blossom media storage ([docs](https://flox1an.github.io/almond/))                                               |
| [Nostube Search](https://github.com/flox1an/nostube-search)        | MeiliSearch video search and recommendations ([docs](https://flox1an.github.io/nostube-search/))                |
| [Nostube Image Proxy](https://github.com/flox1an/nostube-imgproxy) | Image resizing, video thumbnails, Blossom media discovery ([docs](https://flox1an.github.io/nostube-imgproxy/)) |

Which of them a setup needs: [Supporting projects](https://flox1an.github.io/nostube/guide/supporting-projects).

Dependencies are installed once at the repository root (npm workspaces): `npm ci`, then `cd apps/web && npm run build`.
