import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { NostrEvent } from 'nostr-tools'
import {
  isPlayableLiveUrl,
  liveEventFields,
  updateLiveEvent,
  type LiveEventFields,
  type LiveStream,
} from '@nostube/core/live-stream'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import { Label } from '@nostube/widgets/components/label'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import { RadioGroup, RadioGroupItem } from '@nostube/widgets/components/radio-group'
import { TagInput } from '@nostube/widgets/components/tag-input'
import { EventPreviewDiff } from '@/components/edit-video/EventPreviewDiff'
import { useAppContext, useNostrPublish, useTagIndex } from '@/hooks'
import { LIVE_RELAYS } from '@/constants/relays'

const STATUSES: LiveStream['status'][] = ['live', 'planned', 'ended']

/** Unix seconds as the local `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
const toLocalInput = (seconds?: number) => {
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (value: string) => {
  const ms = new Date(value).getTime()
  return value && Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
}

/** Owner dialog: change status, schedule and every displayed field of a kind 30311 event. */
export function EditLiveStreamDialog({
  stream,
  open,
  onOpenChange,
}: {
  stream: LiveStream
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { config } = useAppContext()
  const { publish } = useNostrPublish()
  const { searchTags } = useTagIndex()
  const [fields, setFields] = useState<LiveEventFields>(() => liveEventFields(stream.event))
  // The event the form was filled from; a newer one arriving while editing must not be overwritten blindly.
  const [base, setBase] = useState<NostrEvent>(stream.event)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setFields(liveEventFields(stream.event))
    setBase(stream.event)
    // Only when the dialog opens: refilling on every live update would wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch: Partial<LiveEventFields>) => setFields(prev => ({ ...prev, ...patch }))
  const preview = useMemo(() => updateLiveEvent(base, fields), [base, fields])
  const unplayable = fields.streaming.filter(url => url.trim() && !isPlayableLiveUrl(url.trim()))
  const changedMeanwhile = stream.event.id !== base.id

  const relays = useMemo(
    () => [
      ...new Set([
        ...stream.relays,
        ...config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
        ...LIVE_RELAYS,
      ]),
    ],
    [stream.relays, config.relays]
  )

  const labels: Record<LiveStream['status'], string> = {
    live: t('liveEdit.statusLive', 'Live'),
    planned: t('liveEdit.statusPlanned', 'Planned'),
    ended: t('liveEdit.statusEnded', 'Ended'),
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // Built from the newest event: tags another app set meanwhile (participants, ...) survive.
      await publish({
        event: updateLiveEvent(stream.event, fields),
        relays,
        label: t('liveEdit.title', 'Edit live stream'),
      })
      toast.success(t('liveEdit.success', 'Live stream updated'))
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to update live stream:', error)
      toast.error(t('liveEdit.error', 'Could not update the live stream'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{t('liveEdit.title', 'Edit live stream')}</DialogTitle>
          <DialogDescription>
            {t(
              'liveEdit.description',
              'Changes are published to Nostr as a new version of this stream announcement.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('liveEdit.status', 'Status')}</legend>
            <RadioGroup
              value={fields.status}
              onValueChange={value => set({ status: value as LiveStream['status'] })}
              className="flex flex-wrap gap-4"
            >
              {STATUSES.map(s => (
                <Label key={s} className="flex min-h-9 cursor-pointer items-center gap-2">
                  <RadioGroupItem value={s} />
                  {labels[s]}
                </Label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {fields.status === 'planned'
                ? t(
                    'liveEdit.plannedHint',
                    'Viewers see that the stream has not started; set a start time to announce when it does.'
                  )
                : fields.status === 'ended'
                  ? t(
                      'liveEdit.endedHint',
                      'Viewers see the recording if there is one. You can set the stream live again later.'
                    )
                  : t(
                      'liveEdit.liveHint',
                      'If your streaming service keeps publishing updates, it may set the status back.'
                    )}
            </p>
          </fieldset>

          {fields.status !== 'live' && (
            <div className="space-y-2">
              <Label htmlFor="live-starts">{t('liveEdit.starts', 'Start time')}</Label>
              <Input
                id="live-starts"
                type="datetime-local"
                value={toLocalInput(fields.starts)}
                onChange={e => set({ starts: fromLocalInput(e.target.value) })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="live-title">{t('editVideo.titleLabel')}</Label>
            <Input
              id="live-title"
              value={fields.title}
              onChange={e => set({ title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-summary">{t('editVideo.descriptionLabel')}</Label>
            <Textarea
              id="live-summary"
              value={fields.summary}
              onChange={e => set({ summary: e.target.value })}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-image">{t('liveEdit.image', 'Image URL')}</Label>
            <Input
              id="live-image"
              type="url"
              value={fields.image}
              onChange={e => set({ image: e.target.value })}
              placeholder="https://"
            />
            {fields.image.trim() && (
              <img
                src={fields.image.trim()}
                alt=""
                referrerPolicy="no-referrer"
                className="aspect-video w-40 rounded-md bg-muted object-cover"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-streaming">
              {t('liveEdit.streaming', 'Stream URLs (one per line)')}
            </Label>
            <Textarea
              id="live-streaming"
              value={fields.streaming.join('\n')}
              onChange={e => set({ streaming: e.target.value.split('\n') })}
              rows={2}
              placeholder="https://…/index.m3u8"
              className="font-mono text-xs"
            />
            {unplayable.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t(
                  'liveEdit.unplayable',
                  'nostube only plays public https HLS (.m3u8) or MP4 links; other apps may still use these.'
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-recording">{t('liveEdit.recording', 'Recording URL')}</Label>
            <Input
              id="live-recording"
              type="url"
              value={fields.recording}
              onChange={e => set({ recording: e.target.value })}
              placeholder="https://"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-tags">{t('editVideo.tagsLabel')}</Label>
            <TagInput
              id="live-tags"
              tags={fields.hashtags}
              onTagsChange={hashtags => set({ hashtags })}
              search={searchTags}
              placeholder={t('editVideo.tagsPlaceholder')}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="live-content-warning"
                checked={fields.contentWarning !== undefined}
                onCheckedChange={checked =>
                  set({ contentWarning: checked === true ? '' : undefined })
                }
              />
              <Label htmlFor="live-content-warning" className="cursor-pointer">
                {t('editVideo.contentWarningLabel')}
              </Label>
            </div>
            {fields.contentWarning !== undefined && (
              <Input
                value={fields.contentWarning}
                onChange={e => set({ contentWarning: e.target.value })}
                placeholder={t('editVideo.contentWarningPlaceholder')}
              />
            )}
          </div>

          <EventPreviewDiff
            originalTags={base.tags}
            newTags={preview.tags}
            originalKind={base.kind}
            newKind={preview.kind}
            newContent={preview.content}
          />

          {changedMeanwhile && (
            <p role="status" className="text-xs text-muted-foreground">
              {t(
                'liveEdit.changedMeanwhile',
                'A newer version of this stream arrived while you were editing. Saving keeps its other changes and applies the fields above.'
              )}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !fields.title.trim()}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 h-4 w-4" />
              )}
              {t('liveEdit.save', 'Publish changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
