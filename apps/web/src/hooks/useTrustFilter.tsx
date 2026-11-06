import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustScores, useGlobalScores, hasPendingTrustScores } from '@/hooks/useTrustScore'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Shield } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@nostube/widgets/components/alert-dialog'
import { Button } from '@nostube/widgets/components/button'
import { buttonVariants } from '@nostube/widgets/components/button-variants'
import { Tooltip, TooltipContent, TooltipTrigger } from '@nostube/widgets/components/tooltip'
import type { VideoEvent } from '@nostube/core/video-event'
import { getInstanceConfig } from '@nostube/core/instance-config'

/** Minimum personalized trust score (0–1) to pass the filter */
export const MIN_PERSONAL_SCORE = 0.4
/** Minimum global NosTube score (0–1) to pass the filter */
export const MIN_GLOBAL_SCORE = 0.2
export type TrustFilterInput = {
  authorPubkey: string
  currentUserPubkey?: string
  followedPubkeys: ReadonlySet<string>
  personalScore: number | null | undefined
  globalScore: number | null | undefined
}

export function passesTrustFilter({
  authorPubkey,
  currentUserPubkey,
  followedPubkeys,
  personalScore,
  globalScore,
}: TrustFilterInput): boolean {
  // Instance build: the trust filter is fixed off (nostube-server ADR 0005).
  if (getInstanceConfig()) return true
  if (currentUserPubkey && authorPubkey === currentUserPubkey) return true
  if (followedPubkeys.has(authorPubkey)) return true
  if (personalScore === null || personalScore === undefined) return false
  if (globalScore === null || globalScore === undefined) return false
  return personalScore >= MIN_PERSONAL_SCORE && globalScore >= MIN_GLOBAL_SCORE
}

/**
 * Hook that filters videos by trust scores (personal >= 40%, global >= 20%).
 * Authors in the user's media follow set (kind 10020) and the current user always pass.
 * Authors without both scores are excluded while the filter is enabled.
 */
export function useTrustFilter(videos: VideoEvent[] | null) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem('trustFilter.enabled')
    return stored === null ? true : stored === 'true'
  })
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    localStorage.setItem('trustFilter.enabled', String(enabled))
  }, [enabled])
  const { followedPubkeys } = useFollowSet()
  const { user } = useCurrentUser()

  const followedSet = useMemo(() => new Set(followedPubkeys), [followedPubkeys])

  const authorPubkeys = useMemo(
    () => (videos ? [...new Set(videos.map(v => v.pubkey))] : []),
    [videos]
  )
  const personalScores = useTrustScores(authorPubkeys)
  const globalScores = useGlobalScores(authorPubkeys)

  const filteredVideos = useMemo(() => {
    if (!videos) return null
    if (!enabled) return videos

    return videos.filter(v =>
      passesTrustFilter({
        authorPubkey: v.pubkey,
        currentUserPubkey: user?.pubkey,
        followedPubkeys: followedSet,
        personalScore: personalScores.get(v.pubkey),
        globalScore: globalScores.get(v.pubkey),
      })
    )
  }, [videos, enabled, personalScores, globalScores, followedSet, user])

  // Nothing passes yet but scores are still loading: callers should keep showing
  // skeletons, otherwise the empty grid flashes and infinite scroll pages on.
  const pending = enabled && filteredVideos?.length === 0 && hasPendingTrustScores(authorPubkeys)

  const onLabel = t('pages.home.trustFilterOn', {
    defaultValue: 'Trust filter on — hiding low-score authors',
  })
  const offLabel = t('pages.home.trustFilterOff', {
    defaultValue: 'Trust filter off — showing all videos',
  })
  const trustFilterLabel = enabled ? onLabel : offLabel

  const filterButton = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-11 min-w-11 shrink-0 gap-1.5 px-2 ${enabled ? 'text-muted-foreground' : 'text-destructive'}`}
            aria-label={trustFilterLabel}
            aria-pressed={enabled}
            onClick={() => {
              if (enabled && !localStorage.getItem('trustFilter.warningShown')) {
                setShowWarning(true)
              } else {
                setEnabled(!enabled)
              }
            }}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>
              {t(enabled ? 'pages.home.trustFilterOnShort' : 'pages.home.trustFilterOffShort')}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{trustFilterLabel}</TooltipContent>
      </Tooltip>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent className="min-w-0 break-words">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trust.filterWarning.title')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-muted-foreground">
                <p>{t('trust.filterWarning.body1')}</p>
                <p>{t('trust.filterWarning.body2')}</p>
                <p className="font-medium text-foreground">{t('trust.filterWarning.body3')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogCancel
              className={buttonVariants({
                className:
                  'mt-0 h-auto min-h-11 whitespace-normal py-2 hover:text-primary-foreground',
              })}
            >
              {t('trust.filterWarning.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({
                variant: 'outline',
                className: 'h-auto min-h-11 whitespace-normal py-2 text-foreground',
              })}
              onClick={() => {
                localStorage.setItem('trustFilter.warningShown', 'true')
                setEnabled(false)
              }}
            >
              {t('trust.filterWarning.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  // Instance build: fixed off, so no toggle.
  return {
    filteredVideos,
    filterButton: getInstanceConfig() ? <></> : filterButton,
    enabled,
    pending,
  }
}
