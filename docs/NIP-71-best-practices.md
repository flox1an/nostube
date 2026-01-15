# NIP-71 Video Events: Best Practices

This document extends [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) with practical recommendations for creating and consuming video events, based on real-world implementation experience.

## Table of Contents

1. [Event Creation Best Practices](#event-creation-best-practices)
2. [imeta Tag Best Practices](#imeta-tag-best-practices)
3. [Multi-Resolution Support](#multi-resolution-support)
4. [Thumbnail Handling](#thumbnail-handling)
5. [Content Resilience](#content-resilience)
6. [Client Consumption Best Practices](#client-consumption-best-practices)
7. [Codec Compatibility](#codec-compatibility)
8. [Common Pitfalls](#common-pitfalls)

---

## Event Creation Best Practices

### Choose the Right Kind

| Kind | Type | Use Case |
|------|------|----------|
| `21` | Regular normal video | Immutable video posts, one-time publications |
| `22` | Regular short video | Immutable vertical/portrait shorts |
| `34235` | Addressable normal video | Videos that may need metadata updates, migrations |
| `34236` | Addressable short video | Shorts that may need updates |

**Recommendation:** Prefer addressable events (34235/34236) for most use cases. They allow:
- Metadata corrections without republishing
- URL migration when hosting changes
- Preserving the same reference (`naddr`) across updates

### Required Fields

Always include these tags for proper client rendering:

```json
{
  "kind": 34235,
  "content": "Video description here",
  "tags": [
    ["d", "unique-identifier"],
    ["title", "Human-readable title"],
    ["published_at", "1704067200"],
    ["imeta", "url https://...", "m video/mp4", "dim 1920x1080", "x <sha256>"]
  ]
}
```

### The `d` Tag Identifier

For addressable events, the `d` tag should be:
- **Unique per author**: Use the video's SHA256 hash, a UUID, or platform-specific ID
- **Stable**: Never change this value when updating the event
- **URL-safe**: Avoid special characters that may cause encoding issues

```json
["d", "3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc"]
```

---

## imeta Tag Best Practices

The `imeta` tag is the primary source of video information. Structure it carefully:

### Minimal imeta

```json
["imeta",
  "url https://example.com/video.mp4",
  "m video/mp4",
  "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc"
]
```

### Complete imeta

```json
["imeta",
  "url https://example.com/video.mp4",
  "m video/mp4; codecs=\"avc1.640028,mp4a.40.2\"",
  "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc",
  "dim 1920x1080",
  "size 52428800",
  "duration 120.5",
  "bitrate 3500000",
  "image https://example.com/thumb.jpg",
  "image https://mirror.example.com/thumb.jpg",
  "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
  "fallback https://mirror.example.com/video.mp4",
  "fallback https://backup.example.com/video.mp4"
]
```

### Field Priority

1. **Always include:**
   - `url` - Primary video URL
   - `m` - MIME type (include codecs when known)
   - `x` - SHA256 hash (enables content addressing)

2. **Strongly recommended:**
   - `dim` - Dimensions (WxH) for layout calculation
   - `duration` - For progress bars and time display
   - `image` - Thumbnail URL(s)

3. **Recommended:**
   - `size` - File size in bytes
   - `bitrate` - For quality selection
   - `blurhash` - For placeholder while loading
   - `fallback` - Alternative URLs

### MIME Type with Codecs

Include codec information in the MIME type for better compatibility detection:

```
video/mp4; codecs="avc1.640028,mp4a.40.2"   # H.264 High Profile + AAC
video/mp4; codecs="hvc1.2.4.L120.b0"        # HEVC/H.265
video/webm; codecs="vp9,opus"               # VP9 + Opus
application/x-mpegURL                        # HLS stream
```

---

## Multi-Resolution Support

### Multiple imeta Tags

Provide multiple quality variants using separate imeta tags:

```json
{
  "tags": [
    ["imeta",
      "url https://example.com/1080p.mp4",
      "m video/mp4",
      "dim 1920x1080",
      "x abc123...",
      "bitrate 5000000",
      "image https://example.com/thumb-1080.jpg"
    ],
    ["imeta",
      "url https://example.com/720p.mp4",
      "m video/mp4",
      "dim 1280x720",
      "x def456...",
      "bitrate 2500000",
      "image https://example.com/thumb-720.jpg"
    ],
    ["imeta",
      "url https://example.com/480p.mp4",
      "m video/mp4",
      "dim 854x480",
      "x ghi789...",
      "bitrate 1000000",
      "image https://example.com/thumb-480.jpg"
    ]
  ]
}
```

### HLS Adaptive Streaming

For HLS streams, provide both the manifest and direct file variants:

```json
{
  "tags": [
    ["imeta",
      "url https://example.com/master.m3u8",
      "m application/x-mpegURL",
      "duration 120.5"
    ],
    ["imeta",
      "url https://example.com/1080p.mp4",
      "m video/mp4",
      "dim 1920x1080",
      "x abc123..."
    ]
  ]
}
```

**Note:** Direct file URLs enable Blossom-based discovery and mirroring, while HLS provides adaptive streaming.

---

## Thumbnail Handling

### Multiple Thumbnail Sources

Provide thumbnails with fallbacks:

```json
["imeta",
  "url https://example.com/video.mp4",
  "image https://primary.example.com/thumb.jpg",
  "image https://mirror.example.com/thumb.jpg",
  "image https://backup.example.com/thumb.jpg",
  "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH"
]
```

### Blurhash for LQIP

Include blurhash for smooth loading experience:

```json
["imeta",
  "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH"
]
```

Clients can decode this to show a blurred placeholder while the thumbnail loads.

### Thumbnail Dimensions

Match thumbnail dimensions to video dimensions for each quality variant:

```json
["imeta",
  "dim 1920x1080",
  "image https://example.com/thumb-1080.jpg"
],
["imeta",
  "dim 1280x720",
  "image https://example.com/thumb-720.jpg"
]
```

---

## Content Resilience

### Blossom Integration

When hosting on Blossom servers, use SHA256-based URLs:

```
https://blossom.example.com/<sha256>.<ext>
```

This enables:
- Content-addressed discovery via kind 1063 file metadata events
- Automatic mirroring across Blossom servers
- Hash verification for integrity

### Fallback URLs

Always provide multiple sources:

```json
["imeta",
  "url https://primary.example.com/video.mp4",
  "fallback https://mirror1.example.com/video.mp4",
  "fallback https://mirror2.example.com/video.mp4",
  "fallback https://blossom.example.com/<sha256>.mp4"
]
```

**Client behavior:** Clients should treat `url` and `fallback` equally, trying alternatives on failure.

### Service Tag for Discovery

Enable NIP-96 server discovery:

```json
["imeta",
  "url https://example.com/video.mp4",
  "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc",
  "service nip96"
]
```

Clients can query the author's NIP-96 server list to find the file by hash.

---

## Client Consumption Best Practices

### Parsing imeta Tags

1. Parse all imeta tags, not just the first one
2. Build a list of video variants sorted by quality (highest first)
3. Filter variants by codec compatibility for the current platform
4. Use the highest compatible quality by default

```typescript
// Pseudocode for variant selection
const variants = parseImetaTags(event.tags)
const compatibleVariants = filterByCodecSupport(variants)
const sortedVariants = sortByQuality(compatibleVariants, 'descending')
const selectedVariant = sortedVariants[0] // Highest quality
```

### URL Failover

Implement robust failover:

1. Try the primary `url`
2. On failure, try each `fallback` URL
3. Query Blossom servers using the SHA256 hash (`x`)
4. Query kind 1063 events for additional sources

### Autoplay Considerations

- Check `content-warning` tag before autoplay
- Respect user preferences for autoplay
- Start muted if autoplay is blocked by browser
- Listen for multiple ready events (`canplay`, `loadeddata`)

### Deduplication

When displaying video feeds:

1. Group by `pubkey` + `d` tag (identifier)
2. Prefer addressable events (34235/34236) over regular (21/22)
3. For same kind, prefer newer `created_at`

---

## Codec Compatibility

### Platform-Specific Issues

| Codec | Safari/iOS | Chrome | Firefox |
|-------|------------|--------|---------|
| H.264 (AVC) | Yes | Yes | Yes |
| H.265 (HEVC) | Yes* | Partial | No |
| VP9 | No | Yes | Yes |
| AV1 | Safari 17+ | Yes | Yes |

*iOS requires hardware support

### Codec Detection

Check MIME type for codec info:

```typescript
function isCodecSupported(mimeType: string): boolean {
  // Extract codecs from MIME type
  const codecMatch = mimeType.match(/codecs="([^"]+)"/)
  if (!codecMatch) return true // Assume supported if no codec info

  const codecs = codecMatch[1]

  // Check HEVC on non-Apple platforms
  if (codecs.includes('hvc1') || codecs.includes('hev1')) {
    return isApplePlatform() || hasHardwareHEVCSupport()
  }

  return true
}
```

### Providing Fallback Formats

Always include a widely-compatible format:

```json
{
  "tags": [
    ["imeta",
      "url https://example.com/hevc.mp4",
      "m video/mp4; codecs=\"hvc1.2.4.L120.b0\"",
      "dim 1920x1080"
    ],
    ["imeta",
      "url https://example.com/h264.mp4",
      "m video/mp4; codecs=\"avc1.640028\"",
      "dim 1920x1080"
    ]
  ]
}
```

---

## Common Pitfalls

### 1. Missing SHA256 Hash

**Problem:** Without the `x` (SHA256) field, content-addressed discovery doesn't work.

**Solution:** Always compute and include the SHA256 hash:

```json
["imeta", "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc"]
```

### 2. Spaces in URLs

**Problem:** Some clients incorrectly include spaces in URLs.

**Solution:** Always URL-encode spaces (`%20`) and validate URLs before publishing.

### 3. Missing Dimensions

**Problem:** Clients can't calculate aspect ratio for layout.

**Solution:** Always include `dim WxH`:

```json
["imeta", "dim 1920x1080"]
```

### 4. Duration as String vs Number

**Problem:** Inconsistent duration formats.

**Solution:** Use floating-point seconds as a string:

```json
["imeta", "duration 120.5"]
```

### 5. Data URLs for Thumbnails

**Problem:** Large base64-encoded images bloat event size.

**Solution:** Upload thumbnails to a hosting service and reference by URL. Use blurhash for placeholders:

```json
["imeta",
  "image https://example.com/thumb.jpg",
  "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH"
]
```

### 6. YouTube/External Embeds

**Problem:** Referencing YouTube or other platform URLs.

**Solution:** NIP-71 is for self-hosted content. For external embeds, use kind 1 notes with the URL, or consider the `origin` tag for imported content.

### 7. Inconsistent Tag Placement

**Problem:** Some fields appear both in imeta and as separate tags.

**Solution:** Prefer imeta for media-specific data. Use separate tags for:
- `title` - Video title
- `published_at` - Publication timestamp
- `t` - Hashtags
- `p` - Participant pubkeys
- `content-warning` - NSFW warnings

---

## Example: Complete Well-Formed Event

```json
{
  "kind": 34235,
  "pubkey": "<author-pubkey>",
  "created_at": 1704067200,
  "content": "A beautiful sunset timelapse captured over the mountains.",
  "tags": [
    ["d", "sunset-timelapse-2024"],
    ["title", "Mountain Sunset Timelapse"],
    ["published_at", "1704067200"],
    ["alt", "Timelapse video of a sunset over mountain peaks"],

    ["imeta",
      "url https://blossom.example.com/abc123.mp4",
      "m video/mp4; codecs=\"avc1.640028,mp4a.40.2\"",
      "x abc123def456789...",
      "dim 1920x1080",
      "size 52428800",
      "duration 60.0",
      "bitrate 7000000",
      "image https://blossom.example.com/abc123-thumb.jpg",
      "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
      "fallback https://mirror.example.com/abc123.mp4"
    ],
    ["imeta",
      "url https://blossom.example.com/abc123-720p.mp4",
      "m video/mp4; codecs=\"avc1.640028,mp4a.40.2\"",
      "x def456ghi789...",
      "dim 1280x720",
      "size 26214400",
      "duration 60.0",
      "bitrate 3500000",
      "image https://blossom.example.com/abc123-thumb-720.jpg",
      "fallback https://mirror.example.com/abc123-720p.mp4"
    ],

    ["text-track", "https://blossom.example.com/subtitles.vtt", "en"],

    ["t", "timelapse"],
    ["t", "sunset"],
    ["t", "nature"],

    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],

    ["client", "nostube"]
  ]
}
```

---

## References

- [NIP-71: Video Events](https://github.com/nostr-protocol/nips/blob/master/71.md)
- [NIP-92: imeta Tag](https://github.com/nostr-protocol/nips/blob/master/92.md)
- [NIP-94: File Metadata](https://github.com/nostr-protocol/nips/blob/master/94.md)
- [NIP-96: HTTP File Storage Integration](https://github.com/nostr-protocol/nips/blob/master/96.md)
- [Blossom Protocol](https://github.com/hzrd149/blossom)
