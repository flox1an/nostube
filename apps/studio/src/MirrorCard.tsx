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
import { loadEventOutbox, loadOutbox, retryOutbox, type OutboxJob, type OutboxStatus } from './api'
import { deliveryEventId, jobStatus } from './delivery'

type Load =
  | { name: 'loading' }
  | { name: 'failed'; message: string }
  /** `jobs`: the outbox jobs of the event the address names (`#/distribution?event=<id>`). */
  | { name: 'ready'; status: OutboxStatus; jobs: OutboxJob[] | null }

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
  const [eventId, setEventId] = useState(() => deliveryEventId(location.hash))
  const delivery = useRef<HTMLElement>(null)
  // Only the latest request may land: an older answer, or one after leaving the page, is dropped.
  const latest = useRef({ id: 0 })

  useEffect(() => {
    const onChange = () => setEventId(deliveryEventId(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const refresh = useCallback(async () => {
    const id = ++latest.current.id
    try {
      const [status, jobs] = await Promise.all([
        loadOutbox(),
        eventId ? loadEventOutbox(eventId) : null,
      ])
      if (id === latest.current.id) setLoad({ name: 'ready', status, jobs })
    } catch (e) {
      if (id === latest.current.id) setLoad({ name: 'failed', message: message(e) })
    }
  }, [eventId])

  useEffect(() => {
    const requests = latest.current
    void refresh()
    return () => {
      requests.id++
    }
  }, [refresh])

  useEffect(() => {
    if (load.name !== 'ready' || !load.jobs?.some(job => job.status === 'pending' && job.active))
      return
    const timer = setTimeout(() => void refresh(), 3000)
    return () => clearTimeout(timer)
  }, [load, refresh])

  // A delivery link opens this page at its top; the event's status is what it came for.
  const shown = load.name === 'ready' && load.jobs !== null
  useEffect(() => {
    if (shown) delivery.current?.scrollIntoView({ block: 'start' })
  }, [shown, eventId])

  const retry = async (target?: string, event?: string) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice(t('studio.mirror.retried', { count: await retryOutbox(target, event) }))
      await refresh()
    } catch (e) {
      setNotice(message(e))
    } finally {
      setBusy(false)
    }
  }

  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(i18n.resolvedLanguage)

  // Nothing ever queued and no delivery asked for: an instance without mirrors sees no card.
  if (
    !eventId &&
    (load.name === 'loading' ||
      (load.name === 'ready' &&
        load.status.counts.length === 0 &&
        load.status.problems.length === 0))
  )
    return null

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

            {eventId && load.jobs && (
              <section
                ref={delivery}
                aria-labelledby="delivery-title"
                className="scroll-mt-4 space-y-2"
              >
                <h3 id="delivery-title" className="text-sm font-medium break-all">
                  {t('studio.mirror.event', { id: eventId })}
                </h3>
                {load.jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('studio.mirror.eventEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {load.jobs.map(job => {
                      const status = jobStatus(job)
                      return (
                        <li key={job.id} className="rounded-md border p-2 text-xs">
                          <p className="font-mono break-all">
                            {t(`studio.mirror.kinds.${job.kind}`, { defaultValue: job.kind })}{' '}
                            {job.ref.slice(0, 12)} → {job.target}
                          </p>
                          <p className={status === 'failed' ? 'text-destructive' : undefined}>
                            {t(`publication.target.${status}`)}
                          </p>
                          {(job.lastError ?? (job.status === 'pending' && !job.active)) && (
                            <p className="break-words">
                              {job.lastError ?? t('publication.inactive')}
                            </p>
                          )}
                          {status === 'pending' && job.nextAttemptAt && (
                            <p className="text-muted-foreground">
                              {t('publication.nextAttempt', { time: date(job.nextAttemptAt) })}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || !load.jobs.some(job => job.status === 'failed')}
                  onClick={() => void retry(undefined, eventId)}
                >
                  {t('publication.retry')}
                </Button>
              </section>
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
