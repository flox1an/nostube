# Embed player and oEmbed

The embed player plays a Nostr video inside an `<iframe>` on any website. It is a single HTML file, `embed.html`, that loads the video event from Nostr relays and the media from the author's Blossom servers. It needs no account or API key.

![The embed player](/screenshots/embed-player.webp)

## Quick start

```html
<iframe
  src="https://nostu.be/embed.html?v=nevent1..."
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
></iframe>
```

To get this code, open the video on nostu.be, click the share button and switch to the **Embed** tab of **Share this video**. Tick **Include current timestamp** to start the embed where you paused.

`v` takes the identifier from the video's address: `https://nostu.be/v/<id>` or `https://nostu.be/short/<id>`. It must be a `nevent1…`, `naddr1…` or `note1…` identifier of a video event. Prefer `naddr1…` for addressable videos (kinds 34235 and 34236): the embed then always shows the latest version of the event.

::: warning Use `/embed.html`
Older documentation used `https://nostu.be/embed?v=…`. That path loads the full Nostube app, not the player. Change such embeds to `/embed.html?v=…`.
:::

## URL parameters

| Parameter | Value | Default | Effect |
| --- | --- | --- | --- |
| `v` | `nevent1…`, `naddr1…` or `note1…` | required | The video to play. |
| `t` | whole seconds | `0` | Start position, e.g. `t=90` starts at 1:30. |
| `loop` | `1` | off | Loop the video. Without it, the viewer's own loop setting in the player applies. |
| `title` | `0` | on | `0` hides the title and author overlay. |
| `zaps` | `0` | on | `0` hides the zap markers on the progress bar. |
| `color` | six hex digits, no `#` | `8b5cf6` | Accent colour of the buttons on the content warning and sensitive content screens. |
| `relays` | comma-separated `wss://` URLs | none | Extra relays to look up the video on, asked first. |

Example: start at 30 seconds, loop, no overlay, red buttons:

```html
<iframe
  src="https://nostu.be/embed.html?v=naddr1...&t=30&loop=1&title=0&color=e11d48"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
></iframe>
```

`autoplay`, `muted`, `controls`, `branding` and `quality` from older documentation are ignored. The player always shows its controls, starts unmuted and picks the quality itself; viewers can change quality in the player's settings menu.

## Playback

**Autoplay.** The player always tries to start playing once the video can play. Browsers block autoplay with sound in many cases, especially when the viewer has not interacted with your site yet; the viewer then presses play. Keep `allow="autoplay"` on the iframe, otherwise the browser blocks it every time.

**Title overlay.** The title links to the video's page and the author's name to their profile, both in a new tab. The overlay is shown on load and fades out 2 seconds after the mouse stops moving over the player.

**Keyboard.** When the player has focus:

| Key | Action |
| --- | --- |
| Space, K | Play or pause |
| M | Mute or unmute |
| ← / → | Back or forward 5 seconds |
| J / L | Back or forward 10 seconds |
| F | Fullscreen |
| P | Picture-in-picture |
| 0 to 9 | Jump to 0 % to 90 % of the video |

**Sources.** The player plays the video variants listed in the event, including HLS and DASH streams. If a URL fails, it tries the other variants and the Blossom servers in the author's server list (kind 10063).

**Chapters.** Timestamps in the video description (`0:00 Intro`) show as chapter markers on the progress bar.

## Content warnings and NSFW

The embed enforces the viewer's own safety settings. No URL parameter changes this.

- A video is flagged when it has a `content-warning` tag, NSFW platform attributes, or its author is on the NSFW list of the moderation preset. Authors and events on the preset's block list never play: the embed shows **This video is not available**.
- Flagged videos only play for viewers who enabled sensitive content in their Nostube settings and confirmed they are 18 or older. Browsers keep separate, empty storage for iframes from other sites, so on your page the embed cannot see those settings. Viewers get a **Sensitive content** notice with an **Open on nostube** button instead.
- Viewers who chose to see a warning get a **Content Warning** overlay with **Show anyway**; the video does not start until they click it.
- If the moderation preset cannot be loaded, nothing plays: **Couldn't verify this video**.
- A build with `VITE_NSFW_SAFETY=off` (see [Configuration](/web-app/#configuration)) plays every video without warnings. Only the operator of that deployment can set this.

## Responsive embedding

Let the iframe fill the width of its container and keep the aspect ratio with CSS:

```html
<iframe
  src="https://nostu.be/embed.html?v=nevent1..."
  style="width: 100%; aspect-ratio: 16 / 9; border: 0"
  allowfullscreen
  allow="autoplay; fullscreen"
  loading="lazy"
></iframe>
```

Use `aspect-ratio: 9 / 16` for shorts. `loading="lazy"` delays loading the player until the visitor scrolls near it.

If your site sets a Content Security Policy, allow the embed origin: `frame-src https://nostu.be`.

## Relays

The embed looks up the video on, in this order:

1. the relays in the `relays` parameter,
2. the relay hints inside the `nevent1…` or `naddr1…` identifier,
3. `wss://relay.divine.video` and `wss://relay.primal.net`.

It asks all of them, takes the newest version of the event and checks for a deletion by the author. If a video only lives on a relay that is not on this list, add it with `relays=`.

## oEmbed

The Docker image of the web app (see [Self-hosting the web app](/web-app/#docker)) serves an oEmbed endpoint, so sites and apps that consume oEmbed can turn a pasted video link into the player.

```text
GET https://nostu.be/oembed?url=https://nostu.be/v/nevent1...
```

| Parameter | Value |
| --- | --- |
| `url` | A video or short page: `…/v/<id>` or `…/short/<id>`. Only the path is read. |
| `format` | Optional; the response is always JSON. |

```json
{
  "version": "1.0",
  "type": "video",
  "title": "…",
  "author_name": "npub1…",
  "author_url": "https://nostu.be/p/npub1…",
  "provider_name": "Nostube",
  "provider_url": "https://nostu.be",
  "thumbnail_url": "https://…",
  "html": "<iframe src=\"https://nostu.be/embed.html?v=nevent1…\" width=\"640\" height=\"360\" frameborder=\"0\" allowfullscreen allow=\"autoplay; fullscreen\"></iframe>",
  "width": 640,
  "height": 360,
  "cache_age": 600
}
```

- The player is always 640 × 360. `thumbnail_url` is left out when the event has no thumbnail.
- Successful responses carry `Cache-Control: public, max-age=600`.
- A missing `url` returns 400. A playlist, any other page, an invalid identifier, or an event that no relay returns returns 404.

**Discovery.** When the server finds the event, the HTML of `/v/<id>` and `/short/<id>` pages carries

```html
<link rel="alternate" type="application/json+oembed" href="https://nostu.be/oembed?url=…&format=json" />
```

next to Open Graph tags and, for events with a video URL, a Twitter player card that points at `embed.html`. Static hosting has neither the endpoint nor these tags.

## Self-hosted embed

**With the web app.** Every build of the [web app](/web-app/) contains `embed.html`, so a self-hosted copy serves the player at `https://your-domain/embed.html?v=…`. It behaves like the one on nostu.be, including the **Open on nostube** links to `https://nostu.be`.

**With the Nostube Server.** The [Nostube Server](/server/) serves its own `/embed.html`, built as part of the creator's website:

- Once it has read the instance's public config, it only talks to the instance's own relays (its video sources and interaction relays, see [Configuration](/server/configuration)). It ignores relay hints and the `relays` parameter and never contacts public default relays.
- It loads no moderation preset. Flagged videos are recognised by their `content-warning` tag and NSFW platform attributes only.
- The accent colour comes from the instance's theme; an explicit `color` parameter still wins.
- Title and author of the creator's own videos link to the creator's site. Videos of other authors link to where the creator configured outside links to go. The page title is "Video player"; the player does not mention Nostube.
- Video pages of the server carry Open Graph tags and a Twitter player card pointing at `/embed.html`. The server has no `/oembed` endpoint.

## Troubleshooting

| Message or symptom | Cause and fix |
| --- | --- |
| **Missing required parameter: v (video ID)** | Add `v=`. |
| **Invalid video ID format…** / **Invalid video ID** | `v` is not a valid `nevent1…`, `naddr1…` or `note1…`. Copy it again from the video's address. |
| **Event not found on any relay** | None of the relays answered with the event within 6 seconds. Add a relay that has it: `&relays=wss://relay.example.com`. |
| **This video was deleted by its author** | The author published a deletion for this event. |
| **This video is not available** | The author or event is on the moderation preset's block list. |
| **Failed to parse video event** | The identifier points at an event that is not a video. |
| **No video sources found** | The event lists no playable video URL. |
| **Video unavailable - all sources failed** | No URL in the event and no server in the author's Blossom list returned the file. |
| **Sensitive content** / **Couldn't verify this video** | See [Content warnings and NSFW](#content-warnings-and-nsfw). |
| The Nostube app loads instead of the player | The URL uses `/embed?v=`; use `/embed.html?v=`. |
| The video does not start by itself | The browser blocked autoplay with sound, or the iframe lacks `allow="autoplay"`. |
| The iframe stays blank | Your page's Content Security Policy blocks the frame; add the embed origin to `frame-src`. |
| A link preview shows no player | The site is statically hosted; link previews need the [Docker image](/web-app/#docker). |
