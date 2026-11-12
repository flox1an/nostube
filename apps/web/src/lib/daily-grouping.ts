import { getPublishDate } from '@nostube/core/video-event'
import type { VideoEvent } from '@nostube/core/video-event'

/**
 * Newest-first by publish date. With `group`, keeps only the first long-form video and the
 * first short per author per UTC day, so the input must already be sorted newest-first.
 */
export function applyDailyGrouping(videos: VideoEvent[], group: boolean): VideoEvent[] {
  const seen = new Set<string>()
  const kept = group
    ? videos.filter(video => {
        if (video.type !== 'videos' && video.type !== 'shorts') return false
        const day = new Date(getPublishDate(video) * 1000).toISOString().slice(0, 10)
        const key = `${video.type}:${video.pubkey}:${day}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    : [...videos]
  return kept.sort((a, b) => getPublishDate(b) - getPublishDate(a))
}
