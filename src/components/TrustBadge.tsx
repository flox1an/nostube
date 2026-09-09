import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrustScore } from '@/hooks/useTrustScore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TrustScoreDialog } from '@/components/TrustScoreDebugPanel'
import { getTrustColor } from '@/lib/trust-score-colors'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TrustBadgeProps {
  pubkey: string
  className?: string
}

export function TrustBadge({ pubkey, className }: TrustBadgeProps) {
  const { score, isLoading } = useTrustScore(pubkey)

  if (isLoading) return null

  return <TrustBadgeDisplay pubkey={pubkey} score={score} className={className} />
}

interface TrustBadgeDisplayProps {
  pubkey: string
  score: number | null | undefined
  className?: string
}

export function TrustBadgeDisplay({ pubkey, score, className }: TrustBadgeDisplayProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)

  if (score === null || score === undefined) return null

  const percentage = Math.round(score * 100)
  const trust = getTrustColor(score)
  const isLowTrust = trust.label === 'Low'

  // Routine identity rows only surface an icon; the raw number is opt-in via
  // the dialog. Low trust is a meaningful warning, so it stays labeled — not
  // just color-coded — to remain prominent for color-blind viewers too.
  const tooltipText = isLowTrust
    ? t('trust.badge.tooltipLow', {
        percentage,
        defaultValue: 'Low trust ({{percentage}}%) — tap for details',
      })
    : t('trust.badge.tooltip', {
        label: t(trust.labelKey),
        defaultValue: '{{label}} trust — tap for details',
      })

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              setDialogOpen(true)
            }}
            aria-label={tooltipText}
            className={cn(
              'inline-flex items-center gap-1 text-xs cursor-pointer hover:opacity-80 transition-opacity rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              trust.colorClass,
              className
            )}
          >
            <Shield className="h-3 w-3" />
            {isLowTrust && t('trust.labels.low', { defaultValue: 'Low' })}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
      <TrustScoreDialog pubkey={pubkey} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
