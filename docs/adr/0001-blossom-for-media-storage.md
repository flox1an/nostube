# ADR 0001: Use Blossom for Media Storage

**Date:** 2026-06-05  
**Status:** Accepted

## Context

NosTube needs to store video files and thumbnails. The options considered were:

- **Traditional CDN** (S3, Cloudflare R2, etc.): simple, well-understood, but centralised and subject to takedowns.
- **NIP-96**: the older Nostr file hosting standard. Server-specific URLs; no standard way to re-host a file elsewhere once the original host removes it.
- **Blossom** (BUD-01 / BUD-03): content-addressed blob storage where each file is identified by its SHA256 hash. Any Blossom server can host any blob. Users publish their server list in a replaceable Nostr event (kind 10063).

## Decision

Use Blossom as the primary media hosting protocol.

## Rationale

Blossom's content-addressing means the same blob can be re-uploaded to any Blossom server by anyone — the URL changes but the hash is the same, so events still point to verifiable content. This enables:

1. **Self-hosting**: users can re-upload their own blobs to a new server if the original goes down.
2. **Third-party mirroring**: any party can mirror content without the original uploader's involvement.
3. **Lookup via Nostr**: kind 10063 events let clients discover which servers hold a user's blobs, making fallback transparent.

The upload flow exploits this directly: after uploading to the primary server, the app mirrors the blob to additional servers so multiple URLs exist in the event's `imeta` tags from day one.

NIP-96 was rejected because its server-specific URLs make re-hosting impractical — there is no protocol-level way to discover alternatives or verify that a re-hosted file is identical.

## Consequences

- Clients must support the Blossom auth token flow for uploads.
- Media URLs in events are Blossom URLs; resilience depends on users configuring multiple servers.
- Future support for NIP-96 servers is possible as a secondary fallback but is not planned.
