# One origin; Blossom and relay mounted at the root

The instance serves the app, Blossom and the relay from one origin, with the same layout on every name it answers to (canonical origin and access aliases alike). No subdomains. Blob URLs and relay URLs end up in signed events, so this layout is effectively permanent.

Blossom and the relay sit at the root, not under `/blossom` or `/relay`. Requests are dispatched in this order:

1. `/` with a WebSocket upgrade or `Accept: application/nostr+json` → relay (NIP-01, NIP-11).
2. `/api/*` → the instance's own endpoints (admin, setup, login, public config, health).
3. Blossom paths by method and path → Blossom: `GET`/`HEAD`/`DELETE /<sha256>[.ext]`, `PUT`/`HEAD`/`OPTIONS /upload`, `GET /list/<pubkey>`, `PUT /mirror`, `PUT /report`. An unknown hash gets Blossom's 404, never the app shell.
4. `/assets/*` → static files; missing asset is 404, never the app shell.
5. `GET /sitemap.xml` and `GET /robots.txt` → written by the server (`src/seo.rs`): the sitemap lists the start page, the pages that have text and every video of the creators in the instance's relay that the creator did not hide, each video with Google's `<video:video>` entry when it has a thumbnail; robots.txt allows everything and points to the sitemap.
5a. `GET /feed.xml` (RSS 2.0) and `GET /atom.xml` (Atom) → written by the server (`src/seo.rs`): the newest 100 videos of the creators in the instance's relay that the creator did not hide, newest first, each with title, link to its `/v/<link>` page, published date, description and its first video file as enclosure (`<enclosure>` / `rel="enclosure"` plus `media:content`; `length` is `0` when the event has no `size`). Every page head carries `<link rel="alternate">` for both feeds. Scheduled videos are not on the relay until released, so they never appear.
6. Any other `GET` → an embedded root file of the app build if one exists (`favicon*`, `manifest.webmanifest`, `sw.js`, `registerSW.js`, `embed.html`, the embed player's worker chunks), else the app shell (including `GET /upload`, the app's upload page). The server replaces the shell's `<title>` with the head for the route, for crawlers and link previews that do not run JavaScript: title, description, canonical URL, Open Graph and a Twitter player card (`/embed.html?v=<link>`). A `/v/<naddr|nevent|note>` page gets the video's head, with a schema.org `VideoObject` (JSON-LD), when the video is in the instance's relay, otherwise the site's. The head also carries the current public config (`<script type="application/json" id="nostube-config">`, `<` written as `\u003c`); the site validates and uses it instead of requesting `/api/config`.

The Blossom library extracted from almond covers BUD-01, BUD-02, BUD-04, BUD-06 and BUD-09, nothing else. Almond's own pages and extras (`/`, `/index.html`, `/config`, `/filter-test.html`, `/_wot`, `/filter`, `/_upstream`, `/metrics`, `/_metrics`) stay in almond's standalone binary; the instance's admin interface covers those needs. Cashu payment stays a library feature the instance builds without.

## Considered Options

- **Subdomains** (`blossom.<host>`, `relay.<host>`): impossible on `.local` and bare-IP aliases (ADR 0003), so it would mean two layouts, extra SANs and DNS entries, and URLs that change shape between canonical origin and aliases.
- **Blossom under `/blossom`**: almond would cope (relative routes, path-aware `public_url`, domain-only auth), but clients don't. Nostube's `normalizeServerUrl` strips paths, and its blob detection only accepts `/<sha256>` at the URL root, so path-prefixed blob URLs in events would lose sha256 fallback to other servers, in Nostube and other clients alike.
- **Relay under `/relay`**: works in Nostube, but relay URL normalization across other clients is uneven, and `wss://<host>` is what relay lists and hints expect.

## Consequences

The root namespace is shared, so the app may never add a route that matches a Blossom path for a non-`GET` method or a 64-hex path, and instance endpoints must stay under `/api/`. The app's `/upload` page and Blossom's `/upload` coexist only by HTTP method.
