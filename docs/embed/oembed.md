# oEmbed

oEmbed lets sites and apps turn a pasted Nostube video link into an embedded player automatically. To add an iframe yourself or configure playback, see [Nostube Embedded Player](/embed/).

## Endpoint

The Docker image of the web app (see [Self-hosting the web app](/web-app/#docker)) serves an oEmbed endpoint, so sites and apps that consume oEmbed can turn a pasted video link into the player.

```text
GET https://nostu.be/oembed?url=https://nostu.be/v/nevent1...
```

| Parameter | Value |
| --- | --- |
| `url` | A video or short page: `…/v/<id>` or `…/short/<id>`. Only the path is read. |
| `format` | Optional; the response is always JSON. |

## Response

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

## Discovery

When the server finds the event, the HTML of `/v/<id>` and `/short/<id>` pages carries

```html
<link rel="alternate" type="application/json+oembed" href="https://nostu.be/oembed?url=…&format=json" />
```

next to Open Graph tags and, for events with a video URL, a Twitter player card that points at `embed.html`. Static hosting has neither the endpoint nor these tags.

## Self-hosting

The endpoint is included in the [web app's Docker image](/web-app/#docker). Static hosting and the [Nostube Server](/server/) have no `/oembed` endpoint, even though both can serve the [embedded player](/embed/#self-hosted-embed).
