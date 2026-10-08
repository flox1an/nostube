import { useCurrentUser } from './useCurrentUser'
import { useMemo } from 'react'
import { useFollowSet } from './useFollowSet'
import { useFollowSetContext } from '@/contexts/FollowSetContext'

export function useFollowedAuthors() {
  const { user } = useCurrentUser()
  const { isLoading: followSetLoading } = useFollowSet()
  // Optimistic: falls back to the cached list so the timeline filter exists
  // before the live kind 10020 lands.
  const { optimisticFollowedPubkeys } = useFollowSetContext()

  // Transform pubkeys into profile objects to match old ContactsModel format
  const followedProfiles = useMemo(() => {
    return optimisticFollowedPubkeys.map(pubkey => ({ pubkey }))
  }, [optimisticFollowedPubkeys])

  return {
    data: followedProfiles,
    isLoading: user && followSetLoading,
    enabled: !!user?.pubkey,
  }
}
