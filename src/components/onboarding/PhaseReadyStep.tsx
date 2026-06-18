import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Compass, Upload, Settings } from 'lucide-react'

interface PhaseReadyStepProps {
  onComplete: () => void
  onExplore?: () => void
  onUpload?: () => void
}

export function PhaseReadyStep({ onComplete, onExplore, onUpload }: PhaseReadyStepProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <img
          src="/onboarding/ready-spot.webp"
          alt=""
          className="mx-auto h-24 w-24"
          loading="eager"
          decoding="async"
        />
        <h3 className="text-xl font-semibold">{t('onboarding.readyStep.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('onboarding.readyStep.description')}</p>
      </div>

      <div className="grid gap-2">
        <Card>
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <Compass className="h-4 w-4" />
            {t('onboarding.readyStep.explore')}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4" />
            {t('onboarding.readyStep.upload')}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <Settings className="h-4 w-4" />
            {t('onboarding.readyStep.settings')}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            onUpload?.()
            onComplete()
          }}
          className="flex-1"
        >
          {t('onboarding.readyStep.upload')}
        </Button>
        <Button
          onClick={() => {
            onExplore?.()
            onComplete()
          }}
          className="flex-1"
        >
          {t('onboarding.readyStep.startWatching')}
        </Button>
      </div>
    </div>
  )
}
