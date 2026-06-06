# api/

Vercel Edge Functions that serve as a server-side rendering layer for social-media link previews (Open Graph, oEmbed). Every route is declared `runtime: 'edge'` and is mapped from public URL paths via `vercel.json` rewrites.

## Why this exists

The main app is a client-side SPA (`index.html`). Crawlers and link-unfurlers (Twitter, Discord, Telegram, …) never execute JavaScript, so they see a bare `<html>` skeleton with no `<meta>` tags. These edge functions intercept the page URLs, fetch the relevant Nostr event, inject Open Graph / Twitter Card / oEmbed `<meta>` tags into the HTML, and return the enriched page to the crawler. Regular browser requests fall through to the SPA unchanged.

## Routes

| Public URL         | Edge function             | Handler                          |
| ------------------ | ------------------------- | -------------------------------- |
| `/v/:nevent`       | `api/v/[nevent].ts`       | `handleVideoPage(…, 'video')`    |
| `/short/:nevent`   | `api/short/[nevent].ts`   | `handleVideoPage(…, 'short')`    |
| `/playlist/:nip19` | `api/playlist/[nip19].ts` | `handleVideoPage(…, 'playlist')` |
| `/oembed`          | `api/oembed.ts`           | `handleOEmbed(…)`                |
| `/api/index`       | `api/index.ts`            | health check                     |

## Internal modules (`server/`)

The shared logic lives in `server/` and is imported by the edge functions:

| Module               | Responsibility                                                 |
| -------------------- | -------------------------------------------------------------- |
| `server/nostr.ts`    | Decode NIP-19 identifiers, fetch Nostr events from relays      |
| `server/meta.ts`     | Extract video metadata from events, build `<meta>` tag strings |
| `server/oembed.ts`   | Build the oEmbed JSON response                                 |
| `server/template.ts` | Inject `<meta>` tags into the cached `index.html`              |
| `server/detect.ts`   | Bot / crawler user-agent detection                             |

`api/_nostr.ts` re-exports the two main handlers (`handleVideoPage`, `handleOEmbed`) so each route file stays to a few lines.

## oEmbed

`/oembed?url=<encoded-page-url>&format=json` implements the [oEmbed spec](https://oembed.com/). The page routes embed a `<link rel="alternate" type="application/json+oembed" …>` tag pointing here, which lets platforms like Twitter display a richer card with the player iframe.

## Flow

```
Crawler → GET /v/:nevent
  → vercel.json rewrite → api/v/[nevent].ts
    → _nostr.ts: decodeIdentifier + fetchEvent (relay fetch)
    → server/meta.ts: extractVideoMeta + findValidThumbnail
    → server/template.ts: injectMeta into index.html
  ← enriched HTML with <meta og:*, twitter:*, link[oEmbed]>
```

On any error (unknown identifier, relay timeout, etc.) the function falls back to serving the plain `index.html` so the SPA still loads normally for end-users.
