# Hyperdrive Video and Thumbnail Support

**Date:** 2026-07-18  
**Status:** Proposed  
**Scope:** Playback-only support for `hyper://` sources declared in NIP-92/NIP-94 media metadata.

## Decision

Evaluate **client-side P2P first** using NosTube's existing Nostr/WebRTC Hashtree blob mesh. Do not add a browser Hyperdrive implementation unless that evaluation proves it can provide range-capable, mobile-safe playback.

For the HTTP fallback required by native video elements and misses in the client P2P mesh, implement the Hyperdrive connection as an **Almond Blossom upstream**. Do not deploy a separate Hyperdrive gateway and do not route media through Vercel.

This is compatibility support for third-party media. It does not change the existing media-storage decision:

- Blossom remains NosTube's canonical upload, publication, mirror, and discovery protocol.
- NosTube does not publish `hyper://` URLs in V1.
- Almond fetches Hyperdrive content only on demand, verifies and stores it as a normal Blossom blob, then serves it from its existing domain and P2P store.
- Existing HTTP(S) candidates retain their current ordering and failover behavior.
  INS.PRE 20:

## Client P2P Evaluation and Revised Architecture

### Existing implementation

NosTube already has a browser P2P transport at `src/lib/p2p/p2p-blob-mesh.ts`:

- It uses Nostr relay signaling and browser `RTCPeerConnection`/data channels.
- It requests a blob by SHA-256 and verifies the completed bytes with `crypto.subtle.digest`.
- `src/lib/hls-blossom-loader.ts` already uses the mesh before HTTP fallback for hash-addressed HLS blobs.
- Almond's `src/services/p2p.rs` runs the matching Hashtree/Nostr/WebRTC serving stack over its locally stored Blossom blobs.

This is the right client-side P2P layer to evaluate. It is content-addressed by the same SHA-256 that appears in `imeta` metadata and does not require a browser to understand the Hyperdrive protocol.

### Current limits

The current mesh transfers complete blobs into memory:

- `P2PBlobMesh.get(sha256)` returns one `Uint8Array`, not a byte-range stream.
- The client sets `MAX_TRANSFER_BYTES` to 128 MiB.
- The supplied video is 150,685,174 bytes, so it exceeds that limit.
- A native `<video>` element cannot consume the mesh directly; turning a complete response into a `Blob` URL delays playback and removes efficient seeking.

Therefore client P2P is immediately suitable for thumbnails and existing small HLS segments. It is not yet suitable for monolithic MP4/WebM playback. Treat direct monolithic-video P2P as a later range-streaming protocol project, not a prerequisite for Hyperdrive compatibility.

### Revised source priority

```text
verified browser cache
  -> existing Hashtree P2P mesh
  -> declared HTTP(S) source candidates
  -> Almond Blossom URL with a validated Hyperdrive upstream hint
  -> existing unavailable/error state
```

For HLS, use the existing `hls-blossom-loader` P2P-first behavior for individually hash-addressed segments. For a thumbnail, a verified P2P result becomes a short-lived object URL. For a monolithic video, bypass whole-file P2P after the capability check and use Almond's HTTP range response.

### Almond Hyperdrive upstream

Almond is the only server-side Hyperdrive runtime. Extend it with a narrowly scoped, on-demand upstream resolver:

```text
Browser P2P mesh miss
  -> GET https://almond.example/<sha256>?upstream=hyper://<key>/b/<sha256>
  -> Almond validates the URI and expected hash
  -> Almond joins Hyperdrive peers, retrieves bytes, verifies SHA-256
  -> Almond writes the blob through its normal Blossom storage path
  -> Almond streams a standard HTTP Range response
  -> Almond's existing Hashtree service can seed later client P2P requests
```

The upstream hint is accepted only on a cache miss and only for the exact `hyper://<key>/b/<sha256>` contract. Almond must never treat it as a generic proxy URL. Once a verified blob exists locally, subsequent requests use the canonical Blossom `/<sha256>` path without a hint.

This design turns a successful Hyperdrive retrieval into a normal, independently usable Blossom mirror. It avoids a new gateway deployment, preserves client-side P2P for data already available from peers, and keeps all server-side Hyperdrive work at the Almond storage boundary.

## Problem

NIP-92 permits `imeta` metadata to carry NIP-94 fields, including zero or more `fallback` URLs. The supplied event contains:

```text
url      https://archive.gitvid.net/<sha256>.mp4
fallback hyper://g6roqec1kbcowen4g3kg95na7isgd1xh1djfni559j5er54zyfdo/b/<sha256>
x        <sha256>
```

The `hyper://` authority is a Hyperdrive key, commonly a 52-character z-base32 representation of a 32-byte public key. The `/b/<sha256>` path is a Gitvid storage convention for a blob in that drive; NIP-94 does not define that path.

NosTube currently drops this fallback before the player sees it. `isAllowedEventMediaUrl()` intentionally accepts only public `http:` and `https:` URLs. That protects browser code and remote proxies from untrusted custom-scheme event data, but means a usable Hyperdrive fallback cannot survive parsing.

## Research Findings

### Nostr metadata

- NIP-92 allows `imeta` tags to include NIP-94 metadata fields.
- NIP-94 permits zero or more `fallback` sources after the primary `url`.
- NIP-94 identifies the main file with optional `x` SHA-256 metadata; it does not standardize the `hyper://` scheme or Gitvid's `/b/<hash>` path.

Sources: [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md), [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md).

### Existing NosTube behavior

- `src/utils/video-event.ts` parses `url`, `fallback`, `mirror`, and `image` fields into `VideoVariant`, then calls `filterEventVariantUrls()`.
- `filterEventVariantUrls()` retains only `isAllowedEventMediaUrl()` candidates. A `hyper://` fallback is therefore discarded at lines 399–407.
- `src/lib/media-url-policy.ts` rejects every non-HTTP(S) event URL. This rule must remain true for URLs handed to browser elements and generic remote cache/proxy logic.
- `src/hooks/useMediaUrls.ts` provides the established video/audio/image URL ordering, proxy generation, NIP-94 kind-1063 discovery, and error-driven failover.
- `src/hooks/useImageCascade.ts` accepts one raw image URL and falls through proxy → raw → proxied video frame. It has no multi-source thumbnail fallback sequence.
- `src/components/player/VideoPlayer.tsx`, `src/pages/shorts/ShortsVideoPage.tsx`, `src/hooks/useVideoPrefetch.ts`, and `src/components/player/VideoElement.tsx` use `useMediaUrls()` for video, poster, prefetch, and caption sources.
- `VideoCard`, `VideoSuggestions`, `ShortVideoItem`, the React embed, and several playlist components consume the first thumbnail URL directly or through `useImageCascade()`.
- `AppConfig` already distinguishes event-provided network sources from deliberate local/user configuration. `cachingServers` and `thumbResizeServerUrl` are configured services; event URLs are untrusted.

### Hyperdrive runtime

Hyperdrive is a Corestore-backed distributed filesystem. Almond's private upstream worker can:

1. open a drive from its public key;
2. join and replicate through Hyperswarm using `drive.discoveryKey` and `drive.replicate(socket)`;
3. inspect a file's byte length with `drive.entry(path)`;
4. stream an inclusive byte interval with `drive.createReadStream(path, { start, end, wait, timeout })`.

Hyperdrive's published package targets Node/Bare runtime APIs (`fs`, `path`, `events`) and has no browser export condition. Treating it as a conventional Vite browser dependency is unsupported and would still not give `<video>` a native `hyper://` loader.

Sources: [Hyperdrive README](https://github.com/holepunchto/hyperdrive/blob/main/README.md), [Hyperdrive package metadata](https://github.com/holepunchto/hyperdrive/blob/main/package.json).

## Goals

1. Play a video when its only usable fallback is a supported Gitvid-style Hyperdrive URI.
2. Load Hyperdrive-hosted thumbnails in grids, shorts, video pages, embeds, and metadata posters.
3. Preserve existing primary/fallback ordering for HTTP(S) media.
4. Preserve NosTube's event-URL security boundary: raw `hyper://` values never become browser element URLs or remote proxy targets.
5. Support browser seeking with proper HTTP Range behavior.
6. Avoid pre-downloading whole video files into browser memory.
7. Keep a fully working HTTP(S)-only experience if no Almond Hyperdrive upstream is configured or a Hyperdrive has no peers.

## Non-Goals

- Browser-native Hyperdrive/Hyperswarm/WebRTC implementation.
- Uploading to or publishing Hyperdrives.
- Arbitrary Hyperdrive filesystem browsing.
- Supporting arbitrary `hyper://<key>/<path>` paths in V1.
- Replacing Blossom's upload/mirror/discovery model.
- Treating a declared `x` hash as a reason to trust an arbitrary URL scheme.
- Routing Hyperdrive sources through existing Blossom caching servers or thumbnail resize services before Almond has fetched and stored a verified blob.

## Supported URI Contract

V1 accepts only this canonical, read-only form:

```text
hyper://<drive-key>/b/<lowercase-sha256>
```

| Part           | Requirement                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheme         | Exactly lowercase `hyper:`.                                                                                                                                                                                               |
| Authority      | A canonical Hyperdrive key decoded by the Hypercore key-encoding library. Accept its documented z-base32 and hexadecimal forms; normalize to one canonical string.                                                        |
| Path           | Exactly `/b/<64 lowercase hex characters>`. No query string, fragment, username, password, port, encoded slash, `.` or `..` segment.                                                                                      |
| Video `x`      | If an `imeta` video declares `x`, it **must** equal the path hash. A mismatch rejects only that Hyperdrive candidate.                                                                                                     |
| Thumbnail hash | NIP-92 `image` fields do not necessarily carry a separate hash. For these candidates, the `/b/<hash>` path is the expected blob digest.                                                                                   |
| MIME type      | Video uses the declared `m` only if it is an allowlisted audio/video type. Thumbnails use an allowlisted image type from metadata or Almond's private worker magic-byte detection. Never reflect an arbitrary MIME value. |

A malformed or unsupported URI is retained only in diagnostic source metadata. It is never requested.

## Architecture

```text
Nostr event
  └─ imeta URL / fallback / image fields
       └─ parse into ordered MediaSource values
            ├─ HTTP(S) source ─────────────────────────────────┐
            └─ Hyperdrive source ── Almond upstream hint ──────┤
                                                              v
                                           browser verified cache / Hashtree mesh
                                                              v
                                             useMediaUrls / image cascade
                                                              v
                                                <video>, <audio>, <img>

P2P miss or native-video range request
  └─ Almond normal Blossom file route
       └─ bounded Hyperdrive upstream resolver on local cache miss
            └─ private Hyperdrive runtime and persistent block cache
                 └─ stream verified bytes into Almond Blob storage and HTTP response
```

### Why Almond is the upstream boundary

The browser uses P2P first for blobs already available from Hashtree peers. When it needs HTTP, it receives an ordinary Almond Blossom response, so native `<video>` and `<img>` loading, seeking, preload behavior, and mobile codec handling remain unchanged.

Almond already has the correct cache-miss seam: `handlers/file_serving.rs` dispatches missing blobs to `handlers/upstream.rs::try_upstream_servers()`, which already proxies an upstream range response while saving the blob locally. Hyperdrive becomes one more **private upstream transport** in that code path. It is not a new public gateway and is never deployed on Vercel.

Almond's existing `services/p2p.rs` also seeds locally stored blobs into the Hashtree/Nostr/WebRTC mesh. A successful Hyperdrive fetch therefore makes later browser P2P retrieval possible without another Hyperdrive connection.

## Almond Hyperdrive Upstream Specification

### Public request shape

```text
GET /<sha256>?hyper=hyper://<drive-key>/b/<sha256>
Range: bytes=<start>-<end>
```

The browser sends this only after a client P2P miss and only for a parsed, valid Hyperdrive fallback. `hyper` is an Almond-specific cache-miss hint, not a generic proxy parameter. Once Almond stores and verifies the blob, the canonical URL is simply `GET /<sha256>` with no hint.

| Response | Meaning                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------- |
| `200`    | Full file when no Range header was supplied.                                                      |
| `206`    | Valid byte range; includes `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`.         |
| `400`    | Invalid key, digest, path mapping, MIME hint, or Range syntax.                                    |
| `404`    | Drive opened successfully but `/b/<sha256>` is absent.                                            |
| `416`    | Valid drive/blob but requested range is outside its byte length.                                  |
| `424`    | Drive/blob cannot be verified against its expected digest after a completed verification attempt. |
| `503`    | Almond's upstream or storage capacity is exhausted.                                               |
| `504`    | No peer supplied the required metadata/block before the bounded timeout.                          |

Successful response headers:

```http
Accept-Ranges: bytes
ETag: "sha256-<sha256>"
Cache-Control: public, max-age=31536000, immutable
Cross-Origin-Resource-Policy: cross-origin
X-Content-Type-Options: nosniff
```

Set `Content-Type` from a safe allowlist or recognized file signature. Do not forward arbitrary event metadata as an HTTP response header.

### Drive lifecycle

```ts
interface HyperdriveHandle {
  key: Buffer
  drive: Hyperdrive
  swarm: Hyperswarm
  activeRequests: number
  lastUsedAt: number
}
```

1. Normalize the drive key and look it up in a bounded LRU handle pool.
2. On a miss, open the drive read-only in a namespaced persistent Corestore directory.
3. Join only `drive.discoveryKey` as a client; each Hyperswarm connection calls `drive.replicate(socket)`.
4. Await `drive.entry('/b/<sha256>', { wait: true, timeout })`.
5. Reject absent entries, symlinks, non-files, and entries larger than the configured media cap.
6. Parse the browser Range header. Use `entry.value.blob.byteLength` as total length and `drive.createReadStream(path, { start, end, wait: true, timeout })` for the response body.
7. Evict idle drive handles and close their swarm/drive resources. Keep the Corestore block cache on disk across process restarts.

### Integrity policy

Hyperdrive replication authenticates data to the drive public key. It does **not**, by itself, prove that a producer placed bytes whose SHA-256 equals the Gitvid `/b/<sha256>` filename.

V1 uses two integrity states:

| State    | Behavior                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown  | Stream range bytes from the authenticated drive. Do not expose the entry as a verified cache hit. This matches current direct HTTP playback, which also does not pre-verify every video before first frame. |
| Verified | A completed full-file SHA-256 digest equals the requested blob hash. Persist this result with the local block cache; later reads are trusted cache reads.                                                   |
| Mismatch | Delete local blocks for that blob when possible, mark the drive/blob pair unavailable for a bounded cooldown, and return `424` on later requests.                                                           |

Almond's Hyperdrive upstream computes the digest while serving a complete request or in a separate low-priority verifier. It must not buffer a 150 MB video before emitting the first byte. A future strict mode may require verification before first playback, but that is not part of V1 because it would remove streaming startup.

### Resource and abuse controls

- Read-only `GET`/`HEAD`; no upload, delete, listing, or generic path routes.
- Limit open drives, concurrent replication sessions, active streams, queued requests, and disk cache size.
- Enforce maximum declared blob size and maximum request duration.
- Abort replication immediately when the client disconnects and no other request needs the blocks.
- Use per-IP rate limits and separate short timeouts for metadata lookup, first block, and stalled streams.
- Log only normalized drive key/hash prefixes; never log Nostr event content or user credentials.
- Use a CORS origin allowlist. Do not enable cookies or credentialed requests.
- Expose `/healthz` and internal metrics only; do not expose drive keys beyond normal request paths.

### Download execution and Almond code ownership

```text
thumbnail request or HLS segment
  -> browser verified cache
  -> Hashtree WebRTC mesh: get(sha256)
  -> Almond HTTP fallback on miss

monolithic MP4/WebM
  -> normal HTTP source candidates
  -> Almond HTTP fallback with ?hyper=<validated-uri>
  -> Almond private Hyperdrive upstream on local cache miss
  -> Almond stores the blob and streams Range bytes
```

Implement the public request and cache integration in Almond:

```text
../almond/src/
  models.rs
    FileRequestQuery                 # add an optional `hyper` upstream hint
  handlers/file_serving.rs
    handle_file_request()            # validate/forward the hint only on a local cache miss
  handlers/upstream.rs
    try_upstream_servers()           # add Hyperdrive before HTTP upstream lookup
    try_hyperdrive_upstream()        # new bounded, hash-checked upstream branch
  services/hyperdrive_upstream.rs    # URI parser, worker client, request de-duplication,
                                     # range stream coordination, verification/cooldown state
  services/p2p.rs
    AlmondLocalBlobStore             # unchanged serving path; gains blobs after upstream save
```

`handlers/upstream.rs` is the correct integration point because it already:

1. receives cache-miss requests with the browser Range header;
2. avoids duplicate downloads through `ongoing_downloads`;
3. streams upstream bytes while writing them to Almond storage;
4. returns later requests from the canonical local Blossom file path.

The Hyperdrive implementation runs as an **internal Almond worker**, not an Internet-facing service. Evaluate two worker implementations in a compatibility spike:

1. **Preferred baseline:** private Node/Bare worker using the maintained `hyperdrive`, `corestore`, and `hyperswarm` packages. Almond communicates over a Unix domain socket or loopback-only HTTP/IPC; the worker exposes no public port.
2. **Rust implementation:** only choose this if a proof can retrieve the real Gitvid drive, replicate it over the current Hyperdrive network, and stream its `/b/<hash>` entry with equivalent range behavior. Do not commit Almond to an incomplete Rust Hypercore/Hyperswarm port before that interoperability proof.

The worker request is internal and typed:

```text
ResolveHyperdriveBlob {
  drive_key,
  blob_hash,
  expected_sha256,
  range,
  declared_mime_type,
}
```

It returns a byte stream plus total length and safe content type. Almond remains responsible for public HTTP headers, blob persistence, request limits, and final SHA-256 state.

#### Client-side P2P evaluation spike

Run this before adding any browser Hyperdrive dependency:

1. Enable Almond's existing Hashtree P2P serving with a fixture thumbnail and fixture HLS segment.
2. Start NosTube's `P2PNostrWebRtcBlobMesh` with the same signaling relays and verify cache → P2P → HTTP fallback ordering.
3. Confirm end-to-end SHA-256 verification and cache insertion for a thumbnail.
4. Confirm an HLS segment is obtained through `hls-blossom-loader` without an HTTP request.
5. Attempt the 150,685,174-byte Gitvid video. It must be recorded as unsupported by the current whole-blob, 128 MiB client limit—not silently buffered or retried indefinitely.
6. Measure connection establishment, first byte, total transfer, and memory on mobile-width Chromium and iOS Safari.

The spike passes for V1 if thumbnails and HLS segments use browser P2P successfully and monolithic video cleanly falls back to Almond HTTP. It fails if the mesh cannot interoperate with Almond; in that case Almond HTTP remains the primary Hyperdrive compatibility path.

#### Frontend implementation boundary

The React application contains parsing, policy, P2P selection, and ordinary HTTP failover. It must not import Hyperdrive, Corestore, or Hyperswarm:

```text
src/
  lib/media-source.ts              # MediaSource union and source ordering helpers
  lib/hyperdrive-media-uri.ts      # browser-safe parser; no peer/network code
  lib/almond-upstream-url.ts       # build the cache-miss hint URL for configured Almond
  lib/media-url-policy.ts          # retain HTTP(S) event policy; add narrow Hyperdrive recognition
  utils/video-event.ts             # parse imeta into MediaSource[] rather than raw URL arrays
  lib/p2p/p2p-blob-mesh.ts         # evaluate/extend only for thumbnail and HLS blob selection
  hooks/useMediaUrls.ts            # resolve typed candidates to browser-valid HTTP(S) URLs
  hooks/useImageCascade.ts         # advance across ordered image candidates
```

`VideoPlayer`, `ShortsVideoPage`, `useVideoPrefetch`, `ShortVideoItem`, cards, video suggestions, playlist thumbnails, and the embed player consume resolved sources. Raw `hyper://` values never reach a DOM `src`, browser `fetch`, Vercel endpoint, or public remote proxy.

## Frontend Design

### 1. Replace URL arrays with typed source candidates

Replace `VideoVariant.url` and `fallbackUrls` as the transport model with an ordered source list:

```ts
type MediaSource =
  | {
      transport: 'http'
      href: string
      role: 'primary' | 'fallback'
    }
  | {
      transport: 'hyperdrive'
      uri: string
      driveKey: string
      blobHash: string
      role: 'primary' | 'fallback'
    }

type VideoVariant = {
  sources: readonly MediaSource[]
  hash?: string
  size?: number
  duration?: number
  dimensions?: string
  mimeType?: string
  mediaType?: 'video' | 'audio' | 'image'
  quality?: string
  blurhash?: string
  contributorPubkey?: string
}
```

This is a clean cutover, not an alias layer. All consumers derive playable URLs from `sources`; no component reaches into raw `url`/`fallbackUrls` fields after migration.

`processEvent()` creates the list in NIP order:

1. `url` → primary source;
2. every `fallback` → fallback source in tag order;
3. legacy `mirror` values remain fallback HTTP sources only when they pass existing policy;
4. each `image` group becomes a thumbnail variant with its own ordered sources;
5. old-format event tags become equivalent source lists.

The parser uses two distinct policies:

- `isAllowedEventMediaUrl()` remains HTTP(S)-only.
- `parseHyperdriveMediaUri()` performs syntax-only recognition for the narrow V1 path contract. It does not make a network request and does not grant the URI browser/proxy trust.

### 2. Resolve Hyperdrive candidates through Almond

Extend the configured Blossom-server tag union with `hyperdrive upstream`. This is an explicit user/admin choice of an Almond server allowed to receive a cache-miss Hyperdrive hint:

```ts
export type BlossomServerTag = 'mirror' | 'initial upload' | 'hyperdrive upstream'
```

Add `resolveMediaSources()` before generic media URL generation:

```ts
interface ResolvedMediaSource {
  url: string
  transport: 'direct' | 'almond-upstream'
  source: MediaSource
}
```

Rules:

1. For a hash-addressed thumbnail or HLS segment, probe the existing verified cache and Hashtree mesh before adding an HTTP source.
2. Direct HTTP(S) sources enter the existing `generateMediaUrls()` path unchanged.
3. A valid Hyperdrive source becomes `<configured-almond>/<sha256>?hyper=<encoded-uri>` only when a configured Blossom server has the `hyperdrive upstream` tag.
4. Without a tagged Almond server, skip the Hyperdrive candidate, retain a structured unsupported-source reason for debugging, and continue normal fallback.
5. Preserve source order. Do not put an Almond URL ahead of an HTTP primary or a successful browser P2P source.
6. Almond URLs are browser-valid HTTP(S) candidates; never hand the raw Hyperdrive URI to the generic proxy/mirror generator.

### 3. Generalize image fallback

Replace the single-URL `useImageCascade({ src, videoUrl })` API with a typed-candidate API:

```ts
useImageCascade({
  imageSources: thumbnail.sources,
  videoSources: selectedVideo.sources,
  variant: 'preview',
})
```

For each resolved image candidate, preserve the existing proxy → raw behavior. When it fails, advance to the next image candidate. Only after all images fail should it attempt a configured proxy's video-frame extraction from resolved video candidates. This makes HTTP thumbnail fallbacks useful too, not only Hyperdrive thumbnails.

### 4. Migrate all media consumers

Update these call sites in the same source-model migration:

| Area                                                                                      | Required change                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/player/VideoPlayer.tsx`                                                   | Resolve selected `videoVariant.sources` and poster `thumbnailVariant.sources`.                                                                          |
| `src/pages/shorts/ShortsVideoPage.tsx`                                                    | Resolve current video source candidates and preserve existing singleton-video failover.                                                                 |
| `src/hooks/useVideoPrefetch.ts`                                                           | Prefetch only resolved browser URLs; do not initiate raw Hyperdrive networking in the page.                                                             |
| `src/components/player/VideoElement.tsx`                                                  | Continue HTTP(S)-only captions in V1; Hyperdrive captions remain unsupported.                                                                           |
| `src/components/VideoCard.tsx`, `VideoSuggestions.tsx`, `pages/shorts/ShortVideoItem.tsx` | Pass ordered thumbnail/video source candidates to the new image cascade.                                                                                |
| `src/embed-react/EmbedApp.tsx`                                                            | Resolve Almond fallback URLs for video and poster, or display the existing unavailable state when no `hyperdrive upstream` Almond server is configured. |
| playlist components and `ContributeVariantDialog`                                         | Consume typed thumbnail sources rather than a first raw URL.                                                                                            |
| `VideoDebugInfo`                                                                          | Show source transport, Almond URL, P2P/cache result, requested range/response status, and hash verification state without exposing credentials.         |

### 5. Configuration and deployment

- Extend `BlossomServerTag` with `hyperdrive upstream`; users/admins explicitly tag the Almond server allowed to resolve a Hyperdrive cache miss.
- Deploy the private Hyperdrive worker with Almond in the same trusted deployment boundary, using a shared persistent volume and a Unix socket or loopback-only IPC endpoint.
- Do not add Hyperdrive libraries to the Vite bundle.
- Do not use `cachingServers` for this feature. Caching servers expect Blossom hashes/URL hints; Almond owns the Hyperdrive upstream security and storage contract.

## Rollout Plan

### Phase 0 — fixtures and contract tests

Create deterministic Hyperdrive fixtures with:

- a small WebM/MP4 video blob under `/b/<sha256>`;
- a PNG/WebP thumbnail blob under `/b/<sha256>`;
- an absent blob;
- a blob whose path hash deliberately does not match its bytes.

Use these fixtures for the Almond upstream, browser P2P, and HTTP fallback test suites before changing UI behavior.

### Phase 1 — client-side P2P compatibility spike

Before adding a Hyperdrive upstream, exercise the existing NosTube and Almond Hashtree implementations with the same fixture hashes.

Deliver:

- a fixture thumbnail and HLS segment stored by Almond;
- enabled Almond `services/p2p.rs` serving;
- NosTube `P2PNostrWebRtcBlobMesh` client test;
- metrics for WebRTC connection time, first byte, bytes, memory, and HTTP fallback;
- an explicit 150,685,174-byte monolithic-video capability test.

Exit criterion: thumbnail and HLS segment P2P transfers verify their SHA-256 and avoid HTTP. The large monolithic file must cleanly skip the current 128 MiB whole-blob mesh path and fall back without memory growth or retry loops.

### Phase 2 — Almond Hyperdrive upstream compatibility spike

Implement a private worker proof that opens the real Gitvid drive, obtains `/b/<hash>`, and returns byte ranges to Almond over IPC. Do not expose a worker HTTP port.

Deliver:

- canonical URI/key parser;
- private worker drive-handle pool and Hyperswarm replication;
- Almond IPC client and cancellation propagation;
- `handlers/upstream.rs::try_hyperdrive_upstream()` on local cache miss;
- streaming write through Almond's existing storage path;
- fixture and real-Gitvid interoperability tests.

Exit criterion: `GET /<hash>?hyper=<uri>` streams a valid 206 response, writes a verified normal Blossom blob, and the later `GET /<hash>` succeeds with no Hyperdrive connection.

### Phase 3 — typed source model and resolver

Migrate `VideoVariant` and legacy video-event parsing to `MediaSource[]`. Add parser tests for NIP ordering, HTTP validation, Hyperdrive acceptance, malformed URI rejection, and `x`/path-hash mismatch rejection.

Exit criterion: existing HTTP(S)-only event tests retain candidate ordering and no raw Hyperdrive URI can reach a DOM `src`, browser `fetch`, image proxy, caching server, or Vercel endpoint.

### Phase 4 — player, shorts, prefetch, and thumbnails

Wire P2P-first and Almond-fallback candidates into `useMediaUrls()`, `VideoPlayer`, `ShortsVideoPage`, `useVideoPrefetch()`, and the multi-source image cascade. Update cards, grids, video posters, playlists, and embeds.

Exit criterion: a client P2P hit wins for a thumbnail/HLS segment; a P2P miss followed by an Almond Hyperdrive fetch plays video and populates a normal Blossom cache entry; a failed Hyperdrive thumbnail never breaks video playback.

### Phase 5 — observability and controlled release

Add a disabled-by-default feature flag, client P2P and Almond-upstream metrics, debug details, and a canary Almond instance. Enable for self-hosted/test users first, then opt in through the `hyperdrive upstream` server tag.

## Verification Matrix

### Almond upstream and P2P tests

- Valid full-file `GET` and Range requests through Almond return correct bytes, immutable cache headers, and a safe content type.
- Valid `Range: bytes=0-99`, suffix range, and open-ended range produce correct `206` headers/body.
- Invalid/out-of-bounds range returns `416`.
- Unknown drive/blob times out with `504` without leaking worker handles or Almond download state.
- Missing blob returns `404`.
- Invalid drive key, path traversal, encoded slash, non-`/b/` path, and non-hex digest return `400`.
- Private worker handles are LRU-evicted without deleting persistent blocks.
- Complete digest verification marks valid blobs verified and quarantines mismatches.
- Almond P2P can serve a stored fixture to the browser mesh; the browser verifies it before cache insertion.

### Frontend unit tests

- NIP `url` + HTTP `fallback` ordering is unchanged.
- NIP `url` + Hyperdrive `fallback` survives parsing as typed metadata.
- Hyperdrive primary with HTTP fallback retains both candidates in declared order.
- Hyperdrive URI with a path hash different from video `x` is rejected.
- No tagged Almond upstream means Hyperdrive candidates are skipped with an inspectable reason.
- A raw `hyper://` string never appears in `useMediaUrls().urls`, an element's `src`, or a browser network request.
- Image cascade advances across two HTTP images, then an Almond-backed Hyperdrive image, before video-frame fallback.

### Browser integration tests

- Desktop Chromium and mobile-width Chromium: thumbnail/HLS P2P hit works; monolithic video starts and seeks through Almond HTTP ranges after a P2P miss.
- iOS Safari manual test: inline video starts, seeks, and advances in shorts.
- Thumbnail grid, video detail poster, shorts next-slide thumbnail, and React embed render fixture images.
- Almond unavailable, no peers, malformed metadata, and hash mismatch each degrade to the existing image placeholder/player error state without an uncaught exception.
- Network trace confirms no request to `hyper://`; browser network requests are either WebRTC/Nostr signaling or ordinary Almond/HTTP media requests.

## Open Questions

1. Does Gitvid guarantee that `/b/<hash>` is always the SHA-256 of the returned bytes? Validate this against a real fixture before enabling the completed-download verifier.
2. Can a private Node/Bare worker be packaged with Almond cleanly, or does a Rust implementation prove real Gitvid interoperability first?
3. Should the `hyper` cache-miss hint remain query-based, or should Almond accept a signed/encoded manifest reference to keep source URIs out of access logs?
4. Should NIP-94 kind-1063 discovery add Hyperdrive candidates when their fallback fields contain valid Hyperdrive URIs? V1 should preserve them as typed sources but not promote them ahead of explicit event sources.
5. Should V2 add range-capable browser P2P for monolithic media after the HLS/thumbnail evaluation is complete?

## Acceptance Criteria

The feature is complete when:

1. A NIP-92/NIP-94 video event with an HTTP primary and Gitvid-style Hyperdrive fallback plays through Almond after the HTTP source and client P2P path fail.
2. A Hyperdrive-only supported video event plays when a configured Almond server has the `hyperdrive upstream` tag.
3. Hyperdrive-hosted thumbnails render across all primary first-party surfaces and embeds that have Almond configuration, with browser P2P tried first.
4. Native browser range seeking works; no full-file browser Blob buffering is used for monolithic video.
5. Invalid or unsupported Hyperdrive metadata cannot create browser custom-scheme requests, SSRF paths, arbitrary Hyperdrive reads, or unbounded Almond worker resource usage.
6. A successfully retrieved Hyperdrive blob is available through Almond's normal Blossom path and its existing P2P mesh.
7. Existing HTTP(S)/Blossom media behavior and source ordering remain unchanged.
