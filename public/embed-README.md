# Nostube Embed Player

Embed Nostr videos on your website with a simple iframe.

## Quick Start

Embed a video with just one line of HTML:

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs..."
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
>
</iframe>
```

[See it in action →](https://nostu.be/embed-examples.html)

---

## Getting Started

### 1. Find Your Video ID

Videos on Nostube use Nostr event identifiers:

- **nevent**: Regular video events (kinds 21, 22)
- **naddr**: Addressable video events (kinds 34235, 34236)
- **note**: Basic note IDs

You can find the video ID in the Nostube video URL:

```
https://nostu.be/video/nevent1qqs...
                         └─────┬─────┘
                          Video ID
```

### 2. Embed the Video

Use this basic template:

```html
<iframe
  src="https://nostu.be/embed?v=YOUR_VIDEO_ID"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
>
</iframe>
```

Replace `YOUR_VIDEO_ID` with your actual video identifier.

---

## Parameters

Customize the player with URL parameters:

| Parameter  | Type   | Default    | Description                              |
| ---------- | ------ | ---------- | ---------------------------------------- |
| `v`        | string | _required_ | Video identifier (nevent/naddr/note)     |
| `autoplay` | 0 or 1 | 0          | Auto-play video on load                  |
| `muted`    | 0 or 1 | 0          | Start video muted                        |
| `loop`     | 0 or 1 | 0          | Loop video playback                      |
| `t`        | number | 0          | Start time in seconds                    |
| `controls` | 0 or 1 | 1          | Show/hide video controls                 |
| `title`    | 0 or 1 | 1          | Show/hide title overlay                  |
| `branding` | 0 or 1 | 1          | Show/hide "Watch on Nostube" link        |
| `color`    | hex    | 8b5cf6     | Accent color (without #)                 |
| `relays`   | string | auto       | Custom relay list (comma-separated)      |
| `quality`  | string | auto       | Preferred quality (1080p/720p/480p/auto) |

### Usage Examples

**Autoplay muted:**

```html
<iframe src="https://nostu.be/embed?v=nevent1...&autoplay=1&muted=1"></iframe>
```

**Start at 30 seconds:**

```html
<iframe src="https://nostu.be/embed?v=nevent1...&t=30"></iframe>
```

**Custom red theme:**

```html
<iframe src="https://nostu.be/embed?v=nevent1...&color=ff0000"></iframe>
```

**Minimal player (no overlays):**

```html
<iframe src="https://nostu.be/embed?v=nevent1...&title=0&branding=0"></iframe>
```

---

## Examples

### Basic Embed

Default player with all features:

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs..."
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
>
</iframe>
```

### Autoplay Background Video

Muted autoplay for background videos:

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs...&autoplay=1&muted=1&loop=1&controls=0&title=0&branding=0"
  width="1920"
  height="1080"
  frameborder="0"
  allow="autoplay"
>
</iframe>
```

### Custom Theme

Match your website's color scheme:

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs...&color=00d4ff"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

### Addressable Event (naddr)

Embed updateable video content:

```html
<iframe
  src="https://nostu.be/embed?v=naddr1qvzqqqy9hvpzp3yw98..."
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

[View all examples →](https://nostu.be/embed-examples.html)

---

## Customization

### Responsive Sizing

Make the embed responsive with CSS:

```html
<style>
  .video-container {
    position: relative;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
    height: 0;
    overflow: hidden;
  }

  .video-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
</style>

<div class="video-container">
  <iframe src="https://nostu.be/embed?v=nevent1qqs..."></iframe>
</div>
```

### Custom Colors

Use the `color` parameter with any hex color (without #):

```
&color=8b5cf6  (purple - default)
&color=ff0000  (red)
&color=00d4ff  (cyan)
&color=ff6b6b  (coral)
```

The color is applied to:

- Branding link hover effects
- Focus states
- Accent elements

### Lazy Loading

Improve page load performance with lazy loading:

```html
<iframe src="https://nostu.be/embed?v=nevent1qqs..." loading="lazy" width="640" height="360">
</iframe>
```

---

## Troubleshooting

### Video Not Loading

**Issue:** Player shows "Video not found" error

**Solutions:**

1. Verify the video ID is correct (starts with `nevent1`, `naddr1`, or `note1`)
2. Check that the video event exists on Nostr relays
3. Try adding custom relays: `&relays=wss://relay1.com,wss://relay2.com`
4. Test the video ID on nostu.be first to ensure it works

### Autoplay Not Working

**Issue:** Video doesn't autoplay even with `autoplay=1`

**Solutions:**

1. Add `muted=1` parameter (browsers require muted autoplay)
2. Add `allow="autoplay"` attribute to iframe
3. Check browser autoplay policies (Chrome, Safari have restrictions)
4. Test in an incognito window to rule out browser settings

### Player Too Small/Large

**Issue:** Player doesn't fit the page properly

**Solutions:**

1. Use responsive CSS (see Customization section above)
2. Adjust iframe `width` and `height` attributes
3. Use percentage widths: `width="100%"`
4. Maintain 16:9 aspect ratio: height = width × 0.5625

### Content Warning Stuck

**Issue:** Content warning overlay won't disappear

**Solutions:**

1. Click anywhere on the overlay to reveal
2. Content warnings cannot be bypassed automatically (safety feature)
3. This is expected behavior for videos with `content-warning` tags

### Title Overlay Not Hiding

**Issue:** Title stays visible during playback

**Solutions:**

1. Wait 3 seconds - it auto-hides after initial display
2. Move cursor off the player area to trigger hide
3. Disable with `&title=0` if not needed
4. This is normal hover behavior

### Video Quality Issues

**Issue:** Video is too low quality or buffering

**Solutions:**

1. Check your internet connection
2. Force higher quality: `&quality=1080p` or `&quality=720p`
3. Let auto quality selection work: `&quality=auto` (default)
4. Ensure video has multiple quality variants uploaded

### Relay Connection Failures

**Issue:** "Failed to load video event" error

**Solutions:**

1. Try specifying custom relays: `&relays=wss://relay.damus.io,wss://relay.nostr.band`
2. Check that the relays in the hint are online
3. Test with default relay: `wss://relay.divine.video`
4. Verify the video event ID is correct

---

## Browser Support

The embed player supports all modern browsers:

| Browser       | Version | Support |
| ------------- | ------- | ------- |
| Chrome        | 90+     | ✅ Full |
| Firefox       | 88+     | ✅ Full |
| Safari        | 14+     | ✅ Full |
| Edge          | 90+     | ✅ Full |
| Mobile Chrome | 90+     | ✅ Full |
| Mobile Safari | 14+     | ✅ Full |

### Video Format Compatibility

| Format           | Support              |
| ---------------- | -------------------- |
| MP4 (H.264)      | ✅ All browsers      |
| MP4 (H.265/HEVC) | ⚠️ Not on iOS Safari |
| WebM (VP8)       | ✅ Most browsers     |
| WebM (VP9/AV1)   | ⚠️ Not on iOS Safari |

**Recommendation:** Use H.264 MP4 for best compatibility across all devices.

### Required Features

The embed player requires:

- ES6+ JavaScript support
- Native video element
- Fetch API
- WebSocket support (for relay connections)
- Promise support

---

## Performance

### Bundle Size

- JavaScript bundle: **166KB** uncompressed
- CSS: **9KB** uncompressed
- Total: **175KB** (~60KB gzipped)

### Loading Speed

Typical loading times (on good connection):

- Initial load: ~50-100ms (network dependent)
- Video event fetch: 100-500ms (relay speed)
- First frame: 500-1500ms (video size dependent)
- Total time to playback: **1-2 seconds**

### Optimization Tips

1. **Use lazy loading** for below-the-fold videos

   ```html
   <iframe ... loading="lazy"></iframe>
   ```

2. **Preload critical embeds** with link preconnect

   ```html
   <link rel="preconnect" href="https://nostu.be" />
   ```

3. **Add quality variants** when uploading for adaptive quality selection

4. **Use fast relays** in the hint or specify with `&relays=` parameter

5. **Enable HTTP/2** on your web server for better concurrent loading

### Bandwidth

The player itself is lightweight (~60KB gzipped). Video bandwidth depends on:

- Video file size (varies by length and quality)
- Number of quality variants available
- User's selected or auto-detected quality
- Video codec and bitrate

**Typical video sizes:**

- 360p: 2-5 MB/minute
- 720p: 5-10 MB/minute
- 1080p: 10-20 MB/minute

---

## Features

### ✅ Implemented (v1)

- ✅ iframe-based embedding
- ✅ Native HTML5 video controls
- ✅ Multiple video quality variants
- ✅ Automatic quality selection
- ✅ Nostr event fetching (nevent/naddr/note)
- ✅ Smart relay selection with hints
- ✅ Content warning overlays
- ✅ Title/author overlays (auto-hide)
- ✅ Branding attribution link
- ✅ Custom accent colors
- ✅ Responsive design
- ✅ Keyboard navigation
- ✅ Error handling
- ✅ Loading states

### 🚧 Coming Soon (v2)

- 🚧 HLS streaming support (.m3u8)
- 🚧 Blossom server integration
- 🚧 JavaScript embed API
- 🚧 Playlist support
- 🚧 Captions/subtitles
- 🚧 Analytics tracking (optional)
- 🚧 Chapter markers
- 🚧 Picture-in-picture mode
- 🚧 Quality selector UI

---

## Security & Privacy

### Security Features

The embed player:

- Runs in a sandboxed iframe (isolated from parent page)
- Does not access parent page data or cookies
- Uses HTTPS only for all connections
- Validates all parameters before processing
- Sanitizes video metadata to prevent XSS
- No eval() or dynamic code execution

### Privacy Features

The embed player:

- **Does not track users** - no analytics, no cookies
- **Does not collect personal data** - anonymous by default
- **Connects directly to Nostr relays** - decentralized by design
- **No centralized server** - peer-to-peer video delivery
- **No third-party tracking** - no ads, no pixels
- **Open source** - auditable code

### Content Moderation

The player respects content warnings:

- Videos with `content-warning` tags show an overlay
- Users must explicitly click to view sensitive content
- Content warning text is displayed from the event
- Cannot be bypassed programmatically (safety feature)

---

## Accessibility

### Keyboard Navigation

The player supports standard video keyboard controls:

- **Space** - Play/pause
- **Arrow Left** - Rewind 5 seconds
- **Arrow Right** - Fast forward 5 seconds
- **Arrow Up** - Increase volume
- **Arrow Down** - Decrease volume
- **M** - Toggle mute
- **F** - Toggle fullscreen

### Screen Reader Support

The player includes:

- Semantic HTML structure
- ARIA labels for controls
- Alt text for overlays
- Focus indicators for keyboard navigation

### Accessibility Features

- High contrast mode support
- Reduced motion support (respects `prefers-reduced-motion`)
- Focus visible indicators
- Sufficient color contrast (WCAG AA compliant)

---

## Best Practices

### ✅ Recommended Practices

**Responsive Design:**

```html
<!-- Use percentage widths and CSS for responsive embedding -->
<div class="video-container">
  <iframe src="..." style="width: 100%; height: 100%;"></iframe>
</div>
```

**Aspect Ratio:**
Maintain 16:9 aspect ratio for standard videos:

- 360p → 640×360
- 720p → 1280×720
- 1080p → 1920×1080

**Autoplay:**
Always combine parameters for browser compatibility:

```html
<iframe src="...&autoplay=1&muted=1" allow="autoplay; fullscreen"></iframe>
```

**Accessibility:**
Provide context around embedded videos:

```html
<figure>
  <iframe src="..."></iframe>
  <figcaption>Video title and description</figcaption>
</figure>
```

**Performance:**
Lazy-load embeds below the fold:

```html
<iframe src="..." loading="lazy"></iframe>
```

**Privacy:**
Nostube embeds don't track users, but inform your users:

```html
<p>This video is embedded from Nostube, a privacy-respecting video platform.</p>
```

### ⚠️ Common Pitfalls

**Don't:**

- ❌ Use autoplay without muted - browsers will block it
- ❌ Set `controls=0` without providing alternative controls
- ❌ Embed dozens of autoplaying videos on one page - performance impact
- ❌ Forget the `allow` attribute for autoplay/fullscreen
- ❌ Use invalid hex colors - they will be ignored
- ❌ Specify invalid relay URLs - video may fail to load

**Do:**

- ✅ Test embeds on multiple browsers before deployment
- ✅ Provide fallback content if iframe fails
- ✅ Use responsive CSS for mobile compatibility
- ✅ Respect user autoplay preferences
- ✅ Provide text alternatives for videos

---

## Examples by Use Case

### Blog Post Embed

Standard embed for blog articles:

```html
<figure style="max-width: 800px; margin: 2em auto;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0;">
    <iframe
      src="https://nostu.be/embed?v=nevent1qqs..."
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
      frameborder="0"
      allowfullscreen
      allow="fullscreen"
    >
    </iframe>
  </div>
  <figcaption style="padding: 1em 0; color: #666; text-align: center;">
    Video: My Awesome Tutorial
  </figcaption>
</figure>
```

### Marketing Landing Page

Autoplay hero video:

```html
<div class="hero-video" style="width: 100%; height: 100vh; overflow: hidden;">
  <iframe
    src="https://nostu.be/embed?v=nevent1qqs...&autoplay=1&muted=1&loop=1&controls=0&title=0&branding=0"
    style="width: 100%; height: 100%;"
    frameborder="0"
    allow="autoplay"
  >
  </iframe>
</div>
```

### Video Gallery

Grid of embedded videos:

```html
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
  <iframe src="https://nostu.be/embed?v=nevent1..." width="100%" height="200"></iframe>
  <iframe src="https://nostu.be/embed?v=nevent1..." width="100%" height="200"></iframe>
  <iframe src="https://nostu.be/embed?v=nevent1..." width="100%" height="200"></iframe>
</div>
```

### Documentation Site

Embedded tutorial with custom theme:

```html
<div style="margin: 2em 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
  <iframe
    src="https://nostu.be/embed?v=nevent1qqs...&color=2563eb"
    width="100%"
    height="400"
    frameborder="0"
    allowfullscreen
  >
  </iframe>
</div>
```

---

## Advanced Configuration

### Custom Relay Selection

Specify multiple relays for better reliability:

```html
<iframe
  src="https://nostu.be/embed?v=nevent1qqs...&relays=wss://relay.damus.io,wss://relay.nostr.band,wss://relay.divine.video"
>
</iframe>
```

### Quality Priority

Force specific quality when available:

```html
<!-- Always try 720p first -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&quality=720p"></iframe>

<!-- Always try highest quality -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&quality=1080p"></iframe>
```

### Start Time Deep Linking

Link to specific moments in a video:

```html
<!-- Start at 1 minute 30 seconds (90 seconds) -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&t=90"></iframe>

<!-- Start at 5 minutes (300 seconds) -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&t=300"></iframe>
```

### Brand Customization

Match your brand colors exactly:

```html
<!-- Use your brand's primary color -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&color=YOUR_BRAND_HEX"></iframe>

<!-- Example: Match Material Design Blue -->
<iframe src="https://nostu.be/embed?v=nevent1qqs...&color=2196f3"></iframe>
```

---

## Integration Guides

### WordPress

Add to your post/page content:

```html
<div class="wp-block-embed">
  <iframe
    src="https://nostu.be/embed?v=nevent1qqs..."
    width="640"
    height="360"
    frameborder="0"
    allowfullscreen
  >
  </iframe>
</div>
```

### React/Next.js

Component-based embed:

```jsx
function NosTubeEmbed({ videoId, autoplay = false }) {
  const src = `https://nostu.be/embed?v=${videoId}${autoplay ? '&autoplay=1&muted=1' : ''}`

  return (
    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
      <iframe
        src={src}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        frameBorder="0"
        allowFullScreen
        allow="autoplay; fullscreen"
      />
    </div>
  )
}
```

### Vue.js

Single file component:

```vue
<template>
  <div class="video-container">
    <iframe :src="embedUrl" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>
  </div>
</template>

<script>
export default {
  props: {
    videoId: String,
    autoplay: Boolean,
  },
  computed: {
    embedUrl() {
      let url = `https://nostu.be/embed?v=${this.videoId}`
      if (this.autoplay) url += '&autoplay=1&muted=1'
      return url
    },
  },
}
</script>

<style scoped>
.video-container {
  position: relative;
  padding-bottom: 56.25%;
  height: 0;
}
.video-container iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
```

### Static HTML

Simple copy-paste embed:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Video Page</title>
  </head>
  <body>
    <h1>Check out this video</h1>
    <iframe
      src="https://nostu.be/embed?v=nevent1qqs..."
      width="800"
      height="450"
      frameborder="0"
      allowfullscreen
      allow="autoplay; fullscreen"
    >
    </iframe>
  </body>
</html>
```

---

## API Reference

### URL Parameters

All parameters are optional except `v`:

#### `v` (required)

- **Type:** string
- **Format:** nevent1..., naddr1..., or note1...
- **Example:** `v=nevent1qvzqqqqqz5q3jamnwvaz...`
- **Description:** Nostr event identifier for the video

#### `autoplay`

- **Type:** boolean (0 or 1)
- **Default:** 0
- **Example:** `autoplay=1`
- **Description:** Auto-play video on load (requires muted=1 in most browsers)

#### `muted`

- **Type:** boolean (0 or 1)
- **Default:** 0
- **Example:** `muted=1`
- **Description:** Start video muted (required for autoplay)

#### `loop`

- **Type:** boolean (0 or 1)
- **Default:** 0
- **Example:** `loop=1`
- **Description:** Loop video continuously

#### `t`

- **Type:** number (seconds)
- **Default:** 0
- **Example:** `t=90` (start at 1m 30s)
- **Description:** Start time in seconds

#### `controls`

- **Type:** boolean (0 or 1)
- **Default:** 1
- **Example:** `controls=0`
- **Description:** Show/hide native video controls

#### `title`

- **Type:** boolean (0 or 1)
- **Default:** 1
- **Example:** `title=0`
- **Description:** Show/hide title overlay

#### `branding`

- **Type:** boolean (0 or 1)
- **Default:** 1
- **Example:** `branding=0`
- **Description:** Show/hide "Watch on Nostube" link

#### `quality`

- **Type:** string
- **Default:** auto
- **Options:** auto, 1080p, 720p, 480p, 360p
- **Example:** `quality=720p`
- **Description:** Preferred video quality

#### `color`

- **Type:** hex (without #)
- **Default:** 8b5cf6 (purple)
- **Example:** `color=ff0000` (red)
- **Description:** Accent color for UI elements

#### `relays`

- **Type:** comma-separated URLs
- **Default:** auto (from hint)
- **Example:** `relays=wss://relay.damus.io,wss://relay.nostr.band`
- **Description:** Custom relay list for fetching events

---

## FAQ

### General Questions

**Q: Is Nostube embed free to use?**
A: Yes, completely free. No registration, no API keys, no usage limits.

**Q: Do I need to host anything?**
A: No, everything is hosted by Nostube. Just use the iframe.

**Q: Can I use this on commercial websites?**
A: Yes, free for personal and commercial use.

**Q: Do embeds work offline?**
A: No, embeds require internet connection to load videos from Nostr relays.

### Technical Questions

**Q: What video formats are supported?**
A: MP4 (H.264, H.265) and WebM (VP8, VP9, AV1). H.264 recommended for best compatibility.

**Q: Can I customize the player appearance?**
A: Yes, use the `color` parameter for accent colors. Full CSS customization not supported in v1.

**Q: Does it support captions/subtitles?**
A: Not in v1, coming in v2.

**Q: Can I embed private/unlisted videos?**
A: Only public videos on Nostr relays. No private video support.

**Q: How do I get a video ID?**
A: Visit nostu.be, find your video, copy the ID from the URL.

### Privacy Questions

**Q: Does the embed track users?**
A: No tracking, no cookies, no analytics by default.

**Q: Are embeds GDPR compliant?**
A: Yes, no personal data is collected or processed.

**Q: Do you serve ads in embeds?**
A: No ads, ever. Nostube is ad-free.

**Q: Can parent pages access embed data?**
A: No, embeds run in sandboxed iframes for security.

---

## License

The Nostube embed player is part of the [Nostube](https://nostu.be) project.

Built on the [Nostr](https://nostr.com) protocol - a decentralized social network.

MIT License - Free for personal and commercial use.

---

## Support & Community

- 📖 **Documentation:** [https://nostu.be/embed-examples.html](https://nostu.be/embed-examples.html)
- 🐛 **Report Issues:** [GitHub Issues](https://github.com/nostube/nostube/issues)
- 💬 **Community:** [Nostr](https://nostr.com)
- 📧 **Contact:** support@nostu.be
- 🌐 **Website:** [https://nostu.be](https://nostu.be)

### Contributing

Found a bug or have a feature request? We welcome contributions!

1. Check existing issues on GitHub
2. Create a new issue with detailed description
3. Submit pull requests with improvements
4. Join the community discussion on Nostr

---

## Changelog

### v1.0.0 (Current)

**Initial Release:**

- iframe-based embedding
- NIP-19 identifier support (nevent/naddr/note)
- Smart relay selection
- Quality selection and fallbacks
- Content warning overlays
- Title/author overlays
- Custom branding colors
- Responsive design
- Keyboard navigation
- Error handling

### Roadmap

**v2.0.0 (Planned):**

- HLS streaming support
- Blossom server integration
- JavaScript API
- Captions/subtitles
- Playlist support
- Chapter markers
- Picture-in-picture
- Quality selector UI

---

**Made with ❤️ for the Nostr community**

[Try the interactive embed builder →](https://nostu.be/embed-examples.html#builder)
