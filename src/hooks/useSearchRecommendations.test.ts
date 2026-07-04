import { describe, expect, it } from 'vitest'
import { filterRecommendationsForSettings } from './useSearchRecommendations'
import type { RecommendationVideo } from '@/types/recommendation'

const createRecommendation = (
  overrides: Partial<RecommendationVideo> = {}
): RecommendationVideo => ({
  id: 'video1',
  kind: 21,
  pubkey: 'pubkey1',
  title: 'Recommendation',
  images: [],
  urls: ['https://example.com/video.mp4'],
  duration: 120,
  created_at: 1234567890,
  link: 'video1',
  type: 'videos',
  mediaType: 'video',
  contentWarning: null,
  thumbnailVariants: [],
  recommendationScore: 1,
  ...overrides,
})

describe('filterRecommendationsForSettings', () => {
  it('removes YouTube recommendations when YouTube content is disabled', () => {
    const youtubeOnly = createRecommendation({
      id: 'youtube-only',
      urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    })
    const nativeVideo = createRecommendation({ id: 'native-video' })

    expect(
      filterRecommendationsForSettings([youtubeOnly, nativeVideo], { includeYouTube: false })
    ).toEqual([nativeVideo])
  })

  it('keeps YouTube recommendations when YouTube content is enabled', () => {
    const youtubeOnly = createRecommendation({
      id: 'youtube-only',
      urls: ['https://youtu.be/dQw4w9WgXcQ'],
    })

    expect(filterRecommendationsForSettings([youtubeOnly], { includeYouTube: true })).toEqual([
      youtubeOnly,
    ])
  })
})
