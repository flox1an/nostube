import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
