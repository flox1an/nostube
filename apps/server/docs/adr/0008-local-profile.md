# Mandatory public visitor identity; videos and embeds retain instance scope

> **Status:** this decision supersedes this ADR's earlier “empty means local only” visitor-profile policy. The embed's instance-relay isolation remains unchanged. ADR 0012 (reach) keeps this lookup in both reaches; the **Check** runs a private-reach instance.

The signed-in visitor must see their own published name and picture even when the instance has no copy. Visitor identity therefore always uses the public discovery defaults (`wss://purplepag.es`, `wss://index.hzrd149.com`), instance relays, configured additional profile relays and the visitor's NIP-65 write relays. An empty configured list does not disable this lookup. A signed-in site is no longer promised to make zero requests outside the instance.

**`profileRelays` (still contract version 1).** This optional public-config field is named `profile_relays` in `config.toml`. The server validates it like the other relay lists and writes it into `/api/config` and Studio's config. Studio edits additional visitor-profile discovery relays on the Instance page; there is no “Local only” visitor setting.

- **Absent preserves the existing server defaults** (`wss://purplepag.es`, `wss://index.hzrd149.com`) for old configs and readers. No backend/config migration is needed.
- **Empty means no additional discovery relays.** `[]` remains valid and stored as an empty list. The mandatory public defaults and NIP-65 write relays are still used.
- **A present but invalid value rejects the config** like any other invalid relay list.

**Only visitor identity crosses the query boundary.** `NostubeClient.requestVisitorIdentity` uses the existing raw relay group on the same pool for kinds 0 and 10002 and one exact signed-in visitor public key. Other authors and kinds are discarded before verified-store ingestion. Read-only NIP-65 relays are not followed for the visitor's published profile. This does not widen video catalog, creator metadata, comments/reactions, zap-receipt queries or interaction publishing, and does not add public identity queries for guests. Ordinary query groups and publishing retain their allowlists.

**Privacy tradeoff.** Public discovery and write relays see the visitor's IP address and the public key being queried. A published avatar URL may cause a separate request to its host. This is mandatory identity discovery, not a profile opt-out hidden behind an empty config list. Operators must describe it in their privacy information rather than claim a signed-in site stays fully local.

**The embed on an instance uses only the instance relays.** When the embed has read the instance config, the video, the author's profile and the author's Blossom list come from `videoSources` ∪ `interactionRelays`; relay hints in the `naddr`/`nevent`, the `?relays=` parameter and public defaults are not used (ADR 0005). The visitor-identity exception does not apply to the embed. It does not load nostube's public moderation preset; a flagged video uses its content warning and the viewer's NSFW setting. When the config cannot be read, the embed keeps its public behaviour; the site's fail-closed config load is unchanged.

The apps/web instance build's default upload server remains the instance's own Blossom (its origin), not the three public servers.

**Check.** `apps/server/scripts/check-local-profile.mjs` starts a throwaway instance with `profile_relays = []` and seeds a creator video, profile, thumbnail and media only on its own relay and Blossom. Separate Chromium targets capture requests, WebSocket URLs and sent frames for the signed-in site, video page and embed. Only the two mandatory public `wss://` defaults are permitted externally on the site/video page, and every public `REQ` must contain only kinds 0/10002 with exactly the seeded visitor as author. Public `CLOSE`s are allowed; writes, nonidentity queries, unexpected hosts and external HTTP fail. The embed permits no external traffic. Both public sockets and visitor kind 0/10002 requests must be observed, so public connectivity is a prerequisite. `--default-profile-relays` compares an omitted config list with `[]`; both now have the same public-identity requirement (deploy.md).

## Considered Options

- **Keep “Local only” as a visitor-profile opt-out:** superseded by the requirement to discover signed-in visitors' public identity consistently.
- **Widen the shared allowlist or video relay sets:** rejected. The existing fixed-kind, exact-author visitor request is the narrow exception; video and creator scope stay unchanged.
- **Required field or config migration:** unnecessary. Existing lists and `[]` retain their stored values; only the client-side visitor lookup policy changes.
- **Fail closed in the embed when config cannot be read:** not changed by this decision.
