import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrustScore } from '@/hooks/useTrustScore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TrustScoreDialog } from '@/components/TrustScoreDebugPanel'
import { useState } from 'react'

interface TrustBadgeProps {
  pubkey: string
  className?: string
}

function getTrustLevel(score: number): {
  label: string
  colorClass: string
} {
  if (score >= 0.7) return { label: 'High', colorClass: 'text-green-500' }
  if (score >= 0.4) return { label: 'Medium', colorClass: 'text-yellow-500' }
  return { label: 'Low', colorClass: 'text-red-500' }
}

export function TrustBadge({ pubkey, className }: TrustBadgeProps) {
  const { score, isLoading } = useTrustScore(pubkey)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (isLoading || score === null) return null

  const percentage = Math.round(score * 100)
  const { label, colorClass } = getTrustLevel(score)

  return (
    <>
      <TooltipProvider>
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
                colorClass,
                className
              )}
            >
              <Shield className="h-3 w-3" />
              {percentage}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {label} trust ({percentage}%) — click for details
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TrustScoreDialog pubkey={pubkey} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
