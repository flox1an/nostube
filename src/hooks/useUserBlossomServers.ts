import { useMemo, useRef, useEffect } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventModel } from 'applesauce-react/hooks'
import { UserBlossomServersModel } from 'applesauce-core/models'
import { isBlossomServerBlocked } from '@/constants/relays'

export function useUserBlossomServers() {
  const { user } = useCurrentUser()

  // Throttle logging: only log when values change or every 10 seconds
  const lastLogRef = useRef({ time: 0, serverCount: 0, pubkey: '' })

  // Use UserBlossomServersModel to get user's blossom servers
  const blossomServers =
    useEventModel(UserBlossomServersModel, user?.pubkey ? [user.pubkey] : null) || []

  // Convert URL objects to strings and filter out blocked servers - memoized to prevent infinite loops
  const serverUrls = useMemo(
    () => blossomServers.map(url => url.toString()).filter(url => !isBlossomServerBlocked(url)),
    [blossomServers]
  )

  // Memoize result object to prevent infinite re-renders
  const result = useMemo(
    () => ({
      data: serverUrls,
      isLoading: user && serverUrls.length === 0,
      enabled: !!user?.pubkey,
    }),
    [serverUrls, user]
  )

  // Throttled debug logging in useEffect to avoid impure function calls during render
  useEffect(() => {
    const now = Date.now()
    const shouldLog =
      now - lastLogRef.current.time > 10000 || // 10 seconds elapsed
      lastLogRef.current.serverCount !== serverUrls.length || // Server count changed
      lastLogRef.current.pubkey !== user?.pubkey // User changed

    if (shouldLog) {
      console.log('🔍 useUserBlossomServers called')
      console.log('  User pubkey:', user?.pubkey)
      console.log('  Raw blossom servers from model:', blossomServers)
      console.log('  Converted server URLs:', serverUrls)
      console.log('  Returning:', result)

      lastLogRef.current = {
        time: now,
        serverCount: serverUrls.length,
        pubkey: user?.pubkey || '',
      }
    }
  }, [serverUrls, user?.pubkey, blossomServers, result])

  return result
}
