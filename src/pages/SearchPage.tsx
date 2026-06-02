import { useSearchParams } from 'react-router-dom'
import { SearchFiltersButton } from '@/components/SearchFiltersButton'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useSearchVideos } from '@/hooks/useSearchVideos'
import { useCallback, useEffect, useMemo } from 'react'
import {
  DEFAULT_SEARCH_FILTERS,
  applySearchFilters,
  getActiveSearchFilterCount,
  type SearchDateFilter,
  type SearchDurationFilter,
  type SearchFeatureFilter,
  type SearchFilters,
  type SearchSortFilter,
  type SearchTypeFilter,
} from '@/lib/search-filters'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'

const typeFilters: SearchTypeFilter[] = ['all', 'videos', 'shorts', 'audio']
const durationFilters: SearchDurationFilter[] = ['any', 'short', 'medium', 'long']
const dateFilters: SearchDateFilter[] = ['any', 'today', 'week', 'month', 'year']
const featureFilters: SearchFeatureFilter[] = ['captions', 'hd', 'nostr']
const sortFilters: SearchSortFilter[] = ['relevance', 'newest', 'oldest', 'duration']

function readSearchFilters(searchParams: URLSearchParams): SearchFilters {
  const type = searchParams.get('type')
  const duration = searchParams.get('duration')
  const date = searchParams.get('date')
  const sort = searchParams.get('sort')
  const features = searchParams
    .getAll('feature')
    .filter((feature): feature is SearchFeatureFilter =>
      featureFilters.includes(feature as SearchFeatureFilter)
    )

  return {
    type: typeFilters.includes(type as SearchTypeFilter)
      ? (type as SearchTypeFilter)
      : DEFAULT_SEARCH_FILTERS.type,
    duration: durationFilters.includes(duration as SearchDurationFilter)
      ? (duration as SearchDurationFilter)
      : DEFAULT_SEARCH_FILTERS.duration,
    date: dateFilters.includes(date as SearchDateFilter)
      ? (date as SearchDateFilter)
      : DEFAULT_SEARCH_FILTERS.date,
    features: [...new Set(features)],
    sort: sortFilters.includes(sort as SearchSortFilter)
      ? (sort as SearchSortFilter)
      : DEFAULT_SEARCH_FILTERS.sort,
  }
}

export function SearchPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamString = searchParams.toString()
  const query = searchParams.get('q')
  const filters = useMemo(
    () => readSearchFilters(new URLSearchParams(searchParamString)),
    [searchParamString]
  )
  const activeFilterCount = getActiveSearchFilterCount(filters)

  // Memoize videoKinds to prevent unnecessary re-renders
  const videoKinds = useMemo(() => getKindsForType('all'), [])

  // Use dedicated search hook with client-side MiniSearch
  const { videos, loading, hasLoaded, loadMore } = useSearchVideos({
    query,
    kinds: videoKinds, // All video kinds: 21, 22, 34235, 34236
  })

  const filteredVideos = useMemo(() => applySearchFilters(videos, filters), [videos, filters])

  const handleFiltersChange = useCallback(
    (nextFilters: SearchFilters) => {
      const nextParams = new URLSearchParams(searchParamString)

      if (nextFilters.type === DEFAULT_SEARCH_FILTERS.type) nextParams.delete('type')
      else nextParams.set('type', nextFilters.type)

      if (nextFilters.duration === DEFAULT_SEARCH_FILTERS.duration) nextParams.delete('duration')
      else nextParams.set('duration', nextFilters.duration)

      if (nextFilters.date === DEFAULT_SEARCH_FILTERS.date) nextParams.delete('date')
      else nextParams.set('date', nextFilters.date)

      if (nextFilters.sort === DEFAULT_SEARCH_FILTERS.sort) nextParams.delete('sort')
      else nextParams.set('sort', nextFilters.sort)

      nextParams.delete('feature')
      nextFilters.features.forEach(feature => nextParams.append('feature', feature))

      setSearchParams(nextParams, { replace: true })
    },
    [searchParamString, setSearchParams]
  )

  // Update document title
  useEffect(() => {
    if (query) {
      document.title = `Search: ${query} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [query])

  if (!query) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">{t('pages.search.emptyState')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <div className="flex flex-col gap-3 p-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('pages.search.resultsFor', { query })}</h1>
          {activeFilterCount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {filteredVideos.length} of {videos.length} results
            </p>
          )}
        </div>
        <SearchFiltersButton filters={filters} onChange={handleFiltersChange} />
      </div>

      <VideoTimelinePage
        videos={filteredVideos}
        loading={loading}
        exhausted={hasLoaded}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={t('pages.search.noResults', { query })}
        exhaustedMessage=""
        className=""
      />
    </div>
  )
}
