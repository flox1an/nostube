import { describe, expect, it } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { parseLiveStream, safeLiveRelay } from './live-stream'

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
    expect(stream.relays).toEqual(['wss://relay.example/'])
    expect(safeLiveRelay('wss://relay.example')).toBe(true)
    expect(safeLiveRelay('wss://[::1]')).toBe(false)
  })

  it('ends stale live events and rejects future-dated or malformed ones', () => {
    expect(parseLiveStream(live([]), NOW)?.status).toBe('live')
    expect(parseLiveStream(live([], NOW - 3601), NOW)?.status).toBe('ended')
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
