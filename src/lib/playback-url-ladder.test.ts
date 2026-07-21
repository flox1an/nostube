import { describe, expect, it } from 'vitest'
import { PlaybackUrlLadder } from './playback-url-ladder'

describe('PlaybackUrlLadder', () => {
  const createLadder = (urls = ['https://primary.example/video.mp4', 'https://fallback.example/video.mp4']) =>
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
})
