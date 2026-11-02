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
  /** A page is still loading (videos may already show); whether more exist is known after it. */
  paging: boolean
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
  const { videos, isInitialLoading, phase, hasMore, pagesLoaded, loadMore, subscriptionActive } =
    useTimeline(filters, {
      relays: config.videoSources,
      enabled: Boolean(creator),
      // The instance's relays answer with the full limit when they have it, so a short page is the end.
      endOnShortPage: true,
      // Wait for every source's answer (a silent relay ends at the client's 8 s idle timeout):
      // a page cut off earlier leaves that relay unanswered, and "Load more" shows for nothing.
      pageSettleMs: 10_000,
    })
  return {
    videos,
    loading: isInitialLoading,
    error: phase === 'error',
    hasMore,
    paging: subscriptionActive,
    pagesLoaded,
    loadMore,
  }
}
