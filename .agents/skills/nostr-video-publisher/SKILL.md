---
name: nostr-video-publisher
description: Use when an AI agent needs to create, upload, transcode, sign, or publish Nostr video events for NosTube or compatible Nostr video clients. Covers Nostr and Blossom basics with spec and tool references, kind 34235/34236 event structure, imeta tags, Blossom uploads and mirrors, chunked PATCH upload, subtitles, thumbnails, origin tags, publishing via nak or a NosTube instance's managed key, and ffmpeg transcode guidance.
metadata:
  short-description: Publish NosTube-compatible Nostr video events
---

# Nostr Video Publisher

Use this skill when creating or editing Nostr video posts for NosTube-compatible clients.

New to Nostr or Blossom (keys, events, kinds, relays, blobs, upload auth)? Read [Nostr and Blossom Basics](references/nostr-blossom-basics.md) first: it explains the concepts and lists the NIPs, BUDs and tools.

## Workflow

1. Prepare media: inspect codec, duration, dimensions, bitrate, file size, thumbnail, subtitles, and external origin references.
2. Transcode if needed: prefer broadly playable MP4/H.264 + AAC; optionally create a 480p fallback or HLS. See [Transcode and Upload](references/transcode-upload.md).
3. Upload blobs to Blossom: upload video variants, thumbnail, and subtitles. Keep returned `url`, `sha256`, `size`, and `type`.
4. Build a NIP-71 addressable video event:
   - kind `34235` for normal videos
   - kind `34236` for shorts/vertical-first videos
   - one `imeta` tag per video variant
5. Sign and publish to write relays: for a NosTube server instance, sign with its managed key through the studio API (see [NosTube Server Instances](references/nostr-blossom-basics.md#nostube-server-instances)); otherwise use exact JSON plus `nak event` (below).
6. Optionally publish kind `1063` file metadata events for mirrored blobs.

## Required Event Shape

The event must have:

- `content`: description text
- `created_at`: current publish timestamp
- `tags`:
  - `["d", "<stable-identifier>"]`
  - `["title", "<video title>"]`
  - `["alt", "<description/accessibility text>"]`
  - `["published_at", "<unix seconds>"]`
  - `["duration", "<seconds>"]`
  - at least one `imeta` tag containing `url`, `m`, and ideally `x`, `size`, `dim`, `image`
  - `["L", "ISO-639-1"]`, `["l", "<language>", "ISO-639-1"]`
  - `["client", "nostube"]` when publishing as NosTube-compatible output

Load [Event Reference](references/event-reference.md) for exact tag schema, examples, and parsing compatibility notes.

## NosTube Conventions

- Determine kind from the first publishable variant: portrait/vertical (`height > width`) becomes `34236`; otherwise use `34235`.
- Use `d` as the addressable identifier. Keep it stable for edits/replacements.
- Keep `title` short: at most ~40 characters. Write a concise title instead of reusing a long post or caption text; the full text goes into `content`.
- Use multiple `imeta` tags for variants, not multiple URLs in one `imeta` unless they are fallbacks for the same variant.
- Put thumbnail URLs in every video `imeta` as repeated `image <url>` values. Put thumbnail blurhash in `blurhash <value>` when available.
- Use `fallback <url>` for alternate Blossom/mirror URLs. NosTube also parses old `mirror <url>`, but new events should emit `fallback`.
- Use `text-track` tags for subtitles: `["text-track", "<vtt-or-srt-url>", "<iso-639-1>"]`.
- Add origin tags for imported media: `["r", "<source-url>"]` plus `["origin", "<platform>", "<external-id>", "<source-url>"]` for known platforms.
- Add people as `["p", "<pubkey>", "<relay-hint-if-known>"]`.

## Publishing With `nak`

Prefer project helpers when working inside NosTube. For standalone agents, write exact event JSON first because `imeta` is a multi-value tag and shell tag flags can accidentally split it into invalid separate tags.

```bash
nak event --sec "$NSEC" "$RELAY" < event.json   # signs the JSON from stdin, keeps its tags, publishes
nak req -k 34235 -a <pubkey> -t d=<d-tag> "$RELAY"  # read it back
```

Check `nak event --help` before scripting; preserve the JSON tag arrays byte-for-byte. Never put a secret key on a shared command line or in chat; read it from an environment variable or file.

## Quality Checklist

Before publishing:

- Video URL opens with `HEAD` or `GET`, returns the expected MIME type, and has stable CORS behavior.
- `x` is the lower-case SHA-256 of the exact uploaded file.
- `size` is bytes, not MB.
- `dim` is `WIDTHxHEIGHT`.
- `duration` is seconds, rounded or integer-like.
- Thumbnail is uploaded and referenced through `image`, and it is not a black or blank frame: pick it from sampled candidates, never the first frame or an unchecked platform poster (see [Transcode and Upload](references/transcode-upload.md#thumbnail)).
- Blossom upload uses regular `PUT /upload`; chunked `PATCH /upload` only for large files and only when `OPTIONS /upload` advertises it.
- Publish to the user's write relays and any relevant video relays.

## References

- [Nostr and Blossom Basics](references/nostr-blossom-basics.md): concepts for newcomers, NosTube server instances and managed-key signing, NIP/BUD spec links, tools (nak, ffmpeg, yt-dlp, libraries).
- [Event Reference](references/event-reference.md): complete event schema, `imeta`, subtitles, origins, mirror announcements, JSON examples.
- [Transcode and Upload](references/transcode-upload.md): ffmpeg recipes, thumbnail selection, Blossom PUT/PATCH/mirror flows, Nostr auth notes, and CLI-oriented steps.
