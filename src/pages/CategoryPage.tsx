import { useParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useStableRelays } from '@/hooks'
import { useCategoryVideos } from '@/hooks/useCategoryVideos'
import { useEffect, useMemo } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { getCategoryBySlug } from '@/lib/tag-categories'
import { useTranslation } from 'react-i18next'

export function CategoryPage() {
  const { t } = useTranslation()
  const { category: categorySlug } = useParams<{ category: string }>()
  const relays = useStableRelays()

  // Memoize videoKinds to prevent infinite re-renders
  const videoKinds = useMemo(() => getKindsForType('all'), [])

  // Find category by slug
  const category = useMemo(
    () => (categorySlug ? getCategoryBySlug(categorySlug) : undefined),
    [categorySlug]
  )

  // Use category videos hook with all tags in the category
  const { videos, loading, exhausted, loadMore } = useCategoryVideos({
    tags: category?.tags || [],
    relays,
    videoKinds,
  })

  // Update document title
  useEffect(() => {
    if (category) {
      document.title = `${category.name} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [category])

  // Show error if category not found
  if (categorySlug && !category) {
    return (
      <div className="max-w-560 mx-auto px-4">
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
    <div className="max-w-560 mx-auto px-4">
      <CategoryButtonBar activeSlug={categorySlug} />

      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={exhausted}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={t('pages.category.noVideos', { category: category.name })}
        className=""
      />
    </div>
  )
}
