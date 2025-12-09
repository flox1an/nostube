import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser } from './useCurrentUser'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { kinds, type NostrEvent } from 'nostr-tools'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY } from '@/constants/relays'
import { useNostrPublish } from './useNostrPublish'
import { nowInSecs } from '@/lib/utils'

const FOLLOW_SET_IDENTIFIER = 'nostube-follows'

interface UseFollowSetReturn {
  followedPubkeys: string[]
  isLoading: boolean
  addFollow: (pubkey: string) => Promise<void>
  removeFollow: (pubkey: string) => Promise<void>
  importFromKind3: () => Promise<boolean>
  hasFollowSet: boolean
  hasKind3Contacts: boolean
}

export function useFollowSet(): UseFollowSetReturn {
  const { user } = useCurrentUser()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { publish } = useNostrPublish()
  const [isLoading, setIsLoading] = useState(false)

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

  // Extract followed pubkeys from kind 30000
  const followedPubkeys = useMemo(() => {
    if (!followSetEvent) return []
    return followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1])
  }, [followSetEvent])

  // Add a follow
  const addFollow = useCallback(
    async (pubkey: string) => {
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

        // Add the new follow
        tags.push(['p', pubkey])

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

  // Import follows from kind 3
  const importFromKind3 = useCallback(async (): Promise<boolean> => {
    if (!user?.pubkey || !kind3Event) return false
    setIsLoading(true)

    try {
      // Extract p tags from kind 3
      const kind3PTags = kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1])

      if (kind3PTags.length === 0) return false

      // Build new follow set with all p tags
      const tags: string[][] = [
        ['d', FOLLOW_SET_IDENTIFIER],
        ['title', 'Nostube Follows'],
        ...kind3PTags.map(tag => ['p', tag[1]]),
      ]

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
      return true
    } catch (error) {
      console.error('Failed to import from kind 3:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [user?.pubkey, kind3Event, publish, writeRelays, eventStore])

  return {
    followedPubkeys,
    isLoading,
    addFollow,
    removeFollow,
    importFromKind3,
    hasFollowSet,
    hasKind3Contacts,
  }
}
