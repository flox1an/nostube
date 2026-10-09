import type { VideoEvent } from '@nostube/core/video-event'

/** Minimal VideoEvent for rendering tests. */
export function makeVideo(overrides: Partial<VideoEvent> = {}): VideoEvent {
  return {
    id: 'a'.repeat(64),
    kind: 21,
    title: 'A video',
    description: '',
    images: [],
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000,
    duration: 125,
    tags: [],
    searchText: '',
    urls: ['https://media.example/v.mp4'],
    link: '',
    type: 'videos',
    textTracks: [],
    contentWarning: undefined,
    origins: [],
    videoVariants: [
      {
        url: 'https://media.example/v.mp4',
        mimeType: 'video/mp4',
        fallbackUrls: ['https://mirror.example/v.mp4'],
      },
    ],
    thumbnailVariants: [],
    ...overrides,
  }
}
