# NIP-71 video events

Nostube publishes and reads videos as [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) events, with the media described in [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) `imeta` tags. This page describes what Nostube writes, how it reads events, and what other clients should include so their videos play well in Nostube. Parsing lives in `packages/core/src/video-event.ts`, the web app's event builder in `apps/web/src/hooks/useVideoUpload.ts`, and the Studio's in `packages/core/src/video-publish.ts`.

## Kinds

| Kind | Type | Nostube |
| --- | --- | --- |
| `21` | Normal video, regular | Read |
| `22` | Short (vertical) video, regular | Read |
| `34235` | Normal video, addressable | Read and published |
| `34236` | Short (vertical) video, addressable | Read and published |

Nostube publishes only the addressable kinds. Unlike a regular event, an addressable one can be updated later (new title, new URLs after a server move) and keeps the same `naddr`. Videos taller than wide get `34236`; all others get `34235`.

If the same author publishes the same `d` identifier as a regular and an addressable event, Nostube shows only the addressable one. Between two events of the same type, the newer `created_at` wins.

## An event as Nostube publishes it

```json
{
  "kind": 34235,
  "content": "A timelapse of a sunset over the mountains.",
  "tags": [
    ["d", "<unique identifier>"],
    ["title", "Mountain sunset"],
    ["alt", "A timelapse of a sunset over the mountains."],
    ["published_at", "1704067200"],
    ["duration", "60"],
    [
      "imeta",
      "dim 1920x1080",
      "url https://blossom.example.com/<sha256>.mp4",
      "x <sha256>",
      "m video/mp4; codecs=\"hvc1.1.6.L120.90,mp4a.40.2\"",
      "bitrate 6750000",
      "duration 60",
      "size 50626560",
      "image https://blossom.example.com/<thumb-sha256>.webp",
      "image https://mirror.example.com/<thumb-sha256>.webp",
      "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
      "fallback https://mirror.example.com/<sha256>.mp4"
    ],
    [
      "imeta",
      "dim 854x480",
      "url https://blossom.example.com/<sha256-480>.mp4",
      "x <sha256-480>",
      "m video/mp4; codecs=\"avc1.64001f,mp4a.40.2\"",
      "image https://blossom.example.com/<thumb-sha256>.webp",
      "fallback https://mirror.example.com/<sha256-480>.mp4"
    ],
    ["text-track", "https://blossom.example.com/<vtt-sha256>.vtt", "en"],
    ["t", "timelapse"],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],
    ["client", "nostube"]
  ]
}
```

| Tag | Content |
| --- | --- |
| `d` | A unique identifier, chosen once and never changed when the event is updated. |
| `title` | The title. Without it, Nostube derives one from the description. |
| `alt`, `content` | The description. |
| `published_at` | The publish date in Unix seconds. It can be in the future for a scheduled video; `created_at` is always the signing time. |
| `duration` | Length in seconds, also inside each `imeta`. |
| `imeta` | One tag per variant (resolution, codec or format), see below. |
| `text-track` | `["text-track", <url>, <language>]`, one per subtitle file (WebVTT). |
| `content-warning` | Optional reason; Nostube writes `NSFW` when no reason is given. |
| `t` | Hashtags, without `#`. |
| `p` | Optional people in the video. |
| `L`, `l` | Language (ISO 639-1); the web app only. |
| `expiration` | Optional NIP-40 expiry; the web app only. |
| `origin` | Optional source of imported videos: `["origin", <platform>, <external id>, <original url>, <metadata>]`. |
| `client` | `nostube` (web app) or `nostube-studio` (Nostube Server). |

## imeta fields

| Field | Written by Nostube | Purpose |
| --- | --- | --- |
| `url` | always | Primary URL of this variant. |
| `x` | for uploaded files | SHA-256 of the file. Without it, players cannot look for the file on other Blossom servers. |
| `m` | always | MIME type. The web app adds `codecs="..."` when it knows them; players use it to skip variants the device cannot decode. |
| `dim` | always | `WIDTHxHEIGHT`. Used for the aspect ratio, the kind and quality ordering. |
| `duration` | always | Seconds. |
| `size` | for uploaded files | Bytes. |
| `bitrate` | when known | Bits per second. |
| `image` | when a thumbnail exists | Thumbnail URL. Several `image` entries in one `imeta` are fallbacks for the same picture. |
| `blurhash` | web app | Placeholder while the thumbnail loads. |
| `fallback` | when there are copies | More URLs of the same file (other Primary uploads and Backup mirrors). |

Write `fallback` for alternative URLs. Nostube also reads `mirror` entries from older events, but that is not part of NIP-92.

### Several variants

Put each resolution or codec in its own `imeta` tag. Nostube sorts the variants by height, highest first, and drops those the device cannot play. On iOS that means HEVC under the generic names `hevc`/`h265`, VP9 and AV1; elsewhere, whatever `canPlayType` rejects. `hvc1`/`hev1` are always tried. If every variant would be dropped, all are kept.

Nostube's own uploads use HEVC for higher resolutions and H.264 for the lowest one when the browser can encode HEVC (see [Uploads and transcoding](/media/uploads#settings)). Always include at least one H.264 variant.

### HLS

An HLS stream is one `imeta` with the master playlist as `url` and the type `application/vnd.apple.mpegurl` (Nostube adds the codecs of the streams). In Nostube's HLS uploads, every playlist and segment is its own Blossom blob, and the playlists refer to the others by hash. The `x` of the master playlist is therefore enough to serve the whole stream from any server that has the blobs. URLs ending in `.m3u8` are treated as HLS too.

## How Nostube reads URLs

Players build a fallback list from each variant's `url` and `fallback` entries. Then they try the same hash on the viewer's Blossom servers and on any streaming server they configured; see [How a video URL is resolved](/media/blossom#how-a-video-url-is-resolved).

URLs in an event are never requested if they are not `http(s)`, contain credentials, or point to `localhost` or a private network address. URLs on hosts that re-encode media (`video.nostr.build`, `image.nostr.build`, `cdn.nostrcheck.me`) are played, but not treated as Blossom URLs: their bytes do not match the hash, so Nostube does not look for the hash elsewhere.

If a `url` value contains a space (some clients put the whole `imeta` into one string), Nostube keeps only the part before the first space.

## Checklist for other clients

- Use `34235`/`34236` with a stable `d` tag.
- Include `x`, `dim`, `m` (with codecs if you can) and `duration` in every `imeta`.
- Host media on Blossom with the hash at the root of the path (`https://server/<sha256>.mp4`; Nostube does not treat a hash further down the path as a Blossom URL), and give `fallback` URLs on other Blossom servers.
- Upload thumbnails as files and reference them with `image`; use `blurhash` for the placeholder instead of a `data:` URL.
- Offer an H.264 variant next to HEVC, AV1 or VP9.
- Put media data in `imeta`, and keep `title`, `published_at`, `t`, `p` and `content-warning` as separate tags.

## References

- [NIP-71: Video events](https://github.com/nostr-protocol/nips/blob/master/71.md)
- [NIP-92: Media attachments (`imeta`)](https://github.com/nostr-protocol/nips/blob/master/92.md)
- [NIP-94: File metadata](https://github.com/nostr-protocol/nips/blob/master/94.md)
- [Blossom](https://github.com/hzrd149/blossom)
