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
    <div className="flex items-center justify-between gap-2 pt-4 border-t sticky bottom-0 bg-background md:relative md:bottom-auto px-1 py-2 md:p-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:size-auto md:px-3"
        onClick={onBack}
        aria-label={t('common.back', { defaultValue: 'Back' })}
      >
        <ChevronLeft className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">{t('common.back')}</span>
      </Button>

      <div className="flex items-center gap-2">
        {onDeleteDraft && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={onDeleteDraft}
            aria-label={t('upload.draft.deleteDraft', { defaultValue: 'Delete draft' })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        {onSaveDraft && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="md:size-auto md:px-3"
            onClick={onSaveDraft}
            aria-label={t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
          >
            <Save className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">
              {t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
            </span>
          </Button>
        )}

        {showContinue && screen !== 'review' && (
          <Button type="button" onClick={onContinue} disabled={continueDisabled}>
            <span>{t('upload.next', { defaultValue: 'Next' })}</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
