---
name: nostr-video-publisher
description: Prepare, upload, sign, and publish NIP-71 Nostr video events using Blossom and nak. Use when publishing videos, preparing thumbnails or subtitles, importing media, or configuring publishing prerequisites.
metadata:
  short-description: Publish NosTube-compatible Nostr video events
---

# Nostr Video Publisher

Use this skill when creating or editing Nostr video posts for NosTube-compatible clients.

New to Nostr or Blossom (keys, events, kinds, relays, blobs, upload auth)? Read [Nostr and Blossom Basics](references/nostr-blossom-basics.md) first: it explains the concepts and lists the NIPs, BUDs and tools.

## Preflight

Before any upload or publication:

1. Resolve the intended identity and signer from the user's request and available configuration. Use an authorized signer, protected key environment/file, or a NosTube instance's managed key. If identity is unclear, ask; never silently create a key or use nak's machine-default identity. If no signer is configured on this machine, run [Signing Setup](#signing-setup-precondition) with the user, which hands the pairing to [nak Remote Signer](../nak-remote-signer/SKILL.md).
2. Resolve at least one write relay (`wss://`, or `ws://` for an explicitly local setup). Prefer explicit destinations, then the identity's NIP-65 kind `10002` write relays (unmarked `r` tags also support writes), plus the target instance's relay. Without a known relay, look up kind `10002`/`10063`/`0` on the indexer relays `wss://purplepag.es`, `wss://nos.lol` and `wss://relay.damus.io` (read-only; no confirmation needed).
3. Resolve Blossom upload/mirror destinations **only for files that need hosting** (including thumbnails and subtitles). Prefer explicit destinations, then configured servers or the identity's BUD-03 kind `10063` list. A published server list is a candidate list, not proof of upload permission. Existing hosted media needs no new upload; preserve supplied URLs unless mirroring is requested.
4. Check required tools and authorized access. Probe destinations without sending media first: blob `HEAD`/BUD-06 upload pre-check for Blossom, relay connection/auth requirements where possible. These are preliminary checks, not guarantees of acceptance.
5. If anything is missing, ask once for the unresolved choices together: identity/signer method, write relays, and upload servers as applicable. Offer candidates from discovered lists or the target instance, with reachability/permission unknowns stated. Without discovered write relays, offer this selection (current as of 2026-10, may change; probe first, publish only to the ones the user picks): `wss://relay.nostu.be` (read by nostu.be), `wss://relay.primal.net`, `wss://nos.lol`. Without upload server candidates, ask for endpoints or offer to research current services; don't invent a free/public default. Explain that uploads/events can become public. Request credentials via protected environment/file or signer connection, never chat.

Proceed only when the identity and destinations are resolved and the user has authorized the uploads/publication. Offline preparation can proceed without them. Tool requirements: [Tools](references/nostr-blossom-basics.md#tools).

## Signing Setup (precondition)

Every upload authorization and the video event must be signed by the user's key. This is a precondition, not a step of the publishing flow: resolve it before preparing uploads. The authoritative source is [nak Remote Signer](../nak-remote-signer/SKILL.md) (repository path `skills/nak-remote-signer/SKILL.md`): it covers which signer nak picks up, the QR pairing, the file it stores, and its failure modes. Do not improvise a setup here; follow that skill and come back. Installed without that sibling skill (this one distributed alone)? Add it with `npx skills add flox1an/nostube --skill nak-remote-signer` before continuing; nothing here replaces it.

1. **Instance-managed key:** a NosTube server with a managed key signs through its studio API, so no local signer is needed (see [NosTube Server Instances](references/nostr-blossom-basics.md#nostube-server-instances)). Everything below applies to local and other remote signing.
2. **Detect**, as in [Resolve the signer](../nak-remote-signer/SKILL.md#1-resolve-the-signer): `NOSTR_SECRET_KEY` set by the user, or the protected file `~/.config/nak/signer.env` (must be mode `600`). Never print either value.
3. **No signer, or the user wants a different identity:** stop and run [Pair via QR code](../nak-remote-signer/SKILL.md#2-pair-via-qr-code) with the user. A NIP-46 remote signer (Amber, nsec.app, nsecBunker) is the recommended method: the key never leaves it and the user approves each request there. An `ncryptsec` (NIP-49) or a plain `nsec` in a `chmod 600` file works if the user insists on a local key. NIP-07 browser extensions cannot sign for a CLI: offer a bunker, or publishing through a browser client such as the NosTube upload page.
4. **Verify** the identity once per session before the first upload or publish: sign a throwaway event with no relay argument, so nothing is published, and compare the pubkey with the intended `npub` (`nak decode npub1…`).

```bash
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak event -k 1 -c 'signer check' ) | jq -r .pubkey
```

A bunker shows an approval request; the user confirms it. Proceed only on a match. On mismatch, error, or no answer within about 60 s, stop and fix the signer; never fall back to nak's machine-default key.

For a bunker, every Blossom upload needs its own kind `24242` authorization: suggest the user allows kind `24242` and the video kinds in the signer for this client, or expect one approval per file.

## Workflow

1. Prepare media: inspect codec, duration, dimensions, bitrate, file size, thumbnail, subtitles, and external origin references.
2. Transcode if needed: prefer broadly playable MP4/H.264 + AAC; optionally create a 480p fallback or HLS. See [Transcode and Upload](references/transcode-upload.md).
3. Upload files that need hosting to the selected Blossom servers; verify returned `sha256` against the local file and keep `url`, `size`, and `type`. Reuse existing hosted URLs when no upload is needed.
4. Build a NIP-71 event: prefer editable `34235` (normal) / `34236` (short) with a stable `d`; `21` / `22` are regular, non-addressable alternatives. Use one `imeta` per variant or separate audio track.
5. Sign and publish to write relays: for a NosTube server instance, sign with its managed key through the studio API (see [NosTube Server Instances](references/nostr-blossom-basics.md#nostube-server-instances)); otherwise use exact JSON plus `nak event` (below).
6. Require successful relay `OK` responses and read the signed event back. Report per-relay acceptance/rejection and any partial success; do not call an unsigned/local-only event published. Optionally publish kind `1063` file metadata events for mirrored blobs.

## Event Shape

NIP-71 requires `title`, and `d` for addressable kinds. Set `content` to the description and `created_at` to the current update timestamp. Use at least one playable video `imeta` with `url` and another field (normally `m`), per NIP-92.

Recommended: original `published_at` (preserve on edits), per-variant `duration` in seconds (decimals allowed), `bitrate`, exact-file `x`, byte `size`, `dim`, and preview `image`. A top-level `duration` is a NosTube compatibility addition, not a substitute for per-variant metadata.

`alt`, language `L`/`l`, and `client` are optional. Attribute the actual publishing client, not `nostube` merely because the output is compatible; users may omit client attribution for privacy.

Load [Event Reference](references/event-reference.md) for exact tag schema, examples, and parsing compatibility notes.

## NosTube Conventions

- NosTube selects portrait (`height > width`) as short. NIP-71 itself defines normal/short as a stylistic choice, not a mandatory aspect-ratio or duration threshold.
- Use `d` as the addressable identifier. Keep it stable for edits/replacements.
- Prefer a concise `title` (around 40 characters is an editorial preference, not a NIP limit); the full description goes into `content`.
- Use multiple `imeta` tags for variants, not multiple URLs in one `imeta` unless they are fallbacks for the same variant.
- Put preview URLs in each video `imeta`. Repeated `image` values are copies of the same preview; deduplicate by server + blob hash (including `/hash` vs `/hash.ext`), retaining distinct mirrors. NIP-71 describes same-resolution previews. Put a matching blurhash in `blurhash` when available.
- Use `fallback <url>` for alternate Blossom/mirror URLs. NosTube also parses old `mirror <url>`, but new events should emit `fallback`.
- Choose subtitle tags for the target client: NIP-71 describes URL + track type + optional language; NosTube currently reads its legacy URL + language shape. See [Subtitles](references/event-reference.md#subtitles) before choosing; the shapes are not interchangeable.
- Add origin tags for imported media: `["r", "<source-url>"]` plus `["origin", "<platform>", "<external-id>", "<source-url>"]` for known platforms.
- Importing from YouTube: follow [Importing From YouTube](references/youtube-import.md); its quality gate must pass for every video before upload.
- Add people as `["p", "<pubkey>", "<relay-hint-if-known>"]`.

## Publishing With `nak`

Write exact event JSON first: shell tag flags can accidentally split a multi-value `imeta`. Use `nak event --help` to confirm signing options. Load the signer as described in [Calling nak](../nak-remote-signer/SKILL.md#3-calling-nak), so nothing secret reaches the arguments:

```bash
: "${RELAY:?Choose a write relay first}"
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak event "$RELAY" < event.json )
nak req -k 34235 -a <pubkey> -t d=<d-tag> "$RELAY"
```

The subshell keeps the signer out of the process arguments and is what the signer skill's Blossom calls use too. Prefer a remote signer when available. Never print keys, cookies, or signer connection secrets.

## Quality Checklist

Before publishing:

- Video URL opens with `HEAD` or `GET`, returns the expected MIME type, and has stable CORS behavior.
- `x` is the lower-case SHA-256 of the exact uploaded file.
- `size` is bytes, not MB.
- `dim` is `WIDTHxHEIGHT`.
- `duration` is seconds; NIP-71 allows floating-point values.
- Thumbnail is uploaded and referenced through `image`, and it is not a black or blank frame: pick it from sampled candidates, never the first frame or an unchecked platform poster (see [Transcode and Upload](references/transcode-upload.md#thumbnail)).
- Blossom upload uses regular `PUT /upload`; use chunked PATCH only when the target server documents a compatible extension, not merely because OPTIONS advertises PATCH.
- Upload responses match the file; relay acknowledgements and read-back match the signed event id. Destination failures are reported rather than hidden.

## References

- [Nostr and Blossom Basics](references/nostr-blossom-basics.md): concepts for newcomers, NosTube server instances and managed-key signing, NIP/BUD spec links, tools (nak, ffmpeg, yt-dlp, libraries).
- [Event Reference](references/event-reference.md): complete event schema, `imeta`, subtitles, origins, mirror announcements, JSON examples.
- [Transcode and Upload](references/transcode-upload.md): ffmpeg recipes, thumbnail selection, Blossom PUT/PATCH/mirror flows, Nostr auth notes, and CLI-oriented steps.
- [Importing From YouTube](references/youtube-import.md): yt-dlp setup (latest version, JS runtime), full-quality download of video, metadata, thumbnail and subtitles, the quality gate against throttled/low-quality downloads, batch throttling, and mapping `info.json` to event tags.
