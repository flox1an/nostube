import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFollowSet } from '@/hooks/useFollowSet'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface FollowImportStepProps {
  onComplete: () => void
  onSkip: () => void
}

export function FollowImportStep({ onComplete, onSkip }: FollowImportStepProps) {
  const { t } = useTranslation()
  const { importFromKind3 } = useFollowSet()
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const success = await importFromKind3()
      if (success) {
        setImportSuccess(true)
        localStorage.setItem('nostube_onboarding_follow_import', 'imported')
        // Show success state briefly before advancing
        setTimeout(() => {
          onComplete()
        }, 1500)
      }
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  const handleSkip = () => {
    localStorage.setItem('nostube_onboarding_follow_import', 'skipped')
    onSkip()
  }

  if (importSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-6">
        <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
        <p className="text-center font-medium">{t('onboarding.followImport.success')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-row gap-2 sm:gap-2 mt-4">
        <Button variant="outline" onClick={handleSkip} disabled={isImporting} className="flex-1">
          {t('onboarding.followImport.skip')}
        </Button>
        <Button onClick={handleImport} disabled={isImporting} className="flex-1">
          {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('onboarding.followImport.import')}
        </Button>
      </div>
    </>
  )
}
