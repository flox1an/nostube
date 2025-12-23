# React Embed Player Design

**Date**: 2025-12-23
**Status**: Approved

## Summary

Replace the current vanilla JavaScript embed with a React-based embed that reuses the main app's VideoPlayer component. The new embed maintains full URL parameter compatibility while providing feature parity with the main app player.

## Decisions

| Decision       | Choice                                    |
| -------------- | ----------------------------------------- |
| Scope          | Feature parity with VideoPlayer           |
| Coexistence    | Replace vanilla embed entirely            |
| URL Parameters | Full compatibility with existing API      |
| Nostr fetching | Lightweight client (not Applesauce)       |
| Providers      | None - direct props to VideoPlayer        |
| Build output   | Single JS bundle (vite-plugin-singlefile) |

## Architecture

```
embed.html
    └── loads embed.js (React bundle)
           │
           ├── parseUrlParams()     # Extract ?v=, &autoplay=, etc.
           │
           ├── NostrClient          # Lightweight relay client
           │   ├── fetchVideoEvent()
           │   └── fetchProfile()
           │
           ├── VideoParser          # Extract URLs, variants from event
           │   ├── parseImetaTags()
           │   └── buildVideoVariants()
           │
           └── EmbedApp (React)
               ├── <VideoPlayer />   # Full-featured player from main app
               ├── <TitleOverlay />  # Author + title (optional)
               ├── <Branding />      # Nostube link (optional)
               └── <ContentWarning /> # If content-warning tag present
```

**Key principle**: The React boundary starts at `EmbedApp`. Everything before (URL parsing, Nostr fetching) is vanilla TypeScript - no React, no hooks, no context.

## File Structure

```
src/
├── main.tsx              # Main app entry (unchanged)
├── embed/
│   ├── index.tsx         # Embed entry (React mount)
│   ├── EmbedApp.tsx      # Root component
│   ├── nostr-client.ts   # Lightweight relay client
│   ├── video-parser.ts   # Event → VideoPlayer props
│   ├── url-params.ts     # URL parameter parsing
│   └── components/
│       ├── TitleOverlay.tsx
│       ├── Branding.tsx
│       └── ContentWarning.tsx
embed.html                # Minimal HTML shell
```

## Build Configuration

### Vite Config Addition

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    // Only apply singlefile to embed build
    viteSingleFile({ useRecommendedBuildConfig: false }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
})
```

### Post-Build

Use `vite-plugin-singlefile` or custom script to inline embed assets into single `embed.js`.

## Data Flow

```
1. embed.html loads embed.js

2. parseUrlParams()
   ├── v: "nevent1abc..."
   ├── autoplay: true
   ├── muted: true
   ├── t: 120
   ├── quality: "720p"
   └── ...

3. decodeNostrId(v)
   └── { eventId, pubkey?, relays[] }

4. fetchVideoEvent(eventId, relays)
   └── Returns kind 34235/34236 or 21/22 event

5. parseVideoEvent(event)
   ├── urls: ["https://...", "https://..."]
   ├── videoVariants: [{ quality, url, mime }]
   ├── poster: "https://..."
   ├── title: "Video Title"
   ├── contentWarning: "nsfw" | undefined
   └── authorPubkey: "abc123..."

6. fetchProfile(authorPubkey) [parallel with step 5]
   └── { name, picture, nip05 }

7. ReactDOM.render(<EmbedApp {...allProps} />)
```

### Caching

- Video events: localStorage, 1-hour TTL
- Profiles: localStorage, 24-hour TTL

### Error States

- Invalid `v` param → "Invalid video ID" message
- Event not found → "Video not found" message
- All URLs fail → VideoPlayer's `onAllSourcesFailed` → "Video unavailable"

## VideoPlayer Integration

```tsx
<VideoPlayer
  // Core playback
  urls={videoVariants.map(v => v.url)}
  videoVariants={videoVariants}
  mime={videoVariants[0]?.mime || 'video/mp4'}
  poster={poster}
  // URL params
  loop={params.loop}
  initialPlayPos={params.t}
  // Metadata
  contentWarning={contentWarning}
  authorPubkey={authorPubkey}
  sha256={extractedHash}
  // Callbacks
  onAllSourcesFailed={urls => setError('unavailable')}
  onVideoDimensionsLoaded={(w, h) => updateAspectRatio(w, h)}
/>
```

### Autoplay Handling

```tsx
useEffect(() => {
  if (params.autoplay && videoRef.current) {
    videoRef.current.muted = params.muted ?? true
    videoRef.current.play().catch(() => {
      // Autoplay blocked - show play button
    })
  }
}, [])
```

### Not Needed

- No `useMediaUrls` - URLs come from parsed event
- No `AppContext` - no config needed
- No `cinemaMode` - embed is always full container
- No `textTracks` initially

## Embed-Specific Components

### TitleOverlay

```tsx
interface TitleOverlayProps {
  title: string
  author: { name: string; picture?: string; nip05?: string }
  visible: boolean
  videoId: string
}
```

### Branding

```tsx
interface BrandingProps {
  visible: boolean
  color: string
}
```

### ContentWarning

```tsx
interface ContentWarningProps {
  reason: string
  onAccept: () => void
  color: string
}
```

### Visibility Control

- `?title=0` → TitleOverlay hidden
- `?branding=0` → Branding hidden
- ContentWarning always shown if tag present

## Styling

### CSS Strategy

```tsx
import './embed.css' // Tailwind base + embed-specific styles
```

### Accent Color

```tsx
<div style={{ '--embed-accent': `#${params.color}` }}>
  <EmbedApp />
</div>
```

### Isolation

```css
#nostube-embed {
  all: initial;
  font-family: system-ui, sans-serif;
}

#nostube-embed *,
#nostube-embed *::before,
#nostube-embed *::after {
  box-sizing: border-box;
}
```

### Theme

Dark theme only - embeds always match video content.

## Migration

### Remove

```
src/embed/              # Current vanilla JS (all 20 modules)
scripts/build-embed.js  # esbuild script
public/embed.js         # Built vanilla bundle
public/embed.css        # Vanilla styles
```

### Keep/Update

```
public/embed.html         # Update to load Vite bundle
public/embed-README.md    # Update docs (same API)
public/embed-examples.html # Still works (same params)
```

### npm Scripts

```json
{
  "build": "tsc --noEmit && vite build",
  "dev": "vite"
}
```

Remove `build:embed` and `build:embed:watch` - now part of main build.

## Bundle Size

- Current vanilla: ~60KB gzipped
- New React: ~100-120KB gzipped

Increase is acceptable for feature parity with main app player.

## URL Parameters (Unchanged)

| Param      | Type   | Default  | Description                     |
| ---------- | ------ | -------- | ------------------------------- |
| `v`        | string | required | Video ID (nevent1/naddr1/note1) |
| `autoplay` | 0/1    | 0        | Auto-play video                 |
| `muted`    | 0/1    | 0        | Start muted                     |
| `loop`     | 0/1    | 0        | Loop playback                   |
| `t`        | number | 0        | Start time (seconds)            |
| `controls` | 0/1    | 1        | Show controls                   |
| `title`    | 0/1    | 1        | Show title overlay              |
| `branding` | 0/1    | 1        | Show nostube branding           |
| `quality`  | string | auto     | Preferred quality               |
| `color`    | hex    | 8b5cf6   | Accent color                    |
| `relays`   | string | -        | Custom relays (comma-sep)       |
