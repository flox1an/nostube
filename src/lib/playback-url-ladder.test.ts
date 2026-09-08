import { describe, expect, it } from 'vitest'
import { PlaybackUrlLadder } from './playback-url-ladder'
describe('PlaybackUrlLadder', () => {
  const createLadder = (
    urls = ['https://primary.example/video.mp4', 'https://fallback.example/video.mp4']
  ) =>
    new PlaybackUrlLadder({
      urls,
      blossomServers: [],
      mediaType: 'video',
    })
  it('advances after an active URL fails and does not retry it after refresh', () => {
    const ladder = createLadder()

    expect(ladder.currentUrl).toBe('https://primary.example/video.mp4')
    expect(ladder.onError()).toBe(true)
    expect(ladder.currentUrl).toBe('https://fallback.example/video.mp4')
    expect(ladder.failedUrls).toEqual(['https://primary.example/video.mp4'])

    ladder.refresh({
      urls: ['https://primary.example/video.mp4', 'https://fallback.example/video.mp4'],
      blossomServers: [],
      mediaType: 'video',
    })

    expect(ladder.currentUrl).toBe('https://fallback.example/video.mp4')
    expect(ladder.urls).toEqual([
      'https://primary.example/video.mp4',
      'https://fallback.example/video.mp4',
    ])
  })

  it('merges discovered candidates after generated candidates without duplication', () => {
    const ladder = createLadder(['https://primary.example/video.mp4'])

    expect(
      ladder.merge(
        ['https://primary.example/video.mp4', 'https://discovered.example/video.mp4'],
        'discovered'
      )
    ).toBe(true)
    expect(ladder.urls).toEqual([
      'https://primary.example/video.mp4',
      'https://discovered.example/video.mp4',
    ])
    expect(ladder.hasMore).toBe(true)
    expect(ladder.tryNext()).toBe(true)
    expect(ladder.currentUrl).toBe('https://discovered.example/video.mp4')
  })

  it('keeps segment failover candidates aligned with the shared failed URL set', () => {
    const segment =
      'https://media.example/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.m4s'
    const ladder = createLadder()

    expect(ladder.candidatesFor(segment)).toEqual([segment])
    ladder.onError(segment, 'segment')
    expect(ladder.candidatesFor(segment)).toEqual([])
  })

  it('offers collected ladder URLs to manifest retries after the original fails', () => {
    const sha = '3751b84f27234fc8ce3227d132b422f7e00f4a50c6cdc322080fed89a302d7dd'
    const original = `https://origin.example/${sha}.m3u8`
    const mirror = `https://mirror.example/${sha}.m3u8`
    const ladder = createLadder([original])

    // Discovery merges mirrors after hls.js already started loading the original
    ladder.merge([mirror], 'discovered')
    ladder.onError(original, 'manifest')

    expect(ladder.candidatesFor(original)).toEqual([mirror])
  })

  it('does not surface a failed original when discovery lands after the failure', () => {
    const original = 'https://primary.example/video.m3u8'
    const mirror = 'https://discovered.example/video.m3u8'
    const ladder = createLadder([original])

    ladder.onError(original, 'manifest')
    expect(ladder.currentUrl).toBeNull()

    ladder.merge([mirror], 'discovered')
    expect(ladder.currentUrl).toBe(mirror)
  })
})
