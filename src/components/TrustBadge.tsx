import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrustScore } from '@/hooks/useTrustScore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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

  if (isLoading || score === null) return null

  const percentage = Math.round(score * 100)
  const { label, colorClass } = getTrustLevel(score)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-0.5 text-xs', colorClass, className)}>
            <Shield className="h-3 w-3" />
            {percentage}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {label} trust ({percentage}%)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
