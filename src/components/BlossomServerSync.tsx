import { useEffect } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers'
import { useAppContext } from '@/hooks/useAppContext'
import { type BlossomServerTag } from '@/contexts/AppContext'
import { useEventStore } from 'applesauce-react/hooks'
import { useReadRelays } from '@/hooks/useReadRelays'

/**
 * Automatically syncs user's NIP-63 (kind 10063) blossom servers to app config.
 * This component must be rendered inside AccountsProvider hierarchy.
 */
export function BlossomServerSync() {
  const { user } = useCurrentUser()
  const userBlossomServers = useUserBlossomServers()
  const { config, updateConfig, pool } = useAppContext()
  const eventStore = useEventStore()
  const readRelays = useReadRelays()

  // Debug: Check which relays we're connected to and query for kind 10063
  useEffect(() => {
    if (user?.pubkey) {
      console.log('🌐 Connected relays:', readRelays)
      console.log('🔎 Querying relays for kind 10063 events')
      console.log('  User pubkey:', user.pubkey)

      // Check EventStore first
      const eventsInStore = eventStore.getEventsForFilters([
        {
          kinds: [10063],
          authors: [user.pubkey],
        },
      ])
      console.log('  Events already in EventStore:', eventsInStore)
      if (eventsInStore.length > 0) {
        console.log('  Event found in store:')
        console.log('    ID:', eventsInStore[0].id)
        console.log('    Created:', new Date(eventsInStore[0].created_at * 1000).toISOString())
        console.log('    Tags:', eventsInStore[0].tags)
        console.log('    Content:', eventsInStore[0].content)
      }

      // Query relays for the event
      console.log('  Querying relays...')
      const sub = pool.subscribe(
        [
          {
            kinds: [10063],
            authors: [user.pubkey],
            limit: 1,
          },
        ],
        readRelays,
        {
          onEvent: event => {
            console.log('  📥 Received kind 10063 event from relay:', event)
            console.log('    Event ID:', event.id)
            console.log('    Tags:', event.tags)
            console.log('    Server tags:', event.tags.filter(t => t[0] === 'server'))
          },
          onComplete: () => {
            console.log('  ✅ Query complete')
          },
        }
      )

      return () => {
        console.log('  🛑 Closing subscription')
        sub.close()
      }
    }
  }, [user?.pubkey, eventStore, pool, readRelays])

  // Auto-load user's NIP-63 (kind 10063) blossom servers
  useEffect(() => {
    console.log('🌸 BlossomServerSync - useEffect triggered')
    console.log('  User pubkey:', user?.pubkey)
    console.log('  User blossom servers data:', userBlossomServers.data)
    console.log('  User blossom servers isLoading:', userBlossomServers.isLoading)
    console.log('  Current config blossom servers:', config.blossomServers)

    // Only proceed if user is logged in and has blossom servers
    if (!user?.pubkey) {
      console.log('  ❌ No user pubkey - skipping')
      return
    }

    if (!userBlossomServers.data?.length) {
      console.log('  ❌ No user blossom servers data - skipping')
      return
    }

    console.log('  ✅ User is logged in with blossom servers')

    // Get current servers from config
    const currentServers = config.blossomServers || []
    const currentUrls = new Set(currentServers.map(s => s.url))
    console.log('  Current server URLs:', Array.from(currentUrls))

    // Find new servers (not already in config)
    const newServers = userBlossomServers.data
      .filter(url => {
        const exists = currentUrls.has(url)
        console.log(`    Checking ${url}: ${exists ? 'already exists' : 'NEW'}`)
        return !exists
      })
      .map(url => ({
        url,
        name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        tags: [] as BlossomServerTag[], // Empty tags for user's 10063 servers
      }))

    console.log('  New servers to add:', newServers)

    // Only update if there are new servers to add
    if (newServers.length > 0) {
      console.log('  📝 Updating config with new servers')
      updateConfig(currentConfig => ({
        ...currentConfig,
        blossomServers: [...(currentConfig.blossomServers || []), ...newServers],
      }))
      console.log('  ✅ Config update called')
    } else {
      console.log('  ℹ️ No new servers to add')
    }
  }, [user?.pubkey, userBlossomServers.data, config.blossomServers, updateConfig])

  // This component doesn't render anything
  return null
}
