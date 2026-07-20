import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustScores, useGlobalScores } from '@/hooks/useTrustScore'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Shield } from 'lucide-react'
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

  const filterButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={`shrink-0 rounded-full px-2.5 border ${enabled ? 'border-green-500' : 'border-transparent'}`}
          onClick={() => setEnabled(prev => !prev)}
        >
          <Shield
            className={`h-3.5 w-3.5 ${enabled ? 'text-green-500' : 'text-muted-foreground'}`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled
          ? t('pages.home.trustFilterOn', {
              defaultValue: 'Trust filter on — hiding low-score authors',
            })
          : t('pages.home.trustFilterOff', {
              defaultValue: 'Trust filter off — showing all videos',
            })}
      </TooltipContent>
    </Tooltip>
  )

  return { filteredVideos, filterButton, enabled }
}
