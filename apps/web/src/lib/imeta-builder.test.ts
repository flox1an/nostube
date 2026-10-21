import { describe, expect, it } from 'vitest'
import { buildImetaTag } from './imeta-builder'
import {
  createBlobPlacement,
  normalizeVideoVariantPlacement,
  type VideoVariant,
} from './video-processing'

const primaryBlob = {
  url: 'https://primary.example/video.mp4',
  sha256: 'a'.repeat(64),
  size: 100,
  uploaded: 1,
  type: 'video/mp4',
}

function makeVideo(placement: VideoVariant['placement']): VideoVariant {
  return {
    url: placement.primaryBlob?.url ?? placement.directUrl,
    mimeType: 'video/mp4',
    dimension: '1280x720',
    duration: 60,
    inputMethod: 'url',
    uploadedBlobs: [primaryBlob],
    mirroredBlobs: [],
    placement,
  }
}

describe('Thumbnail locations', () => {
  it('publishes each Blossom server and hash once, preserving the first URL and distinct images', () => {
    const hash = 'f'.repeat(64)
    const primary = `https://blossom.primal.net/${hash}.webp`
    const mirror = `https://nostr.download/${hash}.webp`
    const otherImage = `https://nostr.download/${'b'.repeat(64)}.webp`
    const external = 'https://images.example/thumbnail.webp'
    const tag = buildImetaTag({
      variant: makeVideo(createBlobPlacement({ primaryBlob })),
      thumbnailUrls: [
        primary,
        mirror,
        `https://nostr.download/${hash}`,
        `https://NOSTR.DOWNLOAD:443/${hash}`,
        primary,
        otherImage,
        external,
        external,
        'https://images.example/other.webp',
      ],
    })

    expect(tag.filter(field => field.startsWith('image '))).toEqual([
      `image ${primary}`,
      `image ${mirror}`,
      `image ${otherImage}`,
      `image ${external}`,
      'image https://images.example/other.webp',
    ])
  })
})

describe('Blob Placement', () => {
  it('publishes verified Blob locations before a direct URL fallback', () => {
    const mirrorBlob = { ...primaryBlob, url: 'https://mirror.example/video.mp4' }
    const directUrl = 'https://source.example/video.mp4'
    const tag = buildImetaTag({
      variant: makeVideo(
        createBlobPlacement({
          primaryBlob,
          candidateBlobs: [primaryBlob, mirrorBlob],
          directUrl,
        })
      ),
    })

    expect(tag).toContain(`url ${primaryBlob.url}`)
    expect(tag).toContain(`x ${primaryBlob.sha256}`)
    expect(tag).toContain(`fallback ${mirrorBlob.url}`)
    expect(tag).toContain(`fallback ${directUrl}`)
    expect(tag.indexOf(`fallback ${mirrorBlob.url}`)).toBeLessThan(
      tag.indexOf(`fallback ${directUrl}`)
    )
  })

  it('publishes only master-playlist locations for HLS', () => {
    const masterBlob = { ...primaryBlob, url: 'https://primary.example/master.m3u8' }
    const masterMirror = { ...masterBlob, url: 'https://mirror.example/master.m3u8' }
    const segmentBlob = {
      ...primaryBlob,
      url: 'https://primary.example/segment-000.ts',
      sha256: 'b'.repeat(64),
    }
    const tag = buildImetaTag({
      variant: {
        ...makeVideo(
          createBlobPlacement({
            primaryBlob: masterBlob,
            candidateBlobs: [masterBlob, masterMirror, segmentBlob],
          })
        ),
        mimeType: 'application/vnd.apple.mpegurl',
        uploadedBlobs: [masterBlob, segmentBlob],
        mirroredBlobs: [masterMirror],
      },
    })

    expect(tag).toContain(`url ${masterBlob.url}`)
    expect(tag).toContain(`fallback ${masterMirror.url}`)
    expect(tag).not.toContain(`fallback ${segmentBlob.url}`)
  })

  it('normalizes a legacy direct URL Draft without mutating it', () => {
    const legacy = {
      url: 'https://source.example/video.mp4',
      mimeType: 'video/mp4',
      dimension: '1280x720',
      duration: 60,
      inputMethod: 'url',
      uploadedBlobs: [],
      mirroredBlobs: [],
    } as unknown as VideoVariant

    const normalized = normalizeVideoVariantPlacement(legacy)

    expect(legacy.placement).toBeUndefined()
    expect(normalized.placement).toEqual({
      fallbackBlobs: [],
      directUrl: 'https://source.example/video.mp4',
    })
  })
})
