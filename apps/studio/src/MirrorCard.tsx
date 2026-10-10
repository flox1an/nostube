import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { loadOutbox, retryOutbox, type OutboxStatus } from './api'

type Load =
  | { name: 'loading' }
  | { name: 'failed'; message: string }
  | { name: 'ready'; status: OutboxStatus }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * What the outbox has copied to the mirror targets of the running config, with the problems and
 * a retry for jobs that gave up. Reads the server's state, not the unsaved form.
 */
export function MirrorCard() {
  const { t, i18n } = useTranslation()
  const [load, setLoad] = useState<Load>({ name: 'loading' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Only the latest request may land: an older answer, or one after leaving the page, is dropped.
  const latest = useRef({ id: 0 })

  const refresh = useCallback(async () => {
    const id = ++latest.current.id
    try {
      const status = await loadOutbox()
      if (id === latest.current.id) setLoad({ name: 'ready', status })
    } catch (e) {
      if (id === latest.current.id) setLoad({ name: 'failed', message: message(e) })
    }
  }, [])

  useEffect(() => {
    const requests = latest.current
    void refresh()
    return () => {
      requests.id++
    }
  }, [refresh])

  const retry = async (target?: string) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice(t('studio.mirror.retried', { count: await retryOutbox(target) }))
      await refresh()
    } catch (e) {
      setNotice(message(e))
    } finally {
      setBusy(false)
    }
  }

  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(i18n.resolvedLanguage)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studio.mirror.title')}</CardTitle>
        <CardDescription>{t('studio.mirror.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {load.name === 'loading' && <Skeleton className="h-24 w-full" />}
        {load.name === 'failed' && (
          <Alert variant="destructive">
            <AlertTitle>{t('studio.mirror.loadFailed')}</AlertTitle>
            <AlertDescription>{load.message}</AlertDescription>
          </Alert>
        )}
        {load.name === 'ready' && (
          <>
            {load.status.counts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('studio.mirror.empty')}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t('studio.mirror.target')}</th>
                    <th className="py-1 pr-3 font-medium">{t('studio.mirror.kind')}</th>
                    <th className="py-1 pr-3 font-medium">{t('studio.mirror.done')}</th>
                    <th className="py-1 pr-3 font-medium">{t('studio.mirror.pending')}</th>
                    <th className="py-1 font-medium">{t('studio.mirror.failed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {load.status.counts.map(c => (
                    <tr key={`${c.target}|${c.kind}`} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs break-all">{c.target}</td>
                      <td className="py-1 pr-3">{t(`studio.mirror.kinds.${c.kind}`)}</td>
                      <td className="py-1 pr-3">{c.done}</td>
                      <td className="py-1 pr-3">{c.pending}</td>
                      <td className="py-1">{c.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {load.status.problems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('studio.mirror.problems')}</h3>
                <ul className="space-y-2">
                  {load.status.problems.map(p => (
                    <li
                      key={`${p.kind}|${p.target}|${p.ref}`}
                      className="rounded-md border p-2 text-xs"
                    >
                      <p className="font-mono break-all">
                        {t(`studio.mirror.kinds.${p.kind}`)} {p.ref.slice(0, 12)} → {p.target}
                      </p>
                      <p className="text-destructive break-words">{p.lastError}</p>
                      <p className="text-muted-foreground">
                        {p.status === 'failed'
                          ? t('studio.mirror.gaveUp', { count: p.attempts })
                          : t('studio.mirror.nextAttempt', {
                              count: p.attempts,
                              time: date(p.nextAttemptAt ?? p.updatedAt),
                            })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || load.status.counts.every(c => c.failed === 0)}
                onClick={() => void retry()}
              >
                {t('studio.mirror.retry')}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={refresh}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t('studio.mirror.refresh')}
              </Button>
              {notice && (
                <span role="status" className="text-sm text-muted-foreground">
                  {notice}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
