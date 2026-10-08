import { useMemo, useState } from 'react'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PhasedOnboardingDialog } from './onboarding/PhasedOnboardingDialog'
import {
  clearNewUser,
  isFollowImportResolved,
  isNewUser,
  markFollowDone,
} from '@/lib/onboarding-progress'

export function OnboardingDialog() {
  const { user } = useCurrentUser()
  const { hasFollowSet, followSetLoaded, hasKind3Contacts } = useFollowSet()
  const [isCompleted, setIsCompleted] = useState(false)

  const shouldShow = useMemo(() => {
    if (!user?.pubkey || isCompleted) return false
    if (!followSetLoaded) return false

    return isNewUser() || (!isFollowImportResolved() && !hasFollowSet && hasKind3Contacts)
  }, [user?.pubkey, hasFollowSet, followSetLoaded, hasKind3Contacts, isCompleted])

  const handleComplete = () => {
    markFollowDone()
    clearNewUser()
    setIsCompleted(true)
  }

  return (
    <PhasedOnboardingDialog open={shouldShow} onOpenChange={() => {}} onComplete={handleComplete} />
  )
}
