# Media URL Failover System - Generalization Plan

## Current State

We have a robust video failover system implemented across multiple files:

- **video-event.ts:185-364** - URL generation (mirrors, proxies, originals)
- **VideoPlayer.tsx:270-308** - Runtime failover (parallel HEAD requests → sequential fallback)
- **VideoPlayer.tsx:315-447** - VTT caption failover with pre-validation
- **url-validator.ts:115-168** - URL validation with 5-minute cache and Blossom fallbacks
- **ShortsVideoPage.tsx:42-53** - Owner's Blossom server discovery

## Goal

Create a **centralized, media-agnostic URL lookup and failover system** that handles:
- Videos (MP4, WebM, etc.)
- Images (thumbnails, posters, avatars, banners)
- Text tracks (VTT captions/subtitles)
- Audio files (future: podcasts, music)

## Architecture

### Core Components

#### 1. Media URL Generator (`/src/lib/media-url-generator.ts`)

Central service for generating URL arrays with fallbacks.

```typescript
interface MediaUrlOptions {
  urls: string[]                    // Original URLs from event
  blossomServers: string[]          // User's + app config servers
  sha256?: string                   // File hash for discovery
  kind?: number                     // Event kind for relay search
  mediaType: 'video' | 'image' | 'vtt' | 'audio'
  proxyConfig?: {
    enabled: boolean
    origin?: string
    maxSize?: { width: number, height: number }
  }
}

interface GeneratedUrls {
  urls: string[]                    // All URLs in priority order
  metadata: {
    source: 'original' | 'mirror' | 'proxy' | 'discovered'
    serverUrl?: string              // Which Blossom server
    isValidated?: boolean           // Pre-validated via HEAD?
  }[]
}

generateMediaUrls(options: MediaUrlOptions): GeneratedUrls
```

**Priority Order:**
1. Original URLs (if valid Blossom URLs)
2. Mirror URLs (exact copies from user's Blossom servers)
3. Proxy URLs (transcoded/resized versions from Blossom servers)
4. Discovered URLs (from kind 1063 events on relays)

#### 2. URL Discovery Service (`/src/lib/url-discovery.ts`)

Finds alternative sources for media files.

```typescript
interface DiscoveryOptions {
  sha256: string                    // File hash (x tag)
  relays: string[]                  // Relays to search
  timeout?: number                  // Search timeout (default 10s)
  maxResults?: number               // Limit results (default 20)
}

interface DiscoveredUrl {
  url: string
  serverUrl: string                 // Blossom server that has it
  pubkey: string                    // Who published the 1063
  timestamp: number
}

async discoverUrls(options: DiscoveryOptions): Promise<DiscoveredUrl[]>
```

**Algorithm:**
1. Query relays for kind 1063 events with matching `x` tag (sha256)
2. Extract `url` tag from each event
3. Validate URLs (HEAD request)
4. Return sorted by timestamp (newest first)

#### 3. React Hook (`/src/hooks/useMediaUrls.ts`)

React integration for components.

```typescript
interface UseMediaUrlsOptions extends MediaUrlOptions {
  enabled?: boolean                 // Enable auto-discovery
  onError?: (error: Error) => void
}

interface MediaUrlsResult {
  urls: string[]                    // All available URLs
  isLoading: boolean
  error: Error | null
  currentIndex: number              // Which URL is active
  moveToNext: () => void           // Try next URL
  reset: () => void                // Start over
}

useMediaUrls(options: UseMediaUrlsOptions): MediaUrlsResult
```

#### 4. Enhanced URL Validator (`/src/lib/url-validator.ts`)

Extend existing validator with media-specific logic.

```typescript
interface ValidationOptions {
  timeout?: number                  // Default 5s
  expectedContentType?: string[]    // e.g., ['video/mp4', 'video/webm']
  minSize?: number                  // Minimum Content-Length
  maxSize?: number                  // Maximum Content-Length
}

async validateMediaUrl(
  url: string,
  options?: ValidationOptions
): Promise<boolean>
```

**Cache Strategy:**
- Valid URLs: 5 minutes
- Invalid URLs: 1 minute (shorter for retry)
- By media type (video cache separate from image cache)

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Component (VideoPlayer, ImageComponent, CaptionTrack, etc) │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  useMediaUrls() hook  │
         └───────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────────┐    ┌────────────────────┐
│ generateMediaUrls │    │  discoverUrls()    │
│  (local sources)  │    │ (relay search)     │
└────────┬──────────┘    └─────────┬──────────┘
         │                         │
         └──────────┬──────────────┘
                    ▼
         ┌─────────────────────┐
         │ validateMediaUrl()  │
         │   (HEAD requests)   │
         └─────────┬───────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  Final URL list  │
         │  (prioritized)   │
         └──────────────────┘
```

## Implementation Phases

### Phase 1: Extract Core Logic (No Breaking Changes)

**Files to create:**
- `/src/lib/media-url-generator.ts`
- `/src/lib/url-discovery.ts`
- `/src/hooks/useMediaUrls.ts`

**Tasks:**
1. Extract mirror/proxy generation from `video-event.ts` → `media-url-generator.ts`
2. Keep video-specific wrapper in `video-event.ts` that calls new generator
3. Implement `discoverUrls()` function (kind 1063 relay search)
4. Create `useMediaUrls()` hook with current VideoPlayer logic
5. Add unit tests for URL generation and discovery

**Validation:** Existing video playback continues working unchanged.

### Phase 2: Enhance URL Validator

**Tasks:**
1. Add `expectedContentType` validation to `url-validator.ts`
2. Add `minSize`/`maxSize` validation for detecting empty files
3. Implement separate cache buckets by media type
4. Add metrics (hit rate, validation time) for debugging

**Validation:** Run existing video URLs through enhanced validator.

### Phase 3: Migrate VideoPlayer

**Tasks:**
1. Replace VideoPlayer's manual failover with `useMediaUrls()` hook
2. Remove duplicate logic (HEAD request handling, URL queue management)
3. Update VTT caption handling to use `useMediaUrls()` for captions
4. Add telemetry for failover events (which URLs work, which fail)

**Validation:** Video playback + captions work identically to before.

### Phase 4: Add Image Support

**Files to modify:**
- Components using images (UserAvatar, VideoCard thumbnails, banners, etc.)

**Tasks:**
1. Create `<ResponsiveImage>` component using `useMediaUrls()`
2. Add Blossom proxy support for image resizing (width/height params)
3. Implement progressive loading (blur placeholder → full image)
4. Add `srcSet` generation for responsive images
5. Migrate existing image components to use `<ResponsiveImage>`

**Validation:** All images load with fallback support.

### Phase 5: Add VTT/Audio Support

**Tasks:**
1. Extract caption track logic to `<CaptionTrack>` component with `useMediaUrls()`
2. Add audio file support (for future podcast/music features)
3. Update `generateMediaUrls()` to handle all media types

**Validation:** Caption tracks have same failover as videos.

### Phase 6: Discovery Integration

**Tasks:**
1. Enable automatic relay discovery in `useMediaUrls()` (opt-in)
2. Add UI feedback when using discovered sources ("Playing from mirror server...")
3. Cache discovered URLs in EventStore for reuse
4. Add admin tools to see which servers have which files

**Validation:** When original URLs fail, system finds alternatives via kind 1063.

## Migration Strategy

### Backwards Compatibility

- Keep existing `video-event.ts` exports during migration
- Add deprecation warnings, remove in later release
- Use feature flags for new discovery system

### Testing Approach

1. **Unit tests:** URL generation, validation, discovery logic
2. **Integration tests:** Full failover scenarios (all URLs fail → discovery → success)
3. **Manual testing:** Playlist with intentionally broken URLs
4. **Performance tests:** Validate HEAD request parallelization doesn't overwhelm servers

### Rollout Plan

1. Deploy Phase 1-2 (infrastructure, no UI changes)
2. Monitor logs for validation metrics
3. Deploy Phase 3 (VideoPlayer migration) to beta users
4. Collect feedback on failover reliability
5. Deploy Phase 4-5 (images, VTT, audio) incrementally
6. Deploy Phase 6 (discovery) with opt-in flag
7. Enable discovery by default after 2 weeks

## Configuration

Add to `AppContext`:

```typescript
interface MediaConfig {
  failover: {
    enabled: boolean
    discovery: {
      enabled: boolean              // Search relays for alternatives
      timeout: number               // Discovery timeout (ms)
      maxResults: number            // Limit discovered URLs
    }
    validation: {
      enabled: boolean              // Pre-validate URLs
      timeout: number               // HEAD request timeout
      parallelRequests: number      // Max parallel validations
    }
  }
  proxy: {
    enabled: boolean
    includeOrigin: boolean          // Add origin param
    imageSizes: { width: number, height: number }[]  // Responsive sizes
  }
}
```

## Benefits

1. **Reliability:** Multiple fallback sources reduce playback failures
2. **Performance:** Pre-validation avoids waiting for broken URLs
3. **Consistency:** All media types use same failover logic
4. **Maintainability:** Central location for URL logic
5. **Extensibility:** Easy to add new media types or discovery methods
6. **User Experience:** Seamless fallback, minimal buffering
7. **Decentralization:** Uses Nostr's native discovery (kind 1063) to find mirrors

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Too many HEAD requests overwhelm servers | Rate limiting, parallel request cap, cache validation results |
| Discovery is too slow | Timeout at 10s, show UI feedback, cache results |
| Breaking existing video playback | Phased rollout, feature flags, comprehensive tests |
| Increased complexity | Clear abstraction boundaries, good documentation |
| Privacy concerns (sending hash to relays) | Already part of Nostr protocol (kind 1063), use trusted relays |

## Success Metrics

- **Playback success rate:** % of videos that play without manual intervention
- **Failover usage:** % of playbacks using fallback URLs
- **Discovery usage:** % of playbacks using discovered URLs (kind 1063)
- **Validation efficiency:** Cache hit rate, average validation time
- **User experience:** Reduced error reports, lower bounce rate

## Future Enhancements

1. **Predictive prefetching:** Validate next video's URLs during current playback
2. **P2P discovery:** BitTorrent-style sharing (NIP-XX)
3. **Quality selection:** Multiple bitrates/resolutions with automatic switching
4. **Offline support:** Cache validated URLs + metadata in IndexedDB
5. **Server health tracking:** Maintain reputation scores for Blossom servers
6. **Geographic optimization:** Prefer geographically closer servers
7. **Cost optimization:** Prefer free/cheap servers over paid ones

## Open Questions

1. Should we limit parallel HEAD requests to avoid DDoSing Blossom servers?
   - **Proposal:** Max 5 parallel, with 200ms delay between batches

2. How long should we cache discovered URLs?
   - **Proposal:** 1 hour (balance freshness vs relay load)

3. Should discovery be opt-in or opt-out?
   - **Proposal:** Opt-out (enabled by default) to maximize reliability

4. What happens if all URLs fail AND discovery finds nothing?
   - **Proposal:** Show error with "Request reupload" button (notifies author)

5. Should we validate all URLs upfront or lazy-validate on failure?
   - **Proposal:** Lazy validation (faster initial load, validate on-demand)

## References

- **NIP-94:** File Metadata (kind 1063 events)
- **NIP-96:** HTTP File Storage Integration (Blossom protocol)
- **Current Implementation:**
  - video-event.ts:185-364
  - VideoPlayer.tsx:270-447
  - url-validator.ts:115-168
