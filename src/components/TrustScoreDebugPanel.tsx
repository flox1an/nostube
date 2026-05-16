import { Shield, ChevronDown, ChevronRight, Loader2, Swords } from 'lucide-react'
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
import { useTranslation } from 'react-i18next'
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
          className={cn('h-full rounded-full transition-all', getTrustColor(score).bgClass)}
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

interface UserLevel {
  name: string
  colorClass: string
  bgClass: string
  minScore: number
}

const USER_LEVELS: UserLevel[] = [
  { name: 'Grandmaster', colorClass: 'text-purple-500', bgClass: 'bg-purple-500', minScore: 0.9 },
  { name: 'Master', colorClass: 'text-amber-500', bgClass: 'bg-amber-500', minScore: 0.75 },
  { name: 'Adept', colorClass: 'text-blue-500', bgClass: 'bg-blue-500', minScore: 0.5 },
  { name: 'Apprentice', colorClass: 'text-green-500', bgClass: 'bg-green-500', minScore: 0.2 },
  {
    name: 'Novice',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted-foreground',
    minScore: 0,
  },
]

/**
 * Color mapping for personalized trust scores (badge + dialog header).
 * Separate from getUserLevel which is for the global NosTube user level only.
 */
export function getTrustColor(score: number): {
  label: string
  labelKey: string
  colorClass: string
  bgClass: string
} {
  if (score >= 0.7)
    return {
      label: 'High',
      labelKey: 'trust.labels.high',
      colorClass: 'text-green-500',
      bgClass: 'bg-green-500',
    }
  if (score >= 0.4)
    return {
      label: 'Medium',
      labelKey: 'trust.labels.medium',
      colorClass: 'text-yellow-500',
      bgClass: 'bg-yellow-500',
    }
  return {
    label: 'Low',
    labelKey: 'trust.labels.low',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500',
  }
}

export function getUserLevel(score: number): UserLevel {
  return USER_LEVELS.find(l => score >= l.minScore) ?? USER_LEVELS[USER_LEVELS.length - 1]
}

function TrustScoreContent({ result }: { result: TrustScoreResult }) {
  const { t } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const percentage = Math.round(result.score * 100)
  const { components } = result
  const validators = components.validators
  const globalScore = getGlobalScore(result)
  const reportPenalty = Object.entries(validators).find(([k]) => k.endsWith(':report_penalty'))?.[1]

  return (
    <div className="space-y-3">
      {/* Overall personalized score */}
      {(() => {
        const trust = getTrustColor(result.score)
        return (
          <div className="flex items-center gap-3">
            <Shield className={cn('h-6 w-6', trust.colorClass)} />
            <div>
              <span className="text-2xl font-bold">{percentage}%</span>
              <span className={cn('text-sm ml-2', trust.colorClass)}>
                {t('trust.details.trustLabel', {
                  label: t(trust.labelKey),
                  defaultValue: '{{label}} Trust',
                })}
              </span>
            </div>
          </div>
        )
      })()}

      {/* NosTube User Level */}
      {globalScore !== null &&
        (() => {
          const level = getUserLevel(globalScore)
          const globalPct = Math.round(globalScore * 100)
          return (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Swords className={cn('h-5 w-5', level.colorClass)} />
                  <span className={cn('text-base font-bold', level.colorClass)}>
                    {t(`trust.levels.${level.name.toLowerCase()}`)}
                  </span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{globalPct}%</span>
              </div>
              {/* Level progress bar with tier markers */}
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', level.bgClass)}
                  style={{ width: `${globalPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t('trust.levels.novice')}</span>
                <span>{t('trust.levels.apprentice')}</span>
                <span>{t('trust.levels.adept')}</span>
                <span>{t('trust.levels.master')}</span>
                <span>{t('trust.levels.gm')}</span>
              </div>
              {reportPenalty && reportPenalty.score < 1 && (
                <p className="text-xs text-red-500">
                  {t('trust.details.reportPenalty', {
                    score: reportPenalty.score.toFixed(2),
                    defaultValue: 'Report penalty active: ×{{score}}',
                  })}
                </p>
              )}
            </div>
          )
        })()}

      {/* Expandable details */}
      <button
        onClick={() => setDetailsOpen(prev => !prev)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {detailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t('trust.details.toggle', { defaultValue: 'Details…' })}
      </button>

      {detailsOpen && (
        <div className="space-y-3">
          {/* Social distance */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">
                {t('trust.details.socialDistance', { defaultValue: 'Social Distance' })}
              </span>
              <div className="font-mono font-medium">{components.socialDistance}</div>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">
                {t('trust.details.distanceWeight', { defaultValue: 'Distance Weight' })}
              </span>
              <div className="font-mono font-medium">{components.distanceWeight}</div>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">
                {t('trust.details.normalizedDistance', { defaultValue: 'Normalized Distance' })}
              </span>
              <div className="font-mono font-medium">{components.normalizedDistance}</div>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <span className="text-muted-foreground">
                {t('trust.details.computedAt', { defaultValue: 'Computed At' })}
              </span>
              <div className="font-mono font-medium">
                {new Date(
                  typeof result.computedAt === 'number'
                    ? result.computedAt * 1000
                    : result.computedAt
                ).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Validators */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">
              {t('trust.details.validators', { defaultValue: 'Validators' })}
            </h4>
            <div className="border rounded-md">
              {Object.entries(validators)
                .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                .map(([name, validator]) => (
                  <ValidatorRow key={name} name={name} validator={validator} />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TrustScoreDialogProps {
  pubkey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrustScoreDialog({ pubkey, open, onOpenChange }: TrustScoreDialogProps) {
  const { t } = useTranslation()
  const { result, isLoading } = useTrustScoreDetail(pubkey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('trust.dialog.title', { defaultValue: 'Trust Score Details' })}
          </DialogTitle>
          <DialogDescription>
            {t('trust.dialog.description', {
              defaultValue: 'Personalized trust score from relatr via ContextVM',
            })}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <TrustScoreContent result={result} />
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('trust.dialog.loading', { defaultValue: 'Loading trust score...' })}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t('trust.dialog.noScore', {
              defaultValue: 'No trust score available for this user.',
            })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
