# Transcode and Upload

This reference gives CLI-oriented steps for preparing media for NosTube-compatible video events.

## Inspect Media

```bash
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=codec_name,width,height,avg_frame_rate,bit_rate \
  -show_entries format=duration,size,bit_rate \
  -of json input.mov
```

Publish fields derived from this:

- `duration`: seconds from `format.duration`.
- `dim`: `widthxheight`.
- `size`: uploaded file bytes.
- `bitrate`: total or video bitrate in bits per second.
- `m`: MIME type plus codecs when known.

## When To Transcode

These are compatibility/size choices, not NIP-71 requirements. Transcode when:

- container is not MP4/HLS
- video codec is not H.264/AVC or HEVC
- audio codec is not AAC
- short side is greater than 1080
- bitrate is above roughly 8 Mbps
- you want a smaller fallback variant

The recipes below cap the short side at 1080 or 480 pixels, use 30 fps and 96 kbps audio, and avoid upscaling. Choose settings for the target clients and file size; HEVC support varies.

## MP4 Recipes

Primary 1080p H.264:

```bash
ffmpeg -i input.mov \
  -vf "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)':force_original_aspect_ratio=decrease,setsar=1" \
  -r 30 \
  -c:v libx264 -preset medium -crf 22 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 96k \
  -movflags +faststart \
  output_1080p.mp4
```

480p fallback:

```bash
ffmpeg -i input.mov \
  -vf "scale='if(gt(iw,ih),-2,min(480,iw))':'if(gt(iw,ih),min(480,ih),-2)':force_original_aspect_ratio=decrease,setsar=1" \
  -r 30 \
  -c:v libx264 -preset medium -crf 24 -profile:v main -pix_fmt yuv420p \
  -c:a aac -b:a 96k \
  -movflags +faststart \
  output_480p.mp4
```

HEVC variant, when target clients support it:

```bash
ffmpeg -i input.mov \
  -vf "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)':force_original_aspect_ratio=decrease,setsar=1" \
  -r 30 \
  -c:v libx265 -preset medium -crf 26 -tag:v hvc1 \
  -c:a aac -b:a 96k \
  -movflags +faststart \
  output_1080p_hevc.mp4
```

## Thumbnail

Never take the first frame or a fixed early timestamp blindly, and do not trust a platform-provided poster (X/YouTube posters are often the black first frame): intros, fades and title cards are frequently black. Pick the frame like this:

1. Extract candidates spread over the video (e.g. 10 positions from ~5% to ~90% of the duration). The `thumbnail` filter picks the most representative frame of a window, which avoids transition and motion-blur frames:

```bash
for t in 10 25 40 55 70 85 100 115 130 145; do  # seconds, spread over the duration
  ffmpeg -v error -y -ss $t -i video.mp4 -vf "thumbnail=90,scale=480:-2" -frames:v 1 cand_$t.jpg
done
```

2. Measure the mean luma of each candidate (and of any existing poster) and reject dark or washed-out frames (YAVG below ~25 or above ~230 of 255):

```bash
ffprobe -v error -f lavfi -i "movie=cand_10.jpg,signalstats" \
  -show_entries frame_tags=lavfi.signalstats.YAVG -of csv=p=0
```

3. If you can view images, build a contact sheet (`ffmpeg -pattern_type glob -i 'cand_*.jpg' -vf tile=4x3 sheet.jpg`) and pick the clearest, most on-topic frame: a recognizable subject, no text-only slide, no blur. Otherwise take the remaining candidate with the highest luma variance.
4. Re-extract the chosen timestamp at full resolution:

```bash
ffmpeg -ss <chosen> -i video.mp4 -vf thumbnail=90 -frames:v 1 -q:v 2 thumbnail.jpg
```

Upload the chosen preview if it is not already hosted. NIP-71 describes previews at the video's resolution; create one for each video variant when following that guidance. Include copies of that preview as `image` values, once per distinct server + blob hash (extensionless and extension URLs on the same Blossom server are one location), not every repeated upload/mirror result.

## Subtitles

Convert SRT to WebVTT when possible:

```bash
ffmpeg -i captions.srt captions.vtt
```

Host the WebVTT file and select the target client's tag format. NIP-71 describes `["text-track", "<url>", "subtitles", "<lang>"]`; NosTube currently uses legacy `["text-track", "<url>", "<lang>"]`. See [Subtitles](event-reference.md#subtitles) for the compatibility distinction.

## Blossom Upload Flow

Resolve signer and upload destinations through the skill's preflight first. Normalize and deduplicate server URLs before scheduling uploads/mirrors. For each file that needs hosting:

1. Calculate SHA-256 of the exact bytes.
2. Check existence with `HEAD <server>/<sha256>`. A matching existing blob can be reused; distinguish not-found from authentication or network failure.
3. Create a signed Blossom upload auth event with the file hash, a short future expiration, and server-scoped `server` tag (lowercase hostname only).
4. Upload to `/upload`; BUD-06 `HEAD /upload` can pre-check acceptance, but final upload success still needs checking.
5. Require a successful response, verify returned `sha256` equals the local hash and `size` matches the file, and retain the descriptor. Verify the hosted URL; do not publish a failed or unverified upload as a mirror.

Blob descriptor fields needed for events:

```json
{
  "url": "https://server.example/<sha256>.mp4",
  "sha256": "<sha256>",
  "size": 73400320,
  "type": "video/mp4"
}
```

## Regular Blossom PUT

Most files should use regular Blossom upload:

```http
PUT /upload
Content-Type: video/mp4
X-SHA-256: <sha256>
Authorization: Nostr <base64url-auth-event>

<file bytes>
```

The BUD-11 auth event is kind `24242` with human-readable `content`, `created_at` in the past, `["t", "upload"]`, `["x", "<lowercase-sha256>"]`, and a future `["expiration", "<unix>"]`. Scope it with `["server", "<lowercase-hostname>"]` to avoid authorizing unrelated servers. Encode the **signed JSON event** as Base64url without padding for the `Authorization: Nostr` header. Use a maintained client or inspect available helpers against [BUD-11](https://github.com/hzrd149/blossom/blob/master/buds/11.md); version-specific implementations may use a different encoding. Do not log the token.

## Chunked PATCH Upload

Not an official BUD: NosTube code names it "BUD-10" after an earlier draft, but the current BUD-10 is the `blossom:` URI schema. The headers below describe NosTube's extension, not a universal resumable-upload protocol. Use PATCH only when the target server documents this exact flow; otherwise use PUT. NosTube's web uploader attempts it for files above about 100 MB and falls back to PUT; other clients/instances may use different policies.

Capability negotiation:

```http
OPTIONS /upload
```

Check the target server's documented protocol in addition to `Accept-Patch`, `Allow: PATCH`, or advertised upload modes. Method support alone does not establish compatible chunk headers, ordering, or completion semantics.

Chunk upload:

```http
PATCH /upload
Content-Type: application/octet-stream
X-SHA-256: <file-sha256>
Upload-Type: video/mp4
Upload-Length: <file-size-bytes>
Upload-Offset: <byte-offset>
Content-Length: <chunk-size>
Authorization: Nostr <base64url-auth-event>

<chunk bytes>
```

For servers implementing this extension, use bounded-memory slices/streams, upload the final chunk last, and validate the final descriptor. Respect that server's offset/concurrency rules. Do not assume PATCH support implies resumability or parallel out-of-order chunks.

## Mirror Flow

To mirror an already uploaded blob:

```http
PUT /mirror
Content-Type: application/json
Authorization: Nostr <base64url-upload-auth-scoped-to-mirror-server>

{"url":"https://origin.example/<sha256>.mp4"}
```

Mirror each blob only once per distinct target server, reusing an existing matching blob where possible. Verify mirror descriptors against the source hash and add locations as `fallback` entries on the matching `imeta`. Different encodings belong in separate `imeta` tags, not fallbacks. Optionally publish kind `1063` metadata after the video event.

## Standalone JSON Signing Pattern

When shell tag flags become awkward, write JSON:

```json
{
  "kind": 34235,
  "content": "Description",
  "created_at": 1763047346,
  "tags": [
    ["d", "video-id"],
    ["title", "Title"],
    ["alt", "Description"],
    ["published_at", "1763047346"],
    ["duration", "281"],
    [
      "imeta",
      "dim 1920x1080",
      "url https://server/file.mp4",
      "x <sha256>",
      "m video/mp4",
      "size 123",
      "duration 281",
      "image https://server/thumb.webp"
    ],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"]
  ]
}
```

Configure `NOSTR_SECRET_KEY` and `RELAY` explicitly through protected environment settings, then use `nak event "$RELAY" < event.json` (see the main skill's guarded example), or a NosTube instance's managed signer. These example URLs/hashes are illustrative: replace them with verified media metadata. Check relay `OK` responses and read back the exact signed event id before reporting publication.
