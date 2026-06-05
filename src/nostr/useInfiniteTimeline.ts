import { type TimelineLoader } from 'applesauce-loaders/loaders'
import { type Filter } from 'nostr-tools'
import { useTimeline } from './useTimeline'

interface UseInfiniteTimelineOptions {
  filters?: Filter | Filter[]
  directMode?: boolean
  includeAudio?: boolean
  firstEventTimeoutMs?: number
  pageSettleMs?: number
  firstUsefulTimeoutMs?: number
}

export function useInfiniteTimeline(
  loader?: () => TimelineLoader,
  readRelays: string[] = [],
  options: UseInfiniteTimelineOptions = {}
) {
  const {
    filters,
    directMode,
    includeAudio,
    firstEventTimeoutMs,
    pageSettleMs,
    firstUsefulTimeoutMs,
  } = options

  return useTimeline(filters, {
    loader,
    relays: readRelays,
    directMode,
    includeAudio,
    firstEventTimeoutMs,
    pageSettleMs,
    firstUsefulTimeoutMs,
  })
}
