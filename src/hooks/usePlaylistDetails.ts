import { useEffect, useMemo, useState } from 'react'
import { of, combineLatest } from 'rxjs'
import { switchMap, map } from 'rxjs/operators'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import {
  createAddressLoader,
  createEventLoader,
  createTimelineLoader,
} from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import type { Event as NostrEvent } from 'nostr-tools'

import { decodeAddressPointer, decodeEventPointer } from '@/lib/nip19'
import { combineRelays } from '@/lib/utils'
import { processEvents } from '@/utils/video-event'

import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'
import { useSelectedPreset } from './useSelectedPreset'

// Constant fallback relays - defined outside component to prevent re-renders
const VIDEO_RELAY_FALLBACKS = [
  'wss://haven.slidestr.net',
  'wss://strfry.apps3.slidestr.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
]

type NeventPointer = { id: string }
type NaddrPointer = { identifier: string; pubkey: string; kind: number }

interface VideoRef {
  id: string
  kind: number
  relayHints: string[]
}

interface PlaylistDetailsResult {
  playlistPointer: NeventPointer | (NaddrPointer & { relays?: string[] }) | null
  playlistEvent: NostrEvent | undefined
  playlistTitle: string
  playlistDescription: string
  videoRefs: VideoRef[]
  videoEvents: ReturnType<typeof processEvents>
  readRelays: string[]
  isLoadingPlaylist: boolean
  isLoadingVideos: boolean
  failedVideoIds: Set<string>
  loadingVideoIds: Set<string>
}

function isNeventPointer(ptr: unknown): ptr is NeventPointer {
  return typeof ptr === 'object' && ptr !== null && 'id' in ptr
}

function isNaddrPointer(ptr: unknown): ptr is NaddrPointer {
  return (
    typeof ptr === 'object' &&
    ptr !== null &&
    'identifier' in ptr &&
    'pubkey' in ptr &&
    'kind' in ptr
  )
}

export function usePlaylistDetails(
  nip19param?: string | null,
  videoEventRelays?: string[]
): PlaylistDetailsResult {
  const eventStore = useEventStore()
  const { config, pool } = useAppContext()
  const { presetContent } = useSelectedPreset()

  // Use centralized read relays hook
  const readRelays = useReadRelays()

  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(new Set())
  const [loadingVideoIds, setLoadingVideoIds] = useState<Set<string>>(new Set())

  const playlistPointer = useMemo(() => {
    if (!nip19param) return null
    const naddr = decodeAddressPointer(nip19param)
    if (naddr) return naddr
    const nevent = decodeEventPointer(nip19param)
    return nevent
  }, [nip19param])

  const pointerKey = useMemo(() => {
    if (!playlistPointer) return ''
    if (isNeventPointer(playlistPointer)) {
      return `event:${playlistPointer.id}`
    }
    return `addr:${playlistPointer.kind}:${playlistPointer.pubkey}:${playlistPointer.identifier}`
  }, [playlistPointer])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) {
        return
      }
      setFailedVideoIds(new Set())
      setLoadingVideoIds(new Set())
    })()
    return () => {
      cancelled = true
    }
  }, [pointerKey])

  const allConfigRelays = useMemo(() => config.relays.map(r => r.url), [config.relays])

  const relaysToUse = useMemo(() => {
    const pointerRelays = (playlistPointer as { relays?: string[] } | null)?.relays || []
    const videoRelays = videoEventRelays || []
    return combineRelays([videoRelays, pointerRelays, allConfigRelays, VIDEO_RELAY_FALLBACKS])
  }, [playlistPointer, allConfigRelays, videoEventRelays])

  const eventLoader = useMemo(
    () => createEventLoader(pool, { eventStore, extraRelays: relaysToUse }),
    [pool, eventStore, relaysToUse]
  )

  const addressLoader = useMemo(
    () => createAddressLoader(pool, { eventStore, extraRelays: relaysToUse }),
    [pool, eventStore, relaysToUse]
  )

  const playlistObservable = useMemo(() => {
    if (!playlistPointer) return of(undefined)

    if (isNeventPointer(playlistPointer)) {
      return eventStore.event(playlistPointer.id).pipe(map(event => event ?? undefined))
    } else if (isNaddrPointer(playlistPointer)) {
      return eventStore
        .replaceable(playlistPointer.kind, playlistPointer.pubkey, playlistPointer.identifier)
        .pipe(map(event => event ?? undefined))
    }
    return of(undefined)
  }, [playlistPointer, eventStore])

  const playlistEvent = use$(() => playlistObservable, [playlistObservable])

  const isLoadingPlaylist = Boolean(playlistPointer) && !playlistEvent

  useEffect(() => {
    if (!playlistPointer) return

    let sub: { unsubscribe: () => void } | undefined
    if (isNeventPointer(playlistPointer)) {
      sub = eventLoader(playlistPointer).subscribe({
        next: event => {
          if (event) {
            eventStore.add(event)
          }
        },
        error: err => console.error('[usePlaylistDetails] Failed to load playlist event:', err),
      })
    } else if (isNaddrPointer(playlistPointer)) {
      sub = addressLoader(playlistPointer).subscribe({
        next: event => {
          if (event) {
            eventStore.add(event)
          }
        },
        error: err => console.error('[usePlaylistDetails] Failed to load playlist event:', err),
      })
    }

    return () => {
      if (sub) sub.unsubscribe()
    }
  }, [playlistPointer, eventStore, eventLoader, addressLoader])

  const { playlistTitle, playlistDescription, videoRefs } = useMemo(() => {
    if (!playlistEvent) {
      return {
        playlistTitle: '',
        playlistDescription: '',
        videoRefs: [] as VideoRef[],
      }
    }

    const title =
      playlistEvent.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled Playlist'
    const description = playlistEvent.tags.find((t: string[]) => t[0] === 'description')?.[1] || ''

    const refs = playlistEvent.tags
      .filter((t: string[]) => t[0] === 'e')
      .map((t: string[]) => {
        const tagRelayHint = t[2] || ''
        const tagRelayHints = tagRelayHint ? [tagRelayHint] : []
        const referencedEvent = eventStore.getEvent(t[1])
        const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
        const seenRelayHints = seenRelaysSet ? Array.from(seenRelaysSet) : []
        const relayHints = combineRelays([tagRelayHints, seenRelayHints])
        return {
          id: t[1],
          kind: 0,
          relayHints,
        }
      })

    return {
      playlistTitle: title,
      playlistDescription: description,
      videoRefs: refs,
    }
  }, [playlistEvent, eventStore])

  useEffect(() => {
    if (!playlistEvent || videoRefs.length === 0) {
      return
    }

    const missingRefs = videoRefs.filter(ref => !eventStore.hasEvent(ref.id))

    if (missingRefs.length === 0) {
      return
    }

    let cancelled = false

    ;(async () => {
      await Promise.resolve()
      if (cancelled) {
        return
      }
      setLoadingVideoIds(new Set(missingRefs.map(r => r.id)))
    })()

    const playlistSeenRelaysSet = getSeenRelays(playlistEvent)
    const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []

    // Collect all relay hints from all missing refs
    const allRelayHints = missingRefs.flatMap(ref => ref.relayHints || [])

    // Combine all relays for the batch request
    const batchRelays = combineRelays([allRelayHints, playlistSeenRelays, relaysToUse])

    // Create a single batch request for all missing video IDs
    const missingIds = missingRefs.map(r => r.id)
    const completedIds = new Set<string>()

    const timeoutId = setTimeout(() => {
      if (cancelled) {
        return
      }
      missingRefs.forEach(ref => {
        if (!eventStore.hasEvent(ref.id)) {
          setFailedVideoIds(prev => new Set([...prev, ref.id]))
        }
      })
      setLoadingVideoIds(new Set())
    }, 10000)

    // Use timeline loader with ids filter for batch fetching
    const batchLoader = createTimelineLoader(pool, batchRelays, { ids: missingIds }, { eventStore })

    const subscription = batchLoader().subscribe({
      next: event => {
        if (!cancelled && event && missingIds.includes(event.id)) {
          eventStore.add(event)
          completedIds.add(event.id)
          setLoadingVideoIds(prev => {
            const next = new Set(prev)
            next.delete(event.id)
            return next
          })
          setFailedVideoIds(prev => {
            const next = new Set(prev)
            next.delete(event.id)
            return next
          })
        }
      },
      complete: () => {
        // Mark any events that didn't load as failed
        if (cancelled) {
          return
        }
        missingRefs.forEach(ref => {
          if (!completedIds.has(ref.id) && !eventStore.hasEvent(ref.id)) {
            setFailedVideoIds(prev => new Set([...prev, ref.id]))
            setLoadingVideoIds(prev => {
              const next = new Set(prev)
              next.delete(ref.id)
              return next
            })
          }
        })
      },
      error: err => {
        console.error('[usePlaylistDetails] Failed to load playlist videos:', err)
        if (cancelled) {
          return
        }
        // Mark all as failed on error
        missingRefs.forEach(ref => {
          setFailedVideoIds(prev => new Set([...prev, ref.id]))
        })
        setLoadingVideoIds(new Set())
      },
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [videoRefs, eventStore, pool, relaysToUse, playlistEvent])

  // Observe each video event reactively
  const videoEventsObservable = useMemo(() => {
    if (videoRefs.length === 0) {
      return of([])
    }

    // Use combineLatest to observe all video events
    const observables = videoRefs.map(ref =>
      eventStore.event(ref.id).pipe(switchMap(event => of(event)))
    )

    return combineLatest(observables).pipe(
      switchMap(events => {
        const filteredEvents = events.filter((event): event is NostrEvent => Boolean(event))
        return of(
          processEvents(
            filteredEvents,
            readRelays,
            undefined,
            config.blossomServers,
            undefined,
            presetContent.nsfwPubkeys
          )
        )
      })
    )
  }, [videoRefs, eventStore, readRelays, config.blossomServers, presetContent.nsfwPubkeys])

  const videoEvents = use$(() => videoEventsObservable, [videoEventsObservable]) ?? []

  const isLoadingVideos = Boolean(playlistEvent) && videoRefs.length > 0 && videoEvents.length === 0

  return {
    playlistPointer,
    playlistEvent,
    playlistTitle,
    playlistDescription,
    videoRefs,
    videoEvents,
    readRelays,
    isLoadingPlaylist,
    isLoadingVideos,
    failedVideoIds,
    loadingVideoIds,
  }
}
