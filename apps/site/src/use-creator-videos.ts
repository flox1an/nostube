import { useEffect, useState } from 'react'
import { lastValueFrom, toArray } from 'rxjs'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { processEvents } from '@nostube/core/video-event-pipeline'
import { getKindsForType } from '@nostube/core/video-types'

export interface CreatorVideos {
  videos: VideoEvent[]
  loading: boolean
  error: string | null
}

/** One page of the start creator's videos, newest first, from the configured video sources. */
export function useCreatorVideos(client: NostubeClient, config: InstanceConfig): CreatorVideos {
  const [state, setState] = useState<CreatorVideos>({ videos: [], loading: true, error: null })
  const creator = config.startPage?.creator

  useEffect(() => {
    if (!creator) {
      setState({ videos: [], loading: false, error: null })
      return
    }
    let cancelled = false
    const loadPage = client.getTimelineLoader(
      `site:${creator}`,
      { kinds: getKindsForType('all'), authors: [creator], limit: 50 },
      config.videoSources
    )
    lastValueFrom(loadPage().pipe(toArray()), { defaultValue: [] })
      .then(events => {
        if (cancelled) return
        const videos = processEvents(events, config.videoSources).sort(
          (a, b) => b.created_at - a.created_at
        )
        setState({ videos, loading: false, error: null })
      })
      .catch(error => {
        if (!cancelled) setState({ videos: [], loading: false, error: String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [client, config, creator])

  return state
}
