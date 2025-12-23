# Custom YouTube-Style Video Player Design

## Overview

Replace media-chrome and hls-video-element with a custom video player built on native HTML5 video and hls.js. The design follows YouTube's new player UI with Tailwind CSS styling using the primary color.

## Architecture

### Single Video Element, Two Playback Modes

The player uses a single native `<video>` element with two playback modes:

1. **Native mode** - Direct `src` attribute for MP4/WebM files
2. **HLS mode** - hls.js attached to the same video element for `.m3u8` streams

### Component Structure

```
src/components/player/
├── VideoPlayer.tsx          # Main component, orchestrates everything
├── VideoElement.tsx         # The <video> element + hls.js attachment
├── ControlBar.tsx           # Bottom control bar container
├── ProgressBar.tsx          # Seek bar with hover preview
├── VolumeControl.tsx        # Icon + expandable slider
├── TimeDisplay.tsx          # Current time / duration
├── SettingsMenu.tsx         # Gear icon + nested submenus
├── PlayButton.tsx           # Play/pause button
├── ControlButton.tsx        # Reusable button (PiP, Captions, Theater, Fullscreen)
├── TouchOverlay.tsx         # Mobile tap zones for seek/play
├── LoadingSpinner.tsx       # Center buffering indicator
└── hooks/
    ├── usePlayerState.ts    # Centralized player state
    ├── useHls.ts            # hls.js initialization and quality management
    └── useControlsVisibility.ts  # Auto-hide logic
```

## Control Bar Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Video Content]                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  ← Progress bar
│ [▶] [🔊━━] 1:19 / 1:23:02              [PiP][CC][⚙][🎭][⛶]         │  ← Control bar
└─────────────────────────────────────────────────────────────────────┘
```

**Left group:** Play/Pause, Volume (expand on hover), Time display
**Right group:** PiP, Captions (if available), Settings gear, Theater mode, Fullscreen

### Styling

- Control bar: `bg-gradient-to-t from-black/80 to-transparent`
- Buttons: `text-white hover:text-white/80 transition-colors`
- Icons: 24x24px (`w-6 h-6`)
- Progress bar: `bg-primary` (played), `bg-white/30` (buffer), `bg-white/20` (track)

### Auto-hide Behavior

- Controls visible on mouse move / touch
- Fade out after 3 seconds of inactivity while playing
- Always visible when paused
- Cursor hidden when controls hidden (fullscreen)
- Transition: `transition-opacity duration-300`

## Progress Bar

### Visual States

**Default (not hovering):** 3px height

- Primary color: played portion
- White/40: buffered portion
- White/20: remaining track

**Hovering:** 5px height

- Scrubber appears (14px circle, primary color)
- Timestamp tooltip follows cursor

### Interactions

- **Hover:** Bar expands, scrubber appears, timestamp tooltip follows cursor
- **Click:** Seek to position
- **Drag:** Scrubber follows mouse, video seeks in real-time
- **Touch:** Tap to seek, drag scrubber for fine control

## Settings Menu (Nested Submenus)

### Structure

```
Main menu:
┌─────────────────────┐
│ Quality        720p │ →
│ Playback speed  1x │ →
└─────────────────────┘

Quality submenu:
┌─────────────────────┐
│ ← Quality           │
├─────────────────────┤
│   Auto              │  (HLS only)
│ ✓ 1080p             │
│   720p              │
└─────────────────────┘

Playback speed submenu:
┌─────────────────────┐
│ ← Playback speed    │
├─────────────────────┤
│   0.25x             │
│   0.5x              │
│   0.75x             │
│ ✓ Normal            │
│   1.25x             │
│   1.5x              │
│   2x                │
└─────────────────────┘
```

### Behavior

- Menu positioned above the gear icon (anchored bottom-right)
- Click outside or press Escape to close
- Smooth slide animation between main menu and submenus
- HLS: Quality options from hls.js levels (including "Auto")
- Native: Quality options from `videoVariants` prop

## Volume Control

### Visual States

**Collapsed:** Just the icon
**Expanded (on hover):** Icon + slider (~80px width)
**Muted:** Muted icon (speaker with X)

### Behavior

- Click icon: Toggle mute/unmute
- Hover container: Slider expands with smooth animation (200ms)
- Drag slider: Adjust volume (0-100%)
- Mouse leave: Slider collapses after 300ms delay

### Icon States

- Volume high (>50%): Full speaker waves
- Volume low (1-50%): Single speaker wave
- Muted: Speaker with X

## Mobile Touch Interactions

### Tap Zones

```
┌─────────────────────────────────────────────────────────────┐
│   ┌───────────┐    ┌───────────┐    ┌───────────┐         │
│   │  -10s     │    │  Play/    │    │  +10s     │         │
│   │  Double   │    │  Pause    │    │  Double   │         │
│   │  tap      │    │  Tap      │    │  tap      │         │
│   └───────────┘    └───────────┘    └───────────┘         │
│     (left 1/3)      (center 1/3)     (right 1/3)          │
└─────────────────────────────────────────────────────────────┘
```

### Interactions

- **Single tap anywhere:** Show/hide controls
- **Double tap left third:** Seek -10 seconds + ripple animation
- **Double tap right third:** Seek +10 seconds + ripple animation

### Visual Feedback

Ripple circle animation with seek indicator:

- Arrows pointing direction (◀◀ or ▶▶)
- "10" text below arrows

## State Management

### useHls Hook

```tsx
const {
  levels, // Available quality levels
  currentLevel, // Current quality index (-1 = auto)
  setLevel, // Set quality (-1 for auto)
  isLoading, // HLS loading state
} = useHls(videoRef, src, isHlsSource)
```

### usePlayerState Hook

```tsx
const {
  // Playback
  isPlaying,
  setIsPlaying,
  currentTime,
  setCurrentTime,
  duration,

  // Volume
  volume,
  setVolume,
  isMuted,
  setIsMuted,

  // Buffering
  buffered,
  isBuffering,

  // Quality
  qualities,
  currentQuality,
  setQuality,

  // Captions
  textTracks,
  activeTextTrack,
  setActiveTextTrack,
} = usePlayerState(videoRef, hlsInstance)
```

### useControlsVisibility Hook

```tsx
const { isVisible, showControls } = useControlsVisibility({
  isPlaying,
  hideDelay: 3000,
})
```

## Keyboard Shortcuts

Keep existing shortcuts from `useVideoKeyboardShortcuts`:

- **Space:** Play/pause
- **M:** Mute/unmute
- **T:** Toggle theater/cinema mode
- **F:** Toggle fullscreen
- **Arrow left/right:** Seek -5s/+5s
- **Comma/period:** Frame step (when paused) or playlist navigation

## Loading State

Center spinner displayed when buffering:

- Appears after 200ms delay (avoid flash for quick loads)
- White spinner on semi-transparent black background
- Positioned center of video

## Migration Plan

### Files to Remove

- `hls-video-element` dependency from package.json
- `media-chrome` dependency from package.json
- `src/components/video/HLSVideoPlayer.tsx`
- `src/components/video/NativeVideoPlayer.tsx`
- `src/types/media-chrome.d.ts`

### Files to Create

- `src/components/player/` directory with all new components and hooks

### Files to Modify

- `src/components/VideoPlayer.tsx` → Rewrite to use new player components
- Update imports in any files using old player components

## Future Enhancements

- Sprite sheet thumbnail preview on seek bar hover
- Keyboard shortcut hints overlay (press "?" to show)
- Chapter markers on progress bar
- Quality badge on settings gear icon (HD indicator)
