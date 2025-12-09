import { useMemo, useState } from 'react'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAppContext } from '@/hooks'
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

function OnboardingDialogContent({ initialStep }: { initialStep: 1 | 2 }) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<1 | 2>(initialStep)

  const handleFollowImportComplete = () => {
    setCurrentStep(2)
  }

  const handleFollowImportSkip = () => {
    setCurrentStep(2)
  }

  const handleBlossomConfigComplete = () => {
    // Dialog will close automatically when localStorage is set
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
  const { config } = useAppContext()

  // Compute dialog state based on conditions
  const dialogState = useMemo(() => {
    if (!user?.pubkey) return { shouldShow: false, initialStep: 1 as const }

    const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)
    const blossomConfigCompleted = localStorage.getItem(BLOSSOM_CONFIG_STORAGE_KEY)
    const hasBlossomServers = (config.blossomServers?.length ?? 0) > 0

    // If both steps are completed or blossom is already configured, don't show dialog
    if (blossomConfigCompleted || (followImportCompleted && hasBlossomServers)) {
      return { shouldShow: false, initialStep: 1 as const }
    }

    // Determine which step to show
    if (!followImportCompleted && !hasFollowSet && hasKind3Contacts) {
      return { shouldShow: true, initialStep: 1 as const }
    } else if (followImportCompleted && !blossomConfigCompleted && !hasBlossomServers) {
      return { shouldShow: true, initialStep: 2 as const }
    } else if (!blossomConfigCompleted && !hasBlossomServers) {
      return { shouldShow: true, initialStep: 2 as const }
    }

    return { shouldShow: false, initialStep: 1 as const }
  }, [user?.pubkey, hasFollowSet, hasKind3Contacts, config.blossomServers])

  return (
    <Dialog open={dialogState.shouldShow} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl" hideCloseButton>
        <OnboardingDialogContent
          key={dialogState.initialStep}
          initialStep={dialogState.initialStep}
        />
      </DialogContent>
    </Dialog>
  )
}
