# Event Reference

Sources: [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md),
[NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md),
[NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md).
NIP-71 is a draft; its requirements and NosTube's compatibility conventions are
separated below. Consult the linked specification when interoperability matters.

## Kinds and updates

| Experience   | Regular | Addressable (editable) |
| ------------ | ------- | ---------------------- |
| Normal video | `21`    | `34235`                |
| Short video  | `22`    | `34236`                |

All four share the video metadata format. NIP-71 treats normal/short as a stylistic
choice, not a fixed duration or aspect-ratio rule. NosTube selects the short kind
when the first publishable variant is portrait (`height > width`).

For addressable kinds, include a stable `d` tag. An update keeps the same author,
kind, and `d`, advances `created_at`, and preserves the original `published_at`.
Changing kind changes the address. Regular kinds are not replaced by reusing `d`.
Reference an addressable video with `['a', '<kind>:<pubkey>:<d>', '<relay-hint>']`,
or share its NIP-19 `naddr`; regular events use an event id / `nevent`.

## Event template

This is unsigned event JSON; a signer adds `id`, `pubkey`, and `sig`. Example URLs
and hashes are illustrative, not upload destinations or verifiable media.

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
      "url https://cdn.example/video.mp4",
      "m video/mp4; codecs=\"avc1.64001f,mp4a.40.2\"",
      "x 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "dim 1920x1080",
      "size 123456789",
      "duration 281.25",
      "bitrate 4500000",
      "image https://cdn.example/preview.webp",
      "image https://mirror.example/preview.webp",
      "blurhash L6PZfSi_.AyE_3t7t7R**0o#DgR4",
      "fallback https://mirror.example/video.mp4"
    ],
    ["t", "nostr"],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"]
  ]
}
```

## Requirements versus conventions

- **Required by NIP-71:** `title`; also `d` for `34235`/`34236`.
  `content` holds the summary/description.
- **NIP-92 `imeta` structure:** one `url` and at least one other field; normally
  include `m`. Use one tag per URL. Values are strings split on the **first**
  space into key and value, not separate tag arrays. NIP-71 uses these tags as
  the primary metadata, with a description in `content`; its examples do not
  require embedding every media URL in the description as a kind-1 attachment would.
- **NIP-71 recommended:** `duration` and `bitrate` inside each video/audio `imeta`.
  Duration is seconds and may be fractional; bitrate is bits/second.
- **NIP-71 other tags:** `published_at` is the first publication timestamp in
  stringified Unix seconds; `alt`, `content-warning`, `t`, `p`, `r`, `text-track`,
  `segment`, and imported-content `origin` are optional.
- **NosTube compatibility:** a top-level string `duration` for the first video,
  optional language labels (`L`/`l`), and the subtitle shape described below.
  A roughly 40-character title is editorial guidance, not a protocol limit.
- **Optional attribution:** NIP-89 `client` identifies the actual publishing
  application and has privacy implications. Use `nostube` only for actual
  NosTube-originated output, not simply compatible events. It is not required.
- **Optional retention:** NIP-40 `expiration` requests expiration; it cannot
  guarantee deletion of previously downloaded/cached copies.

## `imeta` fields and mirrors

| Field      | Meaning                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| `url`      | Primary media location                                                     |
| `m`        | Lowercase MIME type, optionally with known codecs                          |
| `x`        | Lowercase SHA-256 of the exact hosted file                                 |
| `ox`       | Original-file hash before server transformations, if applicable (NIP-94)   |
| `dim`      | Pixel dimensions as `WIDTHxHEIGHT`                                         |
| `size`     | Exact file size in bytes                                                   |
| `duration` | Seconds, floating-point allowed                                            |
| `bitrate`  | Average bits/second                                                        |
| `image`    | Preview at the video's resolution; repeated values are fallback copies     |
| `thumb`    | Optional smaller thumbnail with matching aspect ratio (NIP-94)             |
| `blurhash` | Preview placeholder                                                        |
| `fallback` | Another location for the **same exact file**, not a lower-quality encoding |
| `service`  | Optional service hint; `service nip96` only for an actual NIP-96 host      |

NIP-71 says `url` and `fallback` should be weighted equally by clients. Verify
hashes before claiming URLs are equivalent. Deduplicate upload targets by
normalized server URL, and preview/mirror locations by server + blob hash
(`/hash` and `/hash.ext` identify the same Blossom blob). Preserve the first URL
and distinct servers. For ordinary non-Blossom URLs, only collapse identical
URLs; query parameters may select different content.

NosTube also reads legacy `mirror` fields, but new events should emit `fallback`.
Preview `image` copies must show the same image, not different video frames.

## Variants and separate audio

Use separate `imeta` tags for each encoding/resolution: different bytes mean
different `x`, `size`, and possibly `dim`, MIME type, bitrate, and duration.
HLS playlists can also be variants; use the playlist MIME type, hash the actual
playlist, and upload all referenced segments/init data. Mirrors must retain the
same playlist bytes and working segment references.

NIP-71 also permits separate audio tracks. For example, add this tag alongside
the video `imeta` (language `en`, namespace `ISO-639-1`, original-version flag `ov`):

```json
[
  "imeta",
  "url https://audio.example/en.mp3",
  "m audio/mpeg",
  "duration 281.25",
  "bitrate 128000",
  "l en ISO-639-1 ov",
  "waveform 0 7 35 80 100 49 8 4 16 0"
]
```

`waveform` is optional for audio: space-separated integer amplitudes; NIP-71
suggests fewer than 100 values. Clients should prefer separate audio when
available to avoid interruptions during resolution switches. This is protocol
capability, not a guarantee that every target client supports track switching;
retain embedded audio for clients that need it.

## Subtitles

Convert SRT to WebVTT (`text/vtt`) and host the VTT file. The prose in NIP-71
specifies URL, supplementary-information type, then optional language:

```json
["text-track", "https://server.example/subtitles-en.vtt", "subtitles", "en"]
```

Track types described there are `captions`, `subtitles`, `chapters`, and
`metadata`. The draft also contains a conflicting older encoded-event example;
use its explicit tag description for this URL-based form.

**NosTube compatibility exception:** its current parser reads the language at
index 2, and its builders emit this legacy form (optionally with a display name):

```json
["text-track", "https://server.example/subtitles-en.vtt", "en"]
```

Choose the legacy shape only when targeting that NosTube behavior. Do not claim
it conforms to the NIP-71 type/language layout, and do not emit both forms for
the same track: that duplicates the track and may label `subtitles` as a language.

## Chapters and segments

NIP-71 optionally repeats `segment` with start, end, title, and thumbnail URL:

```json
["segment", "00:00:00.000", "00:01:12.500", "Introduction", "https://server.example/chapter-1.webp"]
```

Timestamps are `HH:MM:SS.sss`; every element is a string as required by NIP-01.
Do not infer chapter boundaries from subtitle lines. Clients may ignore segments.

## Origins, participants, and links

For imported media, include the source URL and, when known, normalized platform
and external id. NIP-71 allows an additional optional metadata string:

```json
[
  ["r", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
  ["origin", "youtube", "dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"]
]
```

NosTube recognizes `youtube`, `tiktok`, `instagram`, `twitter`, and `twitch`.
Use `r` alone for a generic source. Reference Nostr source events with `e` (event
id) or `a` (address), optionally a relay hint. `p` tags identify participants:
`["p", "<64-hex-pubkey>", "<optional-relay-hint>"]`; they do not identify an event.
Use `t` for hashtags without `#`.

## Mirror announcements

Optionally publish a separate NIP-94 kind `1063` event for each mirrored blob.
It describes a file, not a replacement video post. NosTube adds video references
(`e`, `a`, `k`) to associate contributed media with the video:

```json
{
  "kind": 1063,
  "content": "Mirrored video file",
  "tags": [
    ["url", "https://mirror.example/video.mp4"],
    ["fallback", "https://mirror2.example/video.mp4"],
    ["x", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
    ["m", "video/mp4"],
    ["size", "73400320"],
    ["dim", "1280x720"],
    ["e", "<video-event-id>", "wss://relay.example"],
    ["a", "34235:<pubkey>:<d-tag>", "wss://relay.example"],
    ["k", "34235"]
  ]
}
```

Add `created_at` and sign before publishing. Require relay acknowledgements as
for the video event; report announcement failures separately from video success.
