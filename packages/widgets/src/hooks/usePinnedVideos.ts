import { useMemo } from 'react'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { useNostubeHost } from '../host'
import { usePinList } from './usePinList'
import { useVideosByRef } from './useVideosByRef'

export function usePinnedVideos(config: InstanceConfig) {
  const { pool } = useNostubeHost()
  const pins = usePinList(pool, config.videoSources, config.startPage?.creator)
  const found = useVideosByRef(config, pins.refs)
  const videos = useMemo(() => {
    const seen = new Set<string>()
    return pins.refs.flatMap(ref => {
      const video = found.get(ref)
      if (!video || seen.has(video.id)) return []
      seen.add(video.id)
      return [video]
    })
  }, [pins.refs, found])
  return { ...pins, videos }
}
