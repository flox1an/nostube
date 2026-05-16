import { describe, expect, it } from 'vitest'
import {
  assessTranscodeNeed,
  assignMp4ResolutionCodecs,
  canUseOriginalHlsVariant,
  computeBrowserTranscodeVideoBitrate,
  computeTargetDimensions,
  defaultVariants,
  type TranscodeSourceMeta,
} from './video-transcode'

const baseMeta: TranscodeSourceMeta = {
  width: 1920,
  height: 1080,
  duration: 60,
  sizeMB: 500,
  bitrateMbps: 60,
  videoCodec: 'hvc1.1.6.L123.B0',
  mimeType: 'video/mp4',
}

describe('assessTranscodeNeed', () => {
  it('returns full for non-mp4 container', () => {
    expect(assessTranscodeNeed({ ...baseMeta, mimeType: 'video/webm' })).toBe('full')
  })

  it('returns full for AV1 codec', () => {
    expect(assessTranscodeNeed({ ...baseMeta, videoCodec: 'av01.0.04M.08' })).toBe('full')
  })

  it('returns full for height > 1080', () => {
    expect(assessTranscodeNeed({ ...baseMeta, height: 2160, bitrateMbps: 5 })).toBe('full')
  })

  it('returns bitrate when codec/container/res fine but bitrate > 8', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 10,
        mimeType: 'video/mp4',
        videoCodec: 'hvc1.1',
      })
    ).toBe('bitrate')
  })

  it('returns none when source is already optimised', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 8,
        videoCodec: 'hvc1.1',
        mimeType: 'video/mp4',
      })
    ).toBe('none')
  })

  it('returns none for AVC below 15 Mbps', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 8,
        videoCodec: 'avc1.64001F',
        mimeType: 'video/mp4',
      })
    ).toBe('none')
  })

  it('treats missing videoCodec as requiring full transcode', () => {
    expect(assessTranscodeNeed({ ...baseMeta, videoCodec: undefined })).toBe('full')
  })

  it('does not misclassify 1080p portrait video (1080x1920) as needing full transcode', () => {
    // Short side is 1080 — this is a standard 1080p portrait recording, not 4K
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        width: 1080,
        height: 1920,
        bitrateMbps: 8,
        videoCodec: 'hvc1.1',
        mimeType: 'video/mp4',
      })
    ).toBe('none')
  })
})

describe('canUseOriginalHlsVariant', () => {
  it('allows MP4 sources with AVC or HEVC video', () => {
    expect(canUseOriginalHlsVariant({ ...baseMeta, videoCodec: 'avc1.64001F' })).toBe(true)
    expect(canUseOriginalHlsVariant({ ...baseMeta, videoCodec: 'hvc1.1.6.L123.B0' })).toBe(true)
  })

  it('rejects unsupported containers and codecs', () => {
    expect(canUseOriginalHlsVariant({ ...baseMeta, mimeType: 'video/webm' })).toBe(false)
    expect(canUseOriginalHlsVariant({ ...baseMeta, videoCodec: 'av01.0.04M.08' })).toBe(false)
  })
})

describe('computeTargetDimensions', () => {
  it('scales landscape 1920x1080 to 1080p unchanged', () => {
    expect(computeTargetDimensions(1920, 1080, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it('scales landscape 3840x2160 down to 1080p', () => {
    expect(computeTargetDimensions(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it('does not upscale - 320x180 source with 1080p target stays at source', () => {
    expect(computeTargetDimensions(320, 180, 1080)).toEqual({ width: 320, height: 180 })
  })

  it('produces even dimensions', () => {
    const { width, height } = computeTargetDimensions(1280, 719, 480)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })

  it('handles portrait video (height > width)', () => {
    const { width, height } = computeTargetDimensions(1080, 1920, 1080)
    expect(width).toBe(1080)
    expect(height).toBe(1920)
  })
})

describe('computeBrowserTranscodeVideoBitrate', () => {
  it('uses balanced as the default browser transcode bitrate', () => {
    expect(computeBrowserTranscodeVideoBitrate(1280, 720)).toBe(3_000_000)
  })

  it('supports compact and high motion presets', () => {
    expect(computeBrowserTranscodeVideoBitrate(1280, 720, 'compact')).toBe(2_000_000)
    expect(computeBrowserTranscodeVideoBitrate(1280, 720, 'high-motion')).toBe(4_000_000)
  })

  it('lets a high-bitrate source pull balanced upward within the preset cap', () => {
    expect(
      computeBrowserTranscodeVideoBitrate(1280, 720, 'balanced', {
        width: 1280,
        height: 720,
        bitrateMbps: 10,
      })
    ).toBe(4_050_000)
  })

  it('does not let a low-bitrate source pull balanced below its floor', () => {
    expect(
      computeBrowserTranscodeVideoBitrate(1280, 720, 'balanced', {
        width: 1280,
        height: 720,
        bitrateMbps: 1.5,
      })
    ).toBe(3_000_000)
  })
})

describe('assignMp4ResolutionCodecs', () => {
  it('uses H.264 only for the lowest selected resolution when HEVC is supported', () => {
    const variants = assignMp4ResolutionCodecs(
      [
        { height: 1080, suggestedCodec: 'hevc' },
        { height: 720, suggestedCodec: 'hevc' },
        { height: 480, suggestedCodec: 'hevc' },
      ],
      true
    )

    expect(variants).toEqual([
      { height: 1080, suggestedCodec: 'hevc' },
      { height: 720, suggestedCodec: 'hevc' },
      { height: 480, suggestedCodec: 'avc' },
    ])
  })

  it('keeps every selected resolution on H.264 when HEVC is unavailable', () => {
    const variants = assignMp4ResolutionCodecs(
      [
        { height: 1080, suggestedCodec: 'hevc' },
        { height: 480, suggestedCodec: 'hevc' },
      ],
      false
    )

    expect(variants).toEqual([
      { height: 1080, suggestedCodec: 'avc' },
      { height: 480, suggestedCodec: 'avc' },
    ])
  })
})

describe('defaultVariants', () => {
  it('produces HEVC 1080p primary + AVC 480p fallback for 4K source', () => {
    const variants = defaultVariants({ ...baseMeta, width: 3840, height: 2160, bitrateMbps: 80 }, [
      'hevc',
      'avc',
    ])
    expect(variants).toHaveLength(2)
    expect(variants[0]).toMatchObject({ codec: 'hevc', targetHeight: 1080 })
    expect(variants[1]).toMatchObject({ codec: 'avc', targetHeight: 480 })
  })

  it('falls back to AVC primary when HEVC not supported', () => {
    const variants = defaultVariants({ ...baseMeta, bitrateMbps: 80 }, ['avc'])
    expect(variants[0].codec).toBe('avc')
  })

  it('skips all variants when source is already <=480p and optimised', () => {
    const variants = defaultVariants({ ...baseMeta, width: 640, height: 360, bitrateMbps: 5 }, [
      'hevc',
      'avc',
    ])
    expect(variants).toHaveLength(0)
  })

  it('omits primary when recommendation is none (source already good)', () => {
    const variants = defaultVariants(
      { ...baseMeta, bitrateMbps: 8, videoCodec: 'hvc1.1', mimeType: 'video/mp4' },
      ['hevc', 'avc']
    )
    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({ codec: 'avc', targetHeight: 480 })
  })
})
