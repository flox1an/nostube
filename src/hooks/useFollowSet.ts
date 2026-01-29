import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser } from './useCurrentUser'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { kinds, type NostrEvent } from 'nostr-tools'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY } from '@/constants/relays'
import { useNostrPublish } from './useNostrPublish'
import { nowInSecs } from '@/lib/utils'
import { getKindsForType } from '@/lib/video-types'

const FOLLOW_SET_IDENTIFIER = 'nostube-follows'
const BATCH_SIZE = 50 // Number of pubkeys to check per query

export interface ImportProgress {
  phase: 'idle' | 'checking' | 'importing' | 'done'
  checked: number
  total: number
  withVideos: number
}

interface UseFollowSetReturn {
  followedPubkeys: string[]
  isLoading: boolean
  addFollow: (pubkey: string, relayHint?: string) => Promise<void>
  removeFollow: (pubkey: string) => Promise<void>
  importFromKind3: () => Promise<boolean>
  hasFollowSet: boolean
  hasKind3Contacts: boolean
  kind3PubkeyCount: number
  importProgress: ImportProgress
  cancelImport: () => void
}

export function useFollowSet(): UseFollowSetReturn {
  const { user } = useCurrentUser()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { publish } = useNostrPublish()
  const [isLoading, setIsLoading] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    phase: 'idle',
    checked: 0,
    total: 0,
    withVideos: 0,
  })
  const cancelRef = useRef(false)

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url)
  }, [config.relays])

  const writeRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('write')).map(relay => relay.url)
  }, [config.relays])

  const relaysWithMetadata = useMemo(() => {
    return [...readRelays, METADATA_RELAY]
  }, [readRelays])

  // Load kind 30000 follow set
  useEffect(() => {
    if (user?.pubkey) {
      const loader = createAddressLoader(pool)
      const subscription = loader({
        kind: 30000,
        pubkey: user.pubkey,
        identifier: FOLLOW_SET_IDENTIFIER,
        relays: relaysWithMetadata,
      }).subscribe(e => eventStore.add(e))

      return () => subscription.unsubscribe()
    }
  }, [user?.pubkey, eventStore, pool, relaysWithMetadata])

  // Also load kind 3 for migration detection
  useEffect(() => {
    if (user?.pubkey && !eventStore.hasReplaceable(kinds.Contacts, user.pubkey)) {
      const loader = createAddressLoader(pool)
      const subscription = loader({
        kind: kinds.Contacts,
        pubkey: user.pubkey,
        relays: relaysWithMetadata,
      }).subscribe(e => eventStore.add(e))

      return () => subscription.unsubscribe()
    }
  }, [user?.pubkey, eventStore, pool, relaysWithMetadata])

  // Get current follow set event using reactive approach
  const [followSetEvent, setFollowSetEvent] = useState<NostrEvent | null>(null)
  const [kind3Event, setKind3Event] = useState<NostrEvent | null>(null)

  useEffect(() => {
    if (!user?.pubkey) {
      setFollowSetEvent(null)
      return
    }

    // Subscribe to follow set event changes using AddressPointer object
    const sub = eventStore
      .addressable({
        kind: 30000,
        pubkey: user.pubkey,
        identifier: FOLLOW_SET_IDENTIFIER,
      })
      .subscribe(event => {
        setFollowSetEvent(event ?? null)
      })

    return () => sub.unsubscribe()
  }, [user?.pubkey, eventStore])

  useEffect(() => {
    if (!user?.pubkey) {
      setKind3Event(null)
      return
    }

    // Subscribe to kind 3 event changes
    const sub = eventStore.replaceable(kinds.Contacts, user.pubkey).subscribe(event => {
      setKind3Event(event ?? null)
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, eventStore])

  const hasFollowSet = !!followSetEvent
  const hasKind3Contacts = !!(kind3Event && kind3Event.tags.some(tag => tag[0] === 'p'))
  const kind3PubkeyCount = useMemo(() => {
    if (!kind3Event) return 0
    return kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1]).length
  }, [kind3Event])

  // Extract followed pubkeys from kind 30000
  const followedPubkeys = useMemo(() => {
    if (!followSetEvent) return []
    return followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1])
  }, [followSetEvent])

  // Add a follow
  const addFollow = useCallback(
    async (pubkey: string, relayHint?: string) => {
      if (!user?.pubkey) return
      setIsLoading(true)

      try {
        // Get current follow set or create new one
        const currentEvent = followSetEvent

        // Build tags
        const tags: string[][] = [
          ['d', FOLLOW_SET_IDENTIFIER],
          ['title', 'Nostube Follows'],
        ]

        // Add existing follows (excluding the one we're adding)
        if (currentEvent) {
          const existingPTags = currentEvent.tags.filter(tag => tag[0] === 'p' && tag[1] !== pubkey)
          tags.push(...existingPTags)
        }

        // Always include self in the follow list
        const hasSelf = currentEvent?.tags.some(tag => tag[0] === 'p' && tag[1] === user.pubkey)
        if (!hasSelf && pubkey !== user.pubkey) {
          tags.push(['p', user.pubkey])
        }

        // Add the new follow with optional relay hint
        tags.push(relayHint ? ['p', pubkey, relayHint] : ['p', pubkey])

        // Publish the updated follow set
        const signedEvent = await publish({
          event: {
            kind: 30000,
            created_at: nowInSecs(),
            content: '',
            tags,
          },
          relays: writeRelays,
        })

        // Add to event store for immediate UI update
        eventStore.add(signedEvent)
      } catch (error) {
        console.error('Failed to add follow:', error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user?.pubkey, followSetEvent, publish, writeRelays, eventStore]
  )

  // Remove a follow
  const removeFollow = useCallback(
    async (pubkey: string) => {
      if (!user?.pubkey || !followSetEvent) return
      setIsLoading(true)

      try {
        // Build tags without the removed pubkey
        const tags: string[][] = [
          ['d', FOLLOW_SET_IDENTIFIER],
          ['title', 'Nostube Follows'],
        ]

        // Add existing follows (excluding the one we're removing)
        const existingPTags = followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1] !== pubkey)
        tags.push(...existingPTags)

        // Publish the updated follow set
        const signedEvent = await publish({
          event: {
            kind: 30000,
            created_at: nowInSecs(),
            content: '',
            tags,
          },
          relays: writeRelays,
        })

        // Add to event store for immediate UI update
        eventStore.add(signedEvent)
      } catch (error) {
        console.error('Failed to remove follow:', error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user?.pubkey, followSetEvent, publish, writeRelays, eventStore]
  )

  // Cancel import
  const cancelImport = useCallback(() => {
    cancelRef.current = true
  }, [])

  // Import follows from kind 3 (only those with videos)
  const importFromKind3 = useCallback(async (): Promise<boolean> => {
    if (!user?.pubkey || !kind3Event) return false
    setIsLoading(true)
    cancelRef.current = false

    try {
      // Extract p tags from kind 3
      const kind3PTags = kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1])
      const allPubkeys = kind3PTags.map(tag => tag[1])

      if (allPubkeys.length === 0) return false

      // Initialize progress
      setImportProgress({
        phase: 'checking',
        checked: 0,
        total: allPubkeys.length,
        withVideos: 0,
      })

      // Check which pubkeys have videos (in batches)
      const pubkeysWithVideos: string[] = []
      const videoKinds = getKindsForType('all')

      for (let i = 0; i < allPubkeys.length; i += BATCH_SIZE) {
        if (cancelRef.current) {
          setImportProgress(prev => ({ ...prev, phase: 'idle' }))
          return false
        }

        const batch = allPubkeys.slice(i, i + BATCH_SIZE)

        // Query for any video from these authors
        const events = await new Promise<NostrEvent[]>(resolve => {
          const results: NostrEvent[] = []
          const seenAuthors = new Set<string>()

          const subscription = pool
            .req(readRelays, {
              kinds: videoKinds,
              authors: batch,
              limit: batch.length, // We only need 1 per author
            })
            .subscribe({
              next: (response: NostrEvent | 'EOSE') => {
                if (response === 'EOSE') {
                  subscription.unsubscribe()
                  resolve(results)
                  return
                }
                // Only keep first video per author
                if (!seenAuthors.has(response.pubkey)) {
                  seenAuthors.add(response.pubkey)
                  results.push(response)
                }
              },
              error: () => {
                subscription.unsubscribe()
                resolve(results)
              },
            })

          // Timeout after 10 seconds
          setTimeout(() => {
            subscription.unsubscribe()
            resolve(results)
          }, 10000)
        })

        // Collect pubkeys that have videos
        const authorsWithVideos = new Set(events.map(e => e.pubkey))
        batch.forEach(pubkey => {
          if (authorsWithVideos.has(pubkey)) {
            pubkeysWithVideos.push(pubkey)
          }
        })

        // Update progress
        setImportProgress({
          phase: 'checking',
          checked: Math.min(i + BATCH_SIZE, allPubkeys.length),
          total: allPubkeys.length,
          withVideos: pubkeysWithVideos.length,
        })
      }

      if (cancelRef.current) {
        setImportProgress(prev => ({ ...prev, phase: 'idle' }))
        return false
      }

      // Always include self in the follow list
      if (!pubkeysWithVideos.includes(user.pubkey)) {
        pubkeysWithVideos.push(user.pubkey)
      }

      if (pubkeysWithVideos.length === 0) {
        setImportProgress({ phase: 'done', checked: allPubkeys.length, total: allPubkeys.length, withVideos: 0 })
        return true
      }

      // Phase 2: Import only pubkeys with videos
      setImportProgress(prev => ({ ...prev, phase: 'importing' }))

      // Build new follow set with only pubkeys that have videos
      // Include relay hints from original kind 3 if available
      const tags: string[][] = [
        ['d', FOLLOW_SET_IDENTIFIER],
        ['title', 'Nostube Follows'],
      ]

      pubkeysWithVideos.forEach(pubkey => {
        const originalTag = kind3PTags.find(t => t[1] === pubkey)
        const relayHint = originalTag?.[2]
        tags.push(relayHint ? ['p', pubkey, relayHint] : ['p', pubkey])
      })

      // Publish the new follow set
      const signedEvent = await publish({
        event: {
          kind: 30000,
          created_at: nowInSecs(),
          content: '',
          tags,
        },
        relays: writeRelays,
      })

      // Add to event store
      eventStore.add(signedEvent)

      setImportProgress({
        phase: 'done',
        checked: allPubkeys.length,
        total: allPubkeys.length,
        withVideos: pubkeysWithVideos.length,
      })

      return true
    } catch (error) {
      console.error('Failed to import from kind 3:', error)
      setImportProgress(prev => ({ ...prev, phase: 'idle' }))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [user?.pubkey, kind3Event, publish, writeRelays, eventStore, pool, readRelays])

  return {
    followedPubkeys,
    isLoading,
    addFollow,
    removeFollow,
    importFromKind3,
    hasFollowSet,
    hasKind3Contacts,
    kind3PubkeyCount,
    importProgress,
    cancelImport,
  }
}
