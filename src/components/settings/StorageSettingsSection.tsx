import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash2, Loader2 } from 'lucide-react'
import { useMissingVideos } from '@/hooks/useMissingVideos'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw } from 'lucide-react'
import { formatDistance } from 'date-fns/formatDistance'
import { getDateLocale } from '@/lib/date-locale'
import { clearBrowserCacheDataOnReload } from '@/lib/cache-clear'
import { resetNostrRuntimeCache } from '@/nostr/core'

// ─── Cache Clear Section ─────────────────────────────

function CacheClearSection() {
  const { t } = useTranslation()
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [cacheSize, setCacheSize] = useState<string>(t('settings.cache.calculating'))

  const estimateCacheSize = useCallback(async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        const usageInMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2)
        return `~${usageInMB} MB`
      }
    } catch {
      // ignore
    }
    return 'Unknown'
  }, [])

  const refreshCacheSize = useCallback(async () => {
    setCacheSize(t('settings.cache.calculating'))
    const size = await estimateCacheSize()
    setCacheSize(size)
  }, [estimateCacheSize, t])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const size = await estimateCacheSize()
      if (!cancelled) setCacheSize(size)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [estimateCacheSize])

  const handleClearCache = async () => {
    setIsClearing(true)
    setShowClearDialog(false)
    try {
      resetNostrRuntimeCache()
      clearBrowserCacheDataOnReload()
    } catch (error) {
      console.error('Failed to clear cache:', error)
      window.location.reload()
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">{t('settings.cache.description')}</p>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">{t('settings.cache.cacheSize')}</p>
            <p className="text-sm text-muted-foreground">{cacheSize}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshCacheSize()}
            disabled={isClearing}
          >
            {t('common.refresh')}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <div>
            <p className="font-medium text-destructive">{t('settings.cache.clearButton')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.cache.clearDescription')}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowClearDialog(true)}
            disabled={isClearing}
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('settings.cache.clearing')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('settings.cache.clearButton')}
              </>
            )}
          </Button>
        </div>

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground font-medium">
            {t('settings.cache.whatGetsCleared')}
          </summary>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>{t('settings.cache.item1')}</li>
            <li>{t('settings.cache.item2')}</li>
            <li>{t('settings.cache.item3')}</li>
            <li>{t('settings.cache.item4')}</li>
          </ul>
          <p className="mt-2">{t('settings.cache.note')}</p>
        </details>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.cache.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.cache.confirmMessage')}
              <br />
              <br />
              {t('settings.cache.confirmWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('settings.cache.clearing')}
                </>
              ) : (
                t('settings.cache.clearButton')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Missing Videos Section ──────────────────────────

function MissingVideosSubSection() {
  const { t, i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const { getAllMissingVideos, clearMissingVideo, clearAllMissing, getMissingCount } =
    useMissingVideos()
  const missingVideos = getAllMissingVideos()
  const missingCount = getMissingCount()
  const entries = Object.entries(missingVideos)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000)
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
    const isPermanent = now - video.failedAt > 7 * 24 * 60 * 60 * 1000
    if (isPermanent)
      return <Badge variant="destructive">{t('settings.missingVideos.permanent')}</Badge>
    if (video.retryAfter && now >= video.retryAfter)
      return (
        <Badge variant="default" className="bg-green-500">
          {t('settings.missingVideos.readyToRetry')}
        </Badge>
      )
    return <Badge variant="secondary">{t('settings.missingVideos.cooldown')}</Badge>
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('settings.missingVideos.description')}</p>
          {missingCount > 0 && (
            <Badge variant="outline">
              {t('settings.missingVideos.filtered', { count: missingCount })}
            </Badge>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t('settings.missingVideos.noMissing')}
          </p>
        ) : (
          <>
            <ScrollArea className="w-full rounded-md border p-3 max-h-72">
              <ul className="space-y-2">
                {entries.map(([videoId, video]) => (
                  <li
                    key={videoId}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg border text-sm"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                          {videoId}
                        </code>
                        {getStatusBadge(video)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.missingVideos.failed')}{' '}
                        {formatDistance(video.failedAt, now, {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.missingVideos.attempts')} {video.attemptCount} •{' '}
                        {formatRetryTime(video.retryAfter)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => clearMissingVideo(videoId)}
                        title={t('settings.missingVideos.retryNow')}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => clearMissingVideo(videoId)}
                        title={t('settings.missingVideos.remove')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <Button variant="outline" onClick={clearAllMissing} className="w-full">
              {t('settings.missingVideos.clearAll')} ({entries.length})
            </Button>

            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground font-medium">
                {t('settings.missingVideos.scheduleTitle')}
              </summary>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>{t('settings.missingVideos.schedule1')}</li>
                <li>{t('settings.missingVideos.schedule2')}</li>
                <li>{t('settings.missingVideos.schedule3')}</li>
                <li>{t('settings.missingVideos.schedule4')}</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Section ────────────────────────────────────

export function StorageSettingsSection() {
  return (
    <div className="space-y-6">
      <CacheClearSection />
      <MissingVideosSubSection />
    </div>
  )
}
