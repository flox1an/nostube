# Nostube oEmbed Service Design

**Date:** 2025-11-27
**Status:** Approved (Implementation Postponed)
**Type:** New Feature - Separate Service

## Overview

A standalone oEmbed service that enables external websites (Discord, Slack, blogs, forums) to automatically embed Nostube videos when users paste video URLs. The service is deployed separately from the main Nostube frontend to maintain the SPA's static nature and simplify self-hosting.

## Goals

- Provide standard oEmbed API support for Nostube video URLs
- Enable rich video embeds on third-party platforms (Discord, Slack, Twitter, etc.)
- Keep the main Nostube app purely static (no server-side dependencies)
- Allow self-hosters to run their own oEmbed service
- Fetch rich metadata (title, author, thumbnail) from Nostr relays
- Provide graceful fallbacks when metadata unavailable

## Non-Goals (for v1)

- oEmbed discovery tags in HTML (no SSR/SSG required)
- Support for custom embed parameters (autoplay, muted, etc.)
- Authentication or rate limiting
- Webhook notifications for cache invalidation
- Support for non-video content types

## Architecture

### Two-Project Design

**Project 1: nostube-oembed-service** (new repository)

- Standalone Node.js serverless project
- Technology: Node.js + nostr-tools + native fetch
- Deployment: Vercel Functions (or any serverless platform)
- Default domain: `https://oembed.nostu.be`
- Repository: Separate from main Nostube app

**Project 2: nostube** (main frontend - existing)

- Remains purely static React SPA
- Add configurable `oembedEndpoint` to AppConfig
- Default points to official service: `https://oembed.nostu.be`
- Self-hosters can override to use their own oEmbed instance

### Project Structure (nostube-oembed-service)

```
nostube-oembed-service/
├── api/
│   └── oembed.js              # Main oEmbed endpoint
├── lib/
│   ├── nostr-client.js        # Relay connections & event fetching
│   ├── video-parser.js        # Parse Nostr events to video metadata
│   ├── url-parser.js          # Extract identifiers from URLs
│   └── cache.js               # In-memory cache implementation
├── tests/
│   ├── oembed.test.js         # Endpoint tests
│   └── nostr-client.test.js   # Nostr integration tests
├── vercel.json                # Vercel configuration
├── package.json               # Dependencies
├── README.md                  # Documentation
└── .env.example               # Configuration template
```

## oEmbed Service Implementation

### Endpoint Specification

**URL Format:**

```
https://oembed.nostu.be/api/oembed?url=<video-url>&format=json
```

**Supported Parameters:**

| Parameter | Type   | Required | Default | Description                 |
| --------- | ------ | -------- | ------- | --------------------------- |
| `url`     | string | **yes**  | -       | Full Nostube video URL      |
| `format`  | string | no       | json    | Response format (json only) |

**Supported URL Patterns:**

- `https://nostu.be/v/<nevent>`
- `https://nostu.be/v/<naddr>`
- `https://nostu.be/v/<note>`
- `https://<custom-domain>/v/<identifier>` (if self-hosted)

### Request Flow

```
1. External service (Discord) makes GET request to oEmbed endpoint
2. Parse video URL → extract identifier (nevent/naddr/note)
3. Decode identifier using nostr-tools (NIP-19)
4. Extract hint relays from identifier
5. Connect to hint relays via WebSocket
6. Fetch video event (kinds 21, 22, 34235, 34236)
7. Parse event → extract title, author, thumbnail, duration
8. Generate iframe HTML for embed player
9. Return oEmbed JSON with metadata
10. Cache response for 10 minutes
```

### Response Format (Success)

**Standard oEmbed JSON:**

```json
{
  "type": "video",
  "version": "1.0",
  "provider_name": "Nostube",
  "provider_url": "https://nostu.be",
  "title": "Video Title from Nostr Event",
  "author_name": "Author Display Name or npub",
  "author_url": "https://nostu.be/author/<npub>",
  "thumbnail_url": "https://cdn.example.com/thumbnail.jpg",
  "thumbnail_width": 1280,
  "thumbnail_height": 720,
  "html": "<iframe src=\"https://nostu.be/embed?v=nevent123\" width=\"640\" height=\"360\" frameborder=\"0\" allowfullscreen allow=\"autoplay; fullscreen\"></iframe>",
  "width": 640,
  "height": 360,
  "cache_age": 600
}
```

**Field Details:**

- `type`: Always "video"
- `version`: oEmbed spec version (1.0)
- `title`: Video title from `title` tag
- `author_name`: Video author from `pubkey` (display name from kind 0 if available)
- `author_url`: Link to author page on Nostube
- `thumbnail_url`: Video thumbnail from `image` tag or imeta
- `html`: iframe embed code pointing to `/embed?v=<identifier>`
- `width` / `height`: Fixed 640x360 (16:9 aspect ratio)
- `cache_age`: 600 seconds (10 minutes)

### Response Format (Error/Fallback)

**When metadata fetch fails (relay timeout, event not found):**

```json
{
  "type": "video",
  "version": "1.0",
  "provider_name": "Nostube",
  "provider_url": "https://nostu.be",
  "title": "Nostube Video",
  "html": "<iframe src=\"https://nostu.be/embed?v=nevent123\" width=\"640\" height=\"360\" frameborder=\"0\" allowfullscreen allow=\"autoplay; fullscreen\"></iframe>",
  "width": 640,
  "height": 360,
  "cache_age": 600
}
```

**Notes:**

- Still returns 200 OK status (not 404)
- Includes iframe HTML (embed player will handle errors)
- Minimal metadata (no author, thumbnail, or specific title)
- Graceful degradation - something is better than nothing

## Nostr Integration

### Relay Selection Strategy

**Use hint relays from identifier:**

- nevent/naddr identifiers include relay hints
- Example: `nevent1qqsabc...qqhwgryjsrkw464ysmrw3w9f65snfw33k76tw94qcyqqqq` includes relay hints
- Directly query those specific relays
- No fallback to default relays (keep it fast and simple)

**Relay Connection Logic:**

```javascript
1. Decode nevent/naddr using nostr-tools
2. Extract hint relays from identifier
3. If no hints, return error fallback response
4. Connect to all hint relays in parallel
5. Send REQ subscription to each relay
6. Return first valid EVENT response
7. Cancel other subscriptions after receiving event
8. 10 second timeout per relay
9. If no relay responds, return minimal fallback response
```

### Event Fetching

**Supported Video Kinds:**

- Kind 21: Short video (vertical)
- Kind 22: Regular video (horizontal)
- Kind 34235: Addressable short video
- Kind 34236: Addressable regular video

**Metadata Extraction:**

- `title` tag → video title
- `pubkey` → author (fetch kind 0 for display name if time permits)
- `image` tag or imeta → thumbnail URL
- `url` tag → video URL (not used in oEmbed, but validates event)
- `d` tag → identifier (for addressable events)

**Timeout Handling:**

- 10 seconds total timeout for relay connections
- If timeout: return minimal fallback response
- Don't wait indefinitely - oEmbed consumers expect fast responses

## Caching Strategy

### Short-Term In-Memory Cache (10 minutes)

**Implementation:**

- Simple in-memory Map: `{ url: { response, timestamp } }`
- Cache key: Full video URL (normalized)
- Cache duration: 10 minutes (600 seconds)
- Eviction: Check timestamp on read, auto-cleanup on write

**Cache Logic:**

```javascript
1. Request comes in with video URL
2. Check cache: if entry exists and age < 10 min, return cached response
3. If cache miss or expired:
   - Fetch from Nostr relays
   - Store response in cache with current timestamp
   - Return response
4. Set HTTP headers: Cache-Control: public, max-age=600
```

**Why 10 minutes?**

- Handles burst sharing (same video shared multiple times)
- Keeps metadata reasonably fresh
- Reduces relay load for viral videos
- Balances performance vs staleness

**Vercel Edge Caching:**

- Also set `Cache-Control` headers for edge caching
- Vercel CDN will cache responses at edge locations
- Further reduces function invocations and latency

## Error Handling

### Error Scenarios

| Scenario                   | HTTP Status         | Response                                  | Behavior          |
| -------------------------- | ------------------- | ----------------------------------------- | ----------------- |
| Valid URL, event found     | 200 OK              | Full oEmbed JSON with metadata            | Success case      |
| Valid URL, relay timeout   | 200 OK              | Minimal oEmbed JSON with iframe           | Graceful fallback |
| Valid URL, event not found | 200 OK              | Minimal oEmbed JSON with iframe           | Graceful fallback |
| Invalid identifier format  | 200 OK              | Minimal oEmbed JSON with iframe           | Graceful fallback |
| Missing `url` parameter    | 400 Bad Request     | `{ error: "url parameter required" }`     | Client error      |
| Non-Nostube URL            | 400 Bad Request     | `{ error: "URL not supported" }`          | Client error      |
| Invalid format parameter   | 501 Not Implemented | `{ error: "Only JSON format supported" }` | Spec compliance   |

### Graceful Degradation

**Philosophy:** Always return an iframe if possible

- Even if we can't fetch metadata, the embed player can try
- Embed player has its own error handling and retry logic
- Better user experience than broken links
- Temporary relay issues don't break embeds permanently

## Configuration in Main Nostube App

### AppConfig Extension

**File:** `src/contexts/AppContext.tsx`

```typescript
interface AppConfig {
  // ... existing config (relays, blossomServers, etc.)

  // oEmbed service endpoint
  oembedEndpoint?: string // Default: 'https://oembed.nostu.be'
}
```

**Runtime Configuration (Docker/env):**

```javascript
// In runtime-env.js or equivalent
window.__RUNTIME_ENV__ = {
  // ... existing env vars
  OEMBED_ENDPOINT: 'https://oembed.nostu.be',
}
```

### Usage in Main App

**Where oEmbed URL is referenced:**

1. **Share Button / Copy Embed Code Feature** (future)
   - Generate iframe HTML for users to copy
   - Uses configured oEmbed endpoint

2. **Documentation / Help Pages**
   - Show oEmbed endpoint URL for developers
   - Example embed codes

3. **Internal Embed Detection** (future - phase 2)
   - Detect Nostube URLs in comments/descriptions
   - Render embedded player inline

**Example Implementation:**

```typescript
// src/lib/oembed.ts
import { useAppContext } from '@/contexts/AppContext'

export function useOembedEndpoint() {
  const { config } = useAppContext()
  return config.oembedEndpoint || 'https://oembed.nostu.be'
}

export function getOembedUrl(videoUrl: string): string {
  const endpoint = useOembedEndpoint()
  return `${endpoint}/api/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
}
```

## Deployment

### Official Nostube oEmbed Service

**Hosting:** Vercel (recommended)

- Domain: `https://oembed.nostu.be`
- Deploy as Vercel serverless functions
- Automatic scaling, global edge network
- Zero-config deployment

**Vercel Configuration (`vercel.json`):**

```json
{
  "functions": {
    "api/oembed.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "headers": [
    {
      "source": "/api/oembed",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=600, s-maxage=600, stale-while-revalidate=300"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    }
  ]
}
```

### Self-Hosted Deployment

**For users who want to run their own oEmbed service:**

**Option 1: Vercel**

```bash
# Clone nostube-oembed-service repo
git clone https://github.com/nostube/nostube-oembed-service.git
cd nostube-oembed-service

# Deploy to your Vercel account
vercel --prod

# Update your Nostube frontend config
OEMBED_ENDPOINT=https://your-oembed.vercel.app
```

**Option 2: Docker + Any Node.js Host**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**Option 3: Cloudflare Workers**

- Adapt code for Cloudflare Workers runtime
- Deploy via Wrangler CLI
- Update frontend config to point to worker URL

## Testing Strategy

### Unit Tests

**Test Coverage:**

- URL parsing (extract identifiers from various URL formats)
- NIP-19 decoding (nevent, naddr, note)
- Video event parsing (all 4 video kinds)
- Cache logic (hit, miss, expiration)
- Error handling (timeouts, invalid inputs)

**Example Tests:**

```javascript
describe('oEmbed Endpoint', () => {
  test('returns full metadata for valid video URL', async () => {
    /* ... */
  })
  test('returns minimal response on relay timeout', async () => {
    /* ... */
  })
  test('handles nevent and naddr identifiers', async () => {
    /* ... */
  })
  test('caches responses for 10 minutes', async () => {
    /* ... */
  })
  test('returns 400 for missing url parameter', async () => {
    /* ... */
  })
})
```

### Integration Tests

**Test with Real Relays:**

- Mock WebSocket connections to relay servers
- Test actual Nostr event fetching
- Verify timeout handling
- Test parallel relay connections

### Manual Testing

**Test Platforms:**

- Discord: Paste Nostube URL in channel
- Slack: Paste URL in message
- Twitter: Paste URL in tweet (if oEmbed supported)
- WordPress: Use oEmbed embed block
- Custom test page: Fetch oEmbed JSON and render iframe

**Test Cases:**

- Valid nevent video URL
- Valid naddr video URL
- Non-existent video (404 from relays)
- Slow relay (timeout handling)
- Self-hosted Nostube instance URL
- URL with custom domain

## Documentation

### README for nostube-oembed-service

**Contents:**

1. **Quick Start** - Deploy in 5 minutes
2. **API Reference** - Endpoint parameters and responses
3. **Deployment Guides** - Vercel, Docker, Cloudflare
4. **Configuration** - Environment variables
5. **Self-Hosting** - Complete setup instructions
6. **Development** - Local setup, testing, contributing

### Documentation for Main Nostube App

**Add to Nostube docs:**

1. **For Developers** - How to use oEmbed endpoint
2. **For Self-Hosters** - Configure custom oEmbed endpoint
3. **Examples** - Sample oEmbed requests/responses

### Registering with oEmbed Consumers

**Some platforms require registration:**

- **Discord/Slack:** Usually auto-discover oEmbed endpoints (no registration)
- **WordPress:** Auto-discovers (no registration)
- **Twitter/X:** May require explicit registration (if supported)
- **Reddit:** May require registration for auto-embed

**Documentation should include:**

- List of platforms that support oEmbed auto-discovery
- Instructions for platforms requiring registration

## Success Criteria

✅ Standalone service deployable to Vercel/Cloudflare/Docker
✅ Returns standard oEmbed JSON responses
✅ Fetches rich metadata from Nostr relays (title, author, thumbnail)
✅ Uses hint relays from nevent/naddr identifiers
✅ Graceful fallback when metadata unavailable
✅ 10-minute response caching (in-memory + edge)
✅ Configurable in main Nostube app (oembedEndpoint config)
✅ Main Nostube app remains purely static
✅ Complete documentation for self-hosters
✅ Works with Discord, Slack, and other oEmbed consumers
✅ Sub-2-second response times (with caching)

## Future Enhancements (Not in v1)

1. **oEmbed Discovery Tags** - Add meta tags to video pages (requires SSR/SSG)
2. **Custom Embed Parameters** - Support autoplay, muted, start time, etc.
3. **Author Metadata Enrichment** - Fetch kind 0 profiles for display names
4. **Thumbnail Proxy** - Proxy/cache thumbnails for faster loading
5. **Analytics** - Track oEmbed request metrics
6. **Rate Limiting** - Prevent abuse with rate limits
7. **Authentication** - Optional API keys for private instances
8. **Webhook Cache Invalidation** - Purge cache when video updated
9. **XML Format Support** - Support `format=xml` parameter
10. **Responsive Iframe Support** - Support `maxwidth`/`maxheight` parameters

## Implementation Phases (When Ready)

### Phase 1: Service Setup

1. Create `nostube-oembed-service` repository
2. Set up Node.js project with dependencies
3. Create basic endpoint structure
4. Deploy to Vercel for testing

### Phase 2: Nostr Integration

1. Implement NIP-19 decoding
2. Implement relay connection logic
3. Implement event fetching with timeout
4. Parse video events into metadata

### Phase 3: Response Generation

1. Build oEmbed JSON response structure
2. Generate iframe HTML
3. Handle error cases and fallbacks
4. Implement response caching

### Phase 4: Main App Integration

1. Add `oembedEndpoint` to AppConfig
2. Add runtime configuration support
3. Document configuration for self-hosters
4. Update deployment docs

### Phase 5: Testing & Documentation

1. Write unit tests for all modules
2. Write integration tests with mock relays
3. Test with real Discord/Slack
4. Write comprehensive README
5. Add documentation to main Nostube docs

## Example Test URLs

**For testing in various platforms:**

**Regular video (nevent):**

```
https://nostu.be/v/nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk
```

**Addressable video (naddr):**

```
https://nostu.be/v/naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj
```

## Conclusion

This design provides a clean, maintainable oEmbed service that integrates seamlessly with Nostube while keeping the main application purely static. The separate-service architecture allows for independent scaling and deployment, while the configurable endpoint enables self-hosters to run the complete stack. The graceful error handling ensures embeds work reliably even when Nostr relays are slow or unavailable.
