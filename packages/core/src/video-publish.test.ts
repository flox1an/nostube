import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import { processEvent } from './video-event'
import { buildVideoEvent, videoKindFor, type VideoPublishInput } from './video-publish'

const PUBKEY = 'c'.repeat(64)
const HASH = 'a'.repeat(64)
const ORIGIN = 'https://videos.example.org'

const input = (patch: Partial<VideoPublishInput> = {}): VideoPublishInput => ({
  identifier: 'my-clip-1',
  title: ' My clip ',
  description: 'About the clip\nwith a second line',
  tags: ['travel', 'berlin'],
  video: {
    url: `${ORIGIN}/${HASH}.mp4`,
    sha256: HASH,
    size: 123_456,
    type: 'video/mp4',
    width: 1920,
    height: 1080,
    duration: 61.4,
  },
  thumbnail: {
    url: `${ORIGIN}/${'b'.repeat(64)}.jpg`,
    sha256: 'b'.repeat(64),
    size: 900,
    type: 'image/jpeg',
  },
  publishedAt: 1_700_000_000,
  ...patch,
})

/** What a relay hands the site: the template, signed (the id and signature are not read here). */
const asReceived = (template: ReturnType<typeof buildVideoEvent>) => ({
  ...template,
  id: 'e'.repeat(64),
  pubkey: PUBKEY,
  sig: 'f'.repeat(128),
})

describe('videoKindFor', () => {
  it('uses the vertical kind only for videos taller than wide', () => {
    expect(videoKindFor(1920, 1080)).toBe(34235)
    expect(videoKindFor(1080, 1080)).toBe(34235)
    expect(videoKindFor(1080, 1920)).toBe(34236)
  })
})

describe('a built video event, read the way the site reads it', () => {
  it('yields a playable video with its metadata', () => {
    const video = processEvent(asReceived(buildVideoEvent(input())), [
      ORIGIN.replace('https', 'wss'),
    ])!
    expect(video).toBeDefined()
    expect(video.title).toBe('My clip')
    expect(video.description).toBe('About the clip\nwith a second line')
    expect(video.urls).toEqual([`${ORIGIN}/${HASH}.mp4`])
    expect(video.videoVariants).toHaveLength(1)
    expect(video.videoVariants[0]).toMatchObject({
      hash: HASH,
      dimensions: '1920x1080',
      mimeType: 'video/mp4',
    })
    expect(video.duration).toBe(61)
    expect(video.images).toContain(`${ORIGIN}/${'b'.repeat(64)}.jpg`)
    expect(video.thumbnailVariants).toHaveLength(1)
    expect(video.tags).toEqual(['travel', 'berlin'])
    expect(video.contentWarning).toBeUndefined()
    expect(video.published_at).toBe(1_700_000_000)
  })

  it('has a link that decodes to the creator, the kind and the identifier', () => {
    const video = processEvent(asReceived(buildVideoEvent(input())), [])!
    const decoded = nip19.decode(video.link)
    expect(decoded.type).toBe('naddr')
    if (decoded.type === 'naddr') {
      expect(decoded.data).toMatchObject({ kind: 34235, pubkey: PUBKEY, identifier: 'my-clip-1' })
    }
  })

  it('marks a vertical video as a short', () => {
    const vertical = input({ video: { ...input().video, width: 1080, height: 1920 } })
    const video = processEvent(asReceived(buildVideoEvent(vertical)), [])!
    expect(video.kind).toBe(34236)
    expect(video.type).toBe('shorts')
  })

  it('carries a content warning, with NSFW as the default reason', () => {
    const withReason = processEvent(
      asReceived(buildVideoEvent(input({ contentWarning: 'nudity' }))),
      []
    )!
    expect(withReason.contentWarning).toBe('nudity')
    const bare = processEvent(asReceived(buildVideoEvent(input({ contentWarning: ' ' }))), [])!
    expect(bare.contentWarning).toBe('NSFW')
  })

  it('publishes subtitle tracks the player can read', () => {
    const subtitles = [
      { url: `${ORIGIN}/${'d'.repeat(64)}.vtt`, lang: 'en' },
      { url: `${ORIGIN}/${'f'.repeat(64)}.vtt`, lang: 'de' },
    ]
    const event = buildVideoEvent(input({ subtitles }))
    expect(event.tags).toContainEqual(['text-track', subtitles[0].url, 'en'])
    expect(processEvent(asReceived(event), [])!.textTracks).toEqual(subtitles)
  })

  it('works without a thumbnail and without a description', () => {
    const video = processEvent(
      asReceived(buildVideoEvent(input({ thumbnail: undefined, description: '', tags: [] }))),
      []
    )!
    expect(video.thumbnailVariants).toHaveLength(0)
    expect(video.urls).toHaveLength(1)
  })
})
