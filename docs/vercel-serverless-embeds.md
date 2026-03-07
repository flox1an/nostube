# Vercel Serverless Embeds

The serverless function in `api/index.ts` provides social media embed support (Open Graph meta tags, Twitter Player Cards, oEmbed) by detecting crawler bots and injecting metadata before serving the SPA.

**Status: Disabled** (v0.2.19) — the function was timing out on Vercel due to WebSocket connections to Nostr relays not closing cleanly within the serverless execution window.

## How to Re-enable

Add the function config and route rewrites back to `vercel.json`:

```json
{
  "functions": {
    "api/index.ts": {
      "includeFiles": "server/**",
      "maxDuration": 10
    }
  },
  "rewrites": [
    { "source": "/v/:path*", "destination": "/api" },
    { "source": "/short/:path*", "destination": "/api" },
    { "source": "/playlist/:path*", "destination": "/api" },
    { "source": "/oembed", "destination": "/api" },
    { "source": "/((?!\\.well-known/).*)", "destination": "/index.html" }
  ]
}
```

The key pieces:

1. **`functions`** — tells Vercel to bundle `server/**` files with the serverless function and caps execution at 10 seconds.
2. **Route rewrites** — the `/v/`, `/short/`, `/playlist/`, and `/oembed` rewrites must appear _before_ the SPA catch-all so they route through the serverless function instead of falling through to `index.html`.

## Architecture

- `api/index.ts` — Hono handler entry point (uses `handle()` from `hono/vercel`)
- `server/index.ts` — `createApp()` builds the Hono app with bot detection and meta injection
- `server/detect.ts` — user-agent based bot detection
- `server/meta.ts` — generates Open Graph / Twitter Card meta tags
- `server/nostr.ts` — fetches video events from Nostr relays
- `server/oembed.ts` — `/oembed` JSON endpoint
- `server/template.ts` — HTML template with injected meta tags

## Known Issues

The relay fetch in `server/nostr.ts` opens WebSocket connections that can leak if the serverless function times out before they close. Previous fix attempts:

- Hard 8s request timeout + 4s relay fetch timeout
- Replaced `pool.get()` with `subscribeMany` for explicit lifecycle control
- Resolve on first relay EOSE instead of waiting for all relays
- `maxDuration: 10` safety cap

None fully resolved the issue. Future fixes should ensure all WebSocket connections are deterministically closed before the function returns, or consider an HTTP-based relay proxy instead of direct WebSocket connections.

## Standalone Server

For self-hosted deployments, the embed server works reliably as a long-running process:

```bash
npm run server:dev
```

This avoids the serverless timeout constraints entirely.
