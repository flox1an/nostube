import { useEffect, useMemo, useState } from 'react'
import { of } from 'rxjs'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { createAddressLoader, createEventLoader } from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import type { Event as NostrEvent } from 'nostr-tools'

import { decodeAddressPointer, decodeEventPointer } from '@/lib/nip19'
import { combineRelays } from '@/lib/utils'
import { processEvents } from '@/utils/video-event'

import { useAppContext } from './useAppContext'

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

export function usePlaylistDetails(nip19param?: string | null): PlaylistDetailsResult {
  const eventStore = useEventStore()
  const { config, pool } = useAppContext()

  const readRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

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
    setFailedVideoIds(new Set())
    setLoadingVideoIds(new Set())
  }, [pointerKey])

  const allConfigRelays = useMemo(() => config.relays.map(r => r.url), [config.relays])

  const videoRelayFallbacks = [
    'wss://haven.slidestr.net',
    'wss://strfry.apps3.slidestr.net',
    'wss://relay.damus.io',
    'wss://nos.lol',
  ]

  const relaysToUse = useMemo(() => {
    const pointerRelays = (playlistPointer as { relays?: string[] } | null)?.relays || []
    return combineRelays([pointerRelays, allConfigRelays, videoRelayFallbacks])
  }, [playlistPointer, allConfigRelays])

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
      return eventStore.event(playlistPointer.id)
    } else if (isNaddrPointer(playlistPointer)) {
      return eventStore.replaceable(
        playlistPointer.kind,
        playlistPointer.pubkey,
        playlistPointer.identifier
      )
    }
    return of(undefined)
  }, [playlistPointer, eventStore])

  const playlistEvent = useObservableState(playlistObservable)

  const isLoadingPlaylist = Boolean(playlistPointer) && !playlistEvent

  useEffect(() => {
    if (!playlistPointer) return

    let sub: any
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

    setLoadingVideoIds(new Set(missingRefs.map(r => r.id)))

    const playlistSeenRelaysSet = getSeenRelays(playlistEvent)
    const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []

    const completedIds = new Set<string>()
    const timeoutId = setTimeout(() => {
      missingRefs.forEach(ref => {
        if (!eventStore.hasEvent(ref.id)) {
          setFailedVideoIds(prev => new Set([...prev, ref.id]))
        }
      })
      setLoadingVideoIds(new Set())
    }, 10000)

    const subscriptions = missingRefs.map(ref => {
      const tagRelayHints = ref.relayHints || []
      const referencedEvent = eventStore.getEvent(ref.id)
      const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
      const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []

      const videoRelays = combineRelays([
        tagRelayHints,
        seenRelays,
        playlistSeenRelays,
        relaysToUse,
      ])

      const videoLoader = createEventLoader(pool, { eventStore, extraRelays: videoRelays })
      const observable = videoLoader({ id: ref.id })

      return observable.subscribe({
        next: event => {
          if (event) {
            eventStore.add(event)
            completedIds.add(ref.id)
            setLoadingVideoIds(prev => {
              const next = new Set(prev)
              next.delete(ref.id)
              return next
            })
            setFailedVideoIds(prev => {
              const next = new Set(prev)
              next.delete(ref.id)
              return next
            })
          }
        },
        complete: () => {
          if (!completedIds.has(ref.id) && !eventStore.hasEvent(ref.id)) {
            setFailedVideoIds(prev => new Set([...prev, ref.id]))
            setLoadingVideoIds(prev => {
              const next = new Set(prev)
              next.delete(ref.id)
              return next
            })
          }
        },
        error: err => {
          console.error(`[usePlaylistDetails] Failed to load video event ${ref.id}:`, err)
          setFailedVideoIds(prev => new Set([...prev, ref.id]))
          setLoadingVideoIds(prev => {
            const next = new Set(prev)
            next.delete(ref.id)
            return next
          })
        },
      })
    })

    return () => {
      clearTimeout(timeoutId)
      subscriptions.forEach(sub => sub.unsubscribe())
    }
  }, [videoRefs, eventStore, pool, relaysToUse, playlistEvent])

  const videoEvents = useMemo(() => {
    if (videoRefs.length === 0) {
      return []
    }

    const events = videoRefs
      .map(ref => eventStore.getEvent(ref.id))
      .filter((event): event is NostrEvent => Boolean(event))

    return processEvents(events, readRelays, undefined, config.blossomServers)
  }, [videoRefs, eventStore, readRelays, config.blossomServers])

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
