import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
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
    <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card py-4 md:relative md:bottom-auto">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 md:h-10 md:w-auto md:px-3"
        onClick={onBack}
        aria-label={t('common.back', { defaultValue: 'Back' })}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden md:inline">{t('common.back')}</span>
      </Button>

      <div className="flex items-center gap-2">
        {onDeleteDraft && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-destructive hover:text-destructive md:size-10"
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
            className="size-11 md:h-10 md:w-auto md:px-3"
            onClick={onSaveDraft}
            aria-label={t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
          >
            <Save className="h-4 w-4" />
            <span className="hidden md:inline">
              {t('upload.draft.saveDraft', { defaultValue: 'Save Draft' })}
            </span>
          </Button>
        )}

        {showContinue && screen !== 'review' && (
          <Button
            type="button"
            className="min-h-11 md:min-h-10"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            <span>{t('upload.next', { defaultValue: 'Next' })}</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
