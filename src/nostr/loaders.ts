import { getTimelineLoader } from './core'
import { type VideoType } from '@/contexts/AppContext'
import { getKindsForType } from '@/lib/video-types'

// Kind 21 (videos)
export const videoLoader = () => {
  const loader = getTimelineLoader('k21', { kinds: getKindsForType('videos'), limit: 50 })
  return () => loader
}

// Kind 22 (shorts)
export const shortsLoader = () => {
  const loader = getTimelineLoader('k22', { kinds: getKindsForType('shorts'), limit: 50 })
  return () => loader
}

// Combined 21+22 (all video content)
export const allVideoLoader = () => {
  const loader = getTimelineLoader('k21k22', { kinds: getKindsForType('all'), limit: 50 })
  return () => loader
}

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
export const videoTypeLoader = (type: VideoType, relays?: string[]) => {
  const loader = getTimelineLoader(`k21:type:${type}`, { kinds: getKindsForType(type), limit: 20 }, relays)
  return () => loader
}

// By video type and author
export const authorVideoTypeLoader = (type: VideoType, pubkey: string) => {
  const loader = getTimelineLoader(`k21:type:${type}:author:${pubkey}`, {
    kinds: getKindsForType(type),
    authors: [pubkey],
  })
  return () => loader
}

// Example: by hashtag/topic
export const tagVideoLoader = (tag: string) => {
  const loader = getTimelineLoader(`k21:tag:${tag}`, { kinds: getKindsForType('all'), '#t': [tag] })
  return () => loader
}
