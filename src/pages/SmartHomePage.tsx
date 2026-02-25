import { useCurrentUser, useFollowSet } from '@/hooks'
import { HomePage } from './HomePage'
import { SubscriptionsPage } from './SubscriptionsPage'

export function SmartHomePage() {
  const { user } = useCurrentUser()
  const { followedPubkeys } = useFollowSet()

  if (user && followedPubkeys.length > 0) {
    return <SubscriptionsPage />
  }

  return <HomePage />
}
