import type { ReportedPubkeys } from '@/hooks'
import type { BlossomServer } from '@/contexts/AppContext'
import {
  deduplicateByIdentifier,
  isAudioVideo,
  isYouTubeVideo,
  processEvent,
  type Event,
  type ProcessEventsOptions,
  type VideoEvent,
} from './video-event'

export interface FilterPolicy extends ProcessEventsOptions {
  blockPubkeys?: ReportedPubkeys
  blossomServers?: BlossomServer[]
  missingVideoIds?: Set<string>
  nsfwPubkeys?: string[]
  reportedEventIds?: string[]
}

export function createFilterPolicy(
  policy: FilterPolicy = {}
): Required<ProcessEventsOptions> & Omit<FilterPolicy, keyof ProcessEventsOptions> {
  return {
    ...policy,
    includeYouTube: policy.includeYouTube ?? true,
    includeAudio: policy.includeAudio ?? true,
  }
}

function isFilterPolicy(value: FilterPolicy | ReportedPubkeys | undefined): value is FilterPolicy {
  if (!value) return false

  return (
    'includeYouTube' in value ||
    'includeAudio' in value ||
    'blockPubkeys' in value ||
    'blossomServers' in value ||
    'missingVideoIds' in value ||
    'nsfwPubkeys' in value ||
    'reportedEventIds' in value
  )
}

function normalizeFilterPolicy(
  blockPubkeysOrPolicy?: ReportedPubkeys | FilterPolicy,
  blossomServers?: BlossomServer[],
  missingVideoIds?: Set<string>,
  nsfwPubkeys?: string[],
  reportedEventIds?: string[],
  options?: ProcessEventsOptions
): ReturnType<typeof createFilterPolicy> {
  if (isFilterPolicy(blockPubkeysOrPolicy)) {
    return createFilterPolicy(blockPubkeysOrPolicy)
  }

  return createFilterPolicy({
    ...options,
    blockPubkeys: blockPubkeysOrPolicy,
    blossomServers,
    missingVideoIds,
    nsfwPubkeys,
    reportedEventIds,
  })
}

export function validateVideoEvents(events: (Event | undefined)[]): Event[] {
  return events.filter((event): event is Event => event !== undefined)
}

export function transformVideoEvents(
  events: Event[],
  relays: string[],
  policy: FilterPolicy = {}
): VideoEvent[] {
  return events
    .map(event => processEvent(event, relays, policy.blossomServers, policy.nsfwPubkeys))
    .filter((video): video is VideoEvent => video !== undefined && Boolean(video.id))
}

export function filterVideoEvents(videos: VideoEvent[], policy: FilterPolicy = {}): VideoEvent[] {
  const resolvedPolicy = createFilterPolicy(policy)
  const reportedSet = resolvedPolicy.reportedEventIds?.length
    ? new Set(resolvedPolicy.reportedEventIds)
    : undefined

  return videos.filter(
    video =>
      (resolvedPolicy.includeYouTube || !isYouTubeVideo(video)) &&
      (resolvedPolicy.includeAudio || !isAudioVideo(video)) &&
      video.mediaSourceStatus !== 'requires-hash-resolution' &&
      video.mediaSourceStatus !== 'unavailable' &&
      (!resolvedPolicy.blockPubkeys || !resolvedPolicy.blockPubkeys[video.pubkey]) &&
      (!resolvedPolicy.missingVideoIds || !resolvedPolicy.missingVideoIds.has(video.id)) &&
      (!reportedSet || !reportedSet.has(video.id))
  )
}

export function deduplicateVideoEvents(videos: VideoEvent[]): VideoEvent[] {
  return deduplicateByIdentifier(videos)
}

export function processVideoEventPipeline(
  events: (Event | undefined)[],
  relays: string[],
  policy: FilterPolicy = {}
): VideoEvent[] {
  const validEvents = validateVideoEvents(events)
  const transformedEvents = transformVideoEvents(validEvents, relays, policy)
  const filteredEvents = filterVideoEvents(transformedEvents, policy)
  return deduplicateVideoEvents(filteredEvents)
}

export function processEvents(
  events: (Event | undefined)[],
  relays: string[],
  policy?: FilterPolicy
): VideoEvent[]
export function processEvents(
  events: (Event | undefined)[],
  relays: string[],
  blockPubkeys?: ReportedPubkeys,
  blossomServers?: BlossomServer[],
  missingVideoIds?: Set<string>,
  nsfwPubkeys?: string[],
  reportedEventIds?: string[],
  options?: ProcessEventsOptions
): VideoEvent[]
export function processEvents(
  events: (Event | undefined)[],
  relays: string[],
  blockPubkeysOrPolicy?: ReportedPubkeys | FilterPolicy,
  blossomServers?: BlossomServer[],
  missingVideoIds?: Set<string>,
  nsfwPubkeys?: string[],
  reportedEventIds?: string[],
  options?: ProcessEventsOptions
): VideoEvent[] {
  const policy = normalizeFilterPolicy(
    blockPubkeysOrPolicy,
    blossomServers,
    missingVideoIds,
    nsfwPubkeys,
    reportedEventIds,
    options
  )

  return processVideoEventPipeline(events, relays, policy)
}
