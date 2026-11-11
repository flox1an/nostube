import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { hasLightningAddress, formatSats } from '@nostube/core/zap-utils'
import { ZAP_GOAL_KIND } from '@nostube/core/zap-goal'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { ZapButton } from '@/components/ZapButton'
import { cn } from '@/lib/utils'
import type { ZapGoalState } from '@/hooks/useZapGoals'

/**
 * A NIP-75 zap goal: title, verified progress and a zap button that pays the goal's author.
 * `streamAddress` adds the stream to the zap request so the zap also shows in that stream's chat.
 */
export function ZapGoalBar({
  state: { goal, progress },
  streamAddress,
  className,
}: {
  state: ZapGoalState
  streamAddress?: string
  className?: string
}) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey: goal.pubkey })
  const closed = goal.closedAt !== undefined && goal.closedAt <= Math.floor(Date.now() / 1000)
  const canZap = !closed && hasLightningAddress(profile)

  return (
    <div className={cn('rounded-lg border bg-card p-3', className)} data-zap-goal={goal.id}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium wrap-anywhere">
          <Zap className="mr-1 inline h-4 w-4 text-yellow-500" aria-hidden />
          {goal.title || t('zapGoal.untitled', 'Zap goal')}
        </p>
        {canZap && (
          <ZapButton
            eventId={goal.id}
            kind={ZAP_GOAL_KIND}
            authorPubkey={goal.pubkey}
            address={streamAddress}
            extraRelays={goal.relays}
            layout="inline"
            size="sm"
            showZapText
            className="shrink-0"
          />
        )}
      </div>
      {progress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.percent)}
          aria-label={goal.title || t('zapGoal.untitled', 'Zap goal')}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-yellow-500 transition-[width]"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
      <p className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        {progress && (
          <span className="font-semibold text-foreground">
            {t('zapGoal.raised', {
              defaultValue: '{{amount}} sats',
              amount: formatSats(progress.raisedSats),
            })}
          </span>
        )}
        <span className="ml-auto">
          {closed
            ? t('zapGoal.closed', 'Closed')
            : t('zapGoal.target', {
                defaultValue: 'Goal: {{amount}}',
                amount: formatSats(goal.targetSats),
              })}
        </span>
      </p>
    </div>
  )
}
