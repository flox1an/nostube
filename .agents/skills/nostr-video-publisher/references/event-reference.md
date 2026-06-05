# Event Reference

NosTube publishes addressable NIP-71 video events and parses compatible events from other Nostr video clients.

## Kinds

- `34235`: normal/long-form video
- `34236`: short/vertical video

NosTube chooses `34236` when the first publishable variant is portrait (`height > width`), otherwise `34235`.

## Core Event Template

```json
{
  "kind": 34235,
  "content": "Description text",
  "created_at": 1763047346,
  "tags": [
    ["d", "my-stable-video-id"],
    ["title", "My Video"],
    ["alt", "Description text"],
    ["published_at", "1763047346"],
    ["duration", "281"],
    [
      "imeta",
      "dim 1920x1080",
      "url https://cdn.example/sha256.mp4",
      "x 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "m video/mp4; codecs=\"avc1.64001f,mp4a.40.2\"",
      "bitrate 4500000",
      "size 123456789",
      "image https://cdn.example/thumb.webp",
      "blurhash L6PZfSi_.AyE_3t7t7R**0o#DgR4",
      "fallback https://mirror.example/sha256.mp4"
    ],
    ["t", "nostr"],
    ["p", "hexpubkey", "wss://relay.example"],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],
    ["client", "nostube"]
  ]
}
```

## Tags

Required or strongly recommended:

- `d`: stable identifier for the addressable event. Reuse it when editing the same video.
- `title`: display title.
- `alt`: text alternative; NosTube uses description here.
- `published_at`: Unix seconds for publish or scheduled publish date.
- `duration`: first variant duration in seconds.
- `imeta`: one per playable video variant.
- `L` and `l`: language namespace and ISO-639-1 language.
- `client`: use `nostube` for NosTube-originated output.

Optional:

- `content-warning`: reason such as `NSFW`.
- `expiration`: Unix seconds when the event should expire.
- `t`: hashtags, without `#`.
- `p`: tagged people/contributors, optionally with relay hint.
- `text-track`: subtitle/caption track.
- `r`: source URL.
- `origin`: normalized external platform source.

## `imeta` Fields

NosTube builds one `imeta` tag per video variant:

```json
[
  "imeta",
  "dim 1280x720",
  "url https://server.example/<sha256>.mp4",
  "x <sha256-hex>",
  "m video/mp4; codecs=\"avc1.64001f,mp4a.40.2\"",
  "bitrate 2500000",
  "size 73400320",
  "image https://server.example/<thumb-sha256>.webp",
  "image https://mirror.example/<thumb-sha256>.webp",
  "blurhash <blurhash>",
  "fallback https://mirror.example/<sha256>.mp4"
]
```

Field meanings:

- `url`: primary media URL.
- `x`: SHA-256 hex of the media file.
- `m`: MIME type. Include codecs when known.
- `dim`: `WIDTHxHEIGHT`.
- `size`: bytes.
- `bitrate`: bits per second.
- `image`: thumbnail URL. Repeated `image` values are fallbacks for the same thumbnail.
- `blurhash`: placeholder for thumbnail.
- `fallback`: alternate URL for the same exact media blob.

NosTube also reads legacy `mirror` as fallback, but new events should use `fallback`.

## Variants

For multiple qualities, emit multiple `imeta` tags:

```json
[
  [
    "imeta",
    "dim 1920x1080",
    "url https://a/1080.mp4",
    "x <hash1>",
    "m video/mp4",
    "size 100000000",
    "image https://a/thumb.webp"
  ],
  [
    "imeta",
    "dim 854x480",
    "url https://a/480.mp4",
    "x <hash2>",
    "m video/mp4",
    "size 30000000",
    "image https://a/thumb.webp"
  ]
]
```

Use separate `imeta` tags because each variant has its own URL, hash, dimensions, size, and codecs.

## Subtitles

Upload subtitle files to Blossom, then add:

```json
["text-track", "https://server.example/subtitles-en.vtt", "en"]
```

Use ISO-639-1 language codes. Prefer WebVTT (`text/vtt`); SRT can be uploaded but may need conversion for best playback.

## Origins

For known platforms, add both `r` and `origin`:

```json
["r", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
["origin", "youtube", "dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"]
```

Known platforms in NosTube: `youtube`, `tiktok`, `instagram`, `twitter`, `twitch`.

For Nostr origins, use:

- `["e", "<event-id>", "<relay-hint>"]`
- `["a", "<kind>:<pubkey>:<identifier>", "<relay-hint>"]`
- `["p", "<pubkey>", "<relay-hint>"]`

For generic web URLs, use `["r", "<url>"]`.

## Mirror Announcements

After publishing the video event, NosTube may publish kind `1063` file metadata events for mirrored blobs. This is optional and non-blocking.

Example:

```json
{
  "kind": 1063,
  "content": "",
  "tags": [
    ["url", "https://mirror.example/<sha256>.mp4"],
    ["fallback", "https://mirror2.example/<sha256>.mp4"],
    ["x", "<sha256>"],
    ["m", "video/mp4"],
    ["size", "73400320"],
    ["dim", "1280x720"],
    ["e", "<video-event-id>", "wss://relay.example"],
    ["a", "34235:<pubkey>:<d-tag>", "wss://relay.example"],
    ["k", "34235"]
  ]
}
```

Publish `1063` announcements to the user's write relays and relays where the video event was published.
