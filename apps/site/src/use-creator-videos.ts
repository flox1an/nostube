import { useMemo } from 'react'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { isHiddenVideo } from '@nostube/core/hidden-videos'
import {
  useCreatorVideos as useAllCreatorVideos,
  type CreatorVideos,
} from '@nostube/widgets/hooks/useCreatorVideos'

/** The creator's videos (with `tag`: those tagged so) without the ones the creator hid. */
export function useCreatorVideos(config: InstanceConfig, tag?: string): CreatorVideos {
  const all = useAllCreatorVideos(config, tag)
  const hidden = config.site.videos.hidden
  const videos = useMemo(
    () => all.videos.filter(v => !isHiddenVideo(v, hidden)),
    [all.videos, hidden]
  )
  return { ...all, videos }
}
