# Architecture decisions

Decisions are recorded as ADRs in two places with separate numbering. `docs/adr/` holds the decisions for the web app and the ones that span several apps. `apps/server/docs/adr/` holds the server's. The domain terms they use are defined in the glossaries listed in [`CONTEXT-MAP.md`](https://github.com/flox1an/nostube/blob/main/CONTEXT-MAP.md).

## Web app and cross-app (`docs/adr/`)

| ADR | Decision |
| --- | --- |
| [0001](https://github.com/flox1an/nostube/blob/main/docs/adr/0001-blossom-for-media-storage.md) | Blossom for media storage: content-addressed blobs can be mirrored and found on any server, unlike NIP-96 URLs. |
| [0002](https://github.com/flox1an/nostube/blob/main/docs/adr/0002-browser-based-transcoding.md) | Browser transcoding (WebCodecs in Web Workers) is the primary encoding path; a DVM and plain upload are optional fallbacks. |
| [0003](https://github.com/flox1an/nostube/blob/main/docs/adr/0003-applesauce-nostr-library.md) | Applesauce is the Nostr library; RxJS is accepted only where Applesauce needs it. |
| [0004](https://github.com/flox1an/nostube/blob/main/docs/adr/0004-monorepo-with-apps-and-shared-packages.md) | One monorepo with npm workspaces: `apps/*` plus internal `packages/core` (no React) and `packages/widgets`, imported by subpath; the server embeds the site, Studio and embed player. |

## Nostube Server (`apps/server/docs/adr/`)

| ADR | Decision |
| --- | --- |
| [0001](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0001-port-relay-into-nostube-server.md) | The relay is ported into the server instead of embedding `nostr-rs-relay`; Almond stays a pinned library dependency. |
| [0002](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0002-admin-auth-password-plus-nip07.md) | Admin login: a mandatory password, an optional NIP-07 key login, one server-side session. |
| [0003](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0003-tls-modes-and-canonical-origin.md) | TLS modes `proxy`, `files` and `local-ca` (ACME later), and one canonical origin. |
| [0004](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0004-single-origin-root-mounted-blossom-and-relay.md) | App, Blossom and relay share one origin; Blossom and the relay are mounted at the root. |
| [0005](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0005-public-config-fail-closed-instance-build.md) | The public config (`/api/config`, contract v1) is strict and fail-closed; the site reads it before loading anything. |
| [0006](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0006-visitor-interactions-with-own-videos.md) | The relay accepts visitor comments, replies, reactions and their deletions, but only on locally known videos. |
| [0007](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0007-managed-signer.md) | Managed signer: the server keeps the creator key as a NIP-49 `ncryptsec`, unlocked by a local key file. |
| [0008](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0008-local-profile.md) | A signed-in visitor's profile is always looked up on public discovery relays; videos and embeds stay on the instance. |
| [0009](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0009-outbox-and-mirror.md) | A durable outbox copies the instance's own events and blobs to mirror relays and Blossom servers the owner chose. |
| [0010](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0010-apply-public-config-while-running.md) | Public config edits apply while running; only start-time wiring (writers, storage, mirrors) needs a restart. |
| [0011](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0011-reports-extend-visitor-interactions.md) | NIP-56 reports are a fifth accepted visitor kind, reviewed by the owner in the Studio. |
| [0012](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0012-reach.md) | Reach: a private instance publishes nothing; a public one announces its channel profile, relay list and Blossom list. |
| [0013](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0013-nsite-hosting.md) | Site hosting is independent of reach; a managed channel can publish its site as a NIP-5A nsite. |
| [0014](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0014-interaction-import.md) | An optional, opt-in import of public interactions reuses the relay's admission rules (concept accepted, not yet implemented). |
