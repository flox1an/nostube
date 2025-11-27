# Embed Player Profile Fetching Design

**Date:** 2025-11-27
**Status:** Approved
**Author:** Claude Code

## Overview

Extend the embeddable video player to fetch and display author profile information (avatar and display name) from Nostr kind 0 events. The title overlay already supports displaying this data but currently shows fallback values because profile fetching is not implemented.

## Goals

1. Fetch author profile data (avatar URL and display name) from Nostr relays
2. Update the title overlay with real profile information
3. Cache profiles to reduce relay load and improve performance
4. Maintain fast initial video display (non-blocking profile fetch)
5. Handle network failures gracefully with silent fallbacks

## Design Decisions

### 1. Fetch Strategy

**naddr identifiers (addressable events):**

- Pubkey is available in the decoded identifier
- Fetch profile in parallel with video event
- Both requests start simultaneously

**nevent identifiers (regular events):**

- Pubkey not available until video event is fetched
- Fetch profile sequentially after video event arrives
- Video displays immediately, profile loads in background

### 2. Error Handling

**Silent fallback approach:**

- If profile fetch fails or times out, show default avatar and formatted pubkey
- No error messages or loading indicators for profile failures
- TitleOverlay already has this fallback behavior implemented
- User experience is never blocked by profile fetch failures

### 3. Timeout Strategy

**5-second timeout for profile fetches:**

- Shorter than video event timeout (10s) since profile is non-critical
- Gives relays reasonable time to respond
- Fails fast to show fallback without long wait

### 4. Caching Strategy

**LocalStorage with 24-hour TTL:**

- Key format: `nostube-embed-profile-{pubkey}`
- Store: `{profile: {...}, fetchedAt: timestamp}`
- TTL: 86400000ms (24 hours)
- Check cache before fetching from relays
- Reduces relay load for popular creators
- Improves load times for repeat visitors

### 5. Live Updates

**Dynamic overlay updates:**

- Display video immediately with fallback profile info
- Update overlay in real-time when profile data arrives
- Benefits users on slow connections
- Provides smooth progressive enhancement

## Architecture

### New Module: profile-fetcher.js

```javascript
export class ProfileFetcher {
  constructor(client) // Takes NostrClient instance

  async fetchProfile(pubkey, relays) // Fetch from relays with timeout

  static getCachedProfile(pubkey) // Read from localStorage
  static setCachedProfile(pubkey, profile) // Write to localStorage
  static isCacheValid(cachedData) // Check TTL
  static parseProfileMetadata(event) // Extract picture/name from JSON
}
```

**Responsibilities:**

- Fetch kind 0 events from relays using NostrClient
- Parse profile JSON content (picture, display_name, name)
- Manage localStorage cache with TTL validation
- Handle timeouts and errors gracefully

### Updated Module: title-overlay.js

**New method:**

```javascript
static updateProfile(overlay, profile) {
  // Update avatar src and name textContent
  // Animate transition smoothly
}
```

**Responsibilities:**

- Accept profile updates after overlay creation
- Update DOM elements with new data
- Handle cases where overlay might not exist yet

### Updated Module: index.js

**Integration points:**

1. After decoding identifier, check if we have pubkey (naddr case)
2. If yes, start profile fetch in parallel with video fetch
3. If no, wait for video event, extract pubkey, then fetch profile
4. When profile arrives, update overlay if it exists

## Data Flow

### Flow 1: naddr (Parallel Fetch)

```
1. Parse URL params
2. Decode naddr → get pubkey
3. Start parallel:
   a. Fetch video event
   b. Fetch profile (check cache first)
4. Video arrives → create player + overlay with fallback
5. Profile arrives → update overlay with real data
```

### Flow 2: nevent (Sequential Fetch)

```
1. Parse URL params
2. Decode nevent → get event ID only
3. Fetch video event
4. Video arrives → extract pubkey
5. Create player + overlay with fallback
6. Start profile fetch (check cache first)
7. Profile arrives → update overlay with real data
```

## Profile Data Extraction

From kind 0 event content (JSON):

```json
{
  "picture": "https://example.com/avatar.jpg",
  "display_name": "Alice Smith",
  "name": "alice",
  "nip05": "alice@example.com",
  "about": "Bio text"
}
```

**Extraction priority:**

1. `picture` → authorAvatar (required for image)
2. `display_name` → authorName (preferred)
3. `name` → authorName (fallback if no display_name)
4. If neither exists → format pubkey as "abcd1234...wxyz"

## Edge Cases

1. **Cache hit:** Use cached data immediately, no relay fetch
2. **Cache miss:** Fetch from relays, store result
3. **Profile fetch timeout:** Show fallback, don't block video
4. **Profile fetch error:** Show fallback silently
5. **Invalid profile JSON:** Show fallback, log error
6. **Missing picture field:** Use default avatar SVG
7. **Missing name fields:** Use formatted pubkey
8. **Overlay not created yet:** Store profile, apply when overlay is created

## Testing Strategy

1. **Unit tests for ProfileFetcher:**
   - Cache read/write operations
   - TTL validation logic
   - Profile JSON parsing
   - Error handling

2. **Integration tests:**
   - naddr with cache hit
   - naddr with cache miss
   - nevent sequential fetch
   - Timeout scenarios
   - Invalid data handling

3. **Manual testing:**
   - Test with real embeds on test page
   - Verify cache behavior across page reloads
   - Test slow relay responses
   - Verify fallback appearance

## Performance Considerations

- **Cache reduces relay load:** Popular creators' profiles cached 24 hours
- **Non-blocking:** Video displays immediately, profile enhances progressively
- **Short timeout:** 5s prevents long waits for unavailable profiles
- **Reuse connections:** ProfileFetcher uses existing NostrClient instance
- **Minimal payload:** Only fetch kind 0 events, not full profile history

## Security Considerations

- **localStorage scope:** Embed runs in iframe, localStorage is origin-scoped
- **No XSS risk:** Profile data is set via textContent/src, not innerHTML
- **Image loading:** Browser handles image security (CSP, CORS)
- **Cache poisoning:** Low risk, profiles are public data and time-limited

## Future Enhancements (Out of Scope)

- NIP-05 verification indicator
- Animated avatar support (GIFs)
- Profile hover card with full bio
- Cache eviction UI for debugging
- Profile fetch retry logic
- Multiple relay fallback strategy

## Implementation Checklist

- [ ] Create src/embed/profile-fetcher.js
- [ ] Add ProfileFetcher class with cache methods
- [ ] Add profile parsing logic
- [ ] Update src/embed/title-overlay.js with updateProfile method
- [ ] Integrate profile fetching in src/embed/index.js
- [ ] Handle naddr parallel fetch
- [ ] Handle nevent sequential fetch
- [ ] Write unit tests for ProfileFetcher
- [ ] Write tests for TitleOverlay.updateProfile
- [ ] Test with embed examples page
- [ ] Verify cache behavior
- [ ] Update embed documentation
