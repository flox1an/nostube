import { describe, expect, it } from 'vitest'
import { fitWithin, inspectVideo, thumbnailTime } from './probe-video'

describe('thumbnailTime', () => {
  it('is a second in, a tenth of a short clip, and never negative', () => {
    expect(thumbnailTime(120)).toBe(1)
    expect(thumbnailTime(5)).toBe(0.5)
    expect(thumbnailTime(0)).toBe(0)
    expect(thumbnailTime(-3)).toBe(0)
  })
})

describe('fitWithin', () => {
  it('shrinks to the width and keeps the shape, never enlarges', () => {
    expect(fitWithin(1920, 1080, 640)).toEqual([640, 360])
    expect(fitWithin(1080, 1920, 640)).toEqual([640, 1138])
    expect(fitWithin(320, 240, 640)).toEqual([320, 240])
  })
})

describe('inspectVideo', () => {
  it('says so when a file needs converting and the browser has no WebCodecs', async () => {
    await expect(
      inspectVideo(new File(['x'], 'clip.mov', { type: 'video/quicktime' }))
    ).rejects.toThrow(/cannot convert videos \(no WebCodecs\)/)
  })
})
