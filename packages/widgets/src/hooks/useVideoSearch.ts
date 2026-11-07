import { useEffect, useMemo, useState } from 'react'
import type { NostubeClient } from '@nostube/core/client'
import type { NostrEvent } from 'nostr-tools'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { processEvents, type VideoEvent } from '@nostube/core/video-event'
import { getKindsForType } from '@nostube/core/video-types'
import { useTimelineContext } from '../timeline'

export interface VideoSearch {
  /** The matches so far, in the relay's rank order. */
  videos: VideoEvent[]
  /** No answer for this query yet. */
  loading: boolean
  /** A longer prefix is loading; the shorter one stays shown. */
  paging: boolean
  error: boolean
  hasMore: boolean
  loadMore: () => void
}

const PAGE = 50
/** Typing pauses this long before a query goes out. */
const DEBOUNCE_MS = 250

interface Answer {
  /** A new client (another instance) never shows the previous one's answer. */
  client: NostubeClient
  key: string
  limit: number
  events: NostrEvent[]
  /** Events the relay sent, also those the store refused: a full page means more may follow. */
  received: number
  error: boolean
}

/**
 * The start creator's videos matching `query`, by NIP-50 on the instance's own relay, best match
 * first. More results ask again with a larger `limit` (a ranked list has no `until` cursor). A new
 * query or unmount cancels the request. Empty query: nothing. Ignores `config.search` (the Studio
 * searches when the site does not). Needs a TimelineProvider.
 */
export function useVideoSearch(config: InstanceConfig, query: string): VideoSearch {
  const { client, policy } = useTimelineContext()
  const creator = config.startPage?.creator
  // NFC: one canonical spelling per query, so composed and decomposed input share a key and a request.
  const search = query.trim().normalize('NFC')
  const key = creator && search ? `${creator}\n${search}` : ''
  const [page, setPage] = useState({ key, limit: PAGE })
  const limit = page.key === key ? page.limit : PAGE
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (!creator || !search) return
    const events: NostrEvent[] = []
    let received = 0
    const done = (error: boolean) =>
      setAnswer({ client, key: `${creator}\n${search}`, limit, events, received, error })
    let subscription: { unsubscribe: () => void } | undefined
    const timer = setTimeout(() => {
      subscription = client
        .searchVideos({ kinds: getKindsForType('all'), authors: [creator], search, limit })
        .subscribe({
          next: event => {
            received += 1
            // The store refuses deleted, invalid and out-of-scope events.
            const stored = client.eventStore.add(event)
            if (stored) events.push(stored)
          },
          complete: () => done(false),
          error: () => done(true),
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      subscription?.unsubscribe()
    }
  }, [client, creator, search, limit])

  const current = answer?.key === key && answer.client === client ? answer : null
  const videos = useMemo(
    () =>
      current
        ? processEvents(current.events, config.videoSources, {
            blockPubkeys: policy.blockedPubkeys,
            blossomServers: policy.blossomServers,
            missingVideoIds: new Set(Object.keys(policy.getAllMissingVideos())),
            nsfwPubkeys: policy.nsfwPubkeys,
            reportedEventIds: policy.reportedEventIds,
            includeYouTube: policy.showYouTubeContent ?? true,
            includeAudio: policy.showAudioContent ?? true,
          })
        : [],
    [current, config.videoSources, policy]
  )

  return {
    videos,
    loading: Boolean(key) && !current,
    paging: current !== null && current.limit < limit,
    error: current?.error ?? false,
    hasMore: Boolean(current && current.received >= current.limit),
    loadMore: () => setPage({ key, limit: (current?.limit ?? limit) + PAGE }),
  }
}
