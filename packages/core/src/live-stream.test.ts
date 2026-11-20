import { describe, expect, it } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { liveEventFields, parseLiveStream, safeLiveRelay, updateLiveEvent } from './live-stream'

const AUTHOR = 'a'.repeat(64)
const HOST = 'b'.repeat(64)
const NOW = 1_800_000_000

const live = (tags: string[][], created_at = NOW - 60): NostrEvent => ({
  id: 'c'.repeat(64),
  sig: 'd'.repeat(128),
  kind: 30311,
  pubkey: AUTHOR,
  created_at,
  content: '',
  tags: [['d', 'show'], ['status', 'live'], ...tags],
})

describe('parseLiveStream', () => {
  it('keeps only public https HLS/MP4 playback and public wss relays', () => {
    const stream = parseLiveStream(
      live([
        ['streaming', 'javascript:alert(1)//x.m3u8'],
        ['streaming', 'http://cdn.example/live.m3u8'],
        ['streaming', 'https://user:pw@cdn.example/live.m3u8'],
        ['streaming', 'https://127.0.0.1/live.m3u8'],
        ['streaming', 'https://cdn.example/page.html'],
        ['streaming', 'https://cdn.example/live.m3u8?token=1'],
        ['recording', 'https://192.168.1.2/rec.mp4'],
        ['image', 'data:image/png;base64,AAAA'],
        ['thumb', 'https://api.example/thumb.webp?n=1'],
        [
          'relays',
          'wss://relay.example',
          'ws://relay.example',
          'wss://localhost',
          'wss://10.0.0.1',
          'nope',
        ],
      ]),
      NOW
    )!
    expect(stream.streamingUrls).toEqual(['https://cdn.example/live.m3u8?token=1'])
    expect(stream.recordingUrl).toBeUndefined()
    expect(stream.image).toBeUndefined()
    expect(stream.thumb).toBe('https://api.example/thumb.webp?n=1')
    expect(stream.relays).toEqual(['wss://relay.example/'])
    expect(safeLiveRelay('wss://relay.example')).toBe(true)
    expect(safeLiveRelay('wss://[::1]')).toBe(false)
  })

  it('trusts live for 2h, marks it stale up to 12h, ends it after; rejects future-dated or malformed ones', () => {
    const at = (age: number) => parseLiveStream(live([], NOW - age), NOW)
    expect(at(60)).toMatchObject({ status: 'live', stale: false })
    expect(at(2 * 3600 + 1)).toMatchObject({ status: 'live', stale: true })
    expect(at(12 * 3600 + 1)).toMatchObject({ status: 'ended', stale: false })
    expect(parseLiveStream(live([], NOW + 61), NOW)).toBeNull()
    expect(parseLiveStream({ ...live([]), pubkey: 'npub1x' }, NOW)).toBeNull()
    expect(
      parseLiveStream(
        {
          ...live([]),
          tags: [
            ['d', 'x'],
            ['status', 'bogus'],
          ],
        },
        NOW
      )?.status
    ).toBe('ended')
    expect(parseLiveStream({ ...live([]), tags: [['status', 'live']] }, NOW)).toBeNull()
  })

  it('addresses by d tag, matches Host role case-insensitively and preserves warnings', () => {
    const a = parseLiveStream(
      live([
        ['p', HOST, '', 'host'],
        ['content-warning', ' '],
      ]),
      NOW
    )!
    const b = parseLiveStream(
      {
        ...live([]),
        tags: [
          ['d', 'other'],
          ['p', HOST, '', 'Speaker'],
        ],
      },
      NOW
    )!
    expect(a.address).toBe(`30311:${AUTHOR}:show`)
    expect(b.address).toBe(`30311:${AUTHOR}:other`)
    expect(a.hostPubkey).toBe(HOST)
    expect(b.hostPubkey).toBe(AUTHOR)
    expect(b.status).toBe('ended')
    expect(a.contentWarning).toBe('NSFW')
    expect(b.contentWarning).toBeUndefined()
  })
})

describe('updateLiveEvent', () => {
  const original = live(
    [
      ['title', 'Old'],
      ['p', HOST, '', 'host'],
      ['relays', 'wss://relay.example'],
      ['t', 'bitcoin'],
      ['streaming', 'https://cdn.example/a.m3u8'],
      ['current_participants', '12'],
      ['starts', String(NOW - 600)],
    ],
    NOW - 5
  )

  it('changes only the edited fields and keeps every other tag', () => {
    const fields = { ...liveEventFields(original), status: 'planned' as const, title: ' New ' }
    const next = updateLiveEvent(original, fields, NOW)
    const tag = (name: string) => next.tags.filter(t => t[0] === name)
    expect(tag('status')).toEqual([['status', 'planned']])
    expect(tag('title')).toEqual([['title', 'New']])
    expect(tag('d')).toEqual([['d', 'show']])
    expect(tag('p')).toEqual([['p', HOST, '', 'host']])
    expect(tag('relays')).toEqual([['relays', 'wss://relay.example']])
    expect(tag('current_participants')).toEqual([['current_participants', '12']])
    expect(tag('t')).toEqual([['t', 'bitcoin']])
    expect(tag('starts')).toEqual([['starts', String(NOW - 600)]])
  })

  it('replaces the event on relays even when the clock is behind it', () => {
    const next = updateLiveEvent(original, liveEventFields(original), NOW - 100)
    expect(next.created_at).toBe(NOW - 4)
  })

  it('going live with a future or missing start time starts now', () => {
    const fields = { ...liveEventFields(original), status: 'live' as const }
    const start = (starts?: number) =>
      updateLiveEvent(original, { ...fields, starts }, NOW).tags.find(t => t[0] === 'starts')?.[1]
    expect(start(NOW + 3600)).toBe(String(NOW))
    expect(start(undefined)).toBe(String(NOW))
    expect(start(NOW - 600)).toBe(String(NOW - 600))
  })

  it('drops emptied fields and keeps a scheduled start for planned', () => {
    const fields = {
      ...liveEventFields(original),
      status: 'planned' as const,
      streaming: [''],
      starts: NOW + 3600,
      contentWarning: '',
    }
    const next = updateLiveEvent(original, fields, NOW)
    expect(next.tags.some(t => t[0] === 'streaming')).toBe(false)
    expect(next.tags.find(t => t[0] === 'starts')?.[1]).toBe(String(NOW + 3600))
    expect(next.tags.find(t => t[0] === 'content-warning')).toEqual(['content-warning', 'NSFW'])
  })
})
