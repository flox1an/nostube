---
name: nostr-video-publisher
description: Use when an AI agent needs to create, upload, transcode, sign, or publish Nostr video events for NosTube or compatible Nostr video clients. Covers kind 34235/34236 event structure, imeta tags, Blossom uploads and mirrors, BUD-10 PATCH chunked upload, subtitles, thumbnails, origin tags, nak publishing, and ffmpeg transcode guidance.
metadata:
  short-description: Publish NosTube-compatible Nostr video events
---

# Nostr Video Publisher

Use this skill when creating or editing Nostr video posts for NosTube-compatible clients.

## Workflow

1. Prepare media: inspect codec, duration, dimensions, bitrate, file size, thumbnail, subtitles, and external origin references.
2. Transcode if needed: prefer broadly playable MP4/H.264 + AAC; optionally create a 480p fallback or HLS. See [Transcode and Upload](references/transcode-upload.md).
3. Upload blobs to Blossom: upload video variants, thumbnail, and subtitles. Keep returned `url`, `sha256`, `size`, and `type`.
4. Build a NIP-71 addressable video event:
   - kind `34235` for normal videos
   - kind `34236` for shorts/vertical-first videos
   - one `imeta` tag per video variant
5. Sign and publish to write relays. Use exact JSON plus `nak sign ... | nak req -w ...` if no project publisher is available.
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
- Use multiple `imeta` tags for variants, not multiple URLs in one `imeta` unless they are fallbacks for the same variant.
- Put thumbnail URLs in every video `imeta` as repeated `image <url>` values. Put thumbnail blurhash in `blurhash <value>` when available.
- Use `fallback <url>` for alternate Blossom/mirror URLs. NosTube also parses old `mirror <url>`, but new events should emit `fallback`.
- Use `text-track` tags for subtitles: `["text-track", "<vtt-or-srt-url>", "<iso-639-1>"]`.
- Add origin tags for imported media: `["r", "<source-url>"]` plus `["origin", "<platform>", "<external-id>", "<source-url>"]` for known platforms.
- Add people as `["p", "<pubkey>", "<relay-hint-if-known>"]`.

## Publishing With `nak`

Prefer project helpers when working inside NosTube. For standalone agents, write exact event JSON first because `imeta` is a multi-value tag and shell tag flags can accidentally split it into invalid separate tags.

```bash
nak sign --sec "$NSEC" event.json | nak req -w "$RELAY"
```

Check the installed `nak sign --help`/`nak event --help` syntax before scripting; preserve the JSON tag arrays byte-for-byte.

## Quality Checklist

Before publishing:

- Video URL opens with `HEAD` or `GET`, returns the expected MIME type, and has stable CORS behavior.
- `x` is the lower-case SHA-256 of the exact uploaded file.
- `size` is bytes, not MB.
- `dim` is `WIDTHxHEIGHT`.
- `duration` is seconds, rounded or integer-like.
- Thumbnail is uploaded and referenced through `image`.
- For large files, Blossom upload either uses regular `PUT /upload` or BUD-10 `PATCH /upload` after `OPTIONS /upload` capability negotiation.
- Publish to the user's write relays and any relevant video relays.

## References

- [Event Reference](references/event-reference.md): complete event schema, `imeta`, subtitles, origins, mirror announcements, JSON examples.
- [Transcode and Upload](references/transcode-upload.md): ffmpeg recipes, Blossom PUT/PATCH/mirror flows, Nostr auth notes, and CLI-oriented steps.
