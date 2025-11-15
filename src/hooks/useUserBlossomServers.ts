import { useMemo } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventModel } from 'applesauce-react/hooks'
import { UserBlossomServersModel } from 'applesauce-core/models'

export function useUserBlossomServers() {
  const { user } = useCurrentUser()

  console.log('🔍 useUserBlossomServers called')
  console.log('  User pubkey:', user?.pubkey)

  // Use UserBlossomServersModel to get user's blossom servers
  const blossomServers =
    useEventModel(UserBlossomServersModel, user?.pubkey ? [user.pubkey] : null) || []

  console.log('  Raw blossom servers from model:', blossomServers)

  // Convert URL objects to strings for compatibility - memoized to prevent infinite loops
  const serverUrls = useMemo(() => blossomServers.map(url => url.toString()), [blossomServers])

  console.log('  Converted server URLs:', serverUrls)

  // Memoize result object to prevent infinite re-renders
  const result = useMemo(
    () => ({
      data: serverUrls,
      isLoading: user && serverUrls.length === 0,
      enabled: !!user?.pubkey,
    }),
    [serverUrls, user]
  )

  console.log('  Returning:', result)

  return result
}
