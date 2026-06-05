# ADR 0002: Browser-Based Transcoding as Primary Encoding Path

**Date:** 2026-06-05  
**Status:** Accepted

## Context

Video publishing requires transcoding source files into web-compatible formats (H.264/H.265/AV1) at multiple resolutions. The conventional approach is server-side transcoding: upload the raw file, a server encodes it, then the encoded output is stored. The alternative is to encode in the browser before uploading.

## Decision

Browser-based transcoding (via Web Workers) is the primary encoding path. Remote DVM transcoding and a direct-upload fallback are secondary tiers.

## Rationale

**Bandwidth efficiency** is the primary driver. The user uploads only the encoded output, not the raw source file. Raw video files are often much larger than the encoded result; encoding first eliminates that upload cost entirely.

**No infrastructure dependency.** A server-side transcoding pipeline requires a service to be running, maintained, and funded by someone. Browser transcoding needs no external service — any user with a browser can publish.

**Modern hardware is fast enough.** Browser-based encoding via WebCodecs and Web Workers is not inherently slow; on modern devices it is fast. This assumption holds for the majority of the current user base.

**Sovereignty.** The raw source video never leaves the user's device. Only the encoded, ready-to-publish output is uploaded to Blossom servers.

## Tiers

The transcoding pipeline is designed as three tiers in priority order:

1. **Local (browser)** — WebCodecs + Web Workers, multi-resolution output, HLS playlist generation. Primary path.
2. **Remote (DVM)** — Nostr Data Vending Machine (kind 5207/6207). Used when local transcoding is unavailable (e.g. unsupported browser) or the user explicitly chooses it.
3. **Fallback** — direct upload of source or minimally processed file. Last resort.

## Consequences

- Users on older hardware or unsupported browsers fall through to the DVM tier automatically.
- The DVM tier is optional and depends on available DVM operators; it is not a guaranteed path.
- Browser transcoding limits the maximum encoding complexity to what the client device can sustain.
- HLS master playlists and multi-resolution variants are generated client-side before upload.
