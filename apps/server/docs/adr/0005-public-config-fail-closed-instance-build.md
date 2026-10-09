# Public config: a fail-closed v1 contract read by an instance build

> **Status:** the server now embeds `apps/site` (see root ADR 0004); the config contract below stays valid and is read by the site. The instance build in `apps/web` is no longer embedded and is removed later.

The Nostube app embedded in the instance is an **instance build**: it is built with a flag that makes it fetch `GET /api/config` before it builds any loader, and it never runs on the normal app defaults. The nostu.be build never makes that request. The response is `Cache-Control: no-store`; the service worker leaves `/api/` alone.

Contract version 1 has exactly these fields, all required:

| field               | value                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `version`           | `1`                                                                                                |
| `revision`          | positive integer, the applied config revision                                                      |
| `origin`            | canonical origin, `https://host` with no path (ADR 0003)                                           |
| `title`             | non-empty string                                                                                   |
| `creators`          | displayed creators as hex pubkeys; may be `[]`                                                     |
| `startPage`         | `{ "kind": "creator-profile", "creator": <one of creators> }`, or `null` while `creators` is empty |
| `videoSources`      | `ws(s)://` relays for video catalog queries; may be `[]`                                           |
| `interactionRelays` | `ws(s)://` relays that replace the hardcoded profile/zap/indexer/publish relays; may be `[]`       |
| `search`            | `{ "mode": "off" }`, `{ "mode": "local" }`, or `{ "mode": "external", "url": "https://…" }`        |

**Addendum: `site` (still version 1).** The contract gains one required field, `site`, for the creator's public site (`apps/site`). Nothing was deployed against version 1 yet, so it is extended in place instead of bumping the version; from the first deployment on, a new required field bumps `version` again. Two readers share the parser: the site and the instance build in `apps/web` (which ignores the field).

| field                                   | value                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site.tagline`                          | string, may be empty; shown under the title                                                                                                                                                                                                                                                                                                               |
| `site.theme.accent`                     | `#rrggbb`, replaces the primary colour and the focus ring                                                                                                                                                                                                                                                                                                 |
| `site.theme.font`                       | `sans`, `serif` or `mono` (system font stacks, no web fonts)                                                                                                                                                                                                                                                                                              |
| `site.links.profile`, `.video`, `.note` | https URL templates with `{nip19}` for the npub, nprofile, naddr, nevent or note identifier: where the site sends links to Nostr content outside the site (a mention of someone else, a video of another creator, a note). The creator's own videos and the creator open on the site itself. Defaults: njump.me for people and notes, nostu.be for videos |
| `site.videos.hidden`                    | videos not shown: `<kind>:<pubkey>:<d>` (addressable events) or an event id (64 hex); everything else of the `creators` is shown. May be `[]`                                                                                                                                                                                                             |

This changes the earlier rule that the theme stays with the viewer: the creator sets accent and font, while light or dark still follows the viewer's system. In `config.toml` the section is `[site]` (`tagline`, `accent`, `font`, `hidden_videos`, and `[site.links]` with `profile`, `video`, `note`) and may be left out: the server fills the defaults, and the wire format always carries explicit values. The studio edits `site` together with the other editable fields through `GET/PUT /api/admin/config` (session cookie required, JSON body, validated as a whole, `config.prev` kept, then restart). The old server-rendered admin form was removed; `/admin` redirects to `/studio/`, and only setup and login stay server-rendered.

**Missing, off and empty stay apart.** A missing field rejects the whole config. Off is written explicitly. An empty list means "none on purpose". No value, missing or empty, ever selects an app default. The client ignores unknown fields, and a breaking change bumps `version`.

**Load outcomes in an instance build.** A valid config starts the app and is kept in the browser as the last good config. If the server is unreachable or returns 5xx, the app runs on the last good config, or stops with a retry screen when there is none. A 404, an invalid body or an unknown `version` stops the app with an error screen.

**Applied as an overlay.** The config is laid over the browser's saved settings on every load and never written into them. The instance fixes read relays (= `videoSources`), interaction relays and search. Personal preferences (theme, quality, NSFW filter, video type) stay with the viewer.

**Fixed by the instance build, not fields:** the trust filter, preset gate, image proxy, view tracking, DVM discovery and media discovery are all off. A field gets added only once an admin can actually choose the value.

**Video catalog queries** use only `videoSources` and only `creators`. Relay hints, preset relays, outbox relays and the user's NIP-65 never widen them. The author page of a non-creator still opens (no route restriction), but it sends no video request. Video-by-id lookups are also restricted to `creators`.

**Signed-in visitor identity (Site).** The visitor's own profile is an explicit exception to
interaction-relay isolation: `apps/site` discovers that key's NIP-65 list (kind 10002) through
the instance relays plus `purplepag.es` and `index.hzrd149.com`, then loads its profile
(kind 0) from the listed write relays and those discovery relays. Read-only NIP-65 relays
are not used for the visitor's published profile. This never widens video catalog, creator
metadata, comment/reaction publishing or zap-receipt routes, and adds no public relay for guests.
The exception uses `NostubeClient.requestVisitorIdentity` on the same relay pool, bypassing
only the group allowlist for two fixed kinds (0 and 10002) and one exact public key.
Responses for other authors or kinds are discarded before verified store ingestion.
Ordinary pool queries and publishing retain their original restrictions.

**Config changes.** The app checks `/api/config` again on tab focus and relay reconnect. When `revision` differs it reloads the page, which ends running queries and rebuilds every loader from the new scope.

Prototype (logic + walkthroughs): branch `prototype/public-config`, `prototypes/public-config/index.html`.

## Considered Options

- **Runtime probe in one shared build** (404 means normal app): fails open. If the endpoint is broken or misrouted, the app silently goes back to public relays, hosted search and the trust/preset gates, which is exactly what the Nostube central defaults inventory found.
- **Optional fields with app defaults**: brings back the "empty means hosted default" failure from the inventory.
- **Explicit tri-state fields for trust, preset, image proxy, view tracking and DVM**: contract, validation and admin UI for choices the first cut never offers.
- **Live re-scope on a revision change**: every loader, the search index and the caches would have to handle a scope change in place. A reload gets the same result with no extra code.
- **`/api/public-config`**: longer, and adds nothing, since admin endpoints already live under `/api/admin/`.

## Consequences

nostube-server embeds its own Nostube build, made with the instance flag. Every central-default site in the inventory gets an instance-build branch: union relay lists are dropped for video queries, hardcoded interaction relays are replaced by `interactionRelays`, and the fixed policies are switched off. The embed player reads the same `/api/config`. `runtime-env.js` and `window.__RUNTIME_ENV__` are deleted.
