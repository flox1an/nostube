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
import { useCurrentUser } from './useCurrentUser'
import { useReadRelays } from './useReadRelays'
import { useSelectedPreset } from './useSelectedPreset'

// Constant fallback relays - defined outside component to prevent re-renders
const VIDEO_RELAY_FALLBACKS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol']

type NeventPointer = { id: string }
type NaddrPointer = { identifier: string; pubkey: string; kind: number }

interface VideoRef {
  id: string
  kind: number
  relayHints: string[]
  address?: string // "kind:pubkey:d-tag" for addressable events
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
  isPrivate: boolean
  decryptionFailed: boolean
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
  const { user } = useCurrentUser()

  // Use centralized read relays hook
  const readRelays = useReadRelays()

  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(new Set())
  const [loadingVideoIds, setLoadingVideoIds] = useState<Set<string>>(new Set())
  const [decryptedTags, setDecryptedTags] = useState<string[][] | null>(null)
  const [decryptionFailed, setDecryptionFailed] = useState(false)

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

  const isPrivate =
    playlistEvent?.tags.some(t => t[0] === 'encrypted') || Boolean(playlistEvent?.content)

  // Decrypt private playlist content when owner views it
  useEffect(() => {
    let cancelled = false

    if (!playlistEvent || !playlistEvent.content) {
      ;(async () => {
        await Promise.resolve()
        if (!cancelled) {
          setDecryptedTags(null)
          setDecryptionFailed(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    // Only the owner can decrypt
    if (!user?.pubkey || playlistEvent.pubkey !== user.pubkey || !user.signer?.nip44) {
      ;(async () => {
        await Promise.resolve()
        if (!cancelled) {
          setDecryptedTags(null)
          setDecryptionFailed(true)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      try {
        const plaintext = await user.signer!.nip44!.decrypt(user.pubkey, playlistEvent.content)
        const tags: string[][] = JSON.parse(plaintext)
        if (!cancelled) {
          setDecryptedTags(tags)
          setDecryptionFailed(false)
        }
      } catch (err) {
        console.warn('[usePlaylistDetails] Failed to decrypt private playlist:', err)
        if (!cancelled) {
          setDecryptedTags(null)
          setDecryptionFailed(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [playlistEvent, user?.pubkey, user?.signer])

  const { playlistTitle, playlistDescription, videoRefs } = useMemo(() => {
    if (!playlistEvent) {
      return {
        playlistTitle: '',
        playlistDescription: '',
        videoRefs: [] as VideoRef[],
      }
    }

    // Merge public tags with decrypted private tags
    const allTags = decryptedTags ? [...playlistEvent.tags, ...decryptedTags] : playlistEvent.tags

    const title =
      allTags.find((t: string[]) => t[0] === 'title')?.[1] ||
      (isPrivate ? 'Private Playlist' : 'Untitled Playlist')
    const description = allTags.find((t: string[]) => t[0] === 'description')?.[1] || ''

    const refs: VideoRef[] = []
    for (const t of allTags) {
      if (t[0] === 'e') {
        const tagRelayHint = t[2] || ''
        const tagRelayHints = tagRelayHint ? [tagRelayHint] : []
        const referencedEvent = eventStore.getEvent(t[1])
        const seenRelaysSet = referencedEvent ? getSeenRelays(referencedEvent) : undefined
        const seenRelayHints = seenRelaysSet ? Array.from(seenRelaysSet) : []
        const relayHints = combineRelays([tagRelayHints, seenRelayHints])
        refs.push({ id: t[1], kind: 0, relayHints })
      } else if (t[0] === 'a') {
        // Addressable event reference: "kind:pubkey:d-tag"
        const parts = t[1]?.split(':')
        if (parts && parts.length >= 3) {
          const addrKind = parseInt(parts[0])
          const addrPubkey = parts[1]
          const addrIdentifier = parts.slice(2).join(':')
          const tagRelayHints = t[2] ? [t[2]] : []
          // Try to resolve event ID from the replaceable store
          const resolved = eventStore.getReplaceable(addrKind, addrPubkey, addrIdentifier)
          const resolvedId = resolved?.id
          refs.push({
            id: resolvedId || t[1], // Use resolved event ID if available, else address as placeholder
            kind: addrKind,
            relayHints: tagRelayHints,
            address: t[1],
          })
        }
      }
    }

    return {
      playlistTitle: title,
      playlistDescription: description,
      videoRefs: refs,
    }
  }, [playlistEvent, eventStore, decryptedTags, isPrivate])

  useEffect(() => {
    if (!playlistEvent || videoRefs.length === 0) {
      return
    }

    // Split refs into addressable (a-tag) and regular (e-tag)
    const addressRefs = videoRefs.filter(ref => ref.address)
    const eventRefs = videoRefs.filter(ref => !ref.address)

    // Check which refs are missing: for address refs, check replaceable store
    const missingAddressRefs = addressRefs.filter(ref => {
      const parts = ref.address!.split(':')
      if (parts.length < 3) return true
      const resolved = eventStore.getReplaceable(
        parseInt(parts[0]),
        parts[1],
        parts.slice(2).join(':')
      )
      return !resolved
    })
    const missingEventRefs = eventRefs.filter(ref => !eventStore.hasEvent(ref.id))

    if (missingAddressRefs.length === 0 && missingEventRefs.length === 0) {
      return
    }

    let cancelled = false
    const allMissingIds = [...missingEventRefs.map(r => r.id), ...missingAddressRefs.map(r => r.id)]

    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoadingVideoIds(new Set(allMissingIds))
    })()

    const playlistSeenRelaysSet = getSeenRelays(playlistEvent)
    const playlistSeenRelays = playlistSeenRelaysSet ? Array.from(playlistSeenRelaysSet) : []
    const allRelayHints = [...missingEventRefs, ...missingAddressRefs].flatMap(
      ref => ref.relayHints || []
    )
    const batchRelays = combineRelays([allRelayHints, playlistSeenRelays, relaysToUse])

    const completedIds = new Set<string>()
    const subscriptions: { unsubscribe: () => void }[] = []

    const timeoutId = setTimeout(() => {
      if (cancelled) return
      allMissingIds.forEach(id => {
        if (!completedIds.has(id)) {
          setFailedVideoIds(prev => new Set([...prev, id]))
        }
      })
      setLoadingVideoIds(new Set())
    }, 10000)

    const markCompleted = (refId: string) => {
      completedIds.add(refId)
      setLoadingVideoIds(prev => {
        const next = new Set(prev)
        next.delete(refId)
        return next
      })
      setFailedVideoIds(prev => {
        const next = new Set(prev)
        next.delete(refId)
        return next
      })
    }

    // Load regular event refs via batch timeline loader
    if (missingEventRefs.length > 0) {
      const missingIds = missingEventRefs.map(r => r.id)
      const batchLoader = createTimelineLoader(
        pool,
        batchRelays,
        { ids: missingIds },
        { eventStore }
      )

      subscriptions.push(
        batchLoader().subscribe({
          next: event => {
            if (!cancelled && event && missingIds.includes(event.id)) {
              eventStore.add(event)
              markCompleted(event.id)
            }
          },
          complete: () => {
            if (cancelled) return
            missingEventRefs.forEach(ref => {
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
            if (cancelled) return
            missingEventRefs.forEach(ref => {
              setFailedVideoIds(prev => new Set([...prev, ref.id]))
            })
          },
        })
      )
    }

    // Load addressable refs via address loader
    for (const ref of missingAddressRefs) {
      const parts = ref.address!.split(':')
      if (parts.length < 3) continue
      const addrKind = parseInt(parts[0])
      const addrPubkey = parts[1]
      const addrIdentifier = parts.slice(2).join(':')

      subscriptions.push(
        addressLoader({ kind: addrKind, pubkey: addrPubkey, identifier: addrIdentifier }).subscribe(
          {
            next: event => {
              if (!cancelled && event) {
                eventStore.add(event)
                markCompleted(ref.id)
              }
            },
            error: err => {
              console.error('[usePlaylistDetails] Failed to load addressable video:', err)
              if (!cancelled) {
                setFailedVideoIds(prev => new Set([...prev, ref.id]))
                setLoadingVideoIds(prev => {
                  const next = new Set(prev)
                  next.delete(ref.id)
                  return next
                })
              }
            },
          }
        )
      )
    }

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      subscriptions.forEach(sub => sub.unsubscribe())
    }
  }, [videoRefs, eventStore, pool, relaysToUse, playlistEvent, addressLoader])

  // Observe each video event reactively
  const videoEventsObservable = useMemo(() => {
    if (videoRefs.length === 0) {
      return of([])
    }

    // Use combineLatest to observe all video events
    const observables = videoRefs.map(ref => {
      if (ref.address) {
        // For addressable refs, observe via replaceable()
        const parts = ref.address.split(':')
        if (parts.length >= 3) {
          const addrKind = parseInt(parts[0])
          const addrPubkey = parts[1]
          const addrIdentifier = parts.slice(2).join(':')
          return eventStore
            .replaceable(addrKind, addrPubkey, addrIdentifier)
            .pipe(switchMap(event => of(event)))
        }
      }
      return eventStore.event(ref.id).pipe(switchMap(event => of(event)))
    })

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
            presetContent.nsfwPubkeys,
            config.reportedEventIds,
            {
              includeYouTube: config.showYouTubeContent ?? true,
              includeAudio: config.showAudioContent ?? true,
            }
          )
        )
      })
    )
  }, [
    videoRefs,
    eventStore,
    readRelays,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
    config.showAudioContent,
  ])

  const videoEvents = use$(() => videoEventsObservable, [videoEventsObservable]) ?? []

  const isLoadingVideos = Boolean(playlistEvent) && videoRefs.length > 0 && videoEvents.length === 0

  return {
    playlistPointer,
    playlistEvent,
    playlistTitle,
    playlistDescription,
    videoRefs,
    videoEvents,
    isPrivate,
    decryptionFailed,
    readRelays,
    isLoadingPlaylist,
    isLoadingVideos,
    failedVideoIds,
    loadingVideoIds,
  }
}
