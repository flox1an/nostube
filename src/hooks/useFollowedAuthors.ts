import { useCurrentUser } from './useCurrentUser'
import { useMemo } from 'react'
import { useFollowSet } from './useFollowSet'

export function useFollowedAuthors() {
  const { user } = useCurrentUser()
  const { followedPubkeys, isLoading: followSetLoading } = useFollowSet()

  // Transform pubkeys into profile objects to match old ContactsModel format
  const followedProfiles = useMemo(() => {
    return followedPubkeys.map(pubkey => ({ pubkey }))
  }, [followedPubkeys])

  return {
    data: followedProfiles,
    isLoading: user && followSetLoading,
    enabled: !!user?.pubkey,
  }
}
