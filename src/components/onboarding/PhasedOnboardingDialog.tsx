import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { PhaseIdentityStep } from './PhaseIdentityStep'
import { PhaseFeedStep } from './PhaseFeedStep'
import { PhaseReadyStep } from './PhaseReadyStep'

interface PhasedOnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type Step = 1 | 2 | 3

export function PhasedOnboardingDialog({ open, onOpenChange, onComplete }: PhasedOnboardingDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>(1)

  const progress = useMemo(() => {
    if (step === 1) return 33
    if (step === 2) return 66
    return 100
  }, [step])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{t('onboarding.phasedOnboarding.welcome')}</DialogTitle>
          <DialogDescription>{t('onboarding.phasedOnboarding.welcomeDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('onboarding.phasedOnboarding.step1')}</span>
              <span>{t('onboarding.phasedOnboarding.step2')}</span>
              <span>{t('onboarding.phasedOnboarding.step3')}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {step === 1 && <PhaseIdentityStep onComplete={() => setStep(2)} />}
          {step === 2 && <PhaseFeedStep onComplete={() => setStep(3)} onExplore={handleExplore} />}
          {step === 3 && (
            <PhaseReadyStep onComplete={closeDone} onExplore={handleExplore} onUpload={handleUpload} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
