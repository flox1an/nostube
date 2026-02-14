import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTranslation } from 'react-i18next'

interface ReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportType: 'video' | 'comment'
  contentId: string
  contentAuthor?: string
}

const REPORT_REASONS = {
  spam: 'report.reasons.spam',
  illegal: 'report.reasons.illegal',
  nsfw: 'report.reasons.nsfw',
  impersonation: 'report.reasons.impersonation',
  other: 'report.reasons.other',
}

export function ReportDialog({
  open,
  onOpenChange,
  reportType,
  contentId: _contentId,
  contentAuthor: _contentAuthor,
}: ReportDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<keyof typeof REPORT_REASONS>('spam')
  const [details, setDetails] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // TODO: Implement actual report submission (NIP-56 or similar)
    // For now, just close the dialog and reset state
    if (import.meta.env.DEV) {
      console.debug('Report submitted:', {
        type: reportType,
        reason,
        details,
      })
    }

    // Reset state and close
    setReason('spam')
    setDetails('')
    onOpenChange(false)
  }

  const handleCancel = () => {
    setReason('spam')
    setDetails('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {reportType === 'video' ? t('report.titleVideo') : t('report.titleComment')}
            </DialogTitle>
            <DialogDescription>{t('report.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('report.reasonLabel')}</Label>
              <RadioGroup
                value={reason}
                onValueChange={value => setReason(value as keyof typeof REPORT_REASONS)}
              >
                {Object.entries(REPORT_REASONS).map(([key, translationKey]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <RadioGroupItem value={key} id={key} />
                    <Label htmlFor={key} className="font-normal cursor-pointer">
                      {t(translationKey)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="details">{t('report.detailsLabel')}</Label>
              <Textarea
                id="details"
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder={t('report.detailsPlaceholder')}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive">
              {t('report.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
