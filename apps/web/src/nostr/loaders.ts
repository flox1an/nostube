import { getTimelineLoader } from './core'
import { type VideoType } from '@nostube/core'
import { getKindsForType } from '@nostube/core/video-types'

// Kind 21 (videos)

// Kind 22 (shorts)

// Combined 21+22 (all video content)

// By author (pubkey hex)
export const authorVideoLoader = (pubkey: string, relays: string[]) => {
  const loader = getTimelineLoader(
    `k21:author:${pubkey}`,
    { kinds: getKindsForType('all'), authors: [pubkey], limit: 100 },
    relays
  )
  return () => loader
}

// By video type
export const videoTypeLoader = (
  type: VideoType,
  relays?: string[],
  options?: { skipCache?: boolean }
) => {
  const loader = getTimelineLoader(
    `k21:type:${type}`,
    { kinds: getKindsForType(type), limit: 100 },
    relays,
    options
  )
  return () => loader
}

// By video type and author

// Example: by hashtag/topic
