import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { getKindsForType } from '@nostube/core/video-types'
import { useTimeline } from './useTimeline'

export interface CreatorVideos {
  videos: VideoEvent[]
  loading: boolean
  error: boolean
  hasMore: boolean
  /** Finished page loads so far; changes after every page (to drive loading the whole catalog). */
  pagesLoaded: number
  loadMore: () => void
}

/**
 * The start creator's videos, newest first, from the configured video sources: the same timeline
 * hook as nostube, with paging, de-duplication and kind-5 deletions. Nothing is left out here
 * (the site hides what the creator hid). With `tag`, only the videos with that `t` tag (as written
 * or lower-cased, since relays match tags exactly). Needs a TimelineProvider.
 */
export function useCreatorVideos(config: InstanceConfig, tag?: string): CreatorVideos {
  const creator = config.startPage?.creator
  const filters = useMemo<Filter | undefined>(
    () =>
      creator
        ? {
            kinds: getKindsForType('all'),
            authors: [creator],
            ...(tag ? { '#t': [...new Set([tag, tag.toLowerCase()])] } : {}),
            limit: 50,
          }
        : undefined,
    [creator, tag]
  )
  const { videos, isInitialLoading, phase, hasMore, pagesLoaded, loadMore } = useTimeline(
    filters,
    {
      relays: config.videoSources,
      enabled: Boolean(creator),
      // The instance's relays answer with the full limit when they have it, so a short page is the end.
      endOnShortPage: true,
    }
  )
  return {
    videos,
    loading: isInitialLoading,
    error: phase === 'error',
    hasMore,
    pagesLoaded,
    loadMore,
  }
}
