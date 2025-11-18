import { useSearchParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useSearchVideos } from '@/hooks/useSearchVideos'
import { useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'

export function SearchPage() {
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
        <p className="text-muted-foreground">Enter a search query to find videos</p>
      </div>
    )
  }

  return (
    <div className="sm:p-4">
      <div className="p-2">
        <h1 className="text-2xl font-bold mb-4">Search Results for: {query}</h1>
      </div>

      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={false}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={`No videos found for "${query}".`}
        exhaustedMessage=""
        className=""
      />
    </div>
  )
}
