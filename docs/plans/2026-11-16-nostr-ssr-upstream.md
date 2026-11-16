# nostr-ssr for nostu.be: upstream contribution plan

Status: 16 November 2026. Draft for review, not approved for implementation. Statements about nostr-ssr come from reading its source at that date (not from running it); unverified assumptions are marked **[Assumption]**.

## 1. Goal

Replace the Hono server of the web app (`apps/web/server`, about 800 lines, Node) with [v0l/nostr-ssr](https://github.com/v0l/nostr-ssr), the Rust server Kieran runs for snort, zap.stream and dtan, **without forking it**. Everything nostube needs goes upstream as generic, optional features; nostube itself becomes an `ssr.json` and a `Dockerfile` built `FROM voidic/nostr-ssr`.

**Non-goals:** real server-side rendering of the React app (QuickJS cannot run our stack: applesauce, rxjs, hls.js; we keep serving the SPA shell with head tags, as today). Server instances (`apps/server`) are out of scope: they have their own SEO in `apps/server/src/seo.rs`.

## 2. What our server does today

| Route / behaviour                                                                                                                  | Implementation                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `/v/<id>`, `/short/<id>`, `/playlist/<id>`: OG and Twitter player card tags, oEmbed discovery link, injected into `index.html`     | `server/index.ts`, `server/meta.ts` |
| Event lookup on the identifier's relay hints plus four fallback relays, 4 s fetch / 8 s request timeout                            | `server/nostr.ts`                   |
| `/oembed?url=…`: video oEmbed JSON (640×360 iframe, `author_name` = npub, 404 for playlists), documented in `docs/embed/oembed.md` | `server/oembed.ts`                  |
| `/assets/*`: immutable cache for real files, **404** for missing chunks (never the shell)                                          | `server/standalone.ts`              |
| `/manifest.webmanifest` and `/.well-known/*` headers, `/health`                                                                    | `server/standalone.ts`              |

No page cache, no sitemap (`robots.txt` points at `search.nostu.be/sitemap.xml`), no OG tags for profiles, live streams or JSON-LD.

## 3. What nostr-ssr already covers

- Static client serving, a page cache with stale-while-revalidate, per-prefix response `headers`, `PUBLIC_URL` / `X-Forwarded-Proto` origin handling.
- An in-memory event mirror with on-demand fetch from configured relays.
- OG / Twitter / canonical / JSON-LD tags merged into the shell for "sites without an SSR bundle": profiles (kind 0), live streams (30311, with player card from a `player` template), clips (1313), everything else as an article.
- Chunked sitemaps with a video extension (title, thumbnail, duration, tags, view counts) from `media.rs`, which already parses NIP-71 video kinds 21, 22, 34235, 34236 and images (20).
- A dead-media checker that can hide unreachable videos.

## 4. Gaps

| Gap                                                                                                                          | Where in nostr-ssr                      |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Entity paths are hard-coded to `/`, `/e/`, `/p/`; our `/v/`, `/short/`, `/playlist/`, `/live/` are not recognised            | `opengraph::is_entity_path`             |
| Canonical URL is always `<origin>/<nip19>`                                                                                   | `opengraph::event_tags`                 |
| Player template only knows `{nevent}`; size fixed at 640×480                                                                 | `opengraph::live_tags`                  |
| Video kinds get article tags (no `og:video`, no player card), although `media::parse` understands them                       | `opengraph::event_tags`                 |
| Relay hints in `nevent`/`naddr` are dropped; misses are fetched from configured relays only                                  | `mirror::parse_filter`, `Mirror::fetch` |
| No oEmbed endpoint or discovery link                                                                                         | —                                       |
| A missing `/assets/*` file falls back to the page (HTML, status 200), which `cache_assets` then marks `immutable` for a year | `web::router`, `web::cache_assets`      |

## 5. Upstream rules we have to follow

From nostr-ssr's `AGENTS.md`:

- No site names, domains or site-specific filters in code, tests, fixtures, docs or commit messages; site config lives in the site's own repo as `ssr.json`. Fixtures use `demo` / `example.com`.
- Every option is optional with a default; defaults keep current behaviour.
- Every fix and every new option gets a test beside the code, named after the behaviour; all tests run offline.
- No comments in code; short commit subject, no body, no trailers.

The plan therefore never adds nostube code. Each PR either fixes a bug, makes an existing hard-coded value configurable, or adds a Nostr-generic feature that zap.stream and snort can use too.

## 6. Pull requests

Ordered smallest and least opinionated first; each stands alone.

### PR 1: missing assets return 404

A request under `/assets/` with no matching file answers 404 instead of falling back to the page; `cache_assets` only marks real files immutable. No option. Benefit for every site: a stale chunk reference during a deploy no longer caches HTML under a JavaScript URL for a year.

### PR 2: configurable entity prefixes, links and player placeholders

```json
"opengraph": {
  "entity_prefixes": ["/", "/e/", "/p/"],
  "links": [{ "kinds": [21, 34235], "path": "/v/{nip19}" }],
  "player": "https://example.com/embed/{nip19}"
}
```

- `entity_prefixes`: path prefixes under which the last segment is a NIP-19 entity. Default is today's list.
- `links`: per kind list, the path written to `og:url` and the canonical link. Without a match, today's `/<nip19>` stays.
- `{nip19}` in templates: `naddr` for addressable events, `nevent` otherwise. `{nevent}` keeps working.

### PR 3: tags for NIP-71 videos and NIP-68 pictures

A branch in `event_tags` for kinds 20, 21, 22, 34235, 34236 built on `media::parse`:

- `og:type` `video.other`, `og:video` / `og:video:secure_url` (MP4 preferred over HLS), `og:video:type`, width and height from `imeta dim`.
- Twitter player card when `player` is configured, sized from the video instead of a fixed 640×480; `summary_large_image` otherwise.
- JSON-LD `VideoObject`: name, description (`summary` or content), `thumbnailUrl`, `uploadDate`, ISO 8601 `duration`, `contentUrl`, `embedUrl`.
- Thumbnail from `imeta image`, then the `thumb` and `image` tags (today `media::parse` reads only `imeta image`).
- Kind 20 gets `og:image` from its picture.

Small generic addition in the same PR: the article branch prefers a `title` / `summary` tag over `content`, which covers NIP-51 sets (playlists, kind 30005) and NIP-23 articles.

### PR 4: relay hints, opt-in

```json
"opengraph": { "hint_relays": 3 }
```

When set, lookups for an identifier also query up to N of its relay hints. Only `wss://` URLs whose host resolves to public addresses (reusing `health::public_ip`). Default `0` (off), because fetching from user-supplied hosts is an SSRF surface a site has to choose.

### PR 5: oEmbed

```json
"oembed": { "path": "/oembed", "provider_name": "Example", "width": 640, "height": 360 }
```

- A route at `path` taking `url` (and accepting `format=json`). Only URLs on the server's own origin; the path runs through the same `tags_for` as the page.
- With a player: `type: video`, `html` an iframe of the player URL, size from the video or the configured default. Without one: `type: link`. `title`, `author_name` (profile name), `author_url`, `thumbnail_url`, `provider_name`, `provider_url`, `cache_age`.
- 404 for paths without tags.
- Pages that get tags also get `<link rel="alternate" type="application/json+oembed">`.

zap.stream gains embeddable streams and clips from its existing `player` template without code.

### Not proposed upstream

| Need                                      | Covered by                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `/health`                                 | Point our Docker healthcheck at a static file (`/manifest.webmanifest`) |
| `.well-known` CORS, manifest content type | Existing `headers` rules (and `ServeDir` MIME guessing)                 |
| Sitemaps                                  | Existing `sitemap` sources                                              |

## 7. nostube's `ssr.json` after the PRs

```json
{
  "site_name": "nostube",
  "default_image": "/og-image.png",
  "relays": [
    "wss://relay.nostu.be",
    "wss://relay.divine.video",
    "wss://relay.primal.net",
    "wss://nos.lol"
  ],
  "live": false,
  "opengraph": {
    "entity_prefixes": ["/v/", "/short/", "/playlist/", "/live/", "/p/"],
    "links": [
      { "kinds": [21, 34235], "path": "/v/{nip19}" },
      { "kinds": [22, 34236], "path": "/short/{nip19}" },
      { "kinds": [30005], "path": "/playlist/{nip19}" },
      { "kinds": [30311], "path": "/live/{nip19}" }
    ],
    "player": "/embed.html?v={nip19}",
    "hint_relays": 3
  },
  "oembed": { "path": "/oembed", "provider_name": "Nostube", "width": 640, "height": 360 },
  "sitemap": [
    {
      "name": "videos",
      "media": true,
      "filter": { "kinds": [21] },
      "prefix": "/v/",
      "encoding": "nevent"
    },
    {
      "name": "videos-legacy",
      "media": true,
      "filter": { "kinds": [34235] },
      "prefix": "/v/",
      "encoding": "naddr"
    }
  ],
  "headers": [{ "prefix": "/.well-known/", "set": { "access-control-allow-origin": "*" } }]
}
```

Sitemaps need the video kinds in `kinds` and `backfill` (in-memory, `max_events` default 200 000). Whether nostu.be serves its own sitemap or keeps the one from `search.nostu.be` is open (section 10).

## 8. Behaviour changes for nostube

- New: OG and JSON-LD tags for profiles, live streams and playlists; a page cache instead of one relay query per request.
- oEmbed `author_name` becomes the profile name instead of the npub; playlists get oEmbed (`type: link`) instead of 404. Update `docs/embed/oembed.md`.
- Title format follows nostr-ssr (`<title> | <site_name>` for bundle heads; OG-merged titles as built by the tag functions). **[Assumption]** acceptable for link previews; to compare before cut-over.

## 9. Effort and order

1. Open an issue on `v0l/nostr-ssr` describing this plan and asking which parts Kieran wants; send PR 1 as the first, uncontroversial change.
2. PRs 2–5: about 2–3 days including tests **[Assumption]**, built in a working branch and run against nostu.be traffic locally.
3. Cut-over: Dockerfile `FROM voidic/nostr-ssr` with `dist/` and `ssr.json`, compare titles, tags, oEmbed, status codes and sitemap against the live Hono server, then switch and delete `apps/web/server`.

**Risk:** merge speed is unknown; two outside PRs (#1, #2) were open and unmerged on 16 November 2026. If a PR is declined, we keep a fork that differs only by that PR.

## 10. Open decisions

- Sitemap on nostu.be itself, or keep `search.nostu.be/sitemap.xml`?
- Do we accept the oEmbed `author_name` change, or ask for an option?
- Dead-media hiding (`health`): enable for nostu.be's OG and sitemaps?
