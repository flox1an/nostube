import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EventTemplate, NostrEvent } from 'nostr-tools'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import { TagInput } from '@nostube/widgets/components/tag-input'
import { ContentWarning } from '@nostube/widgets/components/ContentWarning'
import { FileDropzone } from '@nostube/widgets/components/FileDropzone'
import { ThumbnailSection } from '@nostube/widgets/components/ThumbnailSection'
import { SubtitleSection } from '@nostube/widgets/components/SubtitleSection'
import { Progress } from '@nostube/widgets/components/progress'
import { detectLanguageFromFilename, generateSubtitleId } from '@nostube/core/subtitle-utils'
import { Field } from './fields'
import { fromLocalInput, isFuture, toLocalInput } from './datetime'
import { useSigner } from './signer-context'
import { makeUploadDeps } from './upload/make-deps'
import { probeVideo, type VideoProbe } from './upload/probe-video'
import type { PublishedVideo } from './upload/run-upload'
import { runVideoEdit, type EditSubtitle, type VideoEditCache } from './upload/run-video-edit'
import { PublishError } from './upload/sign'

export function VideoEditor({
  event,
  getCurrent,
  publish,
  replace,
  dueAt,
  onClose,
}: {
  event: NostrEvent
  getCurrent: () => NostrEvent
  publish: (template: EventTemplate) => Promise<PublishedVideo>
  replace: boolean
  /** A scheduled video: its publish date (unix seconds) can be changed here. */
  dueAt?: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { signer, pubkey } = useSigner()
  const fieldPrefix = `edit-${event.id}`
  const [title, setTitle] = useState(event.tags.find(tag => tag[0] === 'title')?.[1] ?? '')
  const [description, setDescription] = useState(event.content)
  const [tags, setTags] = useState(event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]))
  const oldWarning = event.tags.find(tag => tag[0] === 'content-warning')
  const [warning, setWarning] = useState(!!oldWarning)
  const [reason, setReason] = useState(oldWarning?.[1] ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [probe, setProbe] = useState<VideoProbe | null>(null)
  const [reading, setReading] = useState(false)
  const [thumbnail, setThumbnail] = useState<Blob | null | undefined>()
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>('upload')
  const [subtitles, setSubtitles] = useState<EditSubtitle[]>(() =>
    event.tags
      .filter(tag => tag[0] === 'text-track')
      .map((tag, index) => ({
        id: `existing-${index}`,
        url: tag[1],
        lang: tag[2],
        extra: tag.slice(3),
      }))
  )
  const [subtitlesChanged, setSubtitlesChanged] = useState(false)
  const [dueText, setDueText] = useState(dueAt === undefined ? '' : toLocalInput(dueAt))
  const due = fromLocalInput(dueText)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string>()
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string>()
  const cache = useRef<VideoEditCache>(new Map())
  const busy = useRef(false)
  const selection = useRef(0)
  const imeta = event.tags.filter(tag => tag[0] === 'imeta').flatMap(tag => tag.slice(1))
  const oldThumbnail =
    imeta.find(field => field.startsWith('image '))?.slice(6) ??
    event.tags.find(tag => tag[0] === 'image' || tag[0] === 'thumb')?.[1]
  const oldVideo =
    imeta.find(field => field.startsWith('url '))?.slice(4) ??
    event.tags.find(tag => tag[0] === 'url')?.[1]

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    if (!running) return
    const guard = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [running])

  const choose = async (chosen: File | undefined) => {
    if (!chosen || busy.current) return
    const version = ++selection.current
    setFile(chosen)
    setProbe(null)
    setReading(true)
    setError(null)
    setErrorDetail(undefined)
    try {
      const result = await probeVideo(chosen)
      if (version !== selection.current) return
      cache.current.set(chosen, { probe: result })
      setProbe(result)
    } catch (e) {
      if (version === selection.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (version === selection.current) setReading(false)
    }
  }
  const save = async () => {
    if (busy.current || !signer || !pubkey) return
    busy.current = true
    setRunning(true)
    setError(null)
    setErrorDetail(undefined)
    try {
      const deps = makeUploadDeps({ signer, pubkey, title })
      await runVideoEdit(
        getCurrent,
        pubkey,
        {
          title,
          description,
          tags,
          contentWarning: warning ? reason : undefined,
          file: file ?? undefined,
          thumbnail,
          subtitles: subtitlesChanged ? subtitles : undefined,
        },
        {
          ...deps,
          publish: template =>
            publish(
              dueAt === undefined
                ? template
                : {
                    ...template,
                    tags: template.tags.map(tag =>
                      tag[0] === 'published_at' ? ['published_at', String(due)] : tag
                    ),
                  }
            ),
        },
        cache.current,
        (done, total) => setProgress(total > 0 ? done / total : 0)
      )
      onClose()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(
        ['authorMismatch', 'notAddressable', 'eventMissing'].includes(message)
          ? t(`studio.videos.${message}`)
          : message
      )
      setErrorDetail(e instanceof PublishError ? e.detail : undefined)
    } finally {
      busy.current = false
      setRunning(false)
    }
  }
  const canSave =
    !!signer &&
    pubkey === event.pubkey &&
    title.trim() !== '' &&
    !running &&
    !reading &&
    (!replace || (!!file && !!probe)) &&
    subtitles.every(subtitle => subtitle.lang) &&
    (dueAt === undefined || (due !== undefined && isFuture(due)))

  return (
    <section
      className="w-full space-y-4"
      aria-label={t(replace ? 'studio.videos.replace' : 'studio.videos.edit')}
    >
      {replace && (
        <Field id={`${fieldPrefix}-file`} label={t('studio.upload.file')}>
          <FileDropzone
            id={`${fieldPrefix}-file`}
            accept={{ 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] }}
            disabled={running}
            selectedFile={file}
            onDrop={files => void choose(files[0])}
          />
          {reading && <p role="status">{t('studio.upload.reading')}</p>}
          {probe && (
            <p className="text-sm text-muted-foreground">
              {probe.width}×{probe.height} · {Math.round(probe.duration)}s
            </p>
          )}
          <p className="text-sm text-muted-foreground">{t('studio.videos.replaceHint')}</p>
        </Field>
      )}
      <Field id={`${fieldPrefix}-title`} label={t('studio.upload.videoTitle')}>
        <Input
          id={`${fieldPrefix}-title`}
          value={title}
          disabled={running}
          onChange={e => setTitle(e.target.value)}
        />
      </Field>
      <Field id={`${fieldPrefix}-description`} label={t('studio.upload.videoDescription')}>
        <Textarea
          id={`${fieldPrefix}-description`}
          value={description}
          rows={4}
          disabled={running}
          onChange={e => setDescription(e.target.value)}
        />
      </Field>
      {dueAt !== undefined && (
        <Field
          id={`${fieldPrefix}-due`}
          label={t('studio.upload.publishAt')}
          hint={t(
            due !== undefined && isFuture(due)
              ? 'studio.upload.publishAtHint'
              : 'studio.upload.publishAtPast'
          )}
        >
          <Input
            id={`${fieldPrefix}-due`}
            type="datetime-local"
            value={dueText}
            disabled={running}
            onChange={e => setDueText(e.target.value)}
          />
        </Field>
      )}
      <Field id={`${fieldPrefix}-tags`} label={t('studio.upload.tags')}>
        <TagInput
          id={`${fieldPrefix}-tags`}
          tags={tags}
          onTagsChange={setTags}
          disabled={running}
        />
      </Field>
      <ContentWarning
        enabled={warning}
        reason={reason}
        onEnabledChange={setWarning}
        onReasonChange={setReason}
        disabled={running}
      />
      {/* The widget's preview is tall; a modal must keep its Save button in reach. */}
      <div className="[&_img]:max-h-[200px] [&_video]:max-h-[200px]">
        <ThumbnailSection
          thumbnailSource={thumbnailSource}
          onThumbnailSourceChange={setThumbnailSource}
          thumbnailBlob={thumbnail ?? null}
          onThumbnailDrop={files => {
            if (!busy.current && files[0]) setThumbnail(files[0])
          }}
          onDeleteThumbnail={async () => {
            if (!busy.current) setThumbnail(null)
          }}
          thumbnailUploadInfo={{
            uploadedBlobs: thumbnail === undefined && oldThumbnail ? [{ url: oldThumbnail }] : [],
            uploading: running,
          }}
          videoUrl={preview ?? oldVideo}
          disabled={running}
          onUrlFetchError={message => setError(`${message.title}: ${message.description}`)}
        />
      </div>
      <div role="group" aria-labelledby={`${fieldPrefix}-subtitles`} className="space-y-1.5">
        <p id={`${fieldPrefix}-subtitles`} className="text-sm font-medium leading-none">
          {t('studio.upload.subtitles')}
        </p>
        <SubtitleSection
          subtitles={subtitles.map(subtitle => ({
            id: subtitle.id,
            filename: subtitle.file?.name ?? subtitle.url?.split('/').pop() ?? subtitle.id,
            lang: subtitle.lang,
            uploadedBlobs: subtitle.url ? [{ url: subtitle.url }] : [],
            mirroredBlobs: [],
          }))}
          disabled={running}
          onDrop={files => {
            if (busy.current) return
            setSubtitlesChanged(true)
            setSubtitles(current => [
              ...current,
              ...files.map(file => ({
                id: generateSubtitleId(),
                file,
                lang: detectLanguageFromFilename(file.name),
              })),
            ])
          }}
          onRemove={id => {
            if (busy.current) return
            setSubtitlesChanged(true)
            setSubtitles(current => current.filter(subtitle => subtitle.id !== id))
          }}
          onLanguageChange={(id, lang) => {
            if (busy.current) return
            setSubtitlesChanged(true)
            setSubtitles(current =>
              current.map(subtitle => (subtitle.id === id ? { ...subtitle, lang } : subtitle))
            )
          }}
        />
      </div>
      {running && (
        <>
          <p role="status">{t('studio.videos.saving')}</p>
          <Progress value={Math.round(progress * 100)} />
        </>
      )}
      {error && (
        <div role="alert" className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {errorDetail && <p className="break-all text-xs text-muted-foreground">{errorDetail}</p>}
        </div>
      )}
      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background py-4">
        <Button type="button" disabled={!canSave} onClick={() => void save()}>
          {error ? t('studio.upload.retry') : t('studio.videos.save')}
        </Button>
        <Button type="button" variant="outline" disabled={running} onClick={onClose}>
          {t('studio.videos.cancel')}
        </Button>
      </div>
    </section>
  )
}
