import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { cancelScheduled, loadSchedule, scheduleVideo, type ScheduledVideo } from './api'
import { useSigner } from './signer-context'
import { signChecked } from './upload/sign'
import { VideoEditor } from './VideoEditor'

/** The server releases due videos about once a minute; the list follows at that pace. */
const REFRESH_MS = 60_000

/**
 * Videos the server holds until their publish date, then the released ones (history). A
 * scheduled video can be edited (it is signed again and replaces the held one) or cancelled
 * (its files are removed); neither is visible on any relay.
 */
export function ScheduledVideos() {
  const { t, i18n } = useTranslation()
  const { signer, pubkey } = useSigner()
  const [items, setItems] = useState<ScheduledVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const reload = useCallback(async () => {
    try {
      setItems(await loadSchedule())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void reload()
    const timer = setInterval(() => void reload(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const cancel = async (id: string) => {
    setRunning(true)
    setError(null)
    try {
      await cancelScheduled(id)
      setConfirming(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  if (items.length === 0 && !error) return null
  const when = (seconds: number) => new Date(seconds * 1000).toLocaleString(i18n.resolvedLanguage)
  return (
    <section className="space-y-3" aria-label={t('studio.videos.scheduled.title')}>
      <h3 className="font-medium">{t('studio.videos.scheduled.title')}</h3>
      <ul className="space-y-2">
        {items.map(item => {
          const title = item.event.tags.find(tag => tag[0] === 'title')?.[1] ?? item.identifier
          return (
            <li key={item.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`studio.videos.scheduled.state.${item.state}`, {
                    date: when(
                      item.state === 'released' ? (item.releasedAt ?? item.dueAt) : item.dueAt
                    ),
                  })}
                </span>
              </div>
              {item.state === 'failed' && item.error && (
                <p className="text-sm text-destructive">{item.error}</p>
              )}
              {item.state === 'scheduled' && editing !== item.id && confirming !== item.id && (
                <div className="flex flex-wrap gap-2">
                  {signer && pubkey === item.event.pubkey && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(item.id)}
                    >
                      {t('studio.videos.scheduled.edit')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirming(item.id)}
                  >
                    {t('studio.videos.scheduled.cancelPublication')}
                  </Button>
                </div>
              )}
              {editing === item.id && signer && pubkey && (
                <VideoEditor
                  event={item.event}
                  getCurrent={() => item.event}
                  replace={false}
                  dueAt={item.dueAt}
                  publish={async template => {
                    const signed = await signChecked(signer, template, pubkey)
                    await scheduleVideo(signed)
                    return { eventId: signed.id, link: '', accepted: [] }
                  }}
                  onClose={() => {
                    setEditing(null)
                    void reload()
                  }}
                />
              )}
              {confirming === item.id && (
                <div role="alertdialog" aria-modal="false" className="space-y-3">
                  <p>{t('studio.videos.scheduled.cancelConfirm', { title })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('studio.videos.scheduled.cancelHint')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={running}
                      onClick={() => void cancel(item.id)}
                    >
                      {t('studio.videos.scheduled.confirmCancel')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={running}
                      onClick={() => setConfirming(null)}
                    >
                      {t('studio.videos.scheduled.keep')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
