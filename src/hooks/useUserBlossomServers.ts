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

  // Convert URL objects to strings for compatibility
  const serverUrls = blossomServers.map(url => url.toString())

  console.log('  Converted server URLs:', serverUrls)

  const result = {
    data: serverUrls,
    isLoading: user && serverUrls.length === 0,
    enabled: !!user?.pubkey,
  }

  console.log('  Returning:', result)

  return result
}
