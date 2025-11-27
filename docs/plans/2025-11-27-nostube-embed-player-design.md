# Nostube Embeddable Video Player Design

**Date:** 2025-11-27
**Status:** Approved
**Type:** New Feature

## Overview

A standalone embeddable video player for Nostr videos that can be embedded via iframe on any website, similar to YouTube's embedded player. The player is completely self-contained and lives outside the main React application.

## Goals

- Provide a simple iframe-based embed option for Nostr videos
- Work on any website without external dependencies
- Lightweight and fast (~150KB gzipped)
- Support both nevent (regular) and naddr (addressable) video identifiers
- Professional user experience with proper error handling and content warnings

## Non-Goals (for v1)

- Blossom server integration (mirrors/proxies/caching) - will be added later
- HLS streaming support (.m3u8) - MP4 only initially
- JavaScript embed API - iframe only for now
- Playlist support
- Interactive features (likes, comments, subscriptions)

## Architecture

### File Structure

```
public/
├── nostube-embed.js          # Main embed player (bundled, minified)
├── nostube-embed.css         # Player styles
├── embed-example.html        # Demo/test page
└── embed-README.md           # Documentation for embedders

src/embed/                     # Source code (before bundling)
├── index.js                  # Entry point
├── nostr-client.js           # Relay connections, event fetching
├── video-parser.js           # Parse Nostr events into video metadata
├── player-ui.js              # Render video player DOM
├── error-handler.js          # Loading/error states
├── title-overlay.js          # Title/author display
├── content-warning.js        # Blur overlay for sensitive content
└── branding.js               # "Watch on Nostube" link

scripts/
└── build-embed.js            # Build script (esbuild/rollup)
```

### Technology Stack

- **Vanilla JavaScript** - No React, no framework
- **nostr-tools** - For NIP-19 decoding and WebSocket relay connections
- **Native HTML5 video controls** - No media-chrome or custom player library
- **esbuild/rollup** - For bundling
- **CSS3** - For styling overlays and UI

### Build Process

```bash
# Build embed player
npm run build:embed

# Watch mode for development
npm run build:embed -- --watch

# Output: public/nostube-embed.js (~150KB gzipped)
```

Build configuration:
- Bundle format: IIFE (immediately invoked)
- Target: ES2020
- Minified: Yes
- Bundle nostr-tools: Yes (no external dependencies)

## Embedding Interface

### URL Format

```
https://nostube.com/embed?v=<identifier>&[options]
```

### Supported Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `v` | string | **required** | Video identifier (nevent/naddr/note) |
| `autoplay` | 0/1 | 0 | Auto-play on load |
| `muted` | 0/1 | 0 | Start muted |
| `loop` | 0/1 | 0 | Loop playback |
| `t` | number | 0 | Start time in seconds |
| `controls` | 0/1 | 1 | Show/hide video controls |
| `title` | 0/1 | 1 | Show/hide title overlay |
| `quality` | string | auto | Preferred quality (1080p/720p/480p/auto) |
| `relays` | string | auto | Custom relay list (comma-separated) |
| `color` | hex | 8b5cf6 | Accent color for UI elements |
| `branding` | 0/1 | 1 | Show/hide "Watch on Nostube" link |

### Example Embed Code

```html
<iframe
  src="https://nostube.com/embed?v=nevent1qqs...&autoplay=1&muted=1"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen">
</iframe>
```

## Component Architecture

### Internal Modules

All modules live in a single bundled file but organized as separate functions/classes:

1. **NostrClient** - Relay connections and event fetching
2. **VideoEventParser** - Parse Nostr events into video metadata
3. **PlayerUI** - Render video player DOM
4. **ErrorHandler** - Loading and error states
5. **TitleOverlay** - Title/author display with fade behavior
6. **ContentWarning** - Blur overlay for sensitive content
7. **BrandingLink** - "Watch on Nostube" attribution

### Data Flow

```
1. Parse URL parameters (window.location.search)
2. Decode nevent/naddr using nostr-tools
3. Extract hint relays or use defaults
4. Connect to relays via WebSocket
5. Fetch video event (kinds 21, 22, 34235, 34236)
6. Parse event → extract URLs, title, author, content-warning
7. Build video player DOM
8. Handle quality selection
9. Show content warning overlay if needed
10. Initialize video element with native controls
11. Add title overlay and branding link
```

### State Management

Simple vanilla JS state tracking:
- Current relay connections
- Fetched event data
- Player state (loading/ready/error)
- User interactions (content warning clicked, etc.)

No complex state management needed - keep it simple.

## Feature Details

### 1. Relay Connection & Event Fetching

**Relay Selection Algorithm:**

```javascript
// Priority order:
1. Custom relays from URL parameter (?relays=wss://...)
2. Hint relays from nevent/naddr
3. Default fallback relays:
   - wss://relay.divine.video
   - wss://relay.nostr.band
   - wss://relay.damus.io
```

**Event Fetching Strategy:**

- Connect to all relays in parallel
- Send REQ subscription to each relay
- Return first valid EVENT response
- Cancel other subscriptions after receiving event
- 10 second timeout per relay
- Show error if no relays respond

**WebSocket Implementation:**

- Use native `WebSocket` API
- Handle EOSE (end of stored events)
- Clean connection cleanup
- Reconnect logic for retry button

### 2. Video URL Selection

**For v1: Direct URLs only**

- Parse video URLs from event (imeta tags, url tag, fallback tags)
- No Blossom mirrors/proxies (will be added later)
- Just use URLs directly from the event

**Quality Selection Logic:**

When event has multiple video variants:

```javascript
// Priority order:
1. If quality=1080p → Find URL with "1080" in dimensions
2. If quality=auto → Pick highest quality available
3. If quality=720p → Find 720p, fallback to closest
4. If no dimensions → Use first URL (original)
5. Fallback chain: requested → higher → lower → any
```

**Multi-source handling:**

- Add all video URLs as `<source>` elements
- Browser tries sources in order
- Automatic fallback if first URL fails

### 3. Error Handling & Loading States

**State Progression:**

```
INITIALIZING → FETCHING_EVENT → PARSING_EVENT → LOADING_VIDEO → READY
                     ↓                ↓               ↓
                  ERROR_*         ERROR_*         ERROR_*
```

**Error States:**

| State | Display | User Action |
|-------|---------|-------------|
| `INITIALIZING` | Black screen + spinner | None |
| `FETCHING_EVENT` | "Loading video..." + spinner | None |
| `ERROR_INVALID_ID` | "Invalid video ID" | None |
| `ERROR_NOT_FOUND` | "Video not found" | None |
| `ERROR_RELAY_FAILED` | "Connection failed" + retry | Click retry |
| `ERROR_VIDEO_UNAVAILABLE` | "Video file unavailable" | None |
| `READY` | Video player ready | Play video |

**Visual Design:**

- Show poster/thumbnail as background if available
- Semi-transparent overlay with error message
- Centered text with icon (⚠️ or ℹ️)
- Retry button for connection errors
- "Watch on Nostube" link always visible

**Timeout Handling:**

- Relay connection: 10 seconds per relay
- Event fetch: Try all relays, fail if none respond
- Video loading: Browser handles (native error event)

### 4. Content Warning Overlay

**When to show:**

Video event has a `content-warning` tag

**Visual Design:**

```
├── Blurred poster image (CSS filter: blur(20px))
├── Semi-transparent dark overlay (rgba(0,0,0,0.7))
├── Warning icon + text: "Sensitive content"
├── Secondary text: Event's content-warning message
└── "Click to reveal" button
```

**Interaction Flow:**

1. Parse `content-warning` tag from event
2. Show blurred poster with overlay
3. Video element exists but paused, controls hidden
4. User clicks anywhere → remove overlay, show controls
5. State persists (no re-blur on pause)

**Important:**

- Content warning cannot be disabled (safety feature)
- Always shown regardless of URL parameters
- Clicking reveals video and allows playback

### 5. Title Overlay

**Visual Design:**

```
├── Video title at top (truncated if too long)
├── Author name + avatar in bottom-left corner
└── Auto-hide behavior:
    - Shows on load
    - Fades out after 3 seconds
    - Reappears on hover/pause
    - Hidden during playback
```

**CSS Transitions:**

- Fade in/out: 300ms ease
- Hover detection on player container
- Position: absolute overlay, doesn't affect video size

**Respects Parameters:**

- `title=0` → Skip title overlay entirely
- Default: `title=1` (show)

### 6. Branding Link

**"Watch on Nostube" Link:**

- Positioned in bottom-right corner
- Small, semi-transparent button/link
- Text: "Watch on Nostube"
- Opens full video page in new tab
- URL: `https://nostube.com/video/<nevent-or-naddr>`
- Uses accent color from `color` parameter

**Behavior:**

- Always visible (overlays video)
- Respects `branding=0` to hide
- Z-index above video, below native controls
- Fades in after title overlay fades out

**Purpose:**

- Attribution and discovery
- Drives traffic back to main Nostube app
- Standard practice for embed players (YouTube, Vimeo, etc.)

## Video Format Support

**Supported formats (v1):**

- MP4 (H.264, H.265)
- WebM (VP8, VP9)
- Any format supported by native HTML5 `<video>`

**Not supported (v1):**

- HLS streams (.m3u8) - will be added later with hls.js

**Multi-source fallback:**

- Add all URLs as `<source>` elements
- Browser tries each source in order
- Automatic failover to next URL if first fails

## Testing Strategy

### 1. Manual Testing

**Test page:** `public/embed-example.html`

Test cases:
- Various nevent/naddr identifiers
- All URL parameters combinations
- Different video qualities
- Content warning handling
- Error states (invalid ID, not found, etc.)
- Mobile and desktop browsers

### 2. Unit Tests

Test individual functions:
- NIP-19 decoding
- URL parameter parsing
- Quality selector logic
- Event parser
- Relay selection algorithm

### 3. Integration Tests

Test full flow with mocks:
- Mock WebSocket relay responses
- Mock video event data
- Test state transitions
- Test error handling

### 4. Browser Testing

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

## Implementation Plan

### Phase 1: Core Infrastructure

1. Set up `src/embed/` directory structure
2. Create build script (`scripts/build-embed.js`)
3. Configure esbuild/rollup for bundling
4. Set up basic HTML structure in `embed-example.html`

### Phase 2: Nostr Integration

1. Implement NIP-19 decoding (using nostr-tools)
2. Implement relay connection logic
3. Implement event fetching with timeout handling
4. Parse video events into metadata

### Phase 3: Video Player

1. Build video player DOM structure
2. Implement quality selection logic
3. Handle multi-source URLs
4. Add native video controls

### Phase 4: UI Overlays

1. Implement loading states and error messages
2. Build content warning overlay
3. Build title overlay with fade behavior
4. Add branding link

### Phase 5: Testing & Polish

1. Create comprehensive `embed-example.html` test page
2. Test all error states
3. Test on multiple browsers
4. Write `embed-README.md` documentation
5. Optimize bundle size

### Phase 6: Documentation

1. Write `embed-README.md` with all parameters
2. Add examples for common use cases
3. Document embed code generation
4. Add troubleshooting section

## Documentation

### embed-README.md Contents

1. **Quick Start** - Basic iframe example
2. **Parameters Reference** - All URL parameters with examples
3. **Examples** - Common embedding scenarios
4. **Customization** - Styling and color options
5. **Troubleshooting** - Common issues and solutions
6. **Browser Support** - Compatibility information
7. **Performance** - Bundle size and loading tips

## Future Enhancements (Not in v1)

1. **Blossom Integration** - Mirrors, proxies, caching servers
2. **HLS Support** - Adaptive streaming for .m3u8 files
3. **JavaScript Embed API** - Programmatic control
4. **Captions Support** - Display text-track subtitles
5. **Playlist Support** - Play multiple videos in sequence
6. **Analytics** - Track views and engagement
7. **Chapters** - Video chapters/timeline markers

## Success Criteria

✅ Single bundled JavaScript file (~150KB gzipped)
✅ Works via simple iframe embed
✅ Supports nevent and naddr identifiers
✅ Smart relay selection with fallbacks
✅ Proper error handling and loading states
✅ Content warning overlay for sensitive content
✅ Title overlay with fade behavior
✅ Minimal "Watch on Nostube" branding
✅ Works on all modern browsers
✅ No external dependencies (self-contained)
✅ Comprehensive test page with examples
✅ Complete documentation for embedders

## Example Test IDs

For testing in `embed-example.html`:

**Regular event (nevent):**
```
nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk
```

**Addressable event (naddr):**
```
naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj
```

## Conclusion

This design provides a solid foundation for a standalone embeddable video player that matches the core functionality of the main Nostube app while remaining completely self-contained and easy to embed on any website. The phased approach allows for iterative development with clear milestones, and the architecture supports future enhancements without requiring major refactoring.
