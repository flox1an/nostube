import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrustScore } from '@/hooks/useTrustScore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TrustScoreDialog, getTrustColor } from '@/components/TrustScoreDebugPanel'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TrustBadgeProps {
  pubkey: string
  className?: string
}

export function TrustBadge({ pubkey, className }: TrustBadgeProps) {
  const { t } = useTranslation()
  const { score, isLoading } = useTrustScore(pubkey)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (isLoading || score === null) return null

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
