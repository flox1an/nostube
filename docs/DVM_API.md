# Video Transform DVM API

This document describes how to interact with the Video Transform Data Vending Machine (DVM) using Nostr events.

## Overview

The Video Transform DVM converts videos to HLS (adaptive streaming) or MP4 format and uploads them to Blossom servers. It follows the [NIP-90](https://github.com/nostr-protocol/nips/blob/master/90.md) specification for Data Vending Machines.

| Event Kind | Description                   |
| ---------- | ----------------------------- |
| 5207       | Job Request (video transform) |
| 6207       | Job Result                    |
| 7000       | Job Status/Feedback           |

## Making a Request (Kind 5207)

Send a kind 5207 event to request a video transformation.

### Required Tags

| Tag | Description                              |
| --- | ---------------------------------------- |
| `i` | Input video URL: `["i", "<url>", "url"]` |
| `p` | DVM public key: `["p", "<dvm-pubkey>"]`  |

### Optional Tags

| Tag      | Description                    |
| -------- | ------------------------------ |
| `param`  | Parameters for the job         |
| `relays` | Preferred relays for responses |

### Parameters

| Parameter    | Values                          | Default | Description                  |
| ------------ | ------------------------------- | ------- | ---------------------------- |
| `mode`       | `hls`, `mp4`                    | `mp4`   | Output format                |
| `resolution` | `360p`, `480p`, `720p`, `1080p` | `720p`  | Output resolution (MP4 only) |

### Example: HLS Request

```json
{
  "kind": 5207,
  "content": "",
  "tags": [
    ["i", "https://example.com/video.mp4", "url"],
    ["p", "7ea7fe97f9814b61f1383286a27c44c3000b864aa6d0163fe5ba4f9714b777c2"],
    ["param", "mode", "hls"],
    ["relays", "wss://relay.damus.io", "wss://nos.lol"]
  ]
}
```

### Example: MP4 Request

```json
{
  "kind": 5207,
  "content": "",
  "tags": [
    ["i", "https://example.com/video.mp4", "url"],
    ["p", "7ea7fe97f9814b61f1383286a27c44c3000b864aa6d0163fe5ba4f9714b777c2"],
    ["param", "mode", "mp4"],
    ["param", "resolution", "720p"],
    ["relays", "wss://relay.damus.io"]
  ]
}
```

## Status Updates (Kind 7000)

The DVM sends status events during processing.

### Tags

| Tag       | Description                            |
| --------- | -------------------------------------- |
| `e`       | Reference to the job request event ID  |
| `p`       | Requester's public key                 |
| `status`  | Current status                         |
| `content` | Human-readable message                 |
| `eta`     | Estimated seconds remaining (optional) |

### Status Values

| Status       | Description                |
| ------------ | -------------------------- |
| `processing` | Job is being processed     |
| `success`    | Job completed successfully |
| `error`      | Job failed                 |

### Example: Processing Status

```json
{
  "kind": 7000,
  "content": "",
  "tags": [
    ["e", "abc123..."],
    ["p", "user-pubkey..."],
    ["status", "processing"],
    ["content", "Transcoding to HLS (360p, 720p, 1080p) (~1m 30s remaining)"],
    ["eta", "90"]
  ]
}
```

### Example: Success Status

```json
{
  "kind": 7000,
  "content": "",
  "tags": [
    ["e", "abc123..."],
    ["p", "user-pubkey..."],
    ["status", "success"],
    ["content", "Video transformation complete"]
  ]
}
```

### Example: Error Status

```json
{
  "kind": 7000,
  "content": "",
  "tags": [
    ["e", "abc123..."],
    ["p", "user-pubkey..."],
    ["status", "error"],
    ["content", "Failed to download video: connection timeout"]
  ]
}
```

## Job Result (Kind 6207)

When the job completes, the DVM publishes a result event with the output in the `content` field as JSON.

### Tags

| Tag | Description                           |
| --- | ------------------------------------- |
| `e` | Reference to the job request event ID |
| `p` | Requester's public key                |

### HLS Result Format

```json
{
  "kind": 6207,
  "content": "{\"type\":\"hls\",\"master_playlist\":\"https://...\",\"stream_playlists\":[...],\"total_size_bytes\":125000000}",
  "tags": [
    ["e", "abc123..."],
    ["p", "user-pubkey..."]
  ]
}
```

#### Decoded HLS Content

```json
{
  "type": "hls",
  "master_playlist": "https://blossom.example.com/abc123.m3u8",
  "stream_playlists": [
    {
      "url": "https://blossom.example.com/def456.m3u8",
      "resolution": "1080p",
      "size_bytes": 80000000
    },
    {
      "url": "https://blossom.example.com/ghi789.m3u8",
      "resolution": "720p",
      "size_bytes": 30000000
    },
    {
      "url": "https://blossom.example.com/jkl012.m3u8",
      "resolution": "360p",
      "size_bytes": 15000000
    }
  ],
  "total_size_bytes": 125000000
}
```

| Field                           | Type   | Description                    |
| ------------------------------- | ------ | ------------------------------ |
| `type`                          | string | Always `"hls"`                 |
| `master_playlist`               | string | URL to the HLS master playlist |
| `stream_playlists`              | array  | Individual stream playlists    |
| `stream_playlists[].url`        | string | URL to the stream playlist     |
| `stream_playlists[].resolution` | string | Resolution (e.g., `"1080p"`)   |
| `stream_playlists[].size_bytes` | number | Size of stream in bytes        |
| `total_size_bytes`              | number | Total size of all files        |

### MP4 Result Format

```json
{
  "kind": 6207,
  "content": "{\"type\":\"mp4\",\"urls\":[\"https://...\"],\"resolution\":\"720p\",\"size_bytes\":45000000}",
  "tags": [
    ["e", "abc123..."],
    ["p", "user-pubkey..."]
  ]
}
```

#### Decoded MP4 Content

```json
{
  "type": "mp4",
  "urls": ["https://blossom1.example.com/abc123.mp4", "https://blossom2.example.com/abc123.mp4"],
  "resolution": "720p",
  "size_bytes": 45000000
}
```

| Field        | Type   | Description                               |
| ------------ | ------ | ----------------------------------------- |
| `type`       | string | Always `"mp4"`                            |
| `urls`       | array  | URLs to the MP4 file on different servers |
| `resolution` | string | Output resolution                         |
| `size_bytes` | number | File size in bytes                        |

## Subscribing to Responses

To receive status updates and results, subscribe to:

```json
{
  "kinds": [6207, 7000],
  "authors": ["<dvm-pubkey>"],
  "#e": ["<your-request-event-id>"]
}
```

## Complete Flow Example

### 1. User publishes request

```json
{
  "id": "request123...",
  "kind": 5207,
  "pubkey": "user-pubkey...",
  "content": "",
  "tags": [
    ["i", "https://example.com/myvideo.mp4", "url"],
    ["p", "dvm-pubkey..."],
    ["param", "mode", "hls"]
  ],
  "created_at": 1700000000,
  "sig": "..."
}
```

### 2. DVM sends processing status

```json
{
  "kind": 7000,
  "pubkey": "dvm-pubkey...",
  "tags": [
    ["e", "request123..."],
    ["p", "user-pubkey..."],
    ["status", "processing"],
    ["content", "Starting video transformation"]
  ]
}
```

### 3. DVM sends progress updates

```json
{
  "kind": 7000,
  "pubkey": "dvm-pubkey...",
  "tags": [
    ["e", "request123..."],
    ["p", "user-pubkey..."],
    ["status", "processing"],
    ["content", "Transcoding to HLS (360p, 720p, 1080p) (~2m 30s remaining)"],
    ["eta", "150"]
  ]
}
```

### 4. DVM publishes result

```json
{
  "kind": 6207,
  "pubkey": "dvm-pubkey...",
  "content": "{\"type\":\"hls\",\"master_playlist\":\"https://blossom.example.com/master.m3u8\",\"stream_playlists\":[{\"url\":\"https://blossom.example.com/1080p.m3u8\",\"resolution\":\"1080p\",\"size_bytes\":80000000},{\"url\":\"https://blossom.example.com/720p.m3u8\",\"resolution\":\"720p\",\"size_bytes\":30000000},{\"url\":\"https://blossom.example.com/360p.m3u8\",\"resolution\":\"360p\",\"size_bytes\":15000000}],\"total_size_bytes\":125000000}",
  "tags": [
    ["e", "request123..."],
    ["p", "user-pubkey..."]
  ]
}
```

### 5. DVM sends success status

```json
{
  "kind": 7000,
  "pubkey": "dvm-pubkey...",
  "tags": [
    ["e", "request123..."],
    ["p", "user-pubkey..."],
    ["status", "success"],
    ["content", "Video transformation complete"]
  ]
}
```

## HLS Output Details

When `mode=hls`, the DVM produces:

- **Master Playlist**: Contains references to all quality variants
- **Stream Playlists**: One per resolution (360p, 720p, 1080p)
- **Segments**: 6-second fMP4 segments with H.265 video (H.264 for 1080p) and AAC audio

The URLs use SHA-256 content hashes, making them content-addressable and cacheable.

## Error Handling

If the job fails, you'll receive a status event with `status: "error"`:

```json
{
  "kind": 7000,
  "tags": [
    ["e", "request123..."],
    ["p", "user-pubkey..."],
    ["status", "error"],
    ["content", "Failed to download video: 404 Not Found"]
  ]
}
```

Common errors:

- Invalid or inaccessible video URL
- Unsupported video format
- Video too large or too long
- Blossom upload failures
