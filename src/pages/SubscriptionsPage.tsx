import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useSubscriptionsVideos } from '@/hooks'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

export function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = `${t('navigation.subscriptions')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  const {
    followedPubkeys,
    videos: dedupedVideos,
    loading,
    exhausted,
    prefetching,
    subscriptionActive,
    error,
    loadMore,
    prefetchMore,
  } = useSubscriptionsVideos()

  if (followedPubkeys.length === 0) {
    return (
      <div className="max-w-560 mx-auto sm:p-4">
        <div className="rounded-xl border p-8 text-center space-y-3">
          <h2 className="text-xl font-semibold">{t('pages.subscriptions.welcomeTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('pages.subscriptions.welcomeDescription')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => navigate('/explore')}>
              {t('pages.subscriptions.exploreButton')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/search')}>
              {t('pages.subscriptions.findCreators')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={dedupedVideos}
        loading={loading}
        exhausted={exhausted}
        prefetching={prefetching}
        subscriptionActive={subscriptionActive}
        onLoadMore={loadMore}
        onPrefetch={prefetchMore}
        layoutMode="auto"
        emptyMessage={t('pages.subscriptions.noVideos')}
        exhaustedMessage={t('pages.subscriptions.noMore')}
        error={error}
        className="sm:p-4"
        cardTreatment="quiet-cinema"
      />
    </div>
  )
}
