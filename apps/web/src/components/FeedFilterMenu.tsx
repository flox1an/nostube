import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@nostube/widgets/components/popover'
import { Switch } from '@nostube/widgets/components/switch'
import { useGroupPerDay } from '@/hooks/useGroupPerDay'
import { getInstanceConfig } from '@nostube/core/instance-config'

interface MobileFeedFilterPopoverProps {
  showGroupPerDay?: boolean
  trustEnabled: boolean
  trustHiddenCount: number
  onToggleTrust: () => void
}

/**
 * Compact mobile filter menu: collapses feed-policy toggles into one trigger above the fold
 * and pairs each switch with a plain-language description (no hover tooltips on touch).
 */
export function MobileFeedFilterPopover({
  showGroupPerDay = false,
  trustEnabled,
  trustHiddenCount,
  onToggleTrust,
}: MobileFeedFilterPopoverProps) {
  const { t } = useTranslation()
  const [grouped, setGrouped] = useGroupPerDay()
  const showTrust = !getInstanceConfig()

  if (!showGroupPerDay && !showTrust) return null

  const activeCount = (showGroupPerDay && grouped ? 1 : 0) + (showTrust && trustEnabled ? 1 : 0)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 gap-1.5 px-2.5 text-muted-foreground sm:hidden"
          aria-label={t('pages.home.feedFilters', { defaultValue: 'Feed filters' })}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('pages.search.filters', { defaultValue: 'Filters' })}</span>
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-xs font-medium text-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4">
        <div className="text-sm font-semibold">
          {t('pages.home.feedFilters', { defaultValue: 'Feed filters' })}
        </div>

        {showGroupPerDay && (
          <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium leading-tight">
                {t('pages.home.groupPerDayTitle', { defaultValue: 'One per creator per day' })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('pages.home.groupPerDayHint', {
                  defaultValue: 'Keeps prolific creators from crowding the feed.',
                })}
              </span>
            </span>
            <Switch
              checked={grouped}
              onCheckedChange={setGrouped}
              aria-label={t('pages.home.groupPerDayTitle', {
                defaultValue: 'One per creator per day',
              })}
            />
          </label>
        )}

        {showTrust && (
          <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium leading-tight">
                {t('pages.home.trustFilterTitle', { defaultValue: 'Trust filter' })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {trustEnabled && trustHiddenCount > 0
                  ? t('pages.home.trustFilterHintCount', {
                      count: trustHiddenCount,
                      defaultValue: 'Hiding {{count}} videos from low-score authors.',
                    })
                  : t('pages.home.trustFilterHint', {
                      defaultValue:
                        'Hides videos from unknown or low-score authors. Creators you follow always show.',
                    })}
              </span>
            </span>
            <Switch
              checked={trustEnabled}
              onCheckedChange={onToggleTrust}
              aria-label={t('pages.home.trustFilterTitle', { defaultValue: 'Trust filter' })}
            />
          </label>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface FeedEmptyActionProps {
  trustEnabled: boolean
  trustHiddenCount: number
  onToggleTrust: () => void
  hasCustomSource: boolean
  onResetSource: () => void
}

/** Recovery action when active filters or a custom relay leave a feed empty. */
export function FeedEmptyAction({
  trustEnabled,
  trustHiddenCount,
  onToggleTrust,
  hasCustomSource,
  onResetSource,
}: FeedEmptyActionProps) {
  const { t } = useTranslation()

  if (!hasCustomSource && !(trustEnabled && trustHiddenCount > 0)) return null

  return (
    <div className="flex flex-col items-center gap-3">
      {trustEnabled && trustHiddenCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('pages.home.emptyTrustHint', {
            count: trustHiddenCount,
            defaultValue: '{{count}} videos are currently hidden by the trust filter.',
          })}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {trustEnabled && trustHiddenCount > 0 && (
          <Button variant="outline" size="sm" onClick={onToggleTrust}>
            {t('pages.home.showAllVideos', { defaultValue: 'Show all videos' })}
          </Button>
        )}
        {hasCustomSource && (
          <Button variant="outline" size="sm" onClick={onResetSource}>
            {t('pages.home.backToDefaultFeed', { defaultValue: 'Back to default feed' })}
          </Button>
        )}
      </div>
    </div>
  )
}
