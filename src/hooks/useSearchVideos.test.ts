import { describe, expect, it } from 'vitest'
import { filterSearchVideosForSafety } from './useSearchVideos'
import type { VideoEvent } from '@/utils/video-event'

const nsfwPubkey = 'nsfw-pubkey'
const blockedPubkey = 'blocked-pubkey'

function createVideo(pubkey: string, id: string): VideoEvent {
  return {
    id,
    kind: 34235,
    title: id,
    description: '',
    images: [],
    pubkey,
    created_at: 1,
    duration: 1,
    tags: [],
    searchText: id,
    urls: ['https://example.com/video.mp4'],
    link: id,
    type: 'videos',
    textTracks: [],
    contentWarning: undefined,
    origins: [],
    videoVariants: [],
    thumbnailVariants: [],
  }
}

const safeVideo = createVideo('safe-pubkey', 'safe')
const nsfwVideo = createVideo(nsfwPubkey, 'nsfw')
const blockedVideo = createVideo(blockedPubkey, 'blocked')
const videos = [safeVideo, nsfwVideo, blockedVideo]
const blockedPubkeys = { [blockedPubkey]: true }

describe('filterSearchVideosForSafety', () => {
  it('removes configured NSFW and effective blocked authors when NSFW is hidden', () => {
    expect(filterSearchVideosForSafety(videos, 'hide', [nsfwPubkey], blockedPubkeys)).toEqual([
      safeVideo,
    ])
  })

  it('marks configured NSFW authors with the existing warning UI mode', () => {
    expect(filterSearchVideosForSafety(videos, 'warning', [nsfwPubkey], blockedPubkeys)).toEqual([
      safeVideo,
      { ...nsfwVideo, contentWarning: 'NSFW' },
    ])
  })

  it('keeps configured NSFW authors but always removes blocked authors when NSFW is shown', () => {
    expect(filterSearchVideosForSafety(videos, 'show', [nsfwPubkey], blockedPubkeys)).toEqual([
      safeVideo,
      nsfwVideo,
    ])
  })
})
