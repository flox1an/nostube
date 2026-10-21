# Self-hosting options

Everything in Nostube can be self-hosted. Pick by what you want to run:

| Goal | Run this | Includes | Guide |
|---|---|---|---|
| Your own video channel or curated video site | Nostube Server | Creator homepage, Studio (uploads, settings, moderation), Nostr relay, Blossom storage, embed player | [Getting started](/server/) |
| The same, on a home network without internet | Nostube Server with its own certificate authority | Everything above, offline | [HTTPS and networks](/server/tls) |
| A copy of the full nostu.be client | Web app (static files or Docker) | Feeds, shorts, playlists, uploads to public Blossom servers | [Self-hosting the web app](/web-app/) |
| Videos on an existing website | Embed player | iframe player, oEmbed link previews | [Embed](/embed/) |
| Only media storage | A Blossom server such as Almond | Blob storage for uploads and mirrors | [Blossom storage](/media/blossom) |

## Nostube Server or the web app?

Most creators want **Nostube Server**. It is one container that serves your
homepage, the Studio and the embed player, and stores your videos itself (on disk
or in an S3-compatible bucket). It can mirror your videos and events to public
relays and Blossom servers, so other Nostr clients see them too.

The **web app** is the general Nostr video client behind nostu.be. Hosting it gives
you your own copy of that client; it does not store videos itself and relies on
public relays and Blossom servers.

## Transcoding

You do not need a transcoding server. Uploads in nostu.be and in the Studio are
converted in the browser before they are uploaded. See
[Uploads and transcoding](/media/uploads).
