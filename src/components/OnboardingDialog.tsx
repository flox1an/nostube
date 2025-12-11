import { useMemo, useState } from 'react'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { FollowImportStep } from './onboarding/FollowImportStep'

const FOLLOW_IMPORT_STORAGE_KEY = 'nostube_onboarding_follow_import'

function OnboardingDialogContent({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('onboarding.followImport.title')}</DialogTitle>
        <DialogDescription>{t('onboarding.followImport.description')}</DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <FollowImportStep onComplete={onComplete} onSkip={onComplete} />
      </div>
    </>
  )
}

export function OnboardingDialog() {
  const { user } = useCurrentUser()
  const { hasFollowSet, hasKind3Contacts } = useFollowSet()
  const [isCompleted, setIsCompleted] = useState(false)

  const shouldShow = useMemo(() => {
    if (!user?.pubkey || isCompleted) return false

    const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)

    // Only show if user has kind 3 contacts but no follow set and hasn't completed import
    return !followImportCompleted && !hasFollowSet && hasKind3Contacts
  }, [user?.pubkey, hasFollowSet, hasKind3Contacts, isCompleted])

  const handleComplete = () => {
    setIsCompleted(true)
  }

  return (
    <Dialog open={shouldShow} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl" hideCloseButton>
        <OnboardingDialogContent onComplete={handleComplete} />
      </DialogContent>
    </Dialog>
  )
}
