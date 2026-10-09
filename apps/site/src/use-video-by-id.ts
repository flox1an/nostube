import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { decodeVideoEventIdentifier } from '@nostube/core/nip19'
import type { VideoEvent } from '@nostube/core/video-event'
import { useTimeline } from '@nostube/widgets/hooks/useTimeline'

export type VideoLookup =
  | { status: 'invalid' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'found'; video: VideoEvent }

/**
 * Resolves the `naddr`/`nevent`/`note` of a video link to the video, from the configured video
 * sources. Only videos of the instance's creators resolve: the video sources may be public
 * relays, and a link must not play anyone else's content under this origin. Needs a
 * TimelineProvider.
 */
export function useVideoById(id: string | undefined, config: InstanceConfig): VideoLookup {
  const filters = useMemo<Filter | undefined>(() => {
    const identifier = id ? decodeVideoEventIdentifier(id) : null
    if (!identifier) return undefined
    if (identifier.type === 'address') {
      const { kind, pubkey, identifier: d } = identifier.data
      if (!config.creators.includes(pubkey)) return undefined
      return { kinds: [kind], authors: [pubkey], '#d': [d], limit: 1 }
    }
    return { ids: [identifier.data.id], authors: config.creators, limit: 1 }
  }, [id, config.creators])
  const { videos, isInitialLoading, phase } = useTimeline(filters, {
    relays: config.videoSources,
    enabled: Boolean(filters),
  })

  if (!filters) return { status: 'invalid' }
  const video = videos.find(v => config.creators.includes(v.pubkey))
  if (video) return { status: 'found', video }
  if (isInitialLoading || phase === 'idle') return { status: 'loading' }
  return { status: 'not-found' }
}
