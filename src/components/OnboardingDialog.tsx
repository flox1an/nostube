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
import { BlossomServerConfigStep } from './onboarding/BlossomServerConfigStep'

const FOLLOW_IMPORT_STORAGE_KEY = 'nostube_onboarding_follow_import'
const BLOSSOM_CONFIG_STORAGE_KEY = 'nostube_onboarding_blossom_config'

function OnboardingDialogContent({
  initialStep,
  onComplete,
}: {
  initialStep: 1 | 2
  onComplete: () => void
}) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<1 | 2>(initialStep)

  const handleFollowImportComplete = () => {
    setCurrentStep(2)
  }

  const handleFollowImportSkip = () => {
    setCurrentStep(2)
  }

  const handleBlossomConfigComplete = () => {
    onComplete()
  }

  const getDialogTitle = () => {
    if (currentStep === 1) {
      return t('onboarding.followImport.title')
    }
    return t('onboarding.blossom.title')
  }

  const getDialogDescription = () => {
    if (currentStep === 1) {
      return t('onboarding.followImport.description')
    }
    return ''
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{getDialogTitle()}</DialogTitle>
        {getDialogDescription() && <DialogDescription>{getDialogDescription()}</DialogDescription>}
      </DialogHeader>

      <div className="py-4">
        {currentStep === 1 && (
          <FollowImportStep
            onComplete={handleFollowImportComplete}
            onSkip={handleFollowImportSkip}
          />
        )}
        {currentStep === 2 && <BlossomServerConfigStep onComplete={handleBlossomConfigComplete} />}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        {t('onboarding.blossom.stepIndicator', { current: currentStep, total: 2 })}
      </div>
    </>
  )
}

export function OnboardingDialog() {
  const { user } = useCurrentUser()
  const { hasFollowSet, hasKind3Contacts } = useFollowSet()
  const [isCompleted, setIsCompleted] = useState(false)

  // Compute dialog state based on conditions
  const dialogState = useMemo(() => {
    if (!user?.pubkey || isCompleted) return { shouldShow: false, initialStep: 1 as const }

    const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)
    const blossomConfigCompleted = localStorage.getItem(BLOSSOM_CONFIG_STORAGE_KEY)

    // If blossom config was explicitly completed, don't show
    if (blossomConfigCompleted) {
      return { shouldShow: false, initialStep: 1 as const }
    }

    // If follow import not completed and user has kind 3 contacts but no follow set, show step 1
    if (!followImportCompleted && !hasFollowSet && hasKind3Contacts) {
      return { shouldShow: true, initialStep: 1 as const }
    }

    // If follow import completed or user already has follow set, show step 2
    if (followImportCompleted || hasFollowSet) {
      return { shouldShow: true, initialStep: 2 as const }
    }

    // Default: show step 2 (blossom config)
    return { shouldShow: true, initialStep: 2 as const }
  }, [user?.pubkey, hasFollowSet, hasKind3Contacts, isCompleted])

  const handleComplete = () => {
    setIsCompleted(true)
  }

  return (
    <Dialog open={dialogState.shouldShow} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl" hideCloseButton>
        <OnboardingDialogContent
          key={dialogState.initialStep}
          initialStep={dialogState.initialStep}
          onComplete={handleComplete}
        />
      </DialogContent>
    </Dialog>
  )
}
