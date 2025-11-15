import { getTimelineLoader } from './core'
import { type VideoType } from '@/contexts/AppContext'
import { getKindsForType } from '@/lib/video-types'

// Kind 21 (videos)
export const videoLoader = () =>
  getTimelineLoader('k21', { kinds: getKindsForType('videos'), limit: 50 })

// Kind 22 (shorts)
export const shortsLoader = () =>
  getTimelineLoader('k22', { kinds: getKindsForType('shorts'), limit: 50 })

// Combined 21+22 (all video content)
export const allVideoLoader = () =>
  getTimelineLoader('k21k22', { kinds: getKindsForType('all'), limit: 50 })

// By author (pubkey hex)
export const authorVideoLoader = (pubkey: string, relays: string[]) => () =>
  getTimelineLoader(
    `k21:author:${pubkey}`,
    { kinds: getKindsForType('all'), authors: [pubkey], limit: 100 },
    relays
  )

// By video type
export const videoTypeLoader = (type: VideoType, relays?: string[]) => () =>
  getTimelineLoader(`k21:type:${type}`, { kinds: getKindsForType(type), limit: 20 }, relays)

// By video type and author
export const authorVideoTypeLoader = (type: VideoType, pubkey: string) => () =>
  getTimelineLoader(`k21:type:${type}:author:${pubkey}`, {
    kinds: getKindsForType(type),
    authors: [pubkey],
  })

// Example: by hashtag/topic
export const tagVideoLoader = (tag: string) => () =>
  getTimelineLoader(`k21:tag:${tag}`, { kinds: getKindsForType('all'), '#t': [tag] })
