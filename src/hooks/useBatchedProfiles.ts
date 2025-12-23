import { useEffect, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { kinds } from 'nostr-tools'
import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'
import { METADATA_RELAY } from '@/constants/relays'

/**
 * Batched profile loader
 * Collects profile requests and batches them into a single relay query
 */

const BATCH_DELAY = 100 // milliseconds to wait before sending batch request
let batchTimeout: NodeJS.Timeout | null = null
const pendingPubkeys = new Set<string>()

export function useBatchedProfileLoader() {
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const readRelays = useReadRelays()
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const processBatch = () => {
      if (pendingPubkeys.size === 0) return

      const pubkeysToLoad = Array.from(pendingPubkeys).filter(pubkey => {
        // Only load if not already in event store
        return !eventStore.hasReplaceable(kinds.Metadata, pubkey)
      })

      pendingPubkeys.clear()

      if (pubkeysToLoad.length === 0) return

      // Load all profiles in a single request
      const loader = createTimelineLoader(
        pool,
        [...readRelays, METADATA_RELAY, 'wss://index.hzrd149.com'],
        {
          kinds: [kinds.Metadata],
          authors: pubkeysToLoad,
        },
        {
          eventStore,
          limit: pubkeysToLoad.length,
        }
      )

      loader().subscribe({
        next: _event => {
          // Events are automatically added to eventStore by the loader
        },
        error: err => {
          console.error('[Batch Profile Loader] Error loading profiles:', err)
        },
      })
    }

    // Set up the batch processor
    const scheduleBatch = () => {
      if (batchTimeout) {
        clearTimeout(batchTimeout)
      }
      batchTimeout = setTimeout(() => {
        processBatch()
        batchTimeout = null
      }, BATCH_DELAY)
    }

    // Expose global function to request profiles
    ;(window as unknown as { __requestProfile: (pubkey: string) => void }).__requestProfile = (
      pubkey: string
    ) => {
      if (!pubkey || pubkey.trim() === '') return
      pendingPubkeys.add(pubkey)
      scheduleBatch()
    }

    return () => {
      if (batchTimeout) {
        clearTimeout(batchTimeout)
      }
      hasInitialized.current = false
    }
  }, [eventStore, pool, readRelays])
}

/**
 * Request a profile to be loaded (will be batched with other requests)
 */
export function requestProfile(pubkey: string) {
  const win = window as unknown as { __requestProfile?: (pubkey: string) => void }
  if (typeof window !== 'undefined' && win.__requestProfile) {
    win.__requestProfile(pubkey)
  }
}
