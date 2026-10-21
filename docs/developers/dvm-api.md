# Transform DVM API

The Nostube web app can optionally hand a video to a hosted transform DVM, a [NIP-90](https://github.com/nostr-protocol/nips/blob/master/90.md) Data Vending Machine. The DVM downloads the video, transcodes it to MP4 and uploads the result to Blossom. Browser transcoding is the main path (see [Uploads and transcoding](/media/uploads)). The DVM is a fallback for videos above 1080p or with codecs that do not play everywhere. A Nostube Server never uses a DVM.

This page describes the protocol from the client's side, as implemented in `apps/web/src/lib/dvm-transcode-session.ts`, `apps/web/src/lib/dvm-utils.ts` and `apps/web/src/hooks/useDvmTracker.ts`. Running a DVM is not covered.

| Kind | Sent by | Purpose |
| --- | --- | --- |
| `31990` | DVM | Handler announcement ([NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md)) |
| `5207` | Client | Job request (video transform) |
| `7000` | DVM and client | Job feedback: bids, progress, errors; also bid approval and payment from the client |
| `6207` | DVM | Job result |

## Discovery

The web app asks your read and write relays (plus its default relays) for recent announcements:

```json
{ "kinds": [31990], "#k": ["5207"], "#d": ["video-transform-hls"], "since": <now - 30 minutes> }
```

Only DVMs whose announcement is less than 30 minutes old are offered, so a DVM has to re-announce regularly. The client reads these fields:

| Field | Meaning |
| --- | --- |
| `content` (JSON) or `name` / `about` tags | Display name and description |
| `["capability", "hardware", <value>]` | Hardware acceleration, e.g. `nvidia_nvenc`, `apple_videotoolbox` |
| `["capability", "codecs", "h264,h265"]` | Supported output codecs |
| `["capability", "max_concurrent", <n>]` | Jobs the DVM runs in parallel |
| `["capability", "queue_length", <n>]` | Jobs currently queued |
| `["capability", "speed_720p", <x>]` | Average speed per resolution, as a multiple of real time |
| `["rate", <sats>]` | Price in sats per minute; `0` means free |

## Job request (kind 5207)

When the user picks a DVM and the signer supports NIP-04, the request is encrypted to the DVM:

```json
{
  "kind": 5207,
  "content": "<NIP-04 ciphertext>",
  "tags": [
    ["p", "<dvm pubkey>"],
    ["relays", "wss://relay.example", "wss://nos.lol"],
    ["encrypted"],
    ["expiration", "<now + 24 h>"]
  ]
}
```

The decrypted content holds the input and the parameters:

```json
{
  "i": ["https://blossom.example.com/<sha256>.mov", "url"],
  "params": [
    ["param", "mode", "mp4"],
    ["param", "codec", "h264"],
    ["param", "resolution", "720p"]
  ]
}
```

Without a chosen DVM or without NIP-04 support, the same data goes into plain tags. The `p` tag is included only when a DVM was chosen:

```json
{
  "kind": 5207,
  "content": "",
  "tags": [
    ["i", "https://blossom.example.com/<sha256>.mov", "url"],
    ["param", "mode", "mp4"],
    ["param", "resolution", "720p"],
    ["param", "codec", "h264"],
    ["relays", "wss://relay.example"],
    ["expiration", "<now + 24 h>"],
    ["p", "<dvm pubkey>"]
  ]
}
```

| Parameter | Values sent by Nostube |
| --- | --- |
| `mode` | `mp4` |
| `resolution` | `1080p`, `720p`, `480p`, `360p`, `240p` (only with `mode=mp4`) |
| `codec` | `h264` or `h265` |

The web app sends one request per resolution. The request is published to your write relays, which are also listed in the `relays` tag.

## Bids, approval and payment

A request without `p` is open to any DVM. The client listens for kind `7000` events on the request for 5 seconds and collects bids:

```json
["status", "payment-required", "<optional message>"],
["amount", "<millisats>"],
["cashu", "<mint URL>"]
```

A free bid (`amount` `0`) is preferred. The client approves it with its own kind `7000` event:

```json
{ "kind": 7000, "tags": [["e", "<request id>"], ["p", "<dvm pubkey>"], ["status", "approved"], ["expiration", "<now + 24 h>"]] }
```

If only paid bids arrived, the web app pays the first one with Cashu tokens from the given mint. It uses the user's Cashu wallet, or mints tokens through NWC. Then it sends the token instead of an approval:

```json
{ "kind": 7000, "tags": [["e", "<request id>"], ["p", "<dvm pubkey>"], ["status", "payment-sent"], ["cashu", "<encoded token>"]] }
```

## Feedback (kind 7000)

The client subscribes to the DVM's responses to the request:

```json
{ "kinds": [7000, 6207], "authors": ["<dvm pubkey>"], "#e": ["<request id>"] }
```

| Tag | Meaning |
| --- | --- |
| `["status", <status>, <message>]` | `processing` or `partial` (progress), `error` (job failed, message shown to the user) |
| `["content", <text>]` | Human-readable status, preferred over the message in `status` |
| `["progress", <percent>]` | 0 to 100; otherwise a `NN%` in the message is used |
| `["phase", <phase>]` | `transcoding`, `uploading` or `mirroring` |
| `["eta", <seconds>]` | Estimated time remaining |
| `["speed", <x>]` | Speed as a multiple of real time, or MB/s while uploading |
| `["queue_position", <n>]` | 1-based position in the DVM's queue |

If the request was encrypted and the feedback carries an `encrypted` tag, the content is NIP-04 encrypted JSON: `{"status": "...", "message": "...", "eta": 90}`.

The client warns the user after 90 seconds without feedback. It gives up after 3 minutes of silence, or 10 minutes after the request without a result.

## Result (kind 6207)

The result's `content` is JSON, NIP-04 encrypted when the event has an `encrypted` tag:

```json
{
  "type": "mp4",
  "urls": ["https://blossom1.example.com/<sha256>.mp4", "https://blossom2.example.com/<sha256>.mp4"],
  "resolution": "720p",
  "size_bytes": 45000000,
  "mimetype": "video/mp4; codecs=\"avc1.64001f,mp4a.40.2\"",
  "duration": 120,
  "bitrate": 3000000
}
```

| Field | Meaning |
| --- | --- |
| `urls` | Required. Blossom URLs of the output; the first one becomes the variant's URL. |
| `resolution` | Output resolution, used for the variant's dimensions (`720p` → `1280x720`). |
| `size_bytes` | File size. |
| `mimetype` | MIME type with codecs, used for the `m` field of the `imeta`. |
| `duration`, `bitrate` | Optional; otherwise taken from the source video or computed from size and duration. |

The web app then mirrors the output to the user's Primary and Backup Blossom servers and adds it as a new variant of the video. If the user returns while a job is still running, the client asks for an existing kind `6207` result (`limit: 1`) before waiting again.
