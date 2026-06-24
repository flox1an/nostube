import { describe, expect, it } from 'vitest'
import { buildVideoViewEvent, normalizeViewSegments, VIDEO_VIEW_EVENT_KIND } from './view-events'

describe('view events', () => {
  it('builds a kind 22236 video view event template', () => {
    const built = buildVideoViewEvent({
      videoId: 'video-id',
      videoKind: 34236,
      videoPubkey: 'creator-pubkey',
      videoIdentifier: 'short-id',
      relayHint: 'wss://relay.example',
      viewerPubkey: 'viewer-pubkey',
      segments: [{ start: 0.2, end: 6.1 }],
      source: 'shorts',
      loopCount: 2,
      createdAt: 123,
    })

    expect(built).not.toBeNull()
    expect(built?.event).toEqual({
      kind: VIDEO_VIEW_EVENT_KIND,
      content: '',
      created_at: 123,
      tags: [
        ['a', '34236:creator-pubkey:short-id', 'wss://relay.example'],
        ['e', 'video-id', 'wss://relay.example'],
        ['viewed', '0', '7'],
        ['source', 'shorts'],
        ['loops', '2'],
        ['client', 'nostube'],
      ],
    })
  })

  it('filters sub-second and invalid viewed segments', () => {
    expect(
      normalizeViewSegments([
        { start: 4, end: 4.5 },
        { start: 8, end: 8 },
        { start: 12.1, end: 15.2 },
      ])
    ).toEqual([{ start: 12, end: 16 }])
  })

  it('suppresses self views', () => {
    expect(
      buildVideoViewEvent({
        videoId: 'video-id',
        videoKind: 34235,
        videoPubkey: 'same-pubkey',
        viewerPubkey: 'same-pubkey',
        segments: [{ start: 0, end: 5 }],
      })
    ).toBeNull()
  })
})
