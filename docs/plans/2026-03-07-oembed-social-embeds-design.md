# Social Media Embeds (OG + oEmbed + Twitter Player)

## Goal

Inject Open Graph meta tags, Twitter Player Card tags, and serve an oEmbed endpoint so video/short/playlist links render rich previews on social media (Twitter/X, Discord, Slack, WhatsApp, Telegram, etc.) — with an inline video player where supported.

**Constraint:** The existing Vite SPA must remain deployable as a standalone static site (no SSR required). The server layer is purely additive.

## Architecture

A lightweight Hono server sits in front of the static `dist/` output:

- **On Vercel:** Runs as a serverless function. `vercel.json` rewrites video/short/playlist routes to `/api`. The function checks the user-agent — bots get HTML with injected meta tags, humans get the unmodified SPA `index.html`.
- **Self-hosted with embeds:** Run `node server/index.ts` to serve `dist/` with bot detection and meta injection.
- **Self-hosted static:** Serve `dist/` with nginx/caddy/any static server. App works, crawlers just don't get rich embeds.

```
Crawler ──► Vercel/Hono ──► detect bot UA ──► fetch event from relays
                                             ──► inject <meta> tags into index.html
                                             ──► return enriched HTML

Human  ──► Vercel/Hono ──► detect human UA ──► serve unmodified index.html (SPA)
```

## Routes Handled by Server

| Route                      | Identifier      | Event Kind    |
| -------------------------- | --------------- | ------------- |
| `/v/:nevent`               | nevent/naddr    | 34235, 34236  |
| `/short/:nevent`           | nevent/naddr    | 34236         |
| `/playlist/:naddr`         | naddr           | 30004, etc.   |
| `/oembed?url=&format=json` | parsed from URL | same as above |

## Crawler Detection

Simple user-agent regex match:

```
Twitterbot|facebookexternalhit|Slackbot|Discordbot|WhatsApp|Telegram|LinkedInBot|Embedly|Iframely|vkShare|Pinterestbot
```

## Nostr Relay Fetching

1. Decode `nevent1...` or `naddr1...` with `nostr-tools/nip19`
2. Connect to relays from decoded hints + hardcoded fallbacks (`wss://relay.damus.io`, `wss://nos.lol`)
3. Use `nostr-tools` SimplePool — lightweight, no applesauce dependency on server
4. Timeout after 3 seconds — if no event found, serve plain `index.html` (graceful degradation)
5. Author name: use truncated `npub` for v1 (profile fetch can be added later with caching)

## Metadata Extraction from Event

| Field       | Source                                               |
| ----------- | ---------------------------------------------------- |
| Title       | `title` tag                                          |
| Description | `summary` tag or `content` field                     |
| Thumbnail   | `thumb` tag, first `image` tag, or from `imeta` tags |
| Video URL   | first `url` tag or from `imeta` tags                 |
| Dimensions  | `imeta` tag `dim` field (e.g. `1920x1080`)           |
| Author      | `pubkey` → encoded as `npub`                         |

## Injected Meta Tags

### Open Graph

```html
<meta property="og:type" content="video.other" />
<meta property="og:title" content="Video Title" />
<meta property="og:description" content="Video description..." />
<meta property="og:image" content="https://thumbnail-url.jpg" />
<meta property="og:video" content="https://video-url.mp4" />
<meta property="og:video:type" content="video/mp4" />
<meta property="og:video:width" content="1920" />
<meta property="og:video:height" content="1080" />
<meta property="og:url" content="https://nostube.com/v/nevent1..." />
<meta property="og:site_name" content="NosTube" />
```

### Twitter Player Card

```html
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="Video Title" />
<meta name="twitter:description" content="Video description..." />
<meta name="twitter:image" content="https://thumbnail-url.jpg" />
<meta name="twitter:player" content="https://nostube.com/embed.html#nevent1..." />
<meta name="twitter:player:width" content="1920" />
<meta name="twitter:player:height" content="1080" />
```

### oEmbed Discovery Link

```html
<link
  rel="alternate"
  type="application/json+oembed"
  href="https://nostube.com/oembed?url=https://nostube.com/v/nevent1..."
/>
```

## oEmbed Endpoint

`GET /oembed?url=...&format=json` returns:

```json
{
  "version": "1.0",
  "type": "video",
  "title": "Video Title",
  "author_name": "npub1...",
  "author_url": "https://nostube.com/u/npub1...",
  "provider_name": "NosTube",
  "provider_url": "https://nostube.com",
  "thumbnail_url": "https://thumbnail-url.jpg",
  "html": "<iframe src=\"https://nostube.com/embed.html#nevent1...\" width=\"1920\" height=\"1080\" frameborder=\"0\" allowfullscreen></iframe>",
  "width": 1920,
  "height": 1080
}
```

For playlists: `og:type` is `website`, no `og:video` or `twitter:player` — just title, description, and thumbnail of the first video.

## File Structure

### New files

```
server/
  index.ts        — Hono app: routes, serves dist/ for non-bot requests
  meta.ts         — buildMetaTags(event, type) → HTML string of <meta> + <link> tags
  nostr.ts        — fetchEvent(id, relays) → NostrEvent | null (SimplePool + 3s timeout)
  oembed.ts       — GET /oembed handler → oEmbed JSON response
  detect.ts       — isCrawler(userAgent) → boolean
  template.ts     — injectMeta(html, metaTags) → HTML with tags before </head>

api/
  index.ts        — Vercel serverless entry: exports Hono app handler
```

### Modified files

- `vercel.json` — add rewrites for `/v/:path*`, `/short/:path*`, `/playlist/:path*`, `/oembed` to `/api`
- `package.json` — add `hono` dependency, `server:dev` and `server:build` scripts

### Unchanged

- Everything in `src/` — zero changes
- `vite.config.ts` — unchanged
- Build output (`dist/`) — still a standalone SPA

## Dependencies

- `hono` (new) — server framework, runs on Vercel/Node/Cloudflare/Deno
- `nostr-tools` (existing) — reused for nip19 decoding and SimplePool

## Future Enhancements (not in v1)

- Cache layer (Vercel KV or in-memory LRU) for relay responses
- Author profile name resolution (kind 0 fetch)
- Playlist-specific oEmbed with track listing
