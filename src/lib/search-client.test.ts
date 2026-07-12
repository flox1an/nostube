import { describe, expect, it } from 'vitest'
import { mapExternalHitToVideoEvent } from './search-client'

describe('mapExternalHitToVideoEvent', () => {
  it('does not expose local media URLs returned by the search service', () => {
    const video = mapExternalHitToVideoEvent({
      event_id: 'b'.repeat(64),
      title: 'Local source',
      content_preview: '',
      pubkey: 'a'.repeat(64),
      kind: 34235,
      created_at: 1,
      thumbnail: 'http://127.0.0.1:3000/thumb.jpeg',
      videoUrl: 'http://127.0.0.1:3000/video.mp4',
      tags: [],
    })

    expect(video).toMatchObject({
      images: [],
      urls: [],
      videoVariants: [],
      thumbnailVariants: [],
      mediaSourceStatus: 'unavailable',
      blockedEventMediaUrlCount: 2,
    })
  })
})
