import { deduplicateByIdentifier, type VideoEvent } from '@/utils/video-event'

export interface FilterOptions {
  currentVideoId?: string
  blockedPubkeys?: Record<string, unknown>
}

/**
 * Filter video suggestions based on various criteria:
 * - Remove videos with content warnings (NSFW, etc.)
 * - Remove current video
 * - Remove videos from blocked authors
 * - Deduplicate by pubkey + identifier (prefers addressable events, then newer)
 */
export function filterVideoSuggestions(videos: VideoEvent[], options: FilterOptions): VideoEvent[] {
  const { currentVideoId, blockedPubkeys } = options

  // First deduplicate by pubkey + identifier (same logic as main timelines)
  const deduplicated = deduplicateByIdentifier(videos)

  const filtered: VideoEvent[] = []

  for (const video of deduplicated) {
    // Skip videos with content warnings
    if (video.contentWarning) continue

    // Skip current video
    if (currentVideoId && video.id === currentVideoId) continue

    // Skip blocked authors
    if (blockedPubkeys && blockedPubkeys[video.pubkey]) continue

    filtered.push(video)
  }

  return filtered
}
