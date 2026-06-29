import { useCurrentUser, useFollowSet } from '@/hooks'
import { loadActiveAccount } from '@/hooks/useAccountPersistence'
import { HomePage } from './HomePage'
import { SubscriptionsPage } from './SubscriptionsPage'
import { PageLoader } from '@/components/PageLoader'
import { SubscriptionsPageLoader } from '@/components/page-loaders'

export function SmartHomePage() {
  const { user } = useCurrentUser()
  const { followedPubkeys, followSetLoaded } = useFollowSet()

  // On a hard reload there are two async steps before we can pick the
  // right page: (1) restoring the active account from localStorage (runs
  // in App's AccountRestoreInit useEffect) and (2) loading the kind 10020
  // follow set from relays. Without gating on both, a logged-in user
  // sees HomePage flash before SubscriptionsPage swaps in — unmounting
  // the grid and replaying the thumbnail fade-in on every reload.
  //
  // `loadActiveAccount()` is the synchronous source of truth (the value
  // App's AccountRestoreInit feeds into the account manager). Reading it
  // each render keeps the gate reactive to login/logout without the
  // useState pitfall of stranding the gate on PageLoader after logout.
  const hasPersistedAccount = loadActiveAccount() !== null
  const isWaitingForAccountRestore = hasPersistedAccount && !user
  const isWaitingForFollowSet = !!user && !followSetLoaded

  if (isWaitingForAccountRestore || isWaitingForFollowSet) {
    return hasPersistedAccount ? <SubscriptionsPageLoader /> : <PageLoader />
  }

  if (user && followedPubkeys.length > 0) {
    return <SubscriptionsPage />
  }

  return <HomePage />
}
