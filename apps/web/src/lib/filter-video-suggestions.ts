import { deduplicateByIdentifier, type VideoEvent } from '@nostube/core/video-event'

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
    if (
      video.mediaSourceStatus === 'requires-hash-resolution' ||
      video.mediaSourceStatus === 'unavailable'
    ) {
      continue
    }

    // Skip current video
    if (currentVideoId && video.id === currentVideoId) continue

    // Skip blocked authors
    if (blockedPubkeys && blockedPubkeys[video.pubkey]) continue

    filtered.push(video)
  }

  return filtered
}

export const MAX_SAME_CREATOR_SUGGESTIONS = 3
const MAX_PER_CREATOR_GENERAL_SUGGESTIONS = 2

/**
 * Splits suggestions into a capped "More from creator" section and a diverse discovery section
 * capped per creator so a single prolific channel cannot crowd the watch sidebar.
 */
export function partitionSuggestions<T extends { pubkey: string }>(
  videos: T[],
  authorPubkey?: string,
  maxSameCreator = MAX_SAME_CREATOR_SUGGESTIONS,
  maxPerGeneralCreator = MAX_PER_CREATOR_GENERAL_SUGGESTIONS
): { sameCreator: T[]; general: T[] } {
  const sameCreator: T[] = []
  const general: T[] = []
  const counts = new Map<string, number>()

  for (const video of videos) {
    if (authorPubkey && video.pubkey === authorPubkey) {
      if (sameCreator.length < maxSameCreator) sameCreator.push(video)
      continue
    }
    const seen = counts.get(video.pubkey) ?? 0
    if (seen < maxPerGeneralCreator) {
      counts.set(video.pubkey, seen + 1)
      general.push(video)
    }
  }

  return { sameCreator, general }
}
