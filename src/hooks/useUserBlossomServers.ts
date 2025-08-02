import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventModel } from 'applesauce-react/hooks';
import { UserBlossomServersModel } from 'applesauce-core/models';

export function useUserBlossomServers() {
  const { user } = useCurrentUser();

  // Use UserBlossomServersModel to get user's blossom servers
  const blossomServers = useEventModel(UserBlossomServersModel, user?.pubkey ? [user.pubkey] : null) || [];

  // Convert URL objects to strings for compatibility
  const serverUrls = blossomServers.map(url => url.toString());

  return {
    data: serverUrls,
    isLoading: user && serverUrls.length === 0,
    enabled: !!user?.pubkey,
  };
}
