import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { pageTitle } from '@nostube/core/instance-config'
import { Tabs, TabsList, TabsTrigger } from '@nostube/widgets/components/tabs'
import { useLiveStreams } from '@/hooks/useLiveStreams'
import { LiveCard } from '@/components/live/LiveCard'

const STATUSES: LiveStream['status'][] = ['live', 'planned', 'ended']

/** NIP-53 discovery: streams live, scheduled or ended in the last 24h across Nostr. */
export function LivePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const status = STATUSES.find(s => s === params.get('status')) ?? 'live'
  const { streams, isLoading, error } = useLiveStreams(status)
  useEffect(() => {
    document.title = pageTitle(t('live.title', 'Live'))
  }, [t])
  const labels = {
    live: t('live.now', 'Live now'),
    planned: t('live.scheduled', 'Scheduled'),
    ended: t('live.offline', 'Ended'),
  }
  return (
    <div className="mx-auto max-w-560 sm:p-4">
      <Tabs
        value={status}
        onValueChange={value =>
          setParams(value === 'live' ? {} : { status: value }, { replace: true })
        }
        className="mb-4 px-4 pt-2 sm:px-2 sm:pt-0"
      >
        <TabsList>
          {STATUSES.map(s => (
            <TabsTrigger key={s} value={s} className="min-h-9">
              {labels[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <h1 className="sr-only">{labels[status]}</h1>
      {error && (
        <p role="status" className="mb-4 px-4 text-sm text-muted-foreground sm:px-2">
          {error}
        </p>
      )}
      {isLoading && streams.length === 0 && (
        <p role="status" className="p-8 text-center text-muted-foreground">
          {t('live.loading', 'Finding live streams…')}
        </p>
      )}
      {!isLoading && streams.length === 0 && (
        <div className="mx-2 rounded-xl border border-dashed p-12 text-center">
          <Radio className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">{t('live.empty', 'No live streams found')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('live.emptyHint', 'New streams appear here as their announcements arrive.')}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-2 gap-y-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {streams.map(({ stream, playback }) => (
          <LiveCard key={stream.address} stream={stream} warning={playback === 'warn'} />
        ))}
      </div>
    </div>
  )
}
