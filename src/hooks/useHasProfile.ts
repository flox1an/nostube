import { kinds } from 'nostr-tools'
import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser } from './useCurrentUser'
import { useProfile } from './useProfile'

export function useHasProfile(): { hasProfile: boolean; loaded: boolean } {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const profile = useProfile(user?.pubkey ? { pubkey: user.pubkey } : undefined)

  if (!user?.pubkey) return { hasProfile: false, loaded: false }

  const hasMetadataEvent = eventStore.hasReplaceable(kinds.Metadata, user.pubkey)
  const hasProfile = !!(profile?.display_name || profile?.name || profile?.picture)

  return {
    hasProfile,
    loaded: hasMetadataEvent || profile !== undefined,
  }
}
