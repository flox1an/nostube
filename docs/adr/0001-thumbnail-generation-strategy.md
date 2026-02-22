# ADR-0001: Thumbnail Generation Strategy

**Status:** Proposed
**Date:** 2026-02-22
**Context:** Thumbnail resizing for video feeds and cards

## Context

nostube currently relies on a single imgproxy instance (`imgproxy.nostu.be`) to resize video thumbnails on demand. Every thumbnail display in the app goes through `imageProxy()` / `imageProxyVideoPreview()` / `imageProxyVideoThumbnail()` functions in `src/lib/utils.ts`, which construct a proxy URL like:

```
{resizeServer}/insecure/f:webp/rs:fit:480:480/plain/{encodedOriginalUrl}
```

This works well but creates a single point of failure. If the imgproxy instance goes down, every thumbnail in the app breaks. The question is how to make thumbnail generation more resilient without introducing worse problems.

## Rejected Approach: Kind 1063 Decentralized Thumbnail Discovery

The idea: viewers who resize a thumbnail publish a kind 1063 (NIP-94 File Metadata) event announcing the resized version. Other clients discover these events by querying relays for 1063 events matching the original image hash, eliminating the need for a centralized resize server.

This approach was rejected due to multiple fundamental problems:

### Spam and Abuse

- **Thumbnail poisoning** — Anyone can publish a 1063 event claiming to be a resize of a popular image but serving offensive or phishing content. Every viewer would see the attacker's version. WoT filtering helps but isn't bulletproof, and new users have no WoT.
- **Relay spam** — Bots could flood relays with millions of fake thumbnail 1063 events for every possible `ox` hash, bloating relay storage and forcing clients to sift through garbage.
- **Storage exhaustion** — If every viewer auto-generates and uploads thumbnails, a popular video accumulates thousands of slightly-different resized copies. Each viewer pays their own storage, but the relay index bloats with redundant 1063 events.

### Race Conditions and Duplication

- **Thundering herd** — A viral video gets 500 simultaneous first-time viewers. All query, all get "no results," all resize + upload + publish at the same time. 500 near-identical thumbnails and 500 1063 events for the same original.
- **No natural deduplication** — Different clients resize with different algorithms, quality settings, and canvas implementations. Outputs are never byte-identical, so each gets a unique SHA-256 and a separate Blossom upload.

### Client-Side Resize Quality

- **Canvas inconsistency** — Browser Canvas resize quality varies across engines. Safari, Chrome, and Firefox produce visibly different results. `imageSmoothingQuality` has no cross-browser guarantee.
- **CORS blocking** — Canvas can't export pixels from images without CORS headers. Many CDNs don't serve them. `drawImage()` works but `toBlob()` throws a tainted canvas error. The fallback is... the imgproxy being eliminated.
- **Memory pressure** — Loading a 4K thumbnail into Canvas on a low-end mobile device to resize to 480x480 could cause OOM or jank. Server-side resize exists precisely to avoid this.

### Discovery Reliability

- **Cold start problem** — The system only works after someone has already generated a thumbnail. First viewers always need a resize server or client-side processing. For rarely-viewed videos (the long tail), discovery will almost always miss.
- **Relay availability** — The query adds a relay round-trip before every thumbnail displays. If relays are slow, thumbnails lag or don't appear. A single HTTP GET to imgproxy is faster and simpler.
- **Query overhead** — A video grid shows 20+ thumbnails at once. That's 20 concurrent relay queries before the page can render. Compare to 20 parallel HTTP GETs — the relay path is significantly slower.

### Privacy

- **Viewer fingerprinting** — Publishing a 1063 every time you view a video leaks browsing behavior. Anyone monitoring relays sees exactly which videos a pubkey viewed and when.
- **Blossom server logging** — The viewer uploads the resized image to their own Blossom server, which now knows what images they were looking at.

### Fundamental Tension

Thumbnails are a **read-path optimization**, but this design adds **write-path work** (resize + upload + sign + publish) to the read path. Every viewer pays a cost so future viewers benefit. The incentive is weak — why should a viewer spend bandwidth, CPU, and storage so the next person loads slightly faster?

The 1063 discovery layer is most valuable for video file mirrors where the content hash is the trust anchor. For thumbnails, the content hash changes with every resize, so that trust anchor disappears.

## Rejected Approach: Multiple Thumbnail Sizes in Video Events

The idea: during upload, pre-generate thumbnails at multiple standard sizes (480px, 240px, 120px) and include all sizes as `image` entries in the video event's imeta tags.

This was rejected because the NIP-71 video event format does not support multiple thumbnail sizes within the event structure.

## Recommended Approach: Multiple imgproxy Instances with Failover

Support an array of imgproxy server URLs instead of a single one. If the primary fails, fall back to the next.

### Current State

- `thumbResizeServerUrl` is typed as `string` in `AppContext` (`src/contexts/AppContext.ts:60`)
- Single default: `defaultResizeServer = 'https://imgproxy.nostu.be/'` (`src/constants/servers.ts:2`)
- All `imageProxy*()` functions in `src/lib/utils.ts` accept a single URL
- Settings UI has a single text input (`src/components/settings/GeneralSettingsSection.tsx`)

### Implementation Gaps

1. **Type change** — `thumbResizeServerUrl: string` to `thumbResizeServerUrls: string[]` in AppConfig (with migration for existing single-string configs)
2. **URL construction** — `imageProxy()`, `imageProxyVideoPreview()`, `imageProxyVideoThumbnail()` return a single URL. They either need to return an array of URLs or the primary URL with a mechanism to get fallbacks.
3. **Component-level failover** — Image elements need `onError` handlers that swap to the next proxy URL. This could be a wrapper component or hook (e.g., `useImageWithFallback`).
4. **Settings UI** — Replace single text input with a list editor for multiple resize server URLs.
5. **Admin presets** — Support array of resize servers in NIP-78 preset events.

## Recommended Approach: Client-Side Canvas Resize as Last Resort

When all imgproxy servers fail, resize the original image client-side via Canvas rather than showing a broken thumbnail.

### Current State

- Canvas is used in `ThumbnailSection.tsx` during upload for frame extraction, but at native resolution — no resizing
- No fallback exists at display time. If imgproxy fails, the thumbnail simply doesn't load
- No client-side image resizing anywhere in the display pipeline

### Implementation Gaps

1. **Resize utility** — New function that loads an image, draws it to a canvas at target dimensions, and returns an object URL via `canvas.toBlob()`.
2. **Fallback integration** — Triggered by `onError` on the imgproxy `<img>` after all proxy URLs are exhausted. Load the original full-size thumbnail URL, resize client-side, display the result.
3. **CORS constraints** — Only works for images served with `Access-Control-Allow-Origin` headers. Blossom servers typically serve these, but third-party CDNs may not. When CORS blocks canvas export, fall back to displaying the original unresized image.
4. **Memory management** — Object URLs created via `URL.createObjectURL()` must be revoked on component unmount to prevent memory leaks. An LRU cache of resized thumbnails would prevent re-resizing on every render.
5. **Don't publish** — The resized result should only be used locally. Do not upload to Blossom or publish a 1063 event (this avoids all the privacy and spam problems from the rejected approach).

## Key File References

| Area                  | File                                                 | Details                                                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Thumbnail capture     | `src/components/video-upload/ThumbnailSection.tsx`   | Canvas frame extraction during upload                                    |
| Thumbnail upload      | `src/hooks/useVideoUpload.ts:795-830`                | Upload orchestration to Blossom servers                                  |
| Imeta construction    | `src/lib/imeta-builder.ts:136-139`                   | `image` tag construction in video events                                 |
| Image proxy functions | `src/lib/utils.ts:199-265`                           | `imageProxy()`, `imageProxyVideoPreview()`, `imageProxyVideoThumbnail()` |
| Default server        | `src/constants/servers.ts:2`                         | `defaultResizeServer` constant                                           |
| Config type           | `src/contexts/AppContext.ts:60`                      | `thumbResizeServerUrl?: string`                                          |
| Settings UI           | `src/components/settings/GeneralSettingsSection.tsx` | Single text input for resize server                                      |
| Video event parsing   | `src/utils/video-event.ts:336-360`                   | Thumbnail extraction from imeta tags                                     |

## Decision

1. **Do not** implement kind 1063 decentralized thumbnail discovery
2. **Do not** attempt multiple thumbnail sizes in video events
3. **Do** implement multiple imgproxy server support with failover
4. **Do** implement client-side canvas resize as a last-resort fallback (local only, never publish)
