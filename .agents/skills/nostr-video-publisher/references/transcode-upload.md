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

Transcode when:

- container is not MP4/HLS
- video codec is not H.264/AVC or HEVC
- audio codec is not AAC
- short side is greater than 1080
- bitrate is above roughly 8 Mbps
- you want a smaller fallback variant

NosTube's browser flow targets 1080p primary, optional 480p fallback, 30 fps, 96 kbps audio, and balanced 1080p video around 6.75 Mbps.

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

Upload it to Blossom and include all returned thumbnail/mirror URLs as `image` values in each `imeta` tag.

## Subtitles

Convert SRT to WebVTT when possible:

```bash
ffmpeg -i captions.srt captions.vtt
```

Upload subtitle files to Blossom and add `["text-track", "<url>", "<lang>"]`.

## Blossom Upload Flow

For each file:

1. Calculate SHA-256 of the exact bytes.
2. Check existence with `HEAD <server>/<sha256>`.
3. Create a Blossom upload auth event with the file hash and server-scoped `server` tag.
4. Upload to `/upload`.
5. Store the returned blob descriptor.

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

The auth event is a kind `24242` event with `["t", "upload"]`, `["x", "<sha256>"]` and `["expiration", "<unix>"]`, optionally scoped with `["server", "<domain>"]` (BUD-11, see [Nostr and Blossom Basics](nostr-blossom-basics.md#blossom-in-one-page)). In this repo, `buildUploadAuth` and `blossomAuthorization` in `packages/core/src/blossom-auth.ts` build it; outside, `blossom-client-sdk` `createUploadAuth` does.

## Chunked PATCH Upload

Not an official BUD: NosTube code names it "BUD-10" after an earlier draft, but the current BUD-10 is the `blossom:` URI schema. Use PATCH mainly for large files or resumability. NosTube only attempts chunked upload for files larger than about 100 MB and falls back to PUT if chunking fails.

Capability negotiation:

```http
OPTIONS /upload
```

Treat the server as PATCH-capable if response headers indicate `Accept-Patch`, `Allow: PATCH`, or Blossom upload modes containing `chunked` or `patch`.

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

Use `Blob.slice`/streaming chunks. Upload the final chunk last; expect the final response to return the blob descriptor.

## Mirror Flow

To mirror an already uploaded blob:

```http
PUT /mirror
Content-Type: application/json
Authorization: Nostr <base64url-upload-auth-scoped-to-mirror-server>

{"url":"https://origin.example/<sha256>.mp4"}
```

Add mirror results as `fallback` entries on the matching `imeta` tag. Optionally publish kind `1063` file metadata announcements after the video event is published.

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
      "image https://server/thumb.webp"
    ],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],
    ["client", "nostube"]
  ]
}
```

Then sign and publish it: `nak event --sec "$NSEC" "$RELAY" < event.json`, or through a NosTube instance's managed key (see [NosTube Server Instances](nostr-blossom-basics.md#nostube-server-instances)).
