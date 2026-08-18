# Video Moments / Virtual Clips Design

**Date:** 2026-07-31  
**Status:** Proposed  
**Scope:** Product and technical specification for publishing and displaying video Moments as virtual clips.

## Decision

Add **Moments** as virtual clips of existing Nostr video events. A Moment never copies, reuploads, or republishes the original video media. It references the canonical source video and records a precise time interval, optional creator comment, optional topics, source attribution, and optional preview thumbnail.

Use [NIP-84 highlight events](https://github.com/nostr-protocol/nips/blob/master/84.md) (`kind:9802`) as the compatibility envelope. NIP-84 explicitly permits empty content for non-text media highlights and recommends `e`/`a` references for Nostr sources plus `r` references for URL sources. For video time ranges, use the [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) `segment` tag shape on the `kind:9802` event as a **Nostube extension**. This is not an established interoperable standard; other clients may see only a generic highlight with a source reference.

Public discussion of a Moment uses [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) comments (`kind:1111`) that reference the Moment event. Moment discussion is scoped under the Moment, not mixed into the original video's primary discussion.

## Product Model

A Moment contains:

- canonical source reference: exactly one `e` tag for an immutable video event, or exactly one `a` tag for an addressable video event;
- exact start and end time;
- optional creator comment;
- optional hashtags/topics;
- prominent source and author attribution;
- optional thumbnail preview artifact stored separately and referenced by URL.

A Moment does **not** contain copied alternative video URLs, copied HLS playlists, copied fallback URLs, or canonical video metadata from the original event. The original video remains the only canonical media source.

## Event Model

### Moment event

```json
{
  "kind": 9802,
  "content": "",
  "tags": [
    ["a", "34235:<source-author-pubkey>:<source-d>", "wss://relay.example"],
    ["p", "<source-author-pubkey>", "wss://relay.example", "author"],
    ["segment", "00:01:12.500", "00:01:24.250", "", "https://cdn.example/<thumb>.jpg"],
    ["comment", "This is the key exchange in the demo."],
    ["t", "nostr"],
    ["t", "demo"],
    ["r", "https://nostube.example/v/<source-naddr>?t=72.5&end=84.25", "source"]
  ]
}
```

For immutable source videos (`kind:21` or `kind:22`), replace the `a` tag with:

```json
["e", "<source-event-id>", "wss://relay.example"]
```

Rules:

- `content` should be empty for video Moments. Put the creator's optional text in `["comment", "..."]`.
- `segment` follows the NIP-71 field order: start timestamp, end timestamp, title, thumbnail URL. Nostube treats the title field as optional and should keep it empty unless a future product need appears.
- Start and end timestamps use `HH:MM:SS.sss`; the internal model may also store seconds as numbers after parsing.
- `end` must be greater than `start`.
- `r` is a deep-link fallback to the original in Nostube at the selected interval. It is a navigation fallback, not a media URL.
- The thumbnail URL, when present, points to a separate preview artifact such as a Blossom-hosted image. It is presentation data only.

### Reply event

Top-level public replies to a Moment are NIP-22 `kind:1111` comments scoped to the Moment event:

```json
{
  "kind": 1111,
  "content": "That timestamp explains the whole idea.",
  "tags": [
    ["E", "<moment-event-id>", "wss://relay.example", "<moment-author-pubkey>"],
    ["K", "9802"],
    ["P", "<moment-author-pubkey>", "wss://relay.example"],
    ["e", "<moment-event-id>", "wss://relay.example", "<moment-author-pubkey>"],
    ["k", "9802"],
    ["p", "<moment-author-pubkey>", "wss://relay.example"]
  ]
}
```

Nested replies follow the existing NIP-22 parent/root split: uppercase tags keep the root Moment scope, lowercase tags point to the parent comment.

## UX

### Authoring

Creation happens in a dedicated Clip/Moment composer dialog. Do not put all authoring controls into the normal player timeline.

Composer requirements:

- opens from a restrained player or video-info action such as "Create Moment";
- uses the current playback time as the initial start point;
- provides a larger, zoomable timeline for selecting start and end;
- supports direct numeric start/end controls with timecode precision;
- previews playback of only the selected interval while still using the original media;
- includes optional creator comment and optional tags/topics;
- offers thumbnail selection/generation from a frame at or near the start time;
- warns before publishing that the Moment is public;
- publishes the signed `kind:9802` event to the user's write relays plus source-context relays.

### Discovery and Display

Discovery is separate from authoring. Do not render every published Moment as colored markers on the main playback timeline; that would overload playback and make popular videos noisy.

On the original video page:

- show a restrained Moments entry point/count near the player or actions row;
- show a Moments section below the original video description and before or near comments;
- render published Moments as cards with thumbnail, timecode range, creator comment, tags, source attribution, and reply count;
- card click seeks the original player to the Moment start and can optionally stop or visually indicate the end;
- always keep a full-video action visible from every Moment card.

Inside a Moment card/detail:

- show source-first attribution: original title, original author, and a link to the full video;
- show creator attribution separately from source attribution;
- show public replies under that Moment only;
- do not merge Moment replies into the original video's primary discussion.

## Fetching and Relay Strategy

Fetch Moments for a video with filters matching the source reference:

```ts
const immutableMomentFilter = { kinds: [9802], '#e': [video.id] }
const addressableMomentFilter = {
  kinds: [9802],
  '#a': [`${video.kind}:${video.pubkey}:${video.identifier}`],
}
```

Implementation should follow existing Applesauce patterns:

- use the singleton `EventStore` and `RelayPool`;
- use `createTimelineLoader` for relay queries;
- observe via `useObservableMemo`/`use$` so subscriptions dispose with components;
- cache Moment events in the shared event store;
- query read relays from the source event context plus user/config relays.

Suggested implementation surfaces:

- `src/hooks/useVideoMoments.ts` for source-scoped Moment loading and validation;
- `src/hooks/useMomentReplies.ts` for NIP-22 replies scoped to one Moment;
- `src/components/MomentComposerDialog.tsx`;
- `src/components/VideoMomentsSection.tsx`;
- `src/components/MomentCard.tsx`;
- integration in `src/components/VideoInfoSection.tsx` and player action controls.

## Validation

Moment parsing must reject or hide invalid events:

- missing source `e`/`a` tag;
- both `e` and `a` source tags present;
- missing `segment`;
- malformed timestamp;
- `end <= start`;
- duration above the configured max;
- source reference does not match the current video page;
- thumbnail URL fails the existing event URL policy for images.

MVP max duration: 120 seconds and no more than 20% of the source duration when duration is known. If duration is unknown, enforce only the absolute 120-second limit.

## Guardrails

- Source-first presentation: every Moment must prominently name and link the original video and author.
- Full-video action always present: users must never be trapped in the clipped context.
- Max duration prevents near-whole-video repackaging.
- Publishing warning must say the Moment and its comment are public Nostr events.
- Thumbnail generation may upload an image to Blossom; explain storage, bandwidth, privacy, and copyright implications before upload.
- Generated thumbnails should avoid capturing private or sensitive frames without explicit user action.
- Clients should apply the same moderation/report/mute policy to Moment replies as to video comments.
- Clients may hide Moments from muted users, reported users, or invalid source references.

## MVP Scope

MVP includes:

- create Moment from a video page for NIP-71 video sources;
- publish `kind:9802` with source `e` or `a`, `segment`, optional `comment`, optional `t`, optional thumbnail URL, and `r` deep link;
- generate/select one thumbnail preview from the original video frame and upload it as a separate Blossom image when requested;
- list valid Moments below the original video description as cards;
- show Moment reply count;
- open a Moment card by seeking the original player to the start time;
- publish and display NIP-22 replies under a Moment.

## Non-Goals

- Copying, trimming, transcoding, reuploading, or mirroring video media for a Moment.
- Publishing alternate video URLs, HLS playlists, or copied canonical metadata inside the Moment event.
- Timeline marker lanes for every public Moment on the main player.
- Private/unlisted Moments.
- Monetization, zaps, rankings, or recommendation algorithms for Moments.
- Cross-client standardization of `segment` on `kind:9802`.
- Editing Moments after publication. A correction is a new Moment event in MVP.

## Acceptance Criteria

- A user can create a valid Moment with start/end, optional comment, optional tags, and optional thumbnail without uploading any video media.
- Published Moment events use `kind:9802`, one canonical source `e` or `a`, one valid `segment`, and no copied media variants.
- The source video page shows an aggregate Moments count and Moment cards below the description.
- Main playback timeline remains focused on playback and is not filled with public Moment markers.
- Clicking a Moment seeks the original player to the Moment start and keeps source attribution visible.
- Replies to a Moment are `kind:1111` NIP-22 events referencing the Moment and render under that Moment only.
- Invalid or overlong Moments do not render as normal cards.
- Thumbnail preview failure does not block publishing a text/time-only Moment.

## Open Decisions

- Final route format for Moment detail pages, if any. MVP can use source video routes plus query parameters.
- Whether the composer should default to a fixed duration window such as 15 seconds or require the user to set the end manually.
- Whether authoring should be available on shorts in MVP or limited to normal video pages first.
- Exact public copy for the publishing and thumbnail-upload warnings.
- Whether to stop playback automatically at `end` after opening a Moment or simply show the selected range.

## Verification Plan

- Unit-test Moment tag parsing, timestamp normalization, source matching, max-duration validation, and thumbnail URL validation.
- Unit-test NIP-22 reply filters for immutable and addressable Moment references.
- Component-test the composer validation states and publish payload assembly.
- Component-test Moment card rendering with and without thumbnail/comment/tags.
- Manual-test video page flow: create Moment, publish, reload, count appears, card seeks player, full-video action remains visible.
- Manual-test reply isolation: reply under a Moment and confirm it does not appear in the original video's primary comments.
