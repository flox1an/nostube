# Self-hosting the web app

The web app is the Nostube client that runs at [nostu.be](https://nostu.be): a React single-page app that reads videos from Nostr relays and plays them from Blossom servers. It has no backend of its own, so any static host can serve it. An optional small Node server adds link previews and oEmbed.

::: tip Most creators want the Nostube Server
Do you want a website for your own videos? The [Nostube Server](/server/) already serves its own site, Studio, relay and Blossom storage, so it needs no separate web app. Host this web app only to run another public Nostube client, for example with your own defaults or under your own domain.
:::

![The Nostube web app home page](/screenshots/web-home.webp)

On mobile, rotating a playing video to landscape expands the player to the available
viewport; rotating back restores the page. In browsers that require a tap for
native fullscreen, browser controls may remain visible. Use the fullscreen
button to request native fullscreen.

## Livestreams

**Live** opens `/live`, the streams currently live across Nostr ([NIP-53](https://github.com/nostr-protocol/nips/blob/master/53.md) kind `30311`); a stream opens at `/live/<naddr>`. Nostube only plays streams: there is no stream hosting, zap payment or presence publishing. Guests can watch and read; signed-in accounts send kind `1311` chat through their existing signer.

Below the title, **Follow** follows the host, the zap button zaps the stream (paid to the host, bound to the stream address, so it appears in the chat) and **Share** shares the stream link. The player attempts autoplay; browser policy may require a click for sound. Chat sits beside the player (below it on narrow screens) with its own scroll area and follows new messages until you scroll up; **Jump to latest** resumes. Enter adds a line; Ctrl/Cmd+Enter or **Send chat** publishes. A rejected message keeps its draft. All chat links open a new tab so playback continues.

Chat author and zap-sender profile links use `nprofile` pointers with relay hints. Message authors carry the relays where their message was seen, falling back to the chat's relays when none are known; zap senders carry the chat's relays.

**Chat settings** offer **Pop-out chat** (`/live/<naddr>/chat`, a chat-only window) and **Chat appearance**: font size, coloured names, timestamps, hiding accounts on your own and the streamer's mute list (on by default), Web of Trust badges and a minimum trust score. Unscored accounts, the streamer and you are never hidden by the trust filter. Settings are stored on this device.

Kind `9735` zap receipts appear as highlighted messages only when they pass [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) Appendix F checks against the LNURL provider in the recipient's own profile (host, publisher or `zap` split target); each invoice appears once. Unverifiable receipts are not shown.

Creators who are live show a LIVE tag and a **Live now** section on their profile, a LIVE badge in header search results, and their stream at the top of the suggestions on their video pages.

Streams are read from the configured read relays plus `relay.damus.io`, `nos.lol`, `relay.primal.net` and `relay.zap.stream`, and from the public `wss://` relay hints of a stream link. Discovery covers the last 24 hours (150 announcements); chat shows the newest 300 entries. An announcement still marked live after an hour without update counts as ended. `Host` tags are shown, not verified. Blocklists, mutes and NSFW settings apply. Server-instance builds have no live routes and query no public live relays.

Playback is limited to public HTTPS HLS/MP4 URLs; MoQ, RTMP and audio spaces are not supported. An ended stream plays its recording when it has one. Provider CORS, codec and availability restrictions can still prevent playback.

## Options

| Option                            | What you get                            | Link previews and oEmbed |
| --------------------------------- | --------------------------------------- | ------------------------ |
| [Static hosting](#static-hosting) | `dist/` on any static host or CDN       | No                       |
| [Docker image](#docker)           | `dist/` plus a Hono server on port 8080 | Yes                      |

Videos, profiles and comments work the same in both options. Only the Docker image answers `/oembed` and puts the title, thumbnail and player card of a video into the HTML of `/v/…` pages, so link previews in chat apps and social networks show the video instead of a generic Nostube card.

## Static hosting

Build from the repository root (npm workspaces):

```bash
git clone https://github.com/flox1an/nostube.git
cd nostube
npm ci
cd apps/web
npm run build
```

`npm run build` type-checks, lints, builds the app and the [embed player](/embed/) into `apps/web/dist/`, and copies `index.html` to `404.html`. Upload the contents of `dist/`.

The app uses client-side routes (`/v/…`, `/short/…`, `/p/…`), so the host must answer unknown paths with `index.html`:

| Host                      | What handles it                          |
| ------------------------- | ---------------------------------------- |
| Netlify, Cloudflare Pages | `dist/_redirects` (`/* /index.html 200`) |
| GitHub Pages, surge.sh    | `dist/404.html`                          |
| nginx                     | `try_files $uri $uri/ /index.html;`      |

Serve the files under `/assets/` with a long cache lifetime; their names contain a content hash. Do not cache `index.html` and `sw.js` for long: the service worker precaches the app shell and picks up a new deploy when the browser fetches a changed `sw.js`.

`npm start` previews `dist/` locally on port 8080 (`vite preview`).

::: info
`index.html` contains Open Graph tags for nostu.be (`og:url`, `og:image`). Edit them in `apps/web/index.html` before building if the previews of your start page should name your domain.
:::

## Docker

The `Dockerfile` in the repository root builds the app and the embed player and runs the standalone Hono server from `apps/web/server/`:

```bash
docker build -t nostube .
docker run -d --name nostube -p 8080:8080 nostube
curl http://localhost:8080/health   # healthy
```

The server answers:

| Route                                          | Response                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v/<id>`, `/short/<id>`, `/playlist/<id>` | The app, with the event's title, description and thumbnail as Open Graph and Twitter card tags in the `<head>`; videos also get a Twitter player card and an oEmbed discovery link |
| `GET /oembed?url=<page-url>`                   | oEmbed JSON, see [oEmbed](/embed/oembed)                                                                                                                                           |
| `GET /health`                                  | `healthy`                                                                                                                                                                          |
| `GET /assets/*`                                | Build files, `Cache-Control: public, max-age=31536000, immutable`; a missing file is a 404, never the app                                                                          |
| Any other path                                 | The file from `dist/` if it exists, else `index.html`                                                                                                                              |

`<id>` is a `nevent1…`, `naddr1…` or `note1…` identifier. For `/v/`, `/short/` and `/playlist/` the server looks up the event on the relays in the identifier plus `wss://relay.nostu.be`, `wss://relay.divine.video`, `wss://relay.primal.net` and `wss://nos.lol` (4 s timeout). If it finds nothing, it serves the plain app.

The compose files in the repository (`docker-compose.yml`, `apps/web/docker-compose.yml`) are written for Coolify: they only `expose` port 8080 to the proxy network and do not publish it on the host. Add a `ports:` entry or use `docker run -p` as above when running without such a proxy.

To run the server without Docker, do what the `Dockerfile` does, after `npm run build`:

```bash
cd apps/web
npx tsc server/standalone.ts --outDir server-dist \
  --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck
PORT=8080 node server-dist/standalone.js
```

### Behind a reverse proxy

Put the server behind a proxy that terminates TLS and forwards the original `Host` header. Set `X-Forwarded-Proto: https` on that proxy so link previews and oEmbed responses (`og:url`, `twitter:player`, the iframe `src`) use HTTPS. Without this header the server uses the scheme of its incoming connection. Only `http` and `https` are accepted.

The proxy must **overwrite** `X-Forwarded-Proto`, not pass a client-supplied value through. Keep the backend port private to the proxy network.

## Configuration

| Variable           | When                    | Default | Effect                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`             | Runtime (Docker server) | `8080`  | Port the Hono server listens on.                                                                                                                                                                                                                                                                |
| `VITE_NSFW_SAFETY` | Build time              | `on`    | Any value except `off` keeps NSFW safety on: viewers confirm they are 18+ before they can opt in to sensitive content, and the embed player refuses flagged videos to viewers without that opt-in. `off` disables both; only use it if you take responsibility for the content that then plays. |

Pass the build-time value to Docker as a build argument, or set it in the environment of a static build:

```bash
docker build --build-arg VITE_NSFW_SAFETY=off -t nostube .
VITE_NSFW_SAFETY=off npm run build
```

There is no runtime configuration for relays or servers. The defaults below are compiled in.

## Default relays and servers

New visitors start with these defaults. Visitors change the bold ones under **Settings → Network**; the settings are stored in their browser. The others are fixed in the code.

| Setting                                    | Default                                                                                                                                 | Source file                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Relays** (read)                          | `wss://relay.nostu.be`, `wss://relay.divine.video`, `wss://relay.primal.net`, `wss://nos.lol`, `wss://offchain.pub`, `wss://nostr.wine` | `apps/web/src/constants/relays.ts`                                 |
| Profile metadata relays                    | `wss://purplepag.es`                                                                                                                    | same                                                               |
| Indexer relays                             | `wss://relay.noswhere.com`, `wss://relay.snort.social`                                                                                  | same                                                               |
| Zap receipt relays                         | `wss://relay.primal.net`, `wss://nos.lol`                                                                                               | same                                                               |
| **View-sharing relays**                    | `wss://relay.divine.video`                                                                                                              | same                                                               |
| **Video Hosting** (Blossom upload servers) | `https://blossom.primal.net`, `https://nostr.download`, `https://almond.slidestr.net`                                                   | `packages/core/src/instance-config.ts` (`DEFAULT_BLOSSOM_SERVERS`) |
| **Streaming Servers** (caching servers)    | none                                                                                                                                    | `apps/web/src/constants/relays.ts`                                 |
| **Image Proxy URL** (Service endpoints)    | `https://imgproxy.nostu.be`                                                                                                             | `packages/core/src/imgproxy-config.ts`                             |
| **Search Service URL** (Service endpoints) | `https://search.nostu.be`                                                                                                               | `apps/web/src/lib/search-client.ts`                                |

The **Reset** buttons in **Settings → Network** take their values from the moderation preset selected under **Settings → Presets**: its default relays and its default Blossom proxy. Signed-in users who published a Blossom server list (kind 10063) get that list when they reset **Video Hosting**.

The search service and the image proxy are not part of this repository. To run them yourself, see [Supporting projects](/guide/supporting-projects).

To ship different defaults on your own deployment, edit the files in the table and rebuild. Read more about storage servers in [Blossom storage](/media/blossom).

### Refining search results

Search filters apply immediately and stay in the page URL. The panel explains this timing and shows how many of the loaded results match; the count is not a total across all relays. **Show results** closes the panel without changing your selections. **Reset** clears refinements and restores the default sort while keeping your search query.

### Browsing relays and relay sets

The source control above Home, Shorts and category feeds offers **My feed** (your configured read relays), individual relays, locally saved sources and public Nostr relay lists. **Add relay…** opens a hostname or WebSocket URL without changing your default read/write relays. **Save on this device** keeps a shortcut in this browser for the current account; anonymous shortcuts remain separate. Manage these under **Settings → Network → Browse sources**.

The source name and trust-filter state appear together above the video grid and scroll with the feed. Categories use their own full-width row on Home and category pages; Shorts stays in its own feed. When browsing a selected source, expand its relay count to see its members and the **Save on this device**, **Copy link** and settings actions. **My feed** returns directly to your configured read relays.

**Open relay set…** accepts a `naddr` or `nostr:naddr` address of a NIP-51 kind `30002` set. Signed-in users also see public favourite relays and referenced sets from kind `10012`, plus their own sets. A preview lists members before **Open Relay Set** connects to them. Private entries are not decrypted; sets with invalid/disallowed members, no public members or more than 12 relays are rejected explicitly. Sets and favourites are read-only: Nostube does not sign changes to these lists.

Selected sources are in the page URL, survive reload, and remain selected when navigating between Home, Shorts and categories. Shared set links require confirmation before browsing member relays. Passive lookups use configured discovery relays; explicitly previewing a pasted address can additionally contact its relay hints and its author's outbox. Trust, moderation and content filters still apply. Independent Home shelves are hidden while browsing a particular source.

**Settings → Network → Relays** controls device-local default reading/publishing. Account NIP-65 relays are merged into this configuration when loaded; editing this screen does not publish a new NIP-65 event. Adding a relay here is an explicit read-and-write action. The per-row **Browse** action only changes the feed. Instance relay restrictions and browser secure-connection rules continue to apply.

### Interaction loading

Nearby Shorts slides preload comments and reactions together. Concurrent reads for the same relay and event reference share a request; completed reads, including empty results, are reused for 30 seconds. Failed reads can be retried immediately. A new relay or reference is still queried, and both event-ID and address references remain supported.

This can delay newly received reactions during a quick return to a recently viewed slide. Locally published events still update the event store immediately. Zap receipts keep their live subscriptions. Author NIP-65 relay lists used only for publishing are looked up when the viewer submits a reaction, comment or zap, not while browsing. The first action may wait for discovery to finish; cached author lists and the configured/seen-relay fallback remain available.

### Relays for subscriptions

The **Subscriptions** feed and the home page's **From creators you follow** shelf also query the followed creators' NIP-65 outbox relays (kind 10002, `write` or unmarked `r` tags). Videos and shorts are fetched together. Creators sharing an outbox relay are grouped into one author-filtered request per page; each relay keeps its own pagination cursor. Configured read relays remain available for creators whose relay lists cannot be found and for mirrored videos.

Relay-list discovery uses the existing Applesauce relay pool and batched address loader. Concurrent lookups are shared, and results—including missing lists—are reused for five minutes. Stored relay lists and follow-list relay hints can start outbox requests while discovery refreshes in parallel; newly discovered relay/author pairs are added without restarting existing sources. Relay lists are persisted in the event cache and do not expire merely because their publication date is old.

This applies to the public web client. Instance builds retain their configured relay allowlist and creator scope.

![The web app on a phone](/screenshots/web-mobile-home.webp)

## Branding left in a self-hosted copy

A self-hosted web app still names Nostube in a few places that are not configurable:

- The page title suffix (`- nostube`) and `og:site_name` set by the server.
- `provider_name` in oEmbed responses.
- The embed player's **Open on nostube** links, which point to `https://nostu.be`.

The [Nostube Server](/server/) embed and site do not have these: they follow the creator's own branding.
