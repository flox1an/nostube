import { useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useVideoHistory } from '@/hooks/useVideoHistory'
import { useAppContext } from '@/hooks/useAppContext'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { getRecentlyPlayedVideos, type PlayPositionEntry } from '@/lib/play-position-db'
import { isAudioVideo, isYouTubeVideo, processEvent, type VideoEvent } from '@/utils/video-event'

const SINCE_MS = 1000 * 60 * 60 * 24 * 90 // 90 days, matches play-position-db pruning window
// A video counts as "in progress" once meaningfully started (avoid accidental taps)
// and not yet effectively finished (avoid resurfacing completed videos).
const MIN_PROGRESS_SECONDS = 5
const MAX_COMPLETION_RATIO = 0.95
const SHELF_LIMIT = 12

/**
 * Unfinished videos the signed-in viewer can resume, most recently played first.
 * Reuses existing local play-position storage (per-device/account, not public)
 * and the existing local watch-history entries for renderable video data —
 * introduces no new tracking.
 */
export function useContinueWatching() {
  const { user } = useCurrentUser()
  const { history } = useVideoHistory()
  const { config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [positions, setPositions] = useState<PlayPositionEntry[] | null>(null)

  const pubkey = user?.pubkey

  useEffect(() => {
    if (!pubkey) {
      setPositions(null)
      return
    }
    let cancelled = false
    getRecentlyPlayedVideos(pubkey, Date.now() - SINCE_MS).then(entries => {
      if (!cancelled) setPositions(entries)
    })
    return () => {
      cancelled = true
    }
  }, [pubkey])

  const videos: VideoEvent[] = useMemo(() => {
    if (!pubkey || !positions) return []
    const historyByEventId = new Map(history.map(entry => [entry.eventId, entry.event]))

    const result: VideoEvent[] = []
    for (const position of positions) {
      if (result.length >= SHELF_LIMIT) break
      if (position.duration <= 0) continue
      if (position.time < MIN_PROGRESS_SECONDS) continue
      if (position.time >= position.duration * MAX_COMPLETION_RATIO) continue

      const rawEvent = historyByEventId.get(position.videoId)
      if (!rawEvent) continue

      try {
        const video = processEvent(rawEvent, [], config.blossomServers, presetContent.nsfwPubkeys)
        if (!video) continue
        if (!(config.showYouTubeContent ?? true) && isYouTubeVideo(video)) continue
        if (!(config.showAudioContent ?? true) && isAudioVideo(video)) continue
        result.push(video)
      } catch {
        // Skip videos that fail to process (e.g. malformed cached event)
      }
    }
    return result
  }, [
    pubkey,
    positions,
    history,
    config.blossomServers,
    config.showYouTubeContent,
    config.showAudioContent,
    presetContent.nsfwPubkeys,
  ])

  return {
    videos,
    isLoading: Boolean(pubkey) && positions === null,
  }
}
