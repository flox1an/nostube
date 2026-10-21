# Supporting projects

Nostube is the video interface, not a single service that stores, indexes and transforms every file. These related projects provide supporting services and can also be self-hosted independently:

| Project | Role | Documentation | Source |
| --- | --- | --- | --- |
| **Almond** | Blossom media storage: upload, download, mirror and cache content-addressed files on disk or S3 | [Almond docs](https://flox1an.github.io/almond/) | [flox1an/almond](https://github.com/flox1an/almond) |
| **nostube-search** | MeiliSearch-backed video index, full-text search and recommendations built from Nostr events; does not host video files | [Nostube Search docs](https://flox1an.github.io/nostube-search/) | [flox1an/nostube-search](https://github.com/flox1an/nostube-search) |
| **nostube-imgproxy** | Resize and cache images, extract video thumbnails and audio cover art, and discover media across Blossom servers | [Image Proxy docs](https://flox1an.github.io/nostube-imgproxy/) | [flox1an/nostube-imgproxy](https://github.com/flox1an/nostube-imgproxy) |

Each repository also contains its documentation under `docs/`.

## Which services do I need?

### A creator site with Nostube Server

[Nostube Server](/server/) already embeds Almond as a library and serves Blossom on the instance's own origin. You do **not** need to deploy a separate Almond server. Choose disk or S3 storage in the server's settings; see [Storage and S3](/server/storage).

The creator site and Studio do not require a separate search service or image proxy. Do not deploy the whole supporting stack just to run your own channel.

### A self-hosted copy of the nostu.be web app

The [web app](/web-app/) reads events from Nostr relays and media from Blossom servers. Its search and image proxy are separate service endpoints, not included in the static build or web app Docker image.

To operate those services yourself:

- **Storage:** run Almond using its [getting-started guide](https://flox1an.github.io/almond/guide/getting-started), then add its URL under **Settings → Network → Video Hosting** or **Streaming Servers**, depending on its role. See [Blossom storage](/media/blossom).
- **Search and recommendations:** deploy nostube-search following its [getting-started guide](https://flox1an.github.io/nostube-search/guide/getting-started). Configure its source relays and allow the web app's origin through CORS, then set **Search Service URL** under **Settings → Network → Service endpoints**. A search index is a separate view of relay history, not a guarantee that every relay event has been indexed.
- **Images and thumbnails:** deploy nostube-imgproxy using its [getting-started guide](https://flox1an.github.io/nostube-imgproxy/guide/getting-started), follow its operations and security guidance, then set **Image Proxy URL** under **Settings → Network → Service endpoints**. The web app uses its public browser presets; never put a proxy signing secret in browser configuration.

Visitors' endpoint settings are stored in their browser. To ship your own defaults to new visitors, see the [default relays and servers](/web-app/#default-relays-and-servers) and rebuild the web app.
