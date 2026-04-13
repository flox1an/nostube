import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getPublishDate } from '@/utils/video-event'
import type { VideoEvent } from '@/utils/video-event'
import { useTrustFilter } from '@/hooks/useTrustFilter'

export function HomePage() {
  const { t } = useTranslation()
  const { relayOverride, setRelayOverride } = useAppContext()

  useEffect(() => {
    document.title = `${t('navigation.home')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
  const relays = useStableRelays()

  const effectiveRelays = useMemo(
    () => (relayOverride ? [relayOverride] : relays),
    [relayOverride, relays]
  )

  const loader = useMemo(
    () =>
      videoTypeLoader('videos', effectiveRelays, relayOverride ? { skipCache: true } : undefined),
    [effectiveRelays, relayOverride]
  )

  const { videos, loading, exhausted, subscriptionActive, loadMore } = useInfiniteTimeline(
    loader,
    effectiveRelays
  )

  // Show at most one long-form and one short per pubkey per day (videos are already sorted newest-first)
  const dedupedVideos = useMemo(() => {
    const seenLongform = new Set<string>()
    const seenShorts = new Set<string>()
    const result: VideoEvent[] = []
    for (const video of videos) {
      const day = new Date(getPublishDate(video) * 1000).toISOString().slice(0, 10)
      const key = `${video.pubkey}:${day}`
      if (video.type === 'videos') {
        if (!seenLongform.has(key)) {
          seenLongform.add(key)
          result.push(video)
        }
      } else if (video.type === 'shorts') {
        if (!seenShorts.has(key)) {
          seenShorts.add(key)
          result.push(video)
        }
      }
    }
    return result.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [videos])

  const { filteredVideos, filterButton } = useTrustFilter(dedupedVideos)

  if (!filteredVideos) return null

  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2">
        <CategoryButtonBar
          selectedRelay={relayOverride}
          onRelayChange={setRelayOverride}
          afterRelay={filterButton}
        />
      </div>
      <VideoTimelinePage
        videos={filteredVideos}
        loading={loading}
        exhausted={exhausted}
        subscriptionActive={subscriptionActive}
        onLoadMore={loadMore}
        layoutMode="horizontal"
        emptyMessage={t('pages.home.noVideos')}
        exhaustedMessage={t('pages.home.noMore')}
        className="sm:px-2"
      />
    </div>
  )
}
