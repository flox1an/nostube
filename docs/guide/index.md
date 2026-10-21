# What is Nostube?

Nostube is video on [Nostr](https://nostr.com). A video is a signed Nostr event
that points to media files; the files live on [Blossom](/media/blossom) servers,
and the events live on Nostr relays. No single company holds the videos, the
audience or the account: your Nostr key is your channel, and any compatible client
can show your videos.

This repository contains several ways to use that:

| Part | What it is | Who it is for |
|---|---|---|
| [nostu.be web app](/web-app/) | A video client: home feed, shorts, playlists, comments, likes and zaps across Nostr relays | Viewers and creators who publish to public relays and Blossom servers |
| [Nostube Server](/server/) | One self-hosted package with a creator homepage, Studio, a Nostr relay and Blossom storage | Creators who want their own site and storage, on the internet or on a home network |
| [Embed player](/embed/) | An iframe player and oEmbed endpoint for any Nostr video | Website owners and blogs |

## How the pieces fit

- **Video events.** Each video is an addressable [NIP-71](/developers/nip-71)
  event: kind 34235 for landscape videos and kind 34236 for portrait shorts. Its
  `imeta` tags list the media variants (resolution, codec, hash, URLs) and the
  thumbnail.
- **Blobs.** Media files are identified by their SHA-256 hash. The same file can
  be stored on several Blossom servers (mirrors), and players fall back between
  them. See [Blossom storage](/media/blossom).
- **Uploads.** Nostube converts videos to web-friendly formats in the browser,
  uploads them to your Blossom servers and publishes the event to your relays.
  See [Uploads and transcoding](/media/uploads).
- **Relays.** Clients read video events from relays. nostu.be reads public
  relays; a Nostube Server runs its own relay and can keep everything on it.

## Which one do I need?

- **Watch and publish on public Nostr:** use [nostu.be](https://nostu.be). Nothing
  to install.
- **Run your own channel or a curated video site:** use [Nostube Server](/server/).
  It includes its own homepage and the Studio for uploads and settings.
- **Show Nostr videos on an existing website:** use the [embed player](/embed/).
- **Host the full nostu.be client yourself:** see [Self-hosting the web app](/web-app/).

[Self-hosting options](/guide/self-hosting) compares these in more detail, and the
[tour](/guide/tour) shows what they look like.
