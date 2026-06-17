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
            className={cn(
              'inline-flex items-center gap-0.5 text-xs cursor-pointer hover:opacity-80 transition-opacity',
              trust.colorClass,
              className
            )}
          >
            <Shield className="h-3 w-3" />
            {percentage}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {t('trust.badge.tooltip', {
            label: t(trust.labelKey),
            percentage,
            defaultValue: '{{label}} trust ({{percentage}}%) — click for details',
          })}
        </TooltipContent>
      </Tooltip>
      <TrustScoreDialog pubkey={pubkey} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
