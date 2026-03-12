import { Shield, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTrustScoreDetail } from '@/hooks/useTrustScore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'
import { type TrustScoreResult, getGlobalScore } from '@/nostr/contextvm'

function ScoreBar({
  score,
  label,
  className,
}: {
  score: number
  label: string
  className?: string
}) {
  const percentage = Math.round(score * 100)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{percentage}%</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-foreground min-w-0 truncate">{label}</span>
    </div>
  )
}

function ValidatorRow({
  name,
  validator,
}: {
  name: string
  validator: { score: number; description?: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const shortName = name.includes(':') ? name.split(':').pop()! : name

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <ScoreBar score={validator.score} label={shortName} className="flex-1" />
      </button>
      {expanded && validator.description && (
        <p className="text-xs text-muted-foreground pl-7 pb-2">{validator.description}</p>
      )}
    </div>
  )
}

function TrustScoreContent({ result }: { result: TrustScoreResult }) {
  const percentage = Math.round(result.score * 100)
  const { components } = result
  const validators = components.validators
  const globalScore = getGlobalScore(result)

  return (
    <div className="space-y-3">
      {/* Overall score */}
      <div className="flex items-center gap-3">
        <Shield
          className={cn(
            'h-6 w-6',
            result.score >= 0.7
              ? 'text-green-500'
              : result.score >= 0.4
                ? 'text-yellow-500'
                : 'text-red-500'
          )}
        />
        <div>
          <span className="text-2xl font-bold">{percentage}%</span>
          <span className="text-sm text-muted-foreground ml-2">
            {result.score >= 0.7 ? 'High' : result.score >= 0.4 ? 'Medium' : 'Low'} Trust
          </span>
        </div>
      </div>

      {/* Global NosTube score */}
      {globalScore !== null && (
        <div className="bg-muted/50 rounded-md p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Global NosTube Score</span>
            <span
              className={cn(
                'text-lg font-bold',
                globalScore >= 0.7
                  ? 'text-green-500'
                  : globalScore >= 0.4
                    ? 'text-yellow-500'
                    : 'text-red-500'
              )}
            >
              {Math.round(globalScore * 100)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Platform score based on video activity, engagement, and community participation
          </p>
        </div>
      )}

      {/* Social distance */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Social Distance</span>
          <div className="font-mono font-medium">{components.socialDistance}</div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Distance Weight</span>
          <div className="font-mono font-medium">{components.distanceWeight}</div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Normalized Distance</span>
          <div className="font-mono font-medium">{components.normalizedDistance}</div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Computed At</span>
          <div className="font-mono font-medium">
            {new Date(
              typeof result.computedAt === 'number' ? result.computedAt * 1000 : result.computedAt
            ).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Validators */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Validators</h4>
        <div className="border rounded-md">
          {Object.entries(validators)
            .sort(([, a], [, b]) => b.score - a.score)
            .map(([name, validator]) => (
              <ValidatorRow key={name} name={name} validator={validator} />
            ))}
        </div>
      </div>
    </div>
  )
}

interface TrustScoreDialogProps {
  pubkey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrustScoreDialog({ pubkey, open, onOpenChange }: TrustScoreDialogProps) {
  const { result, isLoading } = useTrustScoreDetail(pubkey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Trust Score Details
          </DialogTitle>
          <DialogDescription>Personalized trust score from relatr via ContextVM</DialogDescription>
        </DialogHeader>
        {result ? (
          <TrustScoreContent result={result} />
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading trust score...</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No trust score available. Log in to see trust scores.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
