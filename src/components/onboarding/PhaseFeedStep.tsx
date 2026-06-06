import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FollowImportStep } from './FollowImportStep'

interface PhaseFeedStepProps {
  onComplete: (skipped: boolean) => void
  onExplore?: () => void
}

const RECOMMENDED_CREATORS = ['Vitor Pamplona', 'kiwi', 'hzrd149', 'fiatjaf']

export function PhaseFeedStep({ onComplete, onExplore }: PhaseFeedStepProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'choose' | 'import' | 'discover'>('choose')

  if (mode === 'import') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('onboarding.feedStep.title')}</h3>
        <FollowImportStep onComplete={() => onComplete(false)} onSkip={() => onComplete(true)} />
      </div>
    )
  }

  if (mode === 'discover') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('onboarding.feedStep.discover')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('onboarding.feedStep.discoverDescription')}
        </p>
        <div className="space-y-2">
          {RECOMMENDED_CREATORS.map(name => (
            <Card key={name}>
              <CardContent className="py-3 text-sm">{name}</CardContent>
            </Card>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode('choose')}>
            {t('common.back')}
          </Button>
          <Button
            onClick={() => {
              onExplore?.()
              onComplete(false)
            }}
          >
            {t('onboarding.feedStep.discover')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('onboarding.feedStep.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('onboarding.feedStep.description')}</p>

      <div className="grid grid-cols-1 gap-3">
        <Card className="cursor-pointer hover:bg-accent/40" onClick={() => setMode('import')}>
          <CardHeader>
            <CardTitle className="text-base">{t('onboarding.feedStep.importFollows')}</CardTitle>
            <CardDescription>{t('onboarding.feedStep.importDescription')}</CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/40" onClick={() => setMode('discover')}>
          <CardHeader>
            <CardTitle className="text-base">{t('onboarding.feedStep.discover')}</CardTitle>
            <CardDescription>{t('onboarding.feedStep.discoverDescription')}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Button variant="ghost" onClick={() => onComplete(true)}>
        {t('onboarding.feedStep.skip')}
      </Button>
    </div>
  )
}
