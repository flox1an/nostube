import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react'

export type UploadScreen = 'source' | 'details' | 'review'

export interface UploadFlowFooterProps {
  screen: UploadScreen
  onBack: () => void
  onContinue: () => void
  continueDisabled: boolean
  showContinue: boolean
  onSaveDraft?: () => void
  onDeleteDraft?: () => void
}

export function UploadFlowFooter({
  screen,
  onBack,
  onContinue,
  continueDisabled,
  showContinue,
  onSaveDraft,
  onDeleteDraft,
}: UploadFlowFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex justify-between pt-4 border-t sticky bottom-0 bg-background md:relative md:bottom-auto pb-safe">
      <Button type="button" variant="outline" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">{t('common.back')}</span>
      </Button>

      <div className="flex gap-2">
        {onDeleteDraft && (
          <Button type="button" variant="outline" size="icon" onClick={onDeleteDraft}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        {onSaveDraft && (
          <Button type="button" variant="secondary" onClick={onSaveDraft}>
            <Save className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">
              {t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
            </span>
          </Button>
        )}

        {showContinue && screen !== 'review' && (
          <Button type="button" onClick={onContinue} disabled={continueDisabled}>
            <span className="hidden md:inline">{t('upload.next', { defaultValue: 'Next' })}</span>
            <ChevronRight className="h-4 w-4 md:ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
