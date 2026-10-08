import { describe, it, expect } from 'vitest'
import type { Event as NostrEvent } from 'nostr-tools'

import type { Video } from '@/hooks/usePlaylist'
import {
  evaluatePlaylistRefs,
  playlistHasUnsafeVideo,
  type VideoEventResolver,
} from './playlist-content-warning'

const NSFW_AUTHOR = 'a'.repeat(64)
const BLOCKED_AUTHOR = 'b'.repeat(64)
const CLEAN_AUTHOR = 'c'.repeat(64)

function event(overrides: Partial<NostrEvent> & { id: string; pubkey: string }): NostrEvent {
  return {
    id: overrides.id,
    pubkey: overrides.pubkey,
    kind: overrides.kind ?? 21,
    created_at: overrides.created_at ?? 0,
    content: overrides.content ?? '',
    sig: overrides.sig ?? '',
    tags: overrides.tags ?? [],
  }
}

function eventTag(id: string): Video {
  return { id, kind: 0, added_at: 0 }
}

function addressTag(kind: number, pubkey: string, identifier: string): Video {
  const address = `${kind}:${pubkey}:${identifier}`
  return { id: address, kind, added_at: 0, pubkey, address }
}

function makeStore(events: NostrEvent[]): VideoEventResolver {
  const byId = new Map(events.map(e => [e.id, e]))
  const byAddr = new Map<string, NostrEvent>()
  for (const e of events) {
    const d = e.tags.find(t => t[0] === 'd')?.[1]
    if (d !== undefined) byAddr.set(`${e.kind}:${e.pubkey}:${d}`, e)
  }
  return {
    getEvent: id => byId.get(id),
    getReplaceable: (kind, pubkey, identifier) => byAddr.get(`${kind}:${pubkey}:${identifier}`),
  }
}

describe('playlistHasUnsafeVideo', () => {
  it('returns false for an empty playlist', () => {
    expect(playlistHasUnsafeVideo([], makeStore([]), {})).toBe(false)
  })

  it('flags videos that the user has reported', () => {
    const videos = [eventTag('event-1')]
    expect(playlistHasUnsafeVideo(videos, makeStore([]), { reportedEventIds: ['event-1'] })).toBe(
      true
    )
  })

  it('flags e-tag videos by NSFW author when only the pubkey hint is known', () => {
    const videos: Video[] = [{ id: 'event-1', kind: 0, added_at: 0, pubkey: NSFW_AUTHOR }]
    expect(playlistHasUnsafeVideo(videos, makeStore([]), { nsfwPubkeys: [NSFW_AUTHOR] })).toBe(true)
  })

  it('flags e-tag videos by blocked author when only the pubkey hint is known', () => {
    const videos: Video[] = [{ id: 'event-1', kind: 0, added_at: 0, pubkey: BLOCKED_AUTHOR }]
    expect(
      playlistHasUnsafeVideo(videos, makeStore([]), { blockedPubkeys: [BLOCKED_AUTHOR] })
    ).toBe(true)
  })

  it('flags videos whose id appears in preset blockedEvents', () => {
    const videos = [eventTag('event-1')]
    expect(playlistHasUnsafeVideo(videos, makeStore([]), { blockedEvents: ['event-1'] })).toBe(true)
  })

  it('flags address-tag videos by NSFW authors without loading the event', () => {
    const videos = [addressTag(34235, NSFW_AUTHOR, 'video-d')]
    expect(playlistHasUnsafeVideo(videos, makeStore([]), { nsfwPubkeys: [NSFW_AUTHOR] })).toBe(true)
  })

  it('flags address-tag videos by blocked authors without loading the event', () => {
    const videos = [addressTag(34235, BLOCKED_AUTHOR, 'video-d')]
    expect(
      playlistHasUnsafeVideo(videos, makeStore([]), { blockedPubkeys: [BLOCKED_AUTHOR] })
    ).toBe(true)
  })

  it('flags event-tag videos resolved to an NSFW author', () => {
    const videos = [eventTag('event-1')]
    const store = makeStore([event({ id: 'event-1', pubkey: NSFW_AUTHOR })])
    expect(playlistHasUnsafeVideo(videos, store, { nsfwPubkeys: [NSFW_AUTHOR] })).toBe(true)
  })

  it('flags event-tag videos resolved to an event with a content-warning tag', () => {
    const videos = [eventTag('event-1')]
    const store = makeStore([
      event({
        id: 'event-1',
        pubkey: CLEAN_AUTHOR,
        tags: [['content-warning', 'NSFW']],
      }),
    ])
    expect(playlistHasUnsafeVideo(videos, store, {})).toBe(true)
  })

  it('flags address-tag videos resolved to an event with a content-warning tag', () => {
    const videos = [addressTag(34235, CLEAN_AUTHOR, 'video-d')]
    const store = makeStore([
      event({
        id: 'event-1',
        pubkey: CLEAN_AUTHOR,
        kind: 34235,
        tags: [
          ['d', 'video-d'],
          ['content-warning', 'NSFW'],
        ],
      }),
    ])
    expect(playlistHasUnsafeVideo(videos, store, {})).toBe(true)
  })

  it('does not flag event-tag videos whose event is not loaded yet', () => {
    const videos = [eventTag('event-1')]
    expect(
      playlistHasUnsafeVideo(videos, makeStore([]), {
        nsfwPubkeys: [NSFW_AUTHOR],
        blockedPubkeys: [BLOCKED_AUTHOR],
      })
    ).toBe(false)
  })

  it('returns false when every referenced video is clean', () => {
    const videos = [eventTag('event-1'), addressTag(34235, CLEAN_AUTHOR, 'video-d')]
    const store = makeStore([
      event({ id: 'event-1', pubkey: CLEAN_AUTHOR }),
      event({
        id: 'event-2',
        pubkey: CLEAN_AUTHOR,
        kind: 34235,
        tags: [['d', 'video-d']],
      }),
    ])
    expect(
      playlistHasUnsafeVideo(videos, store, {
        nsfwPubkeys: [NSFW_AUTHOR],
        blockedPubkeys: [BLOCKED_AUTHOR],
      })
    ).toBe(false)
  })
})

describe('evaluatePlaylistRefs', () => {
  it('returns clean for an empty playlist', () => {
    expect(evaluatePlaylistRefs([], makeStore([]), {})).toEqual({
      hasUnsafe: false,
      unresolved: [],
    })
  })

  it('reports hasUnsafe when a video pubkey is in nsfwPubkeys', () => {
    const videos: Video[] = [{ id: 'event-1', kind: 0, added_at: 0, pubkey: NSFW_AUTHOR }]
    const result = evaluatePlaylistRefs(videos, makeStore([]), { nsfwPubkeys: [NSFW_AUTHOR] })
    expect(result.hasUnsafe).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it('reports hasUnsafe for a resolved content-warning event', () => {
    const videos = [eventTag('event-1')]
    const store = makeStore([
      event({ id: 'event-1', pubkey: CLEAN_AUTHOR, tags: [['content-warning', 'NSFW']] }),
    ])
    expect(evaluatePlaylistRefs(videos, store, {}).hasUnsafe).toBe(true)
  })

  it('reports unresolved for an e-tag whose event is missing and pubkey unknown', () => {
    const videos: Video[] = [{ id: 'event-1', kind: 0, added_at: 0, relayHint: 'wss://relay.io' }]
    const result = evaluatePlaylistRefs(videos, makeStore([]), {})
    expect(result.hasUnsafe).toBe(false)
    expect(result.unresolved).toEqual([
      { id: 'event-1', isAddress: false, relayHint: 'wss://relay.io' },
    ])
  })

  it('reports unresolved for an a-tag whose replaceable event is missing', () => {
    const videos = [addressTag(34235, CLEAN_AUTHOR, 'video-d')]
    const result = evaluatePlaylistRefs(videos, makeStore([]), {})
    expect(result.hasUnsafe).toBe(false)
    expect(result.unresolved).toEqual([
      {
        id: `34235:${CLEAN_AUTHOR}:video-d`,
        isAddress: true,
        address: { kind: 34235, pubkey: CLEAN_AUTHOR, identifier: 'video-d' },
        relayHint: undefined,
      },
    ])
  })

  it('short-circuits on the first unsafe ref and ignores later unresolved ones', () => {
    const videos: Video[] = [
      { id: 'event-unsafe', kind: 0, added_at: 0, pubkey: NSFW_AUTHOR },
      { id: 'event-missing', kind: 0, added_at: 0 },
    ]
    const result = evaluatePlaylistRefs(videos, makeStore([]), { nsfwPubkeys: [NSFW_AUTHOR] })
    expect(result.hasUnsafe).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it('reports clean when every ref resolves to a safe event', () => {
    const videos = [eventTag('event-1'), addressTag(34235, CLEAN_AUTHOR, 'video-d')]
    const store = makeStore([
      event({ id: 'event-1', pubkey: CLEAN_AUTHOR }),
      event({ id: 'event-2', pubkey: CLEAN_AUTHOR, kind: 34235, tags: [['d', 'video-d']] }),
    ])
    const result = evaluatePlaylistRefs(videos, store, {
      nsfwPubkeys: [NSFW_AUTHOR],
      blockedPubkeys: [BLOCKED_AUTHOR],
    })
    expect(result.hasUnsafe).toBe(false)
    expect(result.unresolved).toEqual([])
  })

  it('collects multiple unresolved refs in declaration order', () => {
    const videos: Video[] = [
      { id: 'e1', kind: 0, added_at: 0 },
      addressTag(34235, CLEAN_AUTHOR, 'video-d'),
      { id: 'e2', kind: 0, added_at: 0, relayHint: 'wss://r.example' },
    ]
    const result = evaluatePlaylistRefs(videos, makeStore([]), {})
    expect(result.hasUnsafe).toBe(false)
    expect(result.unresolved.map(r => r.id)).toEqual(['e1', `34235:${CLEAN_AUTHOR}:video-d`, 'e2'])
  })
})
