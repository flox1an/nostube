import { useSearchParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useSearchVideos } from '@/hooks/useSearchVideos'
import { useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'

export function SearchPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q')

  // Use dedicated search hook that only queries relay.nostr.band
  const { videos, loading, loadMore } = useSearchVideos({
    query,
    kinds: getKindsForType('all'), // All video kinds: 21, 22, 34235, 34236
  })

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
    <div className="sm:p-4">
      <div className="p-2">
        <h1 className="text-2xl font-bold mb-4">{t('pages.search.resultsFor', { query })}</h1>
      </div>

      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={false}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={t('pages.search.noResults', { query })}
        exhaustedMessage=""
        className=""
      />
    </div>
  )
}
