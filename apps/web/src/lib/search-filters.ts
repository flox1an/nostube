import { isYouTubeVideo, type VideoEvent, getPublishDate } from '@/utils/video-event'

export type SearchTypeFilter = 'all' | 'videos' | 'shorts' | 'audio'
export type SearchDurationFilter = 'any' | 'short' | 'medium' | 'long'
export type SearchDateFilter = 'any' | 'today' | 'week' | 'month' | 'year'
export type SearchFeatureFilter = 'captions' | 'hd' | 'nostr'
export type SearchSortFilter = 'relevance' | 'newest' | 'oldest' | 'duration'

export interface SearchFilters {
  type: SearchTypeFilter
  duration: SearchDurationFilter
  date: SearchDateFilter
  features: SearchFeatureFilter[]
  sort: SearchSortFilter
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  type: 'all',
  duration: 'any',
  date: 'any',
  features: [],
  sort: 'relevance',
}

export function getActiveSearchFilterCount(filters: SearchFilters): number {
  return (
    (filters.type !== DEFAULT_SEARCH_FILTERS.type ? 1 : 0) +
    (filters.duration !== DEFAULT_SEARCH_FILTERS.duration ? 1 : 0) +
    (filters.date !== DEFAULT_SEARCH_FILTERS.date ? 1 : 0) +
    filters.features.length +
    (filters.sort !== DEFAULT_SEARCH_FILTERS.sort ? 1 : 0)
  )
}

function getVariantHeight(video: VideoEvent): number {
  const dimensions = [
    video.dimensions,
    ...video.videoVariants.map(variant => variant.dimensions),
    ...(video.allVideoVariants ?? []).map(variant => variant.dimensions),
  ]

  return dimensions.reduce((max, dimension) => {
    const height = dimension?.match(/x(\d+)/)?.[1]
    return height ? Math.max(max, Number(height)) : max
  }, 0)
}

function matchesType(video: VideoEvent, type: SearchTypeFilter): boolean {
  if (type === 'all') return true
  if (type === 'audio') return video.mediaType === 'audio'
  if (type === 'videos') return video.type === 'videos' && video.mediaType !== 'audio'
  return video.type === 'shorts' && video.mediaType !== 'audio'
}

function matchesDuration(video: VideoEvent, duration: SearchDurationFilter): boolean {
  if (duration === 'any') return true
  if (!video.duration || video.duration <= 0) return false

  if (duration === 'short') return video.duration < 3 * 60
  if (duration === 'medium') return video.duration >= 3 * 60 && video.duration <= 20 * 60
  return video.duration > 20 * 60
}

function matchesDate(video: VideoEvent, date: SearchDateFilter): boolean {
  if (date === 'any') return true

  const now = Math.floor(Date.now() / 1000)
  const publishedAt = getPublishDate(video)
  const secondsAgo = now - publishedAt

  if (secondsAgo < 0) return true
  if (date === 'today') return secondsAgo <= 24 * 60 * 60
  if (date === 'week') return secondsAgo <= 7 * 24 * 60 * 60
  if (date === 'month') return secondsAgo <= 30 * 24 * 60 * 60
  return secondsAgo <= 365 * 24 * 60 * 60
}

function matchesFeature(video: VideoEvent, feature: SearchFeatureFilter): boolean {
  if (feature === 'captions') return video.textTracks.length > 0
  if (feature === 'hd') return getVariantHeight(video) >= 720
  return !isYouTubeVideo(video)
}

export function applySearchFilters(videos: VideoEvent[], filters: SearchFilters): VideoEvent[] {
  const filtered = videos.filter(
    video =>
      matchesType(video, filters.type) &&
      matchesDuration(video, filters.duration) &&
      matchesDate(video, filters.date) &&
      filters.features.every(feature => matchesFeature(video, feature))
  )

  if (filters.sort === 'relevance') return filtered

  return [...filtered].sort((a, b) => {
    if (filters.sort === 'newest') return getPublishDate(b) - getPublishDate(a)
    if (filters.sort === 'oldest') return getPublishDate(a) - getPublishDate(b)
    return (b.duration || 0) - (a.duration || 0)
  })
}
