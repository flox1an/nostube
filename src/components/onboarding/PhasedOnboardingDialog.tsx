import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHasProfile } from '@/hooks'
import { OnboardingShell } from './OnboardingShell'
import { PhaseIdentityStep } from './PhaseIdentityStep'
import { PhaseProfileStep } from './PhaseProfileStep'
import { PhaseFeedStep } from './PhaseFeedStep'
import { PhaseReadyStep } from './PhaseReadyStep'

interface PhasedOnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type StepId = 'account' | 'profile' | 'follows' | 'ready'

interface StepConfig {
  id: StepId
  label: string
  title: string
  description: string
}

export function PhasedOnboardingDialog({
  open,
  onOpenChange,
  onComplete,
}: PhasedOnboardingDialogProps) {
  const { t } = useTranslation()
  const { hasProfile } = useHasProfile()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const steps = useMemo<StepConfig[]>(() => {
    const flow: StepConfig[] = [
      {
        id: 'account',
        label: t('onboarding.phasedOnboarding.step1'),
        title: t('onboarding.phasedOnboarding.welcome'),
        description: t('onboarding.phasedOnboarding.welcomeDescription'),
      },
    ]

    if (!hasProfile) {
      flow.push({
        id: 'profile',
        label: t('onboarding.phasedOnboarding.stepProfile'),
        title: t('onboarding.profileStep.title'),
        description: t('onboarding.profileStep.description'),
      })
    }

    flow.push(
      {
        id: 'follows',
        label: t('onboarding.phasedOnboarding.step2'),
        title: t('onboarding.feedStep.title'),
        description: t('onboarding.feedStep.description'),
      },
      {
        id: 'ready',
        label: t('onboarding.phasedOnboarding.step3'),
        title: t('onboarding.readyStep.title'),
        description: t('onboarding.readyStep.description'),
      }
    )

    return flow
  }, [hasProfile, t])

  useEffect(() => {
    setCurrentStepIndex(index => Math.min(index, steps.length - 1))
  }, [steps.length])

  const currentStep = steps[currentStepIndex] ?? steps[steps.length - 1]

  const advance = useCallback(() => {
    setCurrentStepIndex(index => Math.min(index + 1, steps.length - 1))
  }, [steps.length])

  const closeDone = useCallback(() => {
    onComplete?.()
    onOpenChange(false)
  }, [onComplete, onOpenChange])

  const handleExplore = useCallback(() => {
    window.location.href = '/explore'
  }, [])

  const handleUpload = useCallback(() => {
    window.location.href = '/upload'
  }, [])

  const hero =
    currentStep?.id === 'account' ? (
      <img
        src="/onboarding/welcome-hero.webp"
        alt=""
        className="h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
      />
    ) : undefined

  return (
    <OnboardingShell
      open={open}
      onOpenChange={onOpenChange}
      title={currentStep.title}
      description={currentStep.description}
      steps={steps}
      currentStepIndex={currentStepIndex}
      hero={hero}
    >
      {currentStep.id === 'account' && <PhaseIdentityStep onComplete={advance} />}
      {currentStep.id === 'profile' && <PhaseProfileStep onComplete={advance} onSkip={advance} />}
      {currentStep.id === 'follows' && (
        <PhaseFeedStep onComplete={advance} onExplore={handleExplore} />
      )}
      {currentStep.id === 'ready' && (
        <PhaseReadyStep onComplete={closeDone} onExplore={handleExplore} onUpload={handleUpload} />
      )}
    </OnboardingShell>
  )
}
