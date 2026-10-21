# Blossom storage

Nostube stores videos, thumbnails, subtitles and HLS segments on [Blossom](https://github.com/hzrd149/blossom) servers. Blossom is a small set of HTTP endpoints for storing blobs on public servers, with Nostr keys as identities. A blob is addressed by the SHA-256 hash of its bytes, so the same file has the same name on every server: `https://<server>/<sha256>.<ext>`.

Because any Blossom server can host any blob, a video does not depend on one host. If the URL in the video event stops working, a client can ask other servers for the same hash and check that the bytes match. This is why Nostube uses Blossom rather than NIP-96 ([ADR 0001](https://github.com/flox1an/nostube/blob/main/docs/adr/0001-blossom-for-media-storage.md)).

## The BUDs Nostube uses

The protocol is split into short documents called BUDs (Blossom Upgrade Documents). A server implements the ones it needs.

| BUD | What it covers | Used by Nostube for |
| --- | --- | --- |
| [BUD-01](https://github.com/hzrd149/blossom/blob/master/buds/01.md) | `GET` / `HEAD /<sha256>` | Playback, and checking whether a server already has a blob before uploading |
| [BUD-02](https://github.com/hzrd149/blossom/blob/master/buds/02.md) | `PUT /upload` | Uploading files |
| [BUD-03](https://github.com/hzrd149/blossom/blob/master/buds/03.md) | User server list, kind `10063` | Finding a user's or a creator's servers |
| [BUD-04](https://github.com/hzrd149/blossom/blob/master/buds/04.md) | `PUT /mirror` | Copying a blob from one server to another |
| [BUD-11](https://github.com/hzrd149/blossom/blob/master/buds/11.md) | Authorization events, kind `24242` | Signing uploads, mirrors and deletions |
| [BUD-12](https://github.com/hzrd149/blossom/blob/master/buds/12.md) | `DELETE /<sha256>` | Removing uploaded files from a discarded draft or after replacing a video's file |

Files larger than 100 MB are first offered to the server as a chunked upload (`PATCH /upload`, announced by the server in its `OPTIONS /upload` response). This is not one of the BUDs above. Almond supports it. Any server that does not support it gets a single `PUT /upload` instead.

## Server roles in the web app

The web app keeps its servers in **Settings → Network**. Every server in the list has zero or more tags:

| Role | Where to set it | What it does |
| --- | --- | --- |
| Hosting, tagged **Primary** (`initial upload`) | Video Hosting | Receives every upload. You need at least one before you can upload a file. |
| Hosting, tagged **Backup** (`mirror`) | Video Hosting | Receives a copy of every uploaded blob through `PUT /mirror`, after the upload to the Primary servers. |
| Hosting, no tag | Video Hosting | Not used for uploads, but still asked for a video's hash during playback. |
| Streaming server (caching server) | Streaming Servers | Tried first during playback. It fetches blobs it does not have from the servers named in the URL. |
| Image proxy | Service endpoints → Image Proxy URL | Produces resized WebP thumbnails. Default: `https://imgproxy.nostu.be`. |

In the nostu.be build, new users start with `blossom.primal.net`, `nostr.download` and `almond.slidestr.net` as Primary servers, with no Backup servers and no streaming server. `cdn.nostrcheck.me` cannot be added: it re-encodes videos, so what it serves no longer matches the hash. For the same reason, URLs on `video.nostr.build`, `image.nostr.build` and `cdn.nostrcheck.me` are not treated as Blossom URLs.

None of this applies to a Nostube Server. Its site and Studio use the instance's own Blossom, plus the creator's server list for playback. They use no image proxy and no media discovery (see [Storage and S3](/server/storage)).

### Your server list (kind 10063)

[BUD-03](https://github.com/hzrd149/blossom/blob/master/buds/03.md) defines a replaceable event, kind `10063`, that holds a user's Blossom servers in `server` tags. Nostube uses it in several places:

- **Web app:** after you sign in, it reads your kind `10063` list and adds any server you don't have yet to Video Hosting, without tags. Tag a server as Primary or Backup to use it for uploads. The web app reads this list but never publishes it.
- **Embed player:** it fetches the author's kind `10063` list and uses those servers as playback fallbacks.
- **Nostube Server:** the creator site uses the creator's kind `10063` list as playback fallbacks. With a managed channel identity, the server signs and publishes the channel's own list (see [Storage and S3](/server/storage)).

## How a video URL is resolved

When the player loads a video, it builds an ordered list of candidate URLs and moves on to the next one when a URL fails:

1. **Streaming servers.** For each streaming server: `https://<cache>/<sha256>.<ext>?xs=<host>&xs=<host>&as=<author>`. Each `xs` names another server that has the blob: the other streaming servers, your hosting servers and the host in the event's URL. `as` is the author's pubkey, so the cache can also look up the author's server list. Proxy URLs are not used for HLS playlists.
2. **The event's own URL**, if it is a Blossom URL.
3. **The same hash on every hosting server you configured**, whatever its tags.
4. **The event's URL, if it is not a Blossom URL**, comes after these alternatives.

Each video variant in the event adds its `url` and `fallback` entries, highest quality first. Variants with codecs the device cannot play are skipped. When the event has a hash, the web app also looks for NIP-94 file metadata events (kind `1063`) with the same `x` hash on your relays and adds the URLs it finds. The web app publishes such an event itself after it mirrors a video's blobs to more servers. URLs that point to `localhost`, private networks or non-HTTP schemes in an event are never requested.

## Thumbnails

The web app loads thumbnails and avatars through an [imgproxy](https://imgproxy.net) instance:

- Blossom images use a fixed preset route: `<imgproxy>/v1/preset/<preset>/<sha256>.<ext>?xs=<server>&as=<pubkey>`. It accepts up to four `xs` hints. The presets are `feed-preview-v1` (480×480), `profile-avatar-v1` (160×160) and `embed-card-v1` (1200×630).
- Other URLs use imgproxy's unsigned `/insecure/f:webp/...` route. This works only if the proxy allows unsigned URLs.

If the proxied image fails, the original image is shown. If the video has no image, a frame from the video is used. A Nostube Server's site never uses an image proxy.

## Choosing a server

A server works well with Nostube if it:

- serves blobs unchanged, so the bytes match the hash in the URL;
- allows browser uploads through CORS: `PUT` and `HEAD` with the `Authorization` and `X-SHA-256` headers;
- supports `PUT /mirror` if you want it as a Backup server;
- answers range requests, so viewers can seek;
- accepts your file sizes and keeps blobs long enough. Many public servers limit size or expire blobs, and some charge for storage.

Use at least two servers, one Primary and one Backup, so every video is available from more than one URL from the start.

## Running your own Blossom server

[Almond](https://flox1an.github.io/almond/) is a Blossom server written in Rust by the Nostube author. It implements BUD-01, 02, 04, 06, 07, 09, 11 and 12, with resumable chunked uploads. It stores blobs on the filesystem or in an S3-compatible bucket, and offers age limits and size caps. Each write endpoint can be off, public, web of trust or DVM, plus an optional npub allowlist. Almond can also fetch missing blobs from upstream servers or from client hints. That makes it usable as a Primary or Backup server, and also as a streaming server.

- Getting started: [flox1an.github.io/almond/guide/getting-started](https://flox1an.github.io/almond/guide/getting-started)
- Configuration: [flox1an.github.io/almond/configuration](https://flox1an.github.io/almond/configuration/)

After it runs, add its URL in **Settings → Network → Video Hosting** and tag it, or add it under **Streaming Servers**.

The **Nostube Server** already includes Almond as a library and serves Blossom from the instance's own origin, so you don't need a separate server. See [Storage and S3](/server/storage).
