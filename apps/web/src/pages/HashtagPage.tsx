import { useParams } from 'react-router-dom'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useStableRelays } from '@/hooks'
import { useHashtagVideos } from '@/hooks/useHashtagVideos'
import { useEffect, useMemo } from 'react'
import { getKindsForType } from '@nostube/core/video-types'
import { useTranslation } from 'react-i18next'
import { useTrustFilter } from '@/hooks/useTrustFilter'
import { appTitle, pageTitle } from '@nostube/core/instance-config'

export function HashtagPage() {
  const { t } = useTranslation()
  const { tag } = useParams<{ tag: string }>()
  const relays = useStableRelays()

  // Memoize videoKinds to prevent infinite re-renders
  const videoKinds = useMemo(() => getKindsForType('all'), [])

  // Use new hook that includes NIP-32 labeled videos
  const { videos, loading, exhausted, loadMore } = useHashtagVideos({
    tag,
    relays,
    videoKinds,
  })

  const { filteredVideos, filterButton, pending: trustPending } = useTrustFilter(videos)

  // Update document title
  useEffect(() => {
    if (tag) {
      document.title = pageTitle(`#${tag}`)
    } else {
      document.title = appTitle()
    }
    return () => {
      document.title = appTitle()
    }
  }, [tag])

  return (
    <div className="max-w-560 mx-auto sm:p-2">
      <div className="flex items-center gap-2 p-2">
        <h1 className="text-2xl font-bold">{t('pages.hashtag.title', { tag })}</h1>
        {filterButton}
      </div>

      <VideoTimelinePage
        videos={filteredVideos ?? []}
        loading={loading || trustPending}
        exhausted={exhausted}
        onLoadMore={loadMore}
        layoutMode="auto"
        fullBleed
        emptyMessage={t('pages.hashtag.noVideos', { tag })}
        className=""
      />
    </div>
  )
}
