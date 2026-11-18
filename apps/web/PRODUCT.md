# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Nostr newcomers** coming from YouTube and similar platforms. They know neither Blossom nor relays and simply want to share a video. Primary audience for the upload flow (confirmed 2026-11-18).
- **Nostr-native occasional uploaders.** They know relays and signers and want the upload done quickly. Primary audience (confirmed).
- **Creators / power users** who control HLS, variants, servers, scheduling and relays. Secondary for the default path, but every capability they use today must stay reachable.

## Product Purpose

nostube (nostu.be) is a video platform on Nostr. Videos are stored as files on Blossom servers and published as signed NIP-71 events (kind 34235 landscape, 34236 portrait/shorts) to relays. Success for uploading: a newcomer goes from "I have a file" to "my video is online" without having to learn Nostr infrastructure first.

## Positioning

No central nostube storage: the uploader's own key signs every event and every Blossom upload authorization, and the files live on Blossom servers the uploader chooses. Transcoding to web-friendly MP4/HLS runs in the uploader's browser (ADR 0002).

## Operating Context

- Upload runs in the browser tab: browser transcoding, chunked Blossom upload, mirroring to backup servers, then publishing to relays. Closing the tab stops processing; in-app navigation does not.
- Signing goes through the user's signer (browser extension, remote signer, local key). Blossom uploads already request signatures during processing; the video event can only be signed once file hashes and URLs are known.
- Drafts persist locally and sync over Nostr; a video shared into the installed PWA lands in a fresh draft.

## Capabilities and Constraints

- nostube controls **no** storage server. Large video files need a Blossom server someone pays for (storage and bandwidth), so server choice is a real user decision, not something the app can silently own. Free public servers have size limits and no guarantees.
- A user's NIP-63 / kind 10063 server list is synced into the app config when present.
- Existing power features that must stay: output format (MP4/HLS), resolution set, quality preset, keep original, HEVC, additional variants, DVM transcoding, subtitles, scheduled publish, expiration, content warning, people and origin attribution, relay selection, event preview, drafts with delete-with-media.
- Decided (2026-11-18): details and publishing share one page with a live preview and a sticky publish column; a remembered **Show all options** switch (Pro mode) reveals relay selection, the event preview and opens every optional section. The separate Review step is gone. The upload dock / batch concept is dropped.

## Product Principles

1. Ask only what the user can actually decide; derive the rest from the file and their Nostr profile.
2. Be honest about decentralised trade-offs (who stores the file, what it costs, what may disappear) in plain words, never in protocol jargon.
3. Waiting is not a step: users describe their video while it processes.
4. Power stays one click away and remembers the user's preference; it never sits in the newcomer's path.

## Accessibility & Inclusion

Localised UI (en, de, fr, es, ja and more via i18next); copy must survive longer translations.
