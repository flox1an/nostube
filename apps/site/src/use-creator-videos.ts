import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { getKindsForType } from '@nostube/core/video-types'
import { useTimeline } from '@nostube/widgets/hooks/useTimeline'

export interface CreatorVideos {
  videos: VideoEvent[]
  loading: boolean
  error: boolean
  hasMore: boolean
  loadMore: () => void
}

/**
 * The start creator's videos, newest first, from the configured video sources: the same timeline
 * hook as nostube, with paging, de-duplication and kind-5 deletions. Needs a TimelineProvider.
 */
export function useCreatorVideos(config: InstanceConfig): CreatorVideos {
  const creator = config.startPage?.creator
  const filters = useMemo<Filter | undefined>(
    () => (creator ? { kinds: getKindsForType('all'), authors: [creator], limit: 50 } : undefined),
    [creator]
  )
  const { videos, isInitialLoading, phase, hasMore, loadMore } = useTimeline(filters, {
    relays: config.videoSources,
    enabled: Boolean(creator),
  })
  return {
    videos,
    loading: isInitialLoading,
    error: phase === 'error',
    hasMore,
    loadMore,
  }
}
