# NosTube — Domain Glossary

## Blob

A media file (video, image, thumbnail) identified by its SHA256 hash. Blobs are content-addressed: the same bytes produce the same hash regardless of which server hosts the file. See also: Blossom Server.

## Blob Placement

The publishable placement of one Blob: its primary verified location, same-hash Blossom Mirror locations, and an optional direct source URL retained as a final fallback. For HLS, Blob Placement applies to the master playlist only; segment and variant playlist Blobs remain lifecycle data for upload, mirroring, and deletion.

## Blossom Server

A server implementing the Blossom protocol (BUD-01/BUD-03) for blob storage. Clients upload blobs and receive a URL; any Blossom server can host any blob, enabling third-party mirroring. A user's server list is published in a Nostr kind 10063 event.

## Video Event

A Nostr addressable event (kind 34235 for landscape, kind 34236 for portrait/shorts) representing a published video, as defined by NIP-71. The event's `imeta` tags carry media URLs, hashes, codec info, and thumbnail references. A Video Event is permanent once published; changes require replacing the event via its `d` tag.

## Short Video

A Video Event of kind 34236, used for portrait-orientation video (height > width). Displayed in the vertical shorts feed. Distinct from a landscape Video Event (34235) so clients and relays can filter by consumption context.

## imeta tag

A structured tag inside a Video Event that describes one media variant: URL, SHA256 hash, MIME type, dimensions, codec, bitrate, and optional thumbnail. Multiple imeta tags in one event represent alternative variants (different resolutions or codecs).

## Draft

An unpublished Video Event under construction. Drafts persist to localStorage and survive page reloads. A Draft transitions through states (editing → transcoding → uploading → published) before becoming a Video Event.

## DVM (Data Vending Machine)

A Nostr-native compute service. NosTube uses DVMs (kind 5207 request / 6207 result) as an optional server-side transcoding fallback when browser-based transcoding is unavailable or unsuitable.

## Blossom Mirror

The act of re-uploading an existing blob (by hash) to an additional Blossom Server. Mirroring adds redundancy: multiple URLs pointing to the same verified content appear in the Video Event's imeta tags.

## Preset

A curator-defined content configuration: a set of relays and filter rules that shape the video feed for a given audience. A user can switch between their personal relay configuration and a Preset.

## Transcoding Tier

One level in the three-tier encoding pipeline: (1) local browser transcoding via WebCodecs, (2) remote DVM transcoding, (3) direct upload fallback. The pipeline attempts each tier in order.

## Trust Score

A reputation signal derived from a user's Nostr social graph. The Trust Score gates NSFW content visibility: users with low or no trust score cannot override the NSFW filter.

## Desktop Host

A Tauri application that packages NosTube's existing web interface in a system WebView and exposes only capability-scoped native operations to it. It is the security boundary for local services, storage, and signer access; the web interface remains unprivileged.

## FIPS Network

The Free Internetworking Peering System: an externally installed, self-organizing encrypted mesh. In the first Desktop Host scope it is an optional prerequisite; when available, NosTube may reach FIPS-resolved IPv6 services as ordinary HTTP origins from the WebView where the media API permits it.

## Local Blossom Cache

A Host-managed Blossom caching server on `127.0.0.1:24242`, started, health-checked, and stopped by the Desktop Host and selected through the existing cache-server configuration. It serves content-addressed Blobs locally, uses `xs` source hints and `as` author hints to retrieve a missing Blob, and is the authoritative local storage boundary for cached video data. Its interoperability contract is the [Local Blossom Cache specification](https://github.com/hzrd149/blossom/blob/master/implementations/local-blossom-cache.md).

## Almond Sidecar

The bundled Almond process that implements the Local Blossom Cache for a Desktop Host. It is distributed inside the desktop installer, bound to `127.0.0.1:24242`, and lifecycle-managed by the Desktop Host; it is not a separately installed application.
