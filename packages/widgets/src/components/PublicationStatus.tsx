import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, CircleAlert, Copy, Loader2, RotateCcw, Send, X } from 'lucide-react'
import { Button } from './button'
import { Progress } from './progress'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { cn } from '../cn'
import { dismissPublication, usePublications, type PublicationActivity } from '../publication'

export function PublicationStatus({ activity }: { activity: PublicationActivity }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now)
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const pending = activity.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [pending])
  const elapsed = Math.max(0, Math.floor((now - activity.startedAt) / 1000))
  const slow = pending && now - activity.updatedAt >= 8000
  const problem = activity.status === 'failed' || activity.status === 'partial' || !!activity.error
  const targetProblem =
    activity.targets?.some(target => target.status === 'failed' || target.status === 'timeout') ??
    false
  const open = expanded ?? (slow || problem || targetProblem)
  const confirmed = activity.targets?.filter(target => target.status === 'confirmed').length ?? 0
  const hasProgress =
    activity.total !== undefined && activity.total > 0 && activity.completed !== undefined
  const phase = t(`publication.phase.${activity.phase}`)
  const summary = pending ? phase : t(`publication.result.${activity.status}`)
  const formatBytes = (bytes: number) =>
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
      : bytes >= 1024 ** 2
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${Math.round(bytes / 1024)} KB`
  const details = [
    activity.label,
    summary,
    activity.error,
    ...(activity.targets?.map(
      target => `${target.url}: ${target.status}${target.message ? ` — ${target.message}` : ''}`
    ) ?? []),
  ]
    .filter(Boolean)
    .join('\n')
  const runAction = async (action: () => Promise<unknown>) => {
    setRetrying(true)
    setActionError(undefined)
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setRetrying(false)
    }
  }
  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
    } catch {
      setActionError(t('publication.copyFailed'))
    }
  }
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm"
      aria-label={activity.label}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0" aria-hidden="true">
          {pending ? (
            <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" />
          ) : problem ? (
            <CircleAlert className="size-5 text-destructive" />
          ) : (
            <Check className="size-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-sm font-medium">{activity.label}</p>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {summary}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {activity.targets && (
              <span>
                {t('publication.confirmed', { done: confirmed, total: activity.targets.length })}
              </span>
            )}
            {pending && <span>{t('publication.elapsed', { seconds: elapsed })}</span>}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 size-11 shrink-0"
          aria-label={t('publication.dismiss')}
          title={t('publication.dismiss')}
          onClick={() => dismissPublication(activity.id)}
        >
          <X />
        </Button>
      </div>
      {hasProgress && (
        <div className="space-y-1 px-4 pb-3">
          <Progress
            className="h-1.5 motion-reduce:transition-none"
            value={Math.min(100, (activity.completed! / activity.total!) * 100)}
            aria-label={phase}
          />
          <p className="text-xs tabular-nums text-muted-foreground">
            {activity.unit === 'bytes'
              ? `${formatBytes(activity.completed!)} / ${formatBytes(activity.total!)}`
              : activity.unit === 'files'
                ? t('publication.files', { done: activity.completed, total: activity.total })
                : `${Math.round((activity.completed! / activity.total!) * 100)}%`}
          </p>
        </div>
      )}
      <div className="px-4 pb-2">
        {slow && (
          <p className="pb-2 text-sm text-muted-foreground">
            {t(activity.phase === 'signing' ? 'publication.signerWait' : 'publication.slow')}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          className="-ml-3 min-h-11 h-auto gap-1 px-3 text-sm"
          aria-expanded={open}
          aria-controls={`publication-${activity.id}`}
          onClick={() => setExpanded(!open)}
        >
          {t(open ? 'publication.hideDetails' : 'publication.details')}
          <ChevronDown className={cn('size-4', open && 'rotate-180')} />
        </Button>
      </div>
      {open && (
        <div
          id={`publication-${activity.id}`}
          className="space-y-3 border-t border-border px-4 py-3 text-sm"
        >
          <p className="text-muted-foreground">
            {t(
              activity.lifetime === 'server'
                ? 'publication.serverLifetime'
                : 'publication.browserLifetime'
            )}
          </p>
          {activity.targets && activity.targets.length > 0 && (
            <ul className="space-y-3">
              {activity.targets.map((target, index) => (
                <li key={`${target.url}:${index}`} className="space-y-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-all font-medium">{target.url}</span>
                    <span
                      className={cn(
                        'text-xs',
                        target.status === 'failed' || target.status === 'timeout'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {t(`publication.target.${target.status}`)}
                    </span>
                  </div>
                  {target.message && (
                    <p className="break-words text-xs text-muted-foreground">{target.message}</p>
                  )}
                  {target.nextAttemptAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('publication.nextAttempt', {
                        time: new Date(target.nextAttemptAt * 1000).toLocaleString(),
                      })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(activity.error || actionError) && (
            <p className="break-words text-destructive" role="alert">
              {actionError ?? activity.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {activity.retry && (!pending || targetProblem || activity.error) && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 h-auto"
                disabled={retrying}
                onClick={() => void runAction(activity.retry!)}
              >
                <RotateCcw />
                {activity.retryLabel ?? t('publication.retry')}
              </Button>
            )}
            {activity.cancel && pending && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 h-auto"
                onClick={activity.cancel}
              >
                {t('publication.cancel')}
              </Button>
            )}
            {activity.href && (
              <Button asChild variant="outline" className="min-h-11 h-auto">
                <a href={activity.href}>{t('publication.backgroundDetails')}</a>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 h-auto"
              onClick={() => void copyDetails()}
            >
              <Copy />
              {t(copied ? 'publication.copied' : 'publication.copy')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

export function PublicationStatusButton() {
  const { t } = useTranslation()
  const activities = usePublications().filter(activity => !activity.hidden)
  if (activities.length === 0) return null
  const targets = activities.flatMap(activity => activity.targets ?? [])
  const confirmed = targets.filter(target => target.status === 'confirmed').length
  const pending = activities.some(activity => activity.status === 'pending')
  const problem =
    confirmed < targets.length ||
    activities.some(
      activity => activity.status === 'failed' || activity.status === 'partial' || !!activity.error
    )
  const label = `${t('publication.title')}${targets.length ? `: ${t('publication.confirmed', { done: confirmed, total: targets.length })}` : ''}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'h-11 shrink-0 gap-1 px-2',
            problem && 'text-destructive hover:text-destructive'
          )}
          aria-label={label}
          title={label}
        >
          {pending ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {targets.length > 0 && (
            <span className="text-xs tabular-nums" aria-hidden>
              {confirmed}/{targets.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[70] max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(25rem,calc(100vw-1rem))] space-y-3 overflow-y-auto p-3"
        aria-label={t('publication.title')}
      >
        <h2 className="text-sm font-semibold">{t('publication.title')}</h2>
        {[...activities].reverse().map(activity => (
          <PublicationStatus key={activity.id} activity={activity} />
        ))}
      </PopoverContent>
    </Popover>
  )
}
