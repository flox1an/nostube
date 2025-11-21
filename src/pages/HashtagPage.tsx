import { useParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useStableRelays, useTimelineLoader } from '@/hooks'
import { useMemo, useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'

export function HashtagPage() {
  const { t } = useTranslation()
  const { tag } = useParams<{ tag: string }>()
  const relays = useStableRelays()

  // Create filter for hashtag
  const filters = useMemo(() => {
    if (!tag) {
      return null
    }
    return {
      kinds: getKindsForType('all'),
      '#t': [tag.toLowerCase()], // Hashtags are typically lowercase in Nostr
    }
  }, [tag])

  const { videos, loading, loadMore } = useTimelineLoader({
    filters,
    relays,
    reloadDependency: tag,
  })

  // Update document title
  useEffect(() => {
    if (tag) {
      document.title = `#${tag} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [tag])

  return (
    <div className="sm:p-4">
      <div className="p-2">
        <h1 className="text-2xl font-bold mb-4">{t('pages.hashtag.title', { tag })}</h1>
      </div>

      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={false}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={t('pages.hashtag.noVideos', { tag })}
        exhaustedMessage=""
        className=""
      />
    </div>
  )
}
