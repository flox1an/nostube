# P2P HLS Blob Cache Design

**Date:** 2026-06-09  
**Status:** Concept  
**Feature:** Verified P2P delivery and browser caching for HLS Blossom blobs

## Overview

NosTube can add a peer-to-peer delivery layer for HLS media without replacing Blossom or adopting the hashtree filesystem namespace. Blossom remains the canonical media storage and publication model. The P2P layer is an opportunistic byte source keyed by SHA-256 hashes that already appear in Blossom URLs and `imeta` tags.

The player flow becomes:

```text
HLS request for a segment or playlist
  -> local verified blob cache
  -> P2P mesh lookup by SHA-256
  -> Blossom/caching server fallback URLs
  -> verify SHA-256 before caching or seeding
  -> return bytes to hls.js
```

The browser keeps verified HLS blobs in origin storage so recently watched content can be replayed locally and served to peers. The cache is bounded by the current browser quota estimate:

```ts
const cacheLimitBytes = Math.floor((estimate.quota ?? 0) * 0.3)
```

No separate user-configured fixed cap is part of this concept.

## Goals

- Reduce Blossom bandwidth by serving popular HLS segments from nearby browser peers.
- Improve playback resilience when a Blossom server is slow or temporarily unavailable.
- Keep all media content-addressed and hash-verified before it is cached or seeded.
- Integrate with the existing NosTube HLS player path, especially `src/lib/hls-blossom-loader.ts`.
- Cache only rebuildable media bytes; Blossom servers remain the durable source of truth.

## Non-Goals

- Replace Blossom with a P2P filesystem.
- Require `htree://` links or hashtree manifests for normal NosTube playback.
- Implement a BitTorrent-style swarm for arbitrary byte ranges in V1.
- Store unverified remote bytes.
- Guarantee offline availability. Browser storage may still be evicted.
- Cache more than `30%` of the live `navigator.storage.estimate().quota`.

## Existing Fit

NosTube already has the pieces this should extend:

- `src/lib/hls-blossom-loader.ts` wraps `hls.js` loading and tries generated Blossom/caching fallback URLs.
- `src/lib/blossom-url.ts` extracts SHA-256 hashes from Blossom URLs.
- `src/lib/media-url-generator.ts` produces fallback URLs across Blossom servers and caching servers.
- Video events already carry media metadata through `imeta`, including `url`, `x`, `m`, `size`, and fallback URLs.

The P2P cache should sit inside the HLS loader, not above the video component. The `<video>` element should continue receiving media from `hls.js`; `hls.js` should receive segment bytes from a custom loader.

## Architecture

### Components

```text
VideoPlayer / hls.js
  -> createBlossomHlsLoader(...)
    -> P2PHlsBlobResolver
      -> VerifiedBlobCache
      -> P2PBlobMesh
      -> BlossomFallbackFetcher
```

### VerifiedBlobCache

Stores media bytes by SHA-256 and tracks metadata for eviction.

Recommended storage:

- **Cache API** for byte responses, because it naturally stores `Response` objects and works well with media-like data.
- **IndexedDB** for metadata, because it can index by hash, last access time, size, media type, and source video id.

Suggested metadata:

```ts
interface P2PBlobCacheEntry {
  sha256: string
  cacheUrl: string
  size: number
  mimeType?: string
  videoId?: string
  variantUrl?: string
  createdAt: number
  lastAccessedAt: number
  accessCount: number
  source: 'p2p' | 'blossom' | 'upload' | 'transcode'
}
```

Use a synthetic same-origin cache request key so the same blob deduplicates across servers:

```text
/__nostube_p2p_blob_cache__/<sha256>
```

### P2PBlobMesh

The mesh is a byte transport, not a file format.

Responsibilities:

- Use Nostr for short-lived WebRTC signaling.
- Connect to a bounded set of peers, preferably follows first and a capped pool of other peers.
- Answer `get(hash)` requests from `VerifiedBlobCache`.
- Ask peers for missing hashes.
- Verify returned bytes before writing them to `VerifiedBlobCache`.

The hashtree P2P protocol shape can be reused conceptually:

```ts
interface P2PBlobMesh {
  start(identity: { pubkey: string }): void
  stop(): void
  get(sha256: string, signal?: AbortSignal): Promise<Uint8Array | null>
  getStats(): P2PBlobMeshStats
}
```

The local store implementation should expose only verified blobs:

```ts
interface P2PLocalStore {
  get(hash: Uint8Array): Promise<Uint8Array | null>
  put(hash: Uint8Array, bytes: Uint8Array, metadata: CacheWriteMetadata): Promise<void>
  delete(hash: Uint8Array): Promise<void>
}
```

### BlossomFallbackFetcher

Fetches the candidate URLs the existing HLS loader already builds.

Rules:

- Try candidates in current priority order.
- Preserve existing failover/debug events.
- For hash-addressed requests, verify bytes before caching.
- If a request cannot be associated with a SHA-256, use the existing network loader behavior and do not add it to the P2P cache.

## HLS Request Resolution

The HLS loader should classify each request:

1. **Known hash request:** URL is a Blossom URL with a SHA-256 in the path, or a segment map knows this request URL maps to a SHA-256.
2. **Unknown hash request:** URL cannot be mapped to expected bytes.

Known hash requests use P2P/cache resolution:

```ts
async function resolveHlsBlob(request: HlsBlobRequest): Promise<Response> {
  const cached = await verifiedBlobCache.get(request.sha256)
  if (cached) return cached

  const p2pBytes = await p2pBlobMesh.get(request.sha256, request.signal)
  if (p2pBytes) {
    await verifiedBlobCache.putVerified({
      sha256: request.sha256,
      bytes: p2pBytes,
      mimeType: request.mimeType,
      videoId: request.videoId,
      source: 'p2p',
    })
    return bytesResponse(p2pBytes, request.mimeType)
  }

  const networkBytes = await fetchFromBlossomCandidates(request)
  await verifiedBlobCache.putVerified({
    sha256: request.sha256,
    bytes: networkBytes,
    mimeType: request.mimeType,
    videoId: request.videoId,
    source: 'blossom',
  })
  return bytesResponse(networkBytes, request.mimeType)
}
```

Unknown hash requests bypass P2P:

```text
existing hls.js BaseLoader -> candidate URL failover -> response to hls.js
```

## Segment Hash Discovery

P2P works best when each HLS segment has its own hash. Whole-video hashes are not enough for efficient streaming.

### V1: Hashes from Blossom Segment URLs

If HLS playlists reference Blossom URLs like:

```text
https://server.example/<segment-sha256>.m4s
```

then `extractBlossomHash()` can identify each segment hash directly. This requires no new manifest format.

### V2: Segment Map for Non-Blossom Playlists

For HLS playlists where segment URLs are relative or non-Blossom, publish or derive a segment map:

```ts
interface HlsSegmentHashMap {
  playlistUrl: string
  segments: Array<{
    uri: string
    sha256: string
    size?: number
    mimeType?: string
    duration?: number
  }>
}
```

The map can be embedded in a NosTube-specific tag later, published as an auxiliary event, or generated during DVM/browser transcode. V1 should not depend on this.

### Master Playlists

Master playlists and media playlists may also be cached if they are content-addressed. If a playlist is mutable or lacks an expected hash, it should be fetched normally and not seeded as verified content.

## Cache Limit

The cache limit is computed from the browser's current storage estimate:

```ts
async function getP2PCacheLimitBytes(): Promise<number> {
  const estimate = await navigator.storage.estimate()
  return Math.floor((estimate.quota ?? 0) * 0.3)
}
```

Eviction should run before writes:

```ts
async function ensureCacheSpace(incomingBytes: number): Promise<void> {
  const limit = await getP2PCacheLimitBytes()
  const usage = await metadataStore.getTotalCachedBytes()

  if (incomingBytes > limit) {
    throw new Error('Blob is larger than the P2P cache limit')
  }

  let bytesToFree = usage + incomingBytes - limit
  while (bytesToFree > 0) {
    const victim = await metadataStore.getLeastRecentlyUsedEntry()
    if (!victim) break
    await deleteCachedBlob(victim.sha256)
    bytesToFree -= victim.size
  }
}
```

Notes:

- `estimate.quota` is an estimate, not a promise that writes will succeed.
- Every storage write still needs `try/catch` for `QuotaExceededError`.
- If `estimate.quota` is unavailable or `0`, disable P2P caching and continue with normal Blossom playback.
- Cache usage should count only NosTube P2P media entries from metadata, not all origin storage.

## Eviction Policy

Use LRU with a few media-specific preferences:

1. Never evict the blob currently being loaded.
2. Prefer evicting old segments over thumbnails and playlists.
3. Prefer evicting low-access blobs before frequently reused blobs.
4. Delete both Cache API bytes and IndexedDB metadata in one logical operation.

The browser may still evict the entire origin's best-effort storage. The app must tolerate missing cache entries at any time.

## Hash Verification

All cached and seeded bytes must be verified:

```ts
async function verifySha256(bytes: Uint8Array, expectedHex: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actualHex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return actualHex === expectedHex.toLowerCase()
}
```

Rules:

- P2P responses are untrusted until verified.
- Blossom responses are also verified before entering the P2P cache.
- Hash mismatch means discard bytes, record a debug event, and try another source.
- Never serve a cache entry to peers unless it was previously verified.

## Player Integration

The `<video>` element does not need to know about P2P or Cache API. It keeps using `hls.js`.

Implementation point:

- Extend `createBlossomHlsLoader(options)` with optional `p2pBlobResolver`.
- In `load(context, config, callbacks)`, try the resolver when `context.url` maps to a SHA-256.
- If the resolver returns bytes, call `callbacks.onSuccess(...)` with the byte payload.
- If the resolver misses or errors non-fatally, fall back to the existing candidate URL loop.

Conceptual loader branch:

```ts
const sha256 = resolveExpectedHash(context.url, options)

if (sha256 && options.p2pBlobResolver?.enabled()) {
  resolveHlsBlob({ sha256, url: context.url, videoId: options.videoId })
    .then(response => callbacks.onSuccess(response, stats, context, undefined))
    .catch(() => loadCandidate())
  return
}

loadCandidate()
```

Care is needed to shape the `hls.js` loader response exactly like the current `BaseLoader` response, including `data`, `url`, `code`, and stats.

## P2P Seeding Behavior

A peer may answer requests only for verified cached hashes.

Seed eligibility:

- User is logged in or has an active local identity for P2P.
- P2P sharing is enabled.
- Blob exists in `VerifiedBlobCache`.
- Blob metadata is not marked private.

Do not announce a full inventory of cached hashes. Peers should ask for hashes they need; local clients answer opportunistically. This avoids turning watch history into a public index.

## Privacy and Safety

Risks:

- Seeding a segment reveals that the browser has seen or cached that segment.
- WebRTC exposes network-level metadata to connected peers.
- Cache contents can imply watch history.

Mitigations:

- Make P2P sharing opt-in.
- Prefer follows and trusted graph peers for initial connections.
- Do not broadcast cached hashes.
- Allow users to clear the P2P cache.
- Stop P2P in private browsing or when storage persistence is unavailable if product policy wants a conservative default.
- Keep NSFW/private/unlisted policy hooks available before seeding.

## Failure Modes

- **No storage quota:** Disable cache writes and play from Blossom.
- **Quota exceeded during write:** Evict and retry once; if it still fails, play without caching.
- **P2P timeout:** Fall back to Blossom immediately.
- **Hash mismatch:** Drop bytes, penalize peer/source in stats, try another source.
- **Browser eviction:** Treat as cache miss.
- **No WebRTC support:** Disable P2P and keep normal HLS loading.

## Suggested Implementation Phases

### Phase 1: Verified Cache Library

- Add `src/lib/p2p/verified-blob-cache.ts`.
- Store bytes in Cache API under synthetic hash URLs.
- Store metadata in IndexedDB.
- Implement SHA-256 verification and LRU eviction using `quota * 0.3`.
- Unit-test cache put/get/delete/evict behavior.

### Phase 2: HLS Loader Cache Read-Through

- Extend `hls-blossom-loader.ts` to check the verified cache for Blossom segment URLs.
- On network success, verify and write segments to cache.
- Add debug events for `cache-hit`, `cache-miss`, `cache-write`, and `cache-evict`.
- No P2P yet; this proves the cache path without networking complexity.

### Phase 3: P2P Mesh Adapter

- Add a `P2PBlobMesh` abstraction around the WebRTC/Nostr signaling implementation.
- Wire the local store to `VerifiedBlobCache`.
- Use Nostr signaling kind `25050` or a NosTube-specific fork if interoperability requires it.
- Limit peer counts and request timeouts aggressively.

### Phase 4: P2P Before Blossom

- Update the resolver order to `cache -> P2P -> Blossom`.
- Cache verified P2P hits.
- Add player diagnostics and a settings toggle.

### Phase 5: Better Segment Metadata

- Ensure browser/DVM HLS output uses content-addressed segment URLs where possible.
- Add a segment hash map for playlists that cannot expose hashes in URLs.

## Open Questions

- Should P2P be opt-in globally, per video, or enabled only for logged-in users?
- Should we request `navigator.storage.persist()` when users enable P2P seeding?
- Do we want to reuse kind `25050` signaling as-is, or define a NosTube label/tag to avoid cross-app mesh confusion?
- Should cache metadata include author/pubkey so user settings can avoid seeding muted or blocked authors?
- How should HLS playlist hash maps be represented in Nostr events if segment URLs are not Blossom URLs?

