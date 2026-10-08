import { describe, it, expect } from 'vitest'
import { filterVideoSuggestions } from './filter-video-suggestions'
import type { VideoEvent } from '@/utils/video-event'

describe('filterVideoSuggestions', () => {
  const createMockVideo = (overrides: Partial<VideoEvent> = {}): VideoEvent => ({
    id: 'video1',
    kind: 21,
    title: 'Test Video',
    description: 'Description',
    images: [],
    pubkey: 'test-pubkey',
    created_at: 1234567890,
    duration: 120,
    tags: [],
    searchText: '',
    urls: ['https://example.com/video.mp4'],
    link: 'video1',
    type: 'videos',
    textTracks: [],
    contentWarning: undefined,
    videoVariants: [],
    thumbnailVariants: [],
    origins: [],
    ...overrides,
  })

  it('filters out videos with NSFW content warning', () => {
    const videos = [
      createMockVideo({ id: 'video1' }),
      createMockVideo({ id: 'video2', contentWarning: 'NSFW' }),
      createMockVideo({ id: 'video3' }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('video1')
    expect(result[1].id).toBe('video3')
  })

  it('filters out videos with other content warnings', () => {
    const videos = [
      createMockVideo({ id: 'video1' }),
      createMockVideo({ id: 'video2', contentWarning: 'Violence' }),
      createMockVideo({ id: 'video3', contentWarning: 'Sensitive content' }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('video1')
  })

  it('keeps videos without content warnings', () => {
    const videos = [
      createMockVideo({ id: 'video1', contentWarning: undefined }),
      createMockVideo({ id: 'video2', contentWarning: undefined }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(2)
  })

  it('filters out current video', () => {
    const videos = [
      createMockVideo({ id: 'video1' }),
      createMockVideo({ id: 'current' }),
      createMockVideo({ id: 'video3' }),
    ]

    const result = filterVideoSuggestions(videos, { currentVideoId: 'current' })

    expect(result).toHaveLength(2)
    expect(result.find(v => v.id === 'current')).toBeUndefined()
  })

  it('filters out blocked pubkeys', () => {
    const videos = [
      createMockVideo({ id: 'video1', pubkey: 'pubkey1' }),
      createMockVideo({ id: 'video2', pubkey: 'blocked' }),
      createMockVideo({ id: 'video3', pubkey: 'pubkey3' }),
    ]

    const result = filterVideoSuggestions(videos, {
      blockedPubkeys: { blocked: true },
    })

    expect(result).toHaveLength(2)
    expect(result.find(v => v.pubkey === 'blocked')).toBeUndefined()
  })

  it('removes duplicate videos by id', () => {
    const videos = [
      createMockVideo({ id: 'video1' }),
      createMockVideo({ id: 'video1' }), // duplicate
      createMockVideo({ id: 'video2' }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('video1')
    expect(result[1].id).toBe('video2')
  })

  it('deduplicates videos by pubkey + identifier, preferring addressable events', () => {
    const videos = [
      createMockVideo({
        id: 'regular-event',
        kind: 21,
        pubkey: 'author1',
        identifier: 'my-video',
        created_at: 1000,
      }),
      createMockVideo({
        id: 'addressable-event',
        kind: 34235,
        pubkey: 'author1',
        identifier: 'my-video',
        created_at: 900, // older but addressable
      }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('addressable-event') // addressable preferred over regular
  })

  it('deduplicates videos by pubkey + identifier, preferring newer when same kind type', () => {
    const videos = [
      createMockVideo({
        id: 'older-event',
        kind: 34235,
        pubkey: 'author1',
        identifier: 'my-video',
        created_at: 1000,
      }),
      createMockVideo({
        id: 'newer-event',
        kind: 34235,
        pubkey: 'author1',
        identifier: 'my-video',
        created_at: 2000, // newer
      }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('newer-event') // newer preferred
  })

  it('keeps videos without identifier as separate entries', () => {
    const videos = [
      createMockVideo({
        id: 'video1',
        kind: 21,
        pubkey: 'author1',
        identifier: undefined,
      }),
      createMockVideo({
        id: 'video2',
        kind: 21,
        pubkey: 'author1',
        identifier: undefined,
      }),
    ]

    const result = filterVideoSuggestions(videos, {})

    expect(result).toHaveLength(2)
  })

  it('applies all filters together', () => {
    const videos = [
      createMockVideo({ id: 'video1', pubkey: 'pubkey1' }),
      createMockVideo({ id: 'video2', contentWarning: 'NSFW' }), // filtered by content warning
      createMockVideo({ id: 'current', pubkey: 'pubkey3' }), // filtered by current video
      createMockVideo({ id: 'video4', pubkey: 'blocked' }), // filtered by blocked pubkey
      createMockVideo({ id: 'video5', pubkey: 'pubkey5' }),
      createMockVideo({ id: 'video5', pubkey: 'pubkey5' }), // duplicate
    ]

    const result = filterVideoSuggestions(videos, {
      currentVideoId: 'current',
      blockedPubkeys: { blocked: true },
    })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('video1')
    expect(result[1].id).toBe('video5')
  })
})
