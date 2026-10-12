import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'
import type { NostrEvent } from 'nostr-tools'
import { useActiveAccount } from 'applesauce-react/hooks'
import { buildReportTags, type ReportReason, type ReportTarget } from '@nostube/core/reports'
import { useNostubeHost } from '@nostube/widgets/host'
import { Button } from '@nostube/widgets/components/button'
import { Textarea } from '@nostube/widgets/components/textarea'
import { Label } from '@nostube/widgets/components/label'
import { RadioGroup, RadioGroupItem } from '@nostube/widgets/components/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import type { IAccount } from 'applesauce-accounts'

const REASONS: ReportReason[] = [
  'spam',
  'nudity',
  'profanity',
  'illegal',
  'impersonation',
  'harassment',
  'other',
]

/**
 * The report action for a video or a comment. Only a signed-in visitor can sign a report, so a
 * guest sees nothing — the same exposure SiteLikes already settled on. A creator signed into
 * their own site sees no report action on their own content either, the same way the studio
 * offers no mute action on it.
 */
export function SiteReport(props: { target: ReportTarget; relays: string[] }) {
  const account = useActiveAccount()
  if (!account || (props.target.type !== 'profile' && account.pubkey === props.target.author)) {
    return null
  }
  return <ReportButton {...props} account={account} />
}

function ReportButton({
  target,
  relays,
  account,
}: {
  target: ReportTarget
  relays: string[]
  account: IAccount
}) {
  const { t } = useTranslation()
  const { pool } = useNostubeHost()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState(false)

  const reset = () => {
    setReason('spam')
    setDetails('')
    setError(null)
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signed = (await account.signer.signEvent({
        kind: 1984,
        content: details,
        tags: [...buildReportTags(target, reason), ['client', 'nostube']],
        created_at: Math.floor(Date.now() / 1000),
      })) as unknown as NostrEvent
      const results = await pool.publish(relays, signed)
      if (!results.some(r => r.ok)) {
        throw new Error(
          results.length
            ? results.map(r => `${r.from}: ${r.message || t('site.report.refused')}`).join('; ')
            : t('site.report.noRelays')
        )
      }
      setReported(true)
      setOpen(false)
      reset()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(t('site.report.failed', { reason: message }))
    } finally {
      setBusy(false)
    }
  }

  if (reported) {
    return <p className="text-xs text-muted-foreground">{t('site.report.sent')}</p>
  }

  const title =
    target.type === 'video'
      ? t('site.report.titleVideo')
      : target.type === 'comment'
        ? t('site.report.titleComment')
        : t('site.report.titleProfile')

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Flag className="h-3 w-3" aria-hidden />
        {t('site.report.action')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={e => void submit(e)}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{t('site.report.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('site.report.reasonLabel')}</Label>
                <RadioGroup
                  value={reason}
                  onValueChange={value => setReason(value as ReportReason)}
                >
                  {REASONS.map(key => (
                    <div key={key} className="flex items-center space-x-2">
                      <RadioGroupItem value={key} id={`report-reason-${key}`} />
                      <Label
                        htmlFor={`report-reason-${key}`}
                        className="font-normal cursor-pointer"
                      >
                        {t(`site.report.reasons.${key}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-details">{t('site.report.detailsLabel')}</Label>
                <Textarea
                  id="report-details"
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder={t('site.report.detailsPlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('site.report.cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? t('site.report.submitting') : t('site.report.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
