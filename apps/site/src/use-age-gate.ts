import { useCallback, useMemo, useState } from 'react'
import type { NsfwFilter } from '@nostube/core'
import { getEffectiveNsfwFilter, getVideoPlayback } from '@nostube/core/content-safety'
import type { VideoEvent } from '@nostube/core/video-event'

const STORAGE_KEY = 'nostube-site:age-confirmed'

function readConfirmed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export interface AgeGate {
  /** The viewer's effective filter: `warning` once 18+ is confirmed, otherwise `hide`. */
  nsfwFilter: NsfwFilter
  /** True for videos the viewer may not open yet (content warning, not confirmed). */
  isLocked: (video: VideoEvent) => boolean
  /** The warning the player should show before it plays, if any. */
  warningFor: (video: VideoEvent) => string | undefined
  confirm: () => void
}

/**
 * Same policy as nostube's embed: a video with a content warning stays locked until the viewer
 * confirms being 18+; after that the player still asks before it plays. The deployment switch
 * VITE_NSFW_SAFETY=off (core/content-safety) turns the confirmation off.
 */
export function useAgeGate(): AgeGate {
  const [confirmed, setConfirmed] = useState(readConfirmed)

  const confirm = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // without storage the confirmation lasts until the page is closed
    }
    setConfirmed(true)
  }, [])

  return useMemo(() => {
    const nsfwFilter = getEffectiveNsfwFilter({
      nsfwFilter: 'warning',
      nsfwAgeConfirmed: confirmed,
    })
    return {
      nsfwFilter,
      isLocked: video => getVideoPlayback(video.contentWarning, nsfwFilter) === 'hidden',
      warningFor: video =>
        getVideoPlayback(video.contentWarning, nsfwFilter) === 'warn'
          ? video.contentWarning
          : undefined,
      confirm,
    }
  }, [confirmed, confirm])
}
