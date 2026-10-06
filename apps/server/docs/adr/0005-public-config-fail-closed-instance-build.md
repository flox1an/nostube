# Public config: a fail-closed v1 contract read by an instance build

The Nostube app embedded in the instance is an **instance build**: it is built with a flag that makes it fetch `GET /api/config` before it builds any loader, and it never runs on the normal app defaults. The nostu.be build never makes that request. The response is `Cache-Control: no-store`; the service worker leaves `/api/` alone.

Contract version 1 has exactly these fields, all required:

| field | value |
|---|---|
| `version` | `1` |
| `revision` | positive integer, the applied config revision |
| `origin` | canonical origin, `https://host` with no path (ADR 0003) |
| `title` | non-empty string |
| `creators` | displayed creators as hex pubkeys; may be `[]` |
| `startPage` | `{ "kind": "creator-profile", "creator": <one of creators> }`, or `null` while `creators` is empty |
| `videoSources` | `ws(s)://` relays for video catalog queries; may be `[]` |
| `interactionRelays` | `ws(s)://` relays that replace the hardcoded profile/zap/indexer/publish relays; may be `[]` |
| `search` | `{ "mode": "off" }`, `{ "mode": "local" }`, or `{ "mode": "external", "url": "https://…" }` |

**Missing, off and empty stay apart.** A missing field rejects the whole config. Off is written explicitly. An empty list means "none on purpose". No value, missing or empty, ever selects an app default. The client ignores unknown fields, and a breaking change bumps `version`.

**Load outcomes in an instance build.** A valid config starts the app and is kept in the browser as the last good config. If the server is unreachable or returns 5xx, the app runs on the last good config, or stops with a retry screen when there is none. A 404, an invalid body or an unknown `version` stops the app with an error screen.

**Applied as an overlay.** The config is laid over the browser's saved settings on every load and never written into them. The instance fixes read relays (= `videoSources`), interaction relays and search. Personal preferences (theme, quality, NSFW filter, video type) stay with the viewer.

**Fixed by the instance build, not fields:** the trust filter, preset gate, image proxy, view tracking, DVM discovery and media discovery are all off. A field gets added only once an admin can actually choose the value.

**Video catalog queries** use only `videoSources` and only `creators`. Relay hints, preset relays, outbox relays and the user's NIP-65 never widen them. The author page of a non-creator still opens (no route restriction), but it sends no video request. Video-by-id lookups are also restricted to `creators`.

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
