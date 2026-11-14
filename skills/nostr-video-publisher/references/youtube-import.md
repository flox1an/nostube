# Importing From YouTube

Use this when moving YouTube videos to Nostr: download the best available media plus
metadata, thumbnail and subtitles with `yt-dlp`, verify quality, then continue with the
normal publishing workflow (transcode if needed, upload, build the event, publish).

Import only content the user owns or has the right to republish. Never put cookies or
account data in chat, logs, process arguments or the published event.

## 1. Tooling preflight

YouTube changes often; old yt-dlp builds silently lose high-quality formats.

1. **Update first, every session:** `yt-dlp -U` (standalone binary), `python3 -m pip install -U "yt-dlp[default]"` (pip) or `brew upgrade yt-dlp`. Distro packages lag; avoid them. Compare `yt-dlp --version` with the latest release at https://github.com/yt-dlp/yt-dlp/releases and stop if it is behind.
2. **JavaScript runtime:** full YouTube support needs an external runtime to solve player challenges ([EJS wiki](https://github.com/yt-dlp/yt-dlp/wiki/EJS)). Deno is used by default; Node/QuickJS need `--js-runtimes node`/`quickjs`. The solver scripts ship with `yt-dlp[default]` and the official binaries; other installs need `--remote-components ejs:github`. A warning like `No supported JavaScript runtime could be found` or `n challenge solving failed` means missing formats: fix it before downloading.
3. **ffmpeg/ffprobe** for merging separate video/audio streams and for verification.

## 2. Inspect before downloading

```bash
yt-dlp -v -F "$URL"
```

Check the verbose header (version, JS runtime, PO token providers) and the format table:

- The best video format should match the source's known maximum (typically 1080p or higher for recent uploads). Compare with what the YouTube page offers.
- **Red flags:** only format `18` (360p progressive MP4) or only low formats listed; warnings mentioning `PO Token`, `Sign in to confirm you're not a bot`, `Some web client https formats have been skipped`, `SABR`, `n challenge`, or HTTP `403`/`429`.

Any red flag fails the gate. Do not "fall back" to the low-quality version and publish it.

## 3. Download

Download the best separate video + audio streams and keep the original codecs (transcode
afterwards, once, if the target needs H.264/AAC; see [Transcode and Upload](transcode-upload.md)):

```bash
yt-dlp \
  -f "bv*+ba/b" -S "res,fps,hdr:12,vcodec,acodec" \
  --merge-output-format mkv \
  --write-info-json --write-description \
  --write-thumbnail --convert-thumbnails jpg \
  --write-subs --write-auto-subs --sub-langs "all,-live_chat" --convert-subs vtt \
  --download-archive archive.txt --no-overwrites \
  -o "%(id)s/%(id)s.%(ext)s" \
  "$URL"
```

- `-S res,…` prefers the highest resolution regardless of codec; `bv*+ba` merges the best video with the best audio. MKV avoids codec/container mismatches (AV1/VP9/Opus); remux or transcode to MP4 later.
- One directory per video id keeps media, `.info.json`, thumbnail and subtitles together.
- `--download-archive` makes batch runs resumable and skips completed ids.
- Auto-generated subtitles (`--write-auto-subs`) are machine output: keep them only when the user wants them, and label them (see below). Prefer uploaded subtitles; `"all,-live_chat"` can produce many languages, so narrow it (`"en.*,de"`) when the user only needs some.

### Batches and blocking

Mass downloads trigger YouTube's bot detection, which degrades results (missing formats, 403s) rather than always failing loudly.

- Throttle: `-t sleep` (or `--sleep-requests 1 --sleep-interval 5 --max-sleep-interval 15 --sleep-subtitles 5`). Do not parallelize downloads from one IP.
- Run the quality gate (step 4) **per video** and stop the batch at the first failure (`--abort-on-error` for download errors; the gate catches silent downgrades). Continuing would fill the archive with bad copies that `--download-archive` then skips forever: remove failed ids from `archive.txt`.
- When blocked: wait (hours, not seconds), update yt-dlp, then retry. Cookies (`--cookies-from-browser firefox` or `--cookies cookies.txt`) can restore formats but tie downloads to an account that YouTube may flag; use them only with the user's explicit consent, preferably a throwaway account, and store the cookie file protected (`chmod 600`). See the [PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide) for provider plugins when formats need PO tokens.

## 4. Quality gate (required before upload)

For each video, compare the downloaded file with the best format YouTube advertised in `.info.json`:

```bash
id=VIDEO_ID
jq '{title, duration, width, height, fps, format_id, max_height: ([.formats[] | select(.vcodec != "none") | .height // 0] | max)}' "$id/$id.info.json"
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,r_frame_rate -of json "$id/$id.mkv"
```

Pass only if all hold:

- The file has exactly one video stream and at least one audio stream (unless the source is silent).
- Video `height` equals `max_height` from the advertised formats, and `max_height` is plausible for the source (a recent 1080p upload advertising 360p max is a blocked download, not a low-quality source; check the YouTube page if unsure).
- Duration matches `.info.json` `duration` within about one second (truncated downloads end early).
- `format_id` is not `18` unless the source really is 360p.
- `ffmpeg -v error -i "$id/$id.mkv" -f null -` prints no decode errors.

On failure: delete the partial output, remove the id from `archive.txt`, fix the cause (update, JS runtime, throttle/wait, cookies with consent), and re-run. Report which videos failed instead of publishing them.

## 5. Map metadata to the event

From `<id>.info.json` (see [Event Reference](event-reference.md)):

| info.json                                        | Event                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `title`                                          | `title` tag (shorten if long; the full title can lead the description) |
| `description`                                    | `content`                                                              |
| `timestamp` (or `upload_date`)                   | `published_at` (Unix seconds as string); `created_at` = now            |
| `id`, `webpage_url`                              | `["r", url]` and `["origin", "youtube", id, url]`                      |
| `duration`, `width`, `height`                    | `imeta` `duration`, `dim` (from ffprobe of the **uploaded** file)      |
| `tags`, `categories`                             | `t` tags: lower-case, no `#`, deduplicated, keep a sensible number     |
| `chapters[]` (`start_time`, `end_time`, `title`) | `segment` tags (`HH:MM:SS.sss` strings)                                |
| `age_limit` ≥ 18                                 | `content-warning`                                                      |
| `language`                                       | optional `L`/`l` language labels                                       |

- `d`: use a stable value such as the YouTube id so re-imports update instead of duplicating.
- Shorts (`/shorts/` URL or portrait dimensions): publish as `34236`.
- Use the original upload date for `published_at`, never the import time.
- Do not copy view/like counts, channel subscriber data or YouTube-specific links into tags.

**Thumbnail:** the downloaded `.jpg` is the creator's chosen poster; still check it is not blank (see [Thumbnail](transcode-upload.md#thumbnail)) and that it is the highest-resolution one (`maxresdefault`, ideally matching the video aspect ratio). Upload it and reference it via `image` in each `imeta`.

**Subtitles:** use the VTT files (`<id>.<lang>.vtt`). Clean auto-generated VTT before upload: YouTube's auto captions repeat rolling lines and contain inline `<c>`/timestamp tags; strip them or omit auto captions. Upload each file and add one `text-track` per language in the shape chosen per [Subtitles](event-reference.md#subtitles); label machine-generated tracks in the display name (e.g. `English (auto-generated)`).

## 6. Continue with the normal workflow

Transcode the verified file if needed, upload video, thumbnail and subtitles, build the event,
sign and publish, then read it back (see the main skill). Keep the `.info.json` until the event
is confirmed, so failed uploads can be retried without downloading again.
