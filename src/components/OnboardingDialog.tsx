import { useMemo, useState } from 'react'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PhasedOnboardingDialog } from './onboarding/PhasedOnboardingDialog'

const FOLLOW_IMPORT_STORAGE_KEY = 'nostube_onboarding_follow_import'
const NEW_USER_STORAGE_KEY = 'nostube_onboarding_new_user'

export function OnboardingDialog() {
  const { user } = useCurrentUser()
  const { hasFollowSet, followSetLoaded, hasKind3Contacts } = useFollowSet()
  const [isCompleted, setIsCompleted] = useState(false)

  const shouldShow = useMemo(() => {
    if (!user?.pubkey || isCompleted) return false
    if (!followSetLoaded) return false

    const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)
    const isNewUser = localStorage.getItem(NEW_USER_STORAGE_KEY) === '1'

    return isNewUser || (!followImportCompleted && !hasFollowSet && hasKind3Contacts)
  }, [user?.pubkey, hasFollowSet, followSetLoaded, hasKind3Contacts, isCompleted])

  const handleComplete = () => {
    localStorage.setItem(FOLLOW_IMPORT_STORAGE_KEY, 'done')
    localStorage.removeItem(NEW_USER_STORAGE_KEY)
    setIsCompleted(true)
  }

  return (
    <PhasedOnboardingDialog open={shouldShow} onOpenChange={() => {}} onComplete={handleComplete} />
  )
}
