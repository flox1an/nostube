# Self-hosting the web app

The web app is the Nostube client that runs at [nostu.be](https://nostu.be): a React single-page app that reads videos from Nostr relays and plays them from Blossom servers. It has no backend of its own, so any static host can serve it. An optional small Node server adds link previews and oEmbed.

::: tip Most creators want the Nostube Server
Do you want a website for your own videos? The [Nostube Server](/server/) already serves its own site, Studio, relay and Blossom storage, so it needs no separate web app. Host this web app only to run another public Nostube client, for example with your own defaults or under your own domain.
:::

![The Nostube web app home page](/screenshots/web-home.webp)

## Options

| Option | What you get | Link previews and oEmbed |
| --- | --- | --- |
| [Static hosting](#static-hosting) | `dist/` on any static host or CDN | No |
| [Docker image](#docker) | `dist/` plus a Hono server on port 8080 | Yes |

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

| Host | What handles it |
| --- | --- |
| Netlify, Cloudflare Pages | `dist/_redirects` (`/* /index.html 200`) |
| GitHub Pages, surge.sh | `dist/404.html` |
| nginx | `try_files $uri $uri/ /index.html;` |

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

| Route | Response |
| --- | --- |
| `GET /v/<id>`, `/short/<id>`, `/playlist/<id>` | The app, with the event's title, description and thumbnail as Open Graph and Twitter card tags in the `<head>`; videos also get a Twitter player card and an oEmbed discovery link |
| `GET /oembed?url=<page-url>` | oEmbed JSON, see [oEmbed](/embed/oembed) |
| `GET /health` | `healthy` |
| `GET /assets/*` | Build files, `Cache-Control: public, max-age=31536000, immutable`; a missing file is a 404, never the app |
| Any other path | The file from `dist/` if it exists, else `index.html` |

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

| Variable | When | Default | Effect |
| --- | --- | --- | --- |
| `PORT` | Runtime (Docker server) | `8080` | Port the Hono server listens on. |
| `VITE_NSFW_SAFETY` | Build time | `on` | Any value except `off` keeps NSFW safety on: viewers confirm they are 18+ before they can opt in to sensitive content, and the embed player refuses flagged videos to viewers without that opt-in. `off` disables both; only use it if you take responsibility for the content that then plays. |

Pass the build-time value to Docker as a build argument, or set it in the environment of a static build:

```bash
docker build --build-arg VITE_NSFW_SAFETY=off -t nostube .
VITE_NSFW_SAFETY=off npm run build
```

There is no runtime configuration for relays or servers. The defaults below are compiled in.

## Default relays and servers

New visitors start with these defaults. Visitors change the bold ones under **Settings → Network**; the settings are stored in their browser. The others are fixed in the code.

| Setting | Default | Source file |
| --- | --- | --- |
| **Relays** (read) | `wss://relay.nostu.be`, `wss://relay.divine.video`, `wss://relay.primal.net`, `wss://nos.lol`, `wss://offchain.pub`, `wss://nostr.wine` | `apps/web/src/constants/relays.ts` |
| Profile metadata relays | `wss://purplepag.es` | same |
| Indexer relays | `wss://relay.noswhere.com`, `wss://relay.snort.social` | same |
| Zap receipt relays | `wss://relay.primal.net`, `wss://nos.lol` | same |
| **View-sharing relays** | `wss://relay.divine.video` | same |
| **Video Hosting** (Blossom upload servers) | `https://blossom.primal.net`, `https://nostr.download`, `https://almond.slidestr.net` | `packages/core/src/instance-config.ts` (`DEFAULT_BLOSSOM_SERVERS`) |
| **Streaming Servers** (caching servers) | none | `apps/web/src/constants/relays.ts` |
| **Image Proxy URL** (Service endpoints) | `https://imgproxy.nostu.be` | `packages/core/src/imgproxy-config.ts` |
| **Search Service URL** (Service endpoints) | `https://nostube-search.apps2.slidestr.net` | `apps/web/src/lib/search-client.ts` |

The **Reset** buttons in **Settings → Network** take their values from the moderation preset selected under **Settings → Presets**: its default relays and its default Blossom proxy. Signed-in users who published a Blossom server list (kind 10063) get that list when they reset **Video Hosting**.

The search service and the image proxy are not part of this repository. To run them yourself, see [Supporting projects](/guide/supporting-projects).

To ship different defaults on your own deployment, edit the files in the table and rebuild. Read more about storage servers in [Blossom storage](/media/blossom).

![The web app on a phone](/screenshots/web-mobile-home.webp)

## Branding left in a self-hosted copy

A self-hosted web app still names Nostube in a few places that are not configurable:

- The page title suffix (`- nostube`) and `og:site_name` set by the server.
- `provider_name` in oEmbed responses.
- The embed player's **Open on nostube** links, which point to `https://nostu.be`.

The [Nostube Server](/server/) embed and site do not have these: they follow the creator's own branding.
