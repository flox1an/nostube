import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { cn } from '@/lib/utils'

/** The red LIVE marker on thumbnails, names and stream headers. */
export function LiveBadge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] leading-4 font-bold tracking-wide text-white',
        className
      )}
    >
      <Radio className="h-2.5 w-2.5" aria-hidden="true" />
      {t('live.badge', 'LIVE')}
    </span>
  )
}

/** Scheduled (with its upcoming start) or ended marker for a stream that is not live. */
export function LiveStatusBadge({
  stream,
  className,
}: {
  stream: Pick<LiveStream, 'status' | 'starts'>
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const upcoming = stream.status === 'planned' && stream.starts && stream.starts * 1000 > Date.now()
  const label =
    stream.status === 'ended'
      ? t('live.offline', 'Ended')
      : upcoming
        ? new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(stream.starts! * 1000)
        : t('live.scheduled', 'Scheduled')
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded bg-black/75 px-1.5 py-0.5 text-[10px] leading-4 font-semibold text-white',
        className
      )}
    >
      {label}
    </span>
  )
}
