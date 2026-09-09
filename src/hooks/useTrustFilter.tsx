import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustScores, useGlobalScores } from '@/hooks/useTrustScore'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Shield, TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { VideoEvent } from '@/utils/video-event'

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

  const trustFilterLabel = enabled
    ? t('pages.home.trustFilterOn', {
        defaultValue: 'Trust filter on — hiding low-score authors',
      })
    : t('pages.home.trustFilterOff', {
        defaultValue: 'Trust filter off — showing all videos',
      })

  const filterButton = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className={`shrink-0 rounded-full px-2.5 border ${enabled ? 'border-green-500' : 'border-transparent'}`}
            aria-label={trustFilterLabel}
            aria-pressed={enabled}
            onClick={() => {
              if (enabled && !localStorage.getItem('trustFilter.warningShown')) {
                setShowWarning(true)
              } else {
                setEnabled(prev => !prev)
              }
            }}
          >
            <Shield
              className={`h-3.5 w-3.5 ${enabled ? 'text-green-500' : 'text-muted-foreground'}`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{trustFilterLabel}</TooltipContent>
      </Tooltip>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 shrink-0 text-destructive" />
              {t('trust.filterWarning.title', {
                defaultValue: 'You are entering the danger zone',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  {t('trust.filterWarning.body1', {
                    defaultValue:
                      'Disabling the trust filter will show videos from untrusted and unverified accounts. Some of this content may be inappropriate, offensive, or intended for adults only (18+).',
                  })}
                </p>
                <p className="font-medium text-foreground">
                  {t('trust.filterWarning.body2', {
                    defaultValue:
                      'What you see from this point on is entirely at your own risk — you are solely responsible for what you choose to watch.',
                  })}
                </p>
                <p>
                  {t('trust.filterWarning.body3', {
                    defaultValue: 'If you are not sure, keep the filter on.',
                  })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('trust.filterWarning.cancel', { defaultValue: 'Keep filter on' })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                localStorage.setItem('trustFilter.warningShown', 'true')
                setEnabled(false)
              }}
            >
              {t('trust.filterWarning.confirm', { defaultValue: 'I understand, disable it' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { filteredVideos, filterButton, enabled }
}
