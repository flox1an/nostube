import { useEffect } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers'
import { useAppContext } from '@/hooks/useAppContext'
import { type BlossomServerTag } from '@/contexts/AppContext'
import { useEventStore } from 'applesauce-react/hooks'

/**
 * Automatically syncs user's NIP-63 (kind 10063) blossom servers to app config.
 * This component must be rendered inside AccountsProvider hierarchy.
 */
export function BlossomServerSync() {
  const { user } = useCurrentUser()
  const userBlossomServers = useUserBlossomServers()
  const { config, updateConfig } = useAppContext()
  const eventStore = useEventStore()

  // Debug: Check EventStore directly for kind 10063 events
  useEffect(() => {
    if (user?.pubkey) {
      console.log('🔎 Checking EventStore for kind 10063 events')
      const events = eventStore.getEventsForFilters([
        {
          kinds: [10063],
          authors: [user.pubkey],
        },
      ])
      console.log('  Found kind 10063 events in EventStore:', events)
      if (events.length > 0) {
        console.log('  Event content:', events[0])
        console.log('  Event tags:', events[0].tags)
      }
    }
  }, [user?.pubkey, eventStore])

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
