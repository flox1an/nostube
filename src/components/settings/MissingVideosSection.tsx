import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMissingVideos } from '@/hooks/useMissingVideos'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { enUS, de } from 'date-fns/locale'
import { RefreshCw, Trash2 } from 'lucide-react'

export function MissingVideosSection() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'de' ? de : enUS
  const { getAllMissingVideos, clearMissingVideo, clearAllMissing, getMissingCount } =
    useMissingVideos()

  const missingVideos = getAllMissingVideos()
  const missingCount = getMissingCount()
  const entries = Object.entries(missingVideos)

  // Use state for current time to avoid impure function calls during render
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Update every minute to refresh retry status
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatRetryTime = (retryAfter: number | undefined) => {
    if (!retryAfter) return 'Unknown'
    if (now >= retryAfter) return t('settings.missingVideos.ready')
    return `Retry in ${formatDistance(retryAfter, now, { locale: dateLocale })}`
  }

  const getStatusBadge = (video: {
    failedAt: number
    retryAfter?: number
    attemptCount: number
  }) => {
    const isPermanent = now - video.failedAt > 7 * 24 * 60 * 60 * 1000 // 7 days

    if (isPermanent) {
      return <Badge variant="destructive">{t('settings.missingVideos.permanent')}</Badge>
    }

    if (video.retryAfter && now >= video.retryAfter) {
      return (
        <Badge variant="default" className="bg-green-500">
          {t('settings.missingVideos.readyToRetry')}
        </Badge>
      )
    }

    return <Badge variant="secondary">{t('settings.missingVideos.cooldown')}</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('settings.missingVideos.title')}</span>
          {missingCount > 0 && (
            <Badge variant="outline" className="ml-2">
              {t('settings.missingVideos.filtered', { count: missingCount })}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t('settings.missingVideos.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t('settings.missingVideos.noMissing')}
            </p>
          ) : (
            <>
              <ScrollArea className="w-full rounded-md border p-4 max-h-96">
                <ul className="space-y-3">
                  {entries.map(([videoId, video]) => (
                    <li
                      key={videoId}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[300px]">
                            {videoId}
                          </code>
                          {getStatusBadge(video)}
                        </div>
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            {t('settings.missingVideos.failed')}{' '}
                            {formatDistance(video.failedAt, now, {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </p>
                          <p className="text-muted-foreground">
                            {t('settings.missingVideos.attempts')} {video.attemptCount} •{' '}
                            {formatRetryTime(video.retryAfter)}
                          </p>
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">
                              {t('settings.missingVideos.showUrls')} ({video.urls.length})
                            </summary>
                            <ul className="mt-2 space-y-1 pl-4">
                              {video.urls.map((url, i) => (
                                <li key={i} className="truncate" title={url}>
                                  {url}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            clearMissingVideo(videoId)
                          }}
                          title={t('settings.missingVideos.retryNow')}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => clearMissingVideo(videoId)}
                          title={t('settings.missingVideos.remove')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              <div className="flex gap-2">
                <Button variant="outline" onClick={clearAllMissing} className="w-full">
                  {t('settings.missingVideos.clearAll')} ({entries.length})
                </Button>
              </div>

              <div className="text-sm text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
                <p className="font-semibold">{t('settings.missingVideos.scheduleTitle')}</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('settings.missingVideos.schedule1')}</li>
                  <li>{t('settings.missingVideos.schedule2')}</li>
                  <li>{t('settings.missingVideos.schedule3')}</li>
                  <li>{t('settings.missingVideos.schedule4')}</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
