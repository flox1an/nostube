import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser } from './useCurrentUser'
import { useMemo, useState, useCallback, useRef } from 'react'
import { type NostrEvent } from 'nostr-tools'
import type { RelayReqEventMessage } from 'applesauce-relay'
import { useAppContext } from './useAppContext'
import { MEDIA_FOLLOWS_KIND, useFollowSetContext } from '@/contexts/FollowSetContext'
import { useNostrPublish } from './useNostrPublish'
import { nowInSecs } from '@/lib/utils'
import { getKindsForType } from '@/lib/video-types'

const BATCH_SIZE = 50 // Number of pubkeys to check per query

export interface ImportProgress {
  phase: 'idle' | 'checking' | 'importing' | 'done'
  checked: number
  total: number
  withVideos: number
}

export interface UseFollowSetReturn {
  followedPubkeys: string[]
  isLoading: boolean
  addFollow: (pubkey: string, relayHint?: string) => Promise<void>
  removeFollow: (pubkey: string) => Promise<void>
  importFromKind3: () => Promise<boolean>
  hasFollowSet: boolean
  /** Whether the initial follow set query has completed (EOSE received) */
  followSetLoaded: boolean
  hasKind3Contacts: boolean
  kind3PubkeyCount: number
  importProgress: ImportProgress
  cancelImport: () => void
}

/**
 * Follow-set state plus the mutation helpers.
 *
 * Loading lives in {@link FollowSetProvider} so it happens once per app,
 * not once per consumer.
 */
export function useFollowSet(): UseFollowSetReturn {
  const { user } = useCurrentUser()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { publish } = useNostrPublish()
  const { followSetEvent, kind3Event, followSetLoaded, followedPubkeys } = useFollowSetContext()
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

  const hasFollowSet = !!followSetEvent
  const hasKind3Contacts = !!(kind3Event && kind3Event.tags.some(tag => tag[0] === 'p'))
  const kind3PubkeyCount = useMemo(() => {
    if (!kind3Event) return 0
    return kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1]).length
  }, [kind3Event])

  // Add a follow
  const addFollow = useCallback(
    async (pubkey: string, relayHint?: string) => {
      if (!user?.pubkey) return
      setIsLoading(true)

      try {
        // Get current follow set or create new one
        const currentEvent = followSetEvent

        // Build tags - carry over existing p tags (excluding the one we're adding)
        const tags: string[][] = []

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
            kind: MEDIA_FOLLOWS_KIND,
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
        const tags: string[][] = followSetEvent.tags.filter(
          tag => tag[0] === 'p' && tag[1] !== pubkey
        )

        // Publish the updated follow set
        const signedEvent = await publish({
          event: {
            kind: MEDIA_FOLLOWS_KIND,
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
              next: response => {
                if (response.type === 'EOSE') {
                  subscription.unsubscribe()
                  resolve(results)
                  return
                }
                if (response.type !== 'EVENT') return
                const event = (response as RelayReqEventMessage).event
                // Only keep first video per author
                if (!seenAuthors.has(event.pubkey)) {
                  seenAuthors.add(event.pubkey)
                  results.push(event)
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
        setImportProgress({
          phase: 'done',
          checked: allPubkeys.length,
          total: allPubkeys.length,
          withVideos: 0,
        })
        return true
      }

      // Phase 2: Import only pubkeys with videos (append to existing list)
      setImportProgress(prev => ({ ...prev, phase: 'importing' }))

      // Start with existing follows to preserve them
      const existingPubkeys = new Set(followedPubkeys)
      const tags: string[][] = followSetEvent
        ? followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1])
        : []

      // Append new pubkeys that aren't already followed
      pubkeysWithVideos.forEach(pubkey => {
        if (!existingPubkeys.has(pubkey)) {
          const originalTag = kind3PTags.find(t => t[1] === pubkey)
          const relayHint = originalTag?.[2]
          tags.push(relayHint ? ['p', pubkey, relayHint] : ['p', pubkey])
        }
      })

      // Publish the updated follow set
      const signedEvent = await publish({
        event: {
          kind: MEDIA_FOLLOWS_KIND,
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
  }, [
    user?.pubkey,
    kind3Event,
    followSetEvent,
    followedPubkeys,
    publish,
    writeRelays,
    eventStore,
    pool,
    readRelays,
  ])

  return {
    followedPubkeys,
    isLoading,
    addFollow,
    removeFollow,
    importFromKind3,
    hasFollowSet,
    followSetLoaded,
    hasKind3Contacts,
    kind3PubkeyCount,
    importProgress,
    cancelImport,
  }
}
