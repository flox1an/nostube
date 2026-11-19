import { describe, expect, it } from 'vitest'
import { getTranscodeRecommendation } from './dvm-utils'
import type { VideoVariant } from './video-processing'

const variant = (dimension: string): VideoVariant =>
  ({ url: 'https://example.com/a.mp4', dimension, mimeType: 'video/mp4' }) as VideoVariant

describe('getTranscodeRecommendation', () => {
  it('calls a 1280x720 file 720p, not 2K, and does not pitch smaller versions', () => {
    const { message } = getTranscodeRecommendation(variant('1280x720'))
    expect(message).not.toContain('2K')
    expect(message).not.toContain('Most viewers watch')
  })

  it('labels a portrait 1080x1920 file 1080p, not 2K', () => {
    expect(getTranscodeRecommendation(variant('1080x1920')).message).toContain('1080p')
  })

  it('pitches smaller versions for 1440p sources', () => {
    expect(getTranscodeRecommendation(variant('2560x1440')).message).toContain('2K')
  })
})
