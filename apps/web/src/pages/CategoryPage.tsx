import { useParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { RelaySourcePicker } from '@/components/RelaySourcePicker'
import { useReadRelays } from '@/hooks'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { RelayBrowseStatus } from '@/components/RelayBrowseStatus'
import { useCategoryVideos } from '@/hooks/useCategoryVideos'
import { useEffect, useMemo } from 'react'
import { getKindsForType } from '@nostube/core/video-types'
import { getCategoryBySlug } from '@/lib/tag-categories'
import { useTranslation } from 'react-i18next'
import { useTrustFilter } from '@/hooks/useTrustFilter'
import { FeedEmptyAction, MobileFeedFilterPopover } from '@/components/FeedFilterMenu'
import { appTitle, pageTitle } from '@nostube/core/instance-config'

export function CategoryPage() {
  const { t } = useTranslation()
  const { category: categorySlug } = useParams<{ category: string }>()
  const relays = useReadRelays()
  const { source, selectSource } = useRelayBrowsing()
  const effectiveRelays = source?.relays ?? relays

  // Memoize videoKinds to prevent infinite re-renders
  const videoKinds = useMemo(() => getKindsForType('all'), [])

  // Find category by slug
  const category = useMemo(
    () => (categorySlug ? getCategoryBySlug(categorySlug) : undefined),
    [categorySlug]
  )

  // Use category videos hook with all tags in the category
  // When relay override is active, use directMode to bypass EventStore
  const { videos, loading, exhausted, loadMore } = useCategoryVideos({
    tags: category?.tags || [],
    relays: effectiveRelays,
    videoKinds,
    directMode: !!source,
  })

  const {
    filteredVideos,
    filterButton,
    enabled: trustEnabled,
    hiddenCount: trustHiddenCount,
    toggle: toggleTrust,
    pending: trustPending,
  } = useTrustFilter(videos)

  // Update document title
  useEffect(() => {
    if (category) {
      document.title = pageTitle(`${category.name}`)
    } else {
      document.title = appTitle()
    }
    return () => {
      document.title = appTitle()
    }
  }, [category])

  // Show error if category not found
  if (categorySlug && !category) {
    return (
      <div className="max-w-560 mx-auto sm:px-2">
        <CategoryButtonBar activeSlug={categorySlug} />
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Category not found</h1>
          <p className="text-muted-foreground">
            The category &quot;{categorySlug}&quot; does not exist.
          </p>
        </div>
      </div>
    )
  }

  if (!category) {
    return null
  }

  return (
    <div className="max-w-560 mx-auto sm:px-2">
      <CategoryButtonBar activeSlug={categorySlug} />
      <div className="mb-2 flex items-center justify-between gap-x-2 px-4 sm:flex-wrap sm:gap-x-4 sm:px-2">
        <h1 className="sr-only text-2xl font-semibold tracking-tight sm:not-sr-only sm:mr-auto">
          {category.name}
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-x-2 sm:flex-initial sm:justify-end">
          <RelaySourcePicker />
          <div className="hidden items-center gap-x-2 sm:flex">{filterButton}</div>
          <MobileFeedFilterPopover
            trustEnabled={trustEnabled}
            trustHiddenCount={trustHiddenCount}
            onToggleTrust={toggleTrust}
          />
        </div>
      </div>
      <RelayBrowseStatus />

      {(!source || source.relays.length > 0) && (
        <VideoTimelinePage
          videos={filteredVideos ?? []}
          loading={loading || trustPending}
          exhausted={exhausted}
          onLoadMore={loadMore}
          layoutMode="auto"
          fullBleed
          emptyMessage={t('pages.category.noVideos', { category: category.name })}
          emptyAction={
            <FeedEmptyAction
              trustEnabled={trustEnabled}
              trustHiddenCount={trustHiddenCount}
              onToggleTrust={toggleTrust}
              hasCustomSource={Boolean(source)}
              onResetSource={() => selectSource(null)}
            />
          }
          className=""
        />
      )}
    </div>
  )
}
