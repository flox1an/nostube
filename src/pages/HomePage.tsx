import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { useMemo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustScores } from '@/hooks/useTrustScore'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Minimum global score (0–1) for an author's videos to appear when filter is on */
const MIN_TRUST_SCORE = 0.05

export function HomePage() {
  const { t } = useTranslation()
  const { relayOverride, setRelayOverride } = useAppContext()
  const [trustFilterEnabled, setTrustFilterEnabled] = useState(true)

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

  // Memoize the loader to prevent recreation on every render
  // When relay override is active, skip EventStore cache to show only that relay's events
  const loader = useMemo(
    () =>
      videoTypeLoader('videos', effectiveRelays, relayOverride ? { skipCache: true } : undefined),
    [effectiveRelays, relayOverride]
  )

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, effectiveRelays)

  // Collect unique author pubkeys for trust score lookup
  const authorPubkeys = useMemo(
    () => (videos ? [...new Set(videos.map(v => v.pubkey))] : []),
    [videos]
  )
  const trustScores = useTrustScores(authorPubkeys)

  // Filter videos by trust score when enabled
  const filteredVideos = useMemo(() => {
    if (!videos) return null
    if (!trustFilterEnabled) return videos

    return videos.filter(v => {
      const score = trustScores.get(v.pubkey)
      // Show videos from authors whose score hasn't loaded yet (don't hide while loading)
      if (score === null || score === undefined) return true
      return score >= MIN_TRUST_SCORE
    })
  }, [videos, trustFilterEnabled, trustScores])

  if (!filteredVideos) return null

  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2 flex items-center gap-1">
        <div className="flex-1 min-w-0">
          <CategoryButtonBar selectedRelay={relayOverride} onRelayChange={setRelayOverride} />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={trustFilterEnabled ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setTrustFilterEnabled(prev => !prev)}
              >
                <Shield className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {trustFilterEnabled
                ? t('pages.home.trustFilterOn', {
                    defaultValue: 'Trust filter on — hiding low-score authors',
                  })
                : t('pages.home.trustFilterOff', {
                    defaultValue: 'Trust filter off — showing all videos',
                  })}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <VideoTimelinePage
        videos={filteredVideos}
        loading={loading}
        exhausted={exhausted}
        onLoadMore={loadMore}
        layoutMode="horizontal"
        emptyMessage={t('pages.home.noVideos')}
        exhaustedMessage={t('pages.home.noMore')}
        className="sm:px-2"
      />
    </div>
  )
}
