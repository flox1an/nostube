import { describe, expect, it } from 'vitest'
import { needsLowerResolutionVariants } from './video-transformation-detection'

import type { VideoVariant } from '@/utils/video-event'

describe('needsLowerResolutionVariants', () => {
  it('treats a lone MP4 with unknown dimensions as needing contributed resolutions', () => {
    const variants: VideoVariant[] = [
      {
        url: 'https://relay.towardsliberty.com/0314768bab8e708cd58f0c7057e781e99f71ccde7781e5f6ad988c6d14763db1.mp4',
        hash: '0314768bab8e708cd58f0c7057e781e99f71ccde7781e5f6ad988c6d14763db1',
        mimeType: 'video/mp4',
        mediaType: 'video',
        fallbackUrls: [],
      },
    ]

    expect(needsLowerResolutionVariants(variants)).toBe(true)
  })
})
