import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventTemplate } from 'nostr-tools'
import { mirrorMedia } from './mirror-media'

const video = 'a'.repeat(64)
const thumbnail = 'b'.repeat(64)
const subtitle = 'c'.repeat(64)
const template: EventTemplate = {
  kind: 34235,
  created_at: 100,
  content: 'A video',
  tags: [
    ['d', 'video'],
    [
      'imeta',
      `url https://studio.local/${video}.mp4`,
      `image https://studio.local/${thumbnail}.png`,
      `x ${video}`,
      'dim 1920x1080',
    ],
    [
      'imeta',
      `url https://studio.local/${video}.mp4`,
      `fallback https://studio.local/${video}.mp4`,
      'm video/mp4',
    ],
    ['thumb', `https://studio.local/${thumbnail}.png`],
    ['text-track', `https://studio.local/${subtitle}.vtt`, 'de', 'Deutsch'],
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('public event media', () => {
  it('waits for every output, image and subtitle then replaces all local URLs', async () => {
    vi.useFakeTimers()
    const videoUrl = `https://mirror.example/${video}.mp4`
    const thumbnailUrl = `https://mirror.example/${thumbnail}.png`
    const subtitleUrl = `https://mirror.example/${subtitle}.vtt`
    let complete = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ready: complete,
              urls: complete
                ? { [video]: videoUrl, [thumbnail]: thumbnailUrl, [subtitle]: subtitleUrl }
                : { [video]: videoUrl },
              error: null,
            })
          )
      )
    )
    let published = false
    const result = mirrorMedia(template, () => {}).then(event => {
      published = true
      return event
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(published).toBe(false)
    complete = true
    await vi.advanceTimersByTimeAsync(3000)
    const event = await result
    expect(event.tags).toEqual([
      ['d', 'video'],
      ['imeta', `url ${videoUrl}`, `image ${thumbnailUrl}`, `x ${video}`, 'dim 1920x1080'],
      ['imeta', `url ${videoUrl}`, `fallback ${videoUrl}`, 'm video/mp4'],
      ['thumb', thumbnailUrl],
      ['text-track', subtitleUrl, 'de', 'Deutsch'],
    ])
    expect(JSON.stringify(event)).not.toContain('studio.local')
  })

  it('refuses media without a content hash instead of publishing an unreachable URL', async () => {
    await expect(
      mirrorMedia({ ...template, tags: [['url', 'https://studio.local/video.mp4']] }, () => {})
    ).rejects.toThrow()
  })
})
