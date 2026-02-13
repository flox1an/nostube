# nosvid - Nostr Video Swiss Army Knife

**Date:** 2026-02-13
**Status:** Shelved (design complete, awaiting implementation)
**Language:** Rust
**Inspiration:** [nak](https://github.com/fiatjaf/nak) (Nostr Army Knife by fiatjaf)

## Overview

`nosvid` is a standalone Rust CLI for working with Nostr video events (NIP-71). It handles the full lifecycle: uploading video files to Blossom servers, probing metadata, transcoding via DVMs, publishing NIP-71 events, mirroring, editing, fetching, and downloading.

Designed with nak-style Unix philosophy: flat subcommands, JSON line-delimited stdin/stdout, composable via piping.

## Command Surface

```
nosvid upload      Full pipeline: probe -> upload+mirror -> transcode -> publish
nosvid probe       Extract video metadata via ffprobe (outputs JSON)
nosvid fetch       Fetch video event(s) by naddr/nevent from relays
nosvid req         Query relays for video events (filter by author/tags/kind)
nosvid inspect     Pretty-print video event details (human-readable)
nosvid edit        Update metadata on published addressable video events
nosvid mirror      Copy blobs to additional Blossom servers
nosvid announce    Publish kind 1063 file metadata events for existing mirrors
nosvid download    Download video file by naddr/nevent or Blossom URL
nosvid transcode   Request DVM transcoding (NIP-90 kind 5207)
nosvid delete      Delete blobs from Blossom servers + optionally delete event
```

## Core Pipeline: `upload`

The star command. Full pipeline in one shot, or interactive when flags are omitted.

### Usage

```bash
# Full flags (scriptable)
nosvid upload ./video.mp4 \
  --title "Bitcoin Talk at PlebLab" \
  --description "Monthly meetup presentation" \
  --tags bitcoin,pleblab,austin \
  --language en \
  --server blossom.primal.net \
  --mirror nostr.download --mirror 24242.io \
  --thumbnail ./thumb.jpg \
  --transcode --resolutions 720p,480p \
  --relay wss://relay.damus.io --relay wss://nos.lol \
  --sec nsec1...

# Interactive (prompts for missing metadata)
nosvid upload ./video.mp4

# From URL
nosvid upload https://example.com/video.mp4

# Dry run (outputs unsigned event JSON, no publish)
nosvid upload ./video.mp4 --dry-run

# Non-interactive (fails on missing required fields)
nosvid upload ./video.mp4 --no-interactive --title "Title" --server blossom.primal.net
```

### Pipeline Stages

```
1. probe           Extract metadata via ffprobe (dimensions, codecs, duration, bitrate, MP4 atoms)
2. upload+mirror   Upload original to primary server(s), mirror to mirror servers
3. transcode       (Optional) Request DVM transcoding for additional resolutions
4. upload+mirror   Upload each transcoded variant to primary + mirror
5. build imeta     Construct imeta tags for all variants (url + fallback entries)
6. sign            Sign the NIP-71 video event
7. publish         Publish to write relays
```

All URLs (primary + mirrors) are stored directly in the imeta tags as `url` and `fallback` entries. The video event is self-contained - no separate kind 1063 events in this flow.

### Smart Defaults (Interactive Mode)

When flags are omitted, `upload` resolves them in order:

| Missing flag | Resolution chain |
|---|---|
| `--title` | MP4 metadata atoms -> interactive prompt |
| `--description` | MP4 `desc`/`ldes` atoms -> interactive prompt |
| `--tags` | MP4 `keyw` atom -> interactive prompt |
| `--server` | Config file -> user's Blossom server list (kind 10063) from relays -> interactive prompt |
| `--mirror` | Config file -> skip if none |
| `--thumbnail` | Extract frame from video (ffmpeg at ~10% duration) |
| `--sec` | `NOSTR_SECRET_KEY` env -> config file -> interactive prompt |
| `--relay` | Config file -> NIP-65 relay list from user profile -> default relays |
| `--language` | Config file default -> interactive prompt |

### Output

Outputs the published event as JSON to stdout (pipeable to nak or jq).

```bash
# Pipe to nak for re-publishing
nosvid upload ./video.mp4 --dry-run | nak event wss://another-relay.com
```

## Commands

### `probe`

Extract video metadata. Wraps `ffprobe`. Requires ffprobe on PATH.

```bash
nosvid probe ./video.mp4
nosvid probe https://blossom.primal.net/abc123def
```

Output:
```json
{
  "dimension": "1920x1080",
  "duration": 342.5,
  "video_codec": "avc1.64001F",
  "audio_codec": "mp4a.40.2",
  "bitrate": 5200000,
  "size": 52428800,
  "container": "mp4",
  "quality_label": "1080p",
  "orientation": "landscape",
  "metadata": {
    "title": "Bitcoin Talk",
    "description": "Monthly meetup presentation",
    "tags": ["bitcoin", "pleblab"],
    "published_at": 1700000000,
    "artist": "satoshi"
  }
}
```

### `fetch`

Fetch video events by NIP-19 identifier.

```bash
nosvid fetch naddr1...
nosvid fetch nevent1...
nosvid fetch naddr1... naddr1...   # multiple
```

Outputs raw JSON events to stdout (one per line).

### `req`

Query relays for video events. Same flag patterns as `nak req`.

```bash
nosvid req -a npub1... wss://relay.damus.io
nosvid req -k 34235 -t bitcoin wss://relay.damus.io
nosvid req -k 34236 --limit 10 wss://relay.damus.io   # shorts
nosvid req --since 2024-01-01 -a npub1... wss://relay.damus.io
```

Outputs raw JSON events to stdout.

### `inspect`

Human-readable display of video event details.

```bash
nosvid inspect naddr1...

# Or from stdin
nosvid fetch naddr1... | nosvid inspect
nak req -k 34235 wss://relay | nosvid inspect
```

Output:
```
Title:     Bitcoin Talk at PlebLab
Author:    npub1abc... (satoshi)
Published: 2024-03-15 14:30 UTC
Duration:  5:42
Kind:      34235 (addressable landscape)

Variants:
  1080p  1920x1080  h264/aac  52MB  blossom.primal.net (+2 mirrors)
  720p   1280x720   h264/aac  28MB  blossom.primal.net (+2 mirrors)
  480p   854x480    h264/aac  14MB  blossom.primal.net (+2 mirrors)

Thumbnail: https://blossom.primal.net/thumb123
Tags:      bitcoin, pleblab, austin
Language:  en
Relays:    wss://relay.damus.io, wss://nos.lol
```

### `edit`

Update metadata on published addressable video events (kinds 34235/34236).

```bash
nosvid edit naddr1... --title "Updated Title"
nosvid edit naddr1... --add-tag lightning --remove-tag test
nosvid edit naddr1... --description "New description"
nosvid edit naddr1... --language es
nosvid edit naddr1... --add-person npub1... --remove-person npub1...
```

Preserves all unknown tags for forward compatibility (same pattern as NosTube: filter out replaced keys, keep everything else).

Composable:
```bash
nosvid fetch naddr1... | nosvid edit --title "New" --dry-run | nosvid publish wss://relay
```

### `mirror`

Copy video blobs to additional Blossom servers.

```bash
# Mirror all variants of a video event
nosvid mirror naddr1... --to nostr.download --to 24242.io

# Mirror + publish kind 1063 announcements
nosvid mirror naddr1... --to nostr.download --announce

# Mirror a specific blob by hash
nosvid mirror --hash abc123... --from blossom.primal.net --to nostr.download
```

### `announce`

Publish kind 1063 file metadata events to announce mirror locations.

```bash
# Announce all mirrors for a video event
nosvid announce naddr1...

# Announce specific blob
nosvid announce --hash abc123... --url https://primary/abc123 \
  --fallback https://mirror1/abc123 --fallback https://mirror2/abc123 \
  --mime video/mp4 --size 52428800 --dim 1920x1080
```

Kind 1063 event structure:
```json
{
  "kind": 1063,
  "content": "",
  "tags": [
    ["e", "<video-event-id>"],
    ["a", "34235:<pubkey>:<d-tag>"],
    ["url", "https://primary/hash"],
    ["x", "<sha256>"],
    ["m", "video/mp4"],
    ["size", "52428800"],
    ["dim", "1920x1080"],
    ["fallback", "https://mirror1/hash"],
    ["fallback", "https://mirror2/hash"]
  ]
}
```

### `download`

Download video files.

```bash
# By video event (picks best quality or specify)
nosvid download naddr1... -o ./video.mp4
nosvid download naddr1... --quality 720p -o ./video.mp4

# By Blossom URL
nosvid download https://blossom.primal.net/abc123 -o ./video.mp4

# Try mirrors on failure (automatic from imeta fallbacks)
nosvid download naddr1... -o ./video.mp4 --try-mirrors
```

### `transcode`

Request DVM transcoding via NIP-90.

```bash
# Transcode an already-published video
nosvid transcode naddr1... --resolutions 720p,480p --codec h264

# Transcode a Blossom URL directly
nosvid transcode --url https://blossom.primal.net/abc123 --resolutions 720p,480p

# With specific DVM
nosvid transcode naddr1... --dvm npub1...

# Encrypted request (NIP-04, when signer supports it)
nosvid transcode naddr1... --encrypt
```

Polls DVM for progress, uploads transcoded variants to primary+mirror, can optionally update the video event with new variants.

### `delete`

Delete blobs and/or events.

```bash
# Delete blobs from servers
nosvid delete --hash abc123... --server blossom.primal.net

# Delete all blobs for a video event
nosvid delete naddr1... --blobs

# Delete event from relays (publish deletion event kind 5)
nosvid delete naddr1... --event

# Both
nosvid delete naddr1... --blobs --event
```

## Global Flags

```
--sec <key>          Signing key: hex, nsec, ncryptsec, bunker:// URI
--relay <url>        Target relay(s), repeatable
--server <url>       Blossom server(s), repeatable
--json               Force JSON output (default for fetch/req, optional for others)
--no-interactive     No prompts, fail on missing required info
--verbose / -v       Show progress, debug info
--quiet / -q         Suppress all non-essential output
--config <path>      Config file path (default: ~/.nosvid/config.toml)
--dry-run            Output event JSON without publishing
```

### Signing (nak-compatible)

Resolution order:
1. `--sec` flag
2. `NOSTR_SECRET_KEY` environment variable
3. Config file `secret_key`
4. Interactive prompt (unless `--no-interactive`)

Supported formats:
- Hex private key
- `nsec1...` (NIP-19 encoded)
- `ncryptsec1...` (NIP-49 encrypted, prompts for password)
- `bunker://pubkey?relay=wss://...` (NIP-46 remote signing)

## Config File

`~/.nosvid/config.toml`

```toml
# Signing
secret_key = "nsec1..."
# OR
# bunker = "bunker://pubkey?relay=wss://..."

# Blossom servers
[blossom]
primary = ["blossom.primal.net"]
mirrors = ["nostr.download", "24242.io"]

# Relays
[relays]
write = ["wss://relay.damus.io", "wss://nos.lol"]
read = ["wss://relay.damus.io", "wss://nos.lol"]

# Defaults
[defaults]
language = "en"
client_tag = "nosvid"

# DVM transcoding
[transcode]
dvm_pubkey = "abc123..."
resolutions = ["720p", "480p"]
codec = "h264"
encrypt = true
```

## NIP-71 Video Event Structure

`nosvid` produces addressable video events (kinds 34235/34236):

```json
{
  "kind": 34235,
  "content": "<description>",
  "created_at": "<unix seconds, always current time>",
  "tags": [
    ["d", "<unique identifier>"],
    ["title", "<title>"],
    ["alt", "<description>"],
    ["published_at", "<unix timestamp>"],

    ["imeta",
      "dim 1920x1080",
      "url https://primary.server/<sha256>",
      "x <sha256>",
      "m video/mp4; codecs=\"avc1.64001F,mp4a.40.2\"",
      "size 52428800",
      "bitrate 5200000",
      "duration 342.5",
      "image https://primary.server/<thumb-hash>",
      "image https://mirror1.server/<thumb-hash>",
      "blurhash eVF$^OI:${M{%L...",
      "fallback https://mirror1.server/<sha256>",
      "fallback https://mirror2.server/<sha256>"
    ],
    ["imeta",
      "dim 1280x720",
      "url https://primary.server/<sha256-720>",
      "x <sha256-720>",
      "m video/mp4; codecs=\"avc1.64001F,mp4a.40.2\"",
      "size 28000000",
      "bitrate 2800000",
      "duration 342.5",
      "image https://primary.server/<thumb-hash>",
      "fallback https://mirror1.server/<sha256-720>",
      "fallback https://mirror2.server/<sha256-720>"
    ],

    ["t", "bitcoin"],
    ["t", "pleblab"],
    ["p", "<pubkey>", "<relay-hint>"],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],
    ["client", "nosvid"]
  ]
}
```

Kind selection: 34235 for landscape (width > height), 34236 for portrait/shorts.

## Composability with nak

```bash
# nak feeds events into nosvid
nak req -k 34235 -a <pubkey> wss://relay | nosvid inspect

# nosvid produces events for nak
nosvid upload ./video.mp4 --dry-run | nak event --sec nsec1... wss://relay

# Probe metadata for scripting
nosvid probe ./video.mp4 | jq .metadata.title

# Batch inspect
nak req -k 34235 --limit 50 wss://relay | nosvid inspect

# Composable edit
nosvid fetch naddr1... | nosvid edit --title "New Title" --dry-run | jq .
```

JSON line-delimited events on stdin/stdout, same format as nak.

## External Dependencies

- **ffprobe** (required): Video metadata extraction. Must be on PATH.
- **ffmpeg** (optional): Thumbnail extraction from video frames.

## Rust Crates (likely)

- `clap` - CLI argument parsing with derive macros
- `nostr-sdk` / `rust-nostr` - Nostr protocol, signing, relay connections
- `nostr-blossom` - Blossom upload/mirror (BUD-01/02/04/10)
- `tokio` - Async runtime
- `reqwest` - HTTP client for Blossom API
- `serde` / `serde_json` - JSON serialization
- `sha2` - SHA256 hashing (streaming)
- `dialoguer` - Interactive prompts
- `indicatif` - Progress bars
- `toml` - Config file parsing
- `bech32` - NIP-19 encoding/decoding (if not in nostr-sdk)

## Implementation Priority

### Phase 1: Core Upload
- `probe` command (ffprobe wrapper)
- `upload` command (full pipeline without transcode)
- Config file support
- Signing (nsec, hex, env var)
- Blossom upload + mirror

### Phase 2: Read Operations
- `fetch` command
- `req` command
- `inspect` command
- `download` command

### Phase 3: Mutations
- `edit` command
- `delete` command
- `mirror` command (standalone)
- `announce` command (kind 1063)

### Phase 4: DVM Integration
- `transcode` command
- NIP-04 encrypted DVM requests
- Progress polling
- Auto-upload transcoded variants

### Phase 5: Advanced
- Bunker signing (NIP-46)
- ncryptsec support (NIP-49)
- NIP-65 relay discovery
- Kind 10063 Blossom server list discovery
- Batch operations
