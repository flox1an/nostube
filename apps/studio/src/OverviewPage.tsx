import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { loadStats, type AdminStats } from './api'

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const

/** Binary steps with the usual unit names, as the upload page shows file sizes. */
function bytesText(bytes: number, locale?: string) {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: UNITS[unit],
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value)
}

type Load =
  | { name: 'loading' }
  | { name: 'failed'; message: string }
  | { name: 'ready'; stats: AdminStats; refreshing: boolean }

/** What the built-in relay and Blossom server hold right now. Reads only, changes nothing. */
export function OverviewPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage
  const [load, setLoad] = useState<Load>({ name: 'loading' })
  // Only the latest request may land: an older answer, or one after leaving the page, is dropped.
  const latest = useRef({ id: 0 })

  const refresh = useCallback(async () => {
    const id = ++latest.current.id
    setLoad(l => (l.name === 'ready' ? { ...l, refreshing: true } : { name: 'loading' }))
    try {
      const stats = await loadStats()
      if (id === latest.current.id) setLoad({ name: 'ready', stats, refreshing: false })
    } catch (e) {
      if (id === latest.current.id) {
        setLoad({ name: 'failed', message: e instanceof Error ? e.message : String(e) })
      }
    }
  }, [])

  useEffect(() => {
    const requests = latest.current
    void refresh()
    return () => {
      requests.id++
    }
  }, [refresh])

  const number = (n: number) => new Intl.NumberFormat(locale).format(n)
  const busy = load.name === 'loading' || (load.name === 'ready' && load.refreshing)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('studio.overview.description')}</p>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          {busy ? t('studio.overview.refreshing') : t('studio.overview.refresh')}
        </Button>
      </div>

      {load.name === 'loading' && <Skeleton className="h-64 w-full" />}

      {load.name === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>{t('studio.overview.loadFailed')}</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}

      {load.name === 'ready' && (
        <Stats stats={load.stats} number={number} bytes={b => bytesText(b, locale)} />
      )}
    </div>
  )
}

function Stats({
  stats: { relay, blossom },
  number,
  bytes,
}: {
  stats: AdminStats
  number: (n: number) => string
  bytes: (b: number) => string
}) {
  const { t, i18n } = useTranslation()
  const maxCount = Math.max(1, ...relay.eventsByKind.map(k => k.count))
  // Share of the quota in use, capped at 100 when over it; no bar without a quota (0).
  const percent =
    blossom.quotaBytes > 0 ? Math.min(100, (blossom.storageBytes / blossom.quotaBytes) * 100) : null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.overview.relay')}</CardTitle>
          <CardDescription>
            <code className="break-all">{relay.url}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Figure label={t('studio.overview.events')} value={number(relay.totalEvents)}>
              {t('studio.overview.eventsHint')}
            </Figure>
            <Figure label={t('studio.overview.database')} value={bytes(relay.databaseBytes)}>
              {t('studio.overview.databaseHint')}
            </Figure>
          </dl>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('studio.overview.byKind')}</h3>
            {relay.eventsByKind.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('studio.overview.noEvents')}</p>
            ) : (
              <ul className="space-y-2">
                {relay.eventsByKind.map(({ kind, count }) => {
                  const name = i18n.exists(`studio.overview.kinds.${kind}`)
                    ? t(`studio.overview.kinds.${kind}`)
                    : null
                  return (
                    <li key={kind} className="space-y-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span>
                          {t('studio.overview.kind', { kind })}
                          {name && <span className="text-muted-foreground"> · {name}</span>}
                        </span>
                        <span className="tabular-nums">{number(count)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary" aria-hidden>
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(1, (count / maxCount) * 100)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.overview.blossom')}</CardTitle>
          <CardDescription>
            <code className="break-all">{blossom.url}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Figure label={t('studio.overview.files')} value={number(blossom.files)} />
            <Figure label={t('studio.overview.storage')} value={bytes(blossom.storageBytes)} />
            <Figure
              label={t('studio.overview.quota')}
              value={
                blossom.quotaBytes > 0 ? bytes(blossom.quotaBytes) : t('studio.overview.unlimited')
              }
            />
            <Figure label={t('studio.overview.freeDisk')} value={bytes(blossom.freeDiskBytes)}>
              {t('studio.overview.reserveHint', {
                reserve: bytes(blossom.freeSpaceReserveBytes),
              })}
            </Figure>
          </dl>
          {percent !== null && (
            <div className="space-y-1">
              <progress
                className="h-2 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
                max={100}
                value={percent}
                aria-label={t('studio.overview.quotaLabel')}
              />
              <p className="text-sm text-muted-foreground">
                {t('studio.overview.quotaUsed', {
                  percent: new Intl.NumberFormat(i18n.resolvedLanguage, {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  }).format(percent / 100),
                  quota: bytes(blossom.quotaBytes),
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.overview.activity')}</CardTitle>
          <CardDescription>{t('studio.overview.activityDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Figure label={t('studio.overview.uploads')} value={number(blossom.uploads)} />
            <Figure label={t('studio.overview.downloads')} value={number(blossom.downloads)} />
            <Figure label={t('studio.overview.served')} value={bytes(blossom.servedBytes)} />
          </dl>
        </CardContent>
      </Card>
    </>
  )
}

function Figure({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {children && <dd className="text-xs text-muted-foreground">{children}</dd>}
    </div>
  )
}
