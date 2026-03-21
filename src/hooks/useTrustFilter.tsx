import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustScores, useGlobalScores } from '@/hooks/useTrustScore'
import { useFollowSet } from '@/hooks/useFollowSet'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { VideoEvent } from '@/utils/video-event'

/** Minimum personalized trust score (0–1) to pass the filter */
export const MIN_PERSONAL_SCORE = 0.4
/** Minimum global NosTube score (0–1) to pass the filter */
export const MIN_GLOBAL_SCORE = 0.2

/**
 * Hook that filters videos by trust scores (personal >= 40%, global >= 20%).
 * Authors in the user's media follow set (kind 10020) always pass.
 * Returns filtered videos, the toggle state, and a button component to place in the UI.
 */
export function useTrustFilter(videos: VideoEvent[] | null) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const { followedPubkeys } = useFollowSet()

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

    return videos.filter(v => {
      // Always show videos from followed authors
      if (followedSet.has(v.pubkey)) return true
      const personal = personalScores.get(v.pubkey)
      const global = globalScores.get(v.pubkey)
      // Show videos from authors whose scores haven't loaded yet
      if (personal === null || personal === undefined) return true
      if (global === null || global === undefined) return true
      return personal >= MIN_PERSONAL_SCORE && global >= MIN_GLOBAL_SCORE
    })
  }, [videos, enabled, personalScores, globalScores, followedSet])

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
