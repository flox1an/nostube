import { describe, expect, it, vi } from 'vitest'
import { detectHlsSegmentFormat, isSameCastMedia, resolveCastSource } from './cast-source'

const HASH = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

describe('resolveCastSource', () => {
  it('hands the receiver the playing URL and mirrors of the same blob, never blob: URLs', () => {
    const source = resolveCastSource({
      urls: [
        'blob:https://nostu.be/123',
        `https://a.example/${HASH}.mp4`,
        `https://b.example/${OTHER}.mp4`,
        `https://c.example/${HASH}.mp4`,
        `https://d.example/${HASH}.mp4`,
        `https://e.example/${HASH}.mp4`,
      ],
      mime: 'video/mp4',
      thumbnailUrl: 'data:image/png;base64,xx',
    })
    expect(source).toMatchObject({
      url: `https://a.example/${HASH}.mp4`,
      fallbackUrls: [`https://c.example/${HASH}.mp4`, `https://d.example/${HASH}.mp4`],
      contentType: 'video/mp4',
      thumbnailUrl: undefined,
    })
  })

  it('casts HLS and MP4 only, by mime type or extension', () => {
    const resolve = (mime: string, url: string) =>
      resolveCastSource({ urls: [url], mime })?.contentType
    expect(resolve('application/x-mpegURL', 'https://a.example/x')).toBe(
      'application/vnd.apple.mpegurl'
    )
    expect(resolve('', 'https://a.example/master.m3u8?x=1')).toBe('application/vnd.apple.mpegurl')
    expect(resolve('', 'https://a.example/v.mp4')).toBe('video/mp4')
    expect(resolve('video/webm', 'https://a.example/v.webm')).toBeUndefined()
    expect(resolve('application/dash+xml', 'https://a.example/v.mpd')).toBeUndefined()
    expect(resolve('', 'https://a.example/v')).toBeUndefined()
  })

  it('skips URLs a receiver cannot reach on its own', () => {
    for (const url of [
      'http://localhost:3000/v.mp4',
      'http://127.0.0.1/v.mp4',
      'https://npub1x.fips/v.mp4',
      'https://user:pw@a.example/v.mp4',
      'data:video/mp4;base64,AAAA',
    ]) {
      expect(resolveCastSource({ urls: [url], mime: 'video/mp4' }), url).toBeUndefined()
    }
    // A LAN server is reachable from a TV on the same network.
    expect(
      resolveCastSource({ urls: ['http://192.168.1.5/v.mp4'], mime: 'video/mp4' })
    ).toBeTruthy()
  })
})

it('recognises the same blob on another server as the same media', () => {
  const urls = [`https://a.example/${HASH}.m3u8`]
  expect(isSameCastMedia(`https://z.example/${HASH}.m3u8`, urls)).toBe(true)
  expect(isSameCastMedia(`https://a.example/${OTHER}.m3u8`, urls)).toBe(false)
  expect(isSameCastMedia(undefined, urls)).toBe(false)
})

describe('detectHlsSegmentFormat', () => {
  const respond = (pages: Record<string, string>) =>
    vi.fn(async (url: string) => new Response(pages[url] ?? '', { status: pages[url] ? 200 : 404 }))

  it('follows the master playlist to a variant and finds fMP4 by its init segment', async () => {
    const fetchFn = respond({
      'https://a.example/m.m3u8': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv/720.m3u8\n',
      'https://a.example/v/720.m3u8': '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\ns0.m4s\n',
    })
    expect(await detectHlsSegmentFormat('https://a.example/m.m3u8', fetchFn as never)).toBe('fmp4')
  })

  it('reports TS for plain media playlists and nothing when unreadable', async () => {
    const fetchFn = respond({ 'https://a.example/t.m3u8': '#EXTM3U\n#EXTINF:6,\ns0.ts\n' })
    expect(await detectHlsSegmentFormat('https://a.example/t.m3u8', fetchFn as never)).toBe('ts')
    expect(await detectHlsSegmentFormat('https://a.example/x.m3u8', fetchFn as never)).toBe(
      undefined
    )
  })
})
