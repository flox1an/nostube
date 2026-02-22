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
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/hooks/useToast'
import { nowInSecs } from '@/lib/utils'

type ReportReason = 'spam' | 'nudity' | 'profanity' | 'illegal' | 'impersonation' | 'harassment'

const REPORT_REASONS: Record<ReportReason, string> = {
  spam: 'report.reasons.spam',
  nudity: 'report.reasons.nudity',
  profanity: 'report.reasons.profanity',
  illegal: 'report.reasons.illegal',
  impersonation: 'report.reasons.impersonation',
  harassment: 'report.reasons.harassment',
}

interface ReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportType: 'video' | 'comment'
  contentId: string
  contentAuthor?: string
}

export function ReportDialog({
  open,
  onOpenChange,
  reportType,
  contentId,
  contentAuthor,
}: ReportDialogProps) {
  const { t } = useTranslation()
  const { publish, isPending } = useNostrPublish()
  const { updateConfig } = useAppContext()
  const { toast } = useToast()
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const tags: string[][] = [['e', contentId, reason]]
    if (contentAuthor) {
      tags.push(['p', contentAuthor, reason])
    }

    try {
      await publish({
        event: {
          kind: 1984,
          content: details,
          tags,
          created_at: nowInSecs(),
        },
      })

      // Add to local reported event IDs for immediate hiding
      updateConfig(config => ({
        ...config,
        reportedEventIds: [...(config.reportedEventIds ?? []), contentId],
      }))

      toast({
        title: t('report.successTitle'),
        description: t('report.successDescription'),
      })

      setReason('spam')
      setDetails('')
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to publish report:', err)
      toast({
        title: t('report.errorTitle'),
        description: t('report.errorDescription'),
        variant: 'destructive',
      })
    }
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
              <RadioGroup value={reason} onValueChange={value => setReason(value as ReportReason)}>
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
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? t('report.submitting') : t('report.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
