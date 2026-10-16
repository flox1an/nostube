import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'
import { isHiddenVideo, videoRef } from '@nostube/core/hidden-videos'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { useTimeline } from '@nostube/widgets/hooks/useTimeline'

/**
 * Resolves video references (`videoRef`: an event id or `<kind>:<pubkey>:<d>`) directly, so
 * videos older than the first catalog page are found too. Only the start creator's videos
 * resolve, and none the creator hid. The map holds each video under its id and its reference.
 */
export function useVideosByRef(
  config: InstanceConfig,
  refs: readonly string[]
): Map<string, VideoEvent> {
  const creator = config.startPage?.creator
  const key = [...new Set(refs.filter(Boolean))].sort().join('\n')
  const filters = useMemo(() => {
    const unique = key ? key.split('\n') : []
    const ids = unique.filter(ref => !ref.includes(':'))
    const identifiers = unique.flatMap(ref => {
      const [kind, author, ...identifier] = ref.split(':')
      return author === creator && ['34235', '34236'].includes(kind) ? [identifier.join(':')] : []
    })
    const common = { authors: creator ? [creator] : [], kinds: [21, 22, 34235, 34236] }
    return {
      ids: ids.length && creator ? { ...common, ids, limit: ids.length } : undefined,
      addresses:
        identifiers.length && creator
          ? { ...common, '#d': identifiers, limit: identifiers.length * 2 }
          : undefined,
    } satisfies { ids: Filter | undefined; addresses: Filter | undefined }
  }, [creator, key])
  const byId = useTimeline(filters.ids, {
    relays: config.videoSources,
    enabled: Boolean(filters.ids),
  })
  const byAddress = useTimeline(filters.addresses, {
    relays: config.videoSources,
    enabled: Boolean(filters.addresses),
  })
  return useMemo(() => {
    const found = new Map<string, VideoEvent>()
    for (const video of [...byAddress.videos, ...byId.videos]) {
      if (video.pubkey !== creator || isHiddenVideo(video, config.site.videos.hidden)) continue
      found.set(video.id, video)
      found.set(videoRef(video), video)
    }
    return found
  }, [byId.videos, byAddress.videos, creator, config.site.videos.hidden])
}
