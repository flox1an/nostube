import type { VideoEvent } from '@/utils/video-event'

export interface FilterOptions {
  currentVideoId?: string
  blockedPubkeys?: Record<string, unknown>
}

/**
 * Filter video suggestions based on various criteria:
 * - Remove videos with content warnings (NSFW, etc.)
 * - Remove current video
 * - Remove videos from blocked authors
 * - Remove duplicate videos
 */
export function filterVideoSuggestions(videos: VideoEvent[], options: FilterOptions): VideoEvent[] {
  const { currentVideoId, blockedPubkeys } = options
  const seenIds = new Set<string>()
  const filtered: VideoEvent[] = []

  for (const video of videos) {
    // Skip videos with content warnings
    if (video.contentWarning) continue

    // Skip current video
    if (currentVideoId && video.id === currentVideoId) continue

    // Skip blocked authors
    if (blockedPubkeys && blockedPubkeys[video.pubkey]) continue

    // Skip duplicates
    if (seenIds.has(video.id)) continue

    filtered.push(video)
    seenIds.add(video.id)
  }

  return filtered
}
