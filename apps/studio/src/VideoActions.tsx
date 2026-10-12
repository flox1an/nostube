import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NostrEvent } from 'nostr-tools'
import type { VideoEvent } from '@nostube/core/video-event'
import { buildVideoDeletion } from '@nostube/core/video-lifecycle'
import { Button } from '@nostube/widgets/components/button'
import { useSigner } from './signer-context'
import type { InstanceClient } from './instance-client'
import { VideoEditor } from './VideoEditor'
import { publishVideoChange } from './upload/publish-video-change'

export function VideoActions({ video, instance }: { video: VideoEvent; instance: InstanceClient }) {
  const { t } = useTranslation()
  const { signer, pubkey } = useSigner()
  const [editing, setEditing] = useState<{ event: NostrEvent; replace: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  if (
    !signer ||
    pubkey !== video.pubkey ||
    (video.kind !== 34235 && video.kind !== 34236) ||
    video.identifier === undefined
  )
    return null

  const getCurrent = () => {
    const event = instance.client.eventStore.getReplaceable(
      video.kind,
      video.pubkey,
      video.identifier
    )
    if (!event) throw new Error('eventMissing')
    return event
  }
  const showError = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    setError(
      ['authorMismatch', 'notAddressable', 'eventMissing'].includes(message)
        ? t(`studio.videos.${message}`)
        : message
    )
  }
  const edit = (replace: boolean) => {
    setError(null)
    try {
      setEditing({ event: getCurrent(), replace })
    } catch (e) {
      showError(e)
    }
  }
  const remove = async () => {
    if (busy.current) return
    busy.current = true
    setRunning(true)
    setError(null)
    try {
      await publishVideoChange(instance, signer, pubkey, buildVideoDeletion(getCurrent(), pubkey))
      setConfirming(false)
    } catch (e) {
      showError(e)
    } finally {
      busy.current = false
      setRunning(false)
    }
  }
  return (
    <>
      {!editing && !confirming && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => edit(false)}>
            {t('studio.videos.edit')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => edit(true)}>
            {t('studio.videos.replace')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setError(null)
              setConfirming(true)
            }}
          >
            {t('studio.videos.delete')}
          </Button>
        </div>
      )}
      {editing && (
        <VideoEditor
          event={editing.event}
          getCurrent={getCurrent}
          publish={template => publishVideoChange(instance, signer, pubkey, template)}
          replace={editing.replace}
          onClose={() => setEditing(null)}
        />
      )}
      {confirming && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`delete-${video.id}`}
          className="w-full space-y-3 rounded-md border p-4"
        >
          <p id={`delete-${video.id}`}>
            {t('studio.videos.deleteConfirm', { title: video.title })}
          </p>
          <p className="text-sm text-muted-foreground">{t('studio.videos.deleteHint')}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={running}
              onClick={() => void remove()}
            >
              {running ? t('studio.videos.deleting') : t('studio.videos.confirmDelete')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={running}
              onClick={() => {
                setConfirming(false)
                setError(null)
              }}
            >
              {t('studio.videos.cancel')}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
