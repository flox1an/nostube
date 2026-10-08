import { useMemo } from 'react'
import { type VideoType } from '@/contexts/AppContext'
import { useReadRelays } from './useReadRelays'
import { getKindsForType } from '@/lib/video-types'
import { hashObjectBigInt } from '@/lib/utils'
import { useTimeline } from '@/nostr/useTimeline'

export default function useVideoTimeline(type: VideoType, authors?: string[]) {
  const readRelays = useReadRelays()

  const filters = useMemo(
    () =>
      authors
        ? { kinds: getKindsForType(type), authors, limit: 50 }
        : { kinds: getKindsForType(type), limit: 50 },
    [type, authors]
  )

  const cacheKey = useMemo(
    () => String(hashObjectBigInt({ filters, relays: [...readRelays].sort() })),
    [filters, readRelays]
  )

  const { videos, loading } = useTimeline(filters, {
    relays: readRelays,
    cacheKey,
    staleTimeMs: 60000,
  })

  return { videos, videosLoading: loading }
}
