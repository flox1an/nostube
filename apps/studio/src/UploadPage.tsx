import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { formatDuration } from '@nostube/widgets'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { TagInput } from '@nostube/widgets/components/tag-input'
import { ContentWarning } from '@nostube/widgets/components/ContentWarning'
import { FileDropzone } from '@nostube/widgets/components/FileDropzone'
import { ThumbnailSection } from '@nostube/widgets/components/ThumbnailSection'
import { SubtitleSection } from '@nostube/widgets/components/SubtitleSection'
import { detectLanguageFromFilename, generateSubtitleId } from '@nostube/core/subtitle-utils'
import { Input } from '@nostube/widgets/components/input'
import { Progress } from '@nostube/widgets/components/progress'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { AdminState } from './api'
import { isKeyConnected } from './draft'
import { Field } from './fields'
import { fromLocalInput, isFuture } from './datetime'
import { hashFor } from './route'
import { useSigner } from './signer-context'
import { probeVideo, type VideoProbe } from './upload/probe-video'
import { makeUploadDeps } from './upload/make-deps'
import {
  isDone,
  newJob,
  runUpload,
  updateJobInput,
  STEPS,
  type UploadJob,
} from './upload/run-upload'

const sizeText = (bytes: number, locale?: string) =>
  bytes >= 1024 ** 3
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'gigabyte',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(bytes / 1024 ** 3)
    : new Intl.NumberFormat(locale, { style: 'unit', unit: 'megabyte' }).format(
        Math.max(1, Math.round(bytes / 1024 ** 2))
      )

/** `my_holiday-clip.mp4` to `my holiday clip`. */
const titleFromName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()

/** Choose a video, describe it, and publish it to this instance. */
export default function UploadPage({ state }: { state: AdminState }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage
  const { signer, pubkey, mode } = useSigner()
  const [file, setFile] = useState<File | null>(null)
  const [probe, setProbe] = useState<VideoProbe | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [warning, setWarning] = useState(false)
  const [reason, setReason] = useState('')
  const [job, setJob] = useState<UploadJob | null>(null)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = useRef(false)
  const selection = useRef(0)
  const [videoUrl, setVideoUrl] = useState<string>()
  const [thumbnail, setThumbnail] = useState<Blob | null>(null)
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>('generated')
  const [subtitles, setSubtitles] = useState<{ id: string; file: File; lang: string }[]>([])
  const [publishAtText, setPublishAtText] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Do not lose a running upload to a closed tab without asking.
  useEffect(() => {
    if (!running) return
    const guard = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [running])

  const choose = async (chosen: File | undefined) => {
    if (busy.current) return
    const version = ++selection.current
    setJob(null)
    setNotice(null)
    setProbe(null)
    setProbeError(null)
    setThumbnail(null)
    setThumbnailSource('generated')
    setSubtitles([])
    setVideoUrl(undefined)
    if (!chosen) return setFile(null)
    setFile(chosen)
    setTitle(titleFromName(chosen.name))
    try {
      const probed = await probeVideo(chosen)
      if (version !== selection.current) return
      setThumbnail(probed.thumbnail)
      setProbe(probed)
    } catch (e) {
      if (version === selection.current) setProbeError(e instanceof Error ? e.message : String(e))
    }
  }

  const mayPublish = pubkey !== null && isKeyConnected(state.config, pubkey)
  const publishAt = fromLocalInput(publishAtText)
  const dateOk = isFuture(publishAt)

  const start = async () => {
    if (!file || !probe || busy.current) return
    busy.current = true
    setRunning(true)
    setNotice(null)
    try {
      if (!mayPublish) return setNotice(t('studio.upload.notConnected'))
      if (!signer) return setNotice(t('studio.errors.noSigner'))
      const deps = makeUploadDeps({ signer, pubkey, title, publishAt })
      const input = {
        file,
        title: title.trim(),
        description,
        tags,
        contentWarning: warning ? reason : undefined,
        thumbnail,
        subtitles,
        publishAt,
      }
      await runUpload(
        job && !isDone(job) ? updateJobInput(job, input) : newJob(input, deps, probe),
        deps,
        setJob
      )
    } finally {
      busy.current = false
      setRunning(false)
    }
  }

  const reset = () => {
    void choose(undefined)
    setTitle('')
    setDescription('')
    setTags([])
    setWarning(false)
    setReason('')
    setPublishAtText('')
    setCopied(false)
  }

  if (job && isDone(job)) {
    const published = job.published!
    const address = `${location.origin}/v/${published.link}`
    if (published.scheduledFor !== undefined) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.upload.scheduledTitle')}</CardTitle>
            <CardDescription>
              {t('studio.upload.scheduledDescription', {
                date: new Date(published.scheduledFor * 1000).toLocaleString(locale),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={reset}>
              {t('studio.upload.another')}
            </Button>
          </CardContent>
        </Card>
      )
    }
    const mirrors = state.config.mirror.relays.length
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.upload.publishedTitle')}</CardTitle>
          <CardDescription>
            {mirrors > 0
              ? t('studio.upload.publishedMirrored', { count: mirrors })
              : t('studio.upload.publishedDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {job.thumbnail && (
              <img
                src={job.thumbnail.url}
                alt=""
                className="h-16 w-28 shrink-0 rounded bg-muted object-cover"
              />
            )}
            <p className="line-clamp-2 font-medium">{job.input.title}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={address} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('studio.upload.view')}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(address).then(() => setCopied(true))
              }
            >
              <span aria-live="polite">
                {copied ? t('studio.upload.copied') : t('studio.upload.copyLink')}
              </span>
            </Button>
            <Button asChild variant="outline">
              <a href={hashFor('videos')}>{t('studio.upload.edit')}</a>
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              {t('studio.upload.another')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const failed = job && STEPS.find(s => job.steps[s.id].status === 'error')
  const canStart =
    !!file && !!probe && title.trim() !== '' && !running && dateOk && subtitles.every(s => s.lang)
  // Why the button is disabled, next to it; a file still being read says so at the file.
  const missing = !file
    ? t('studio.upload.needFile')
    : title.trim() === ''
      ? t('studio.upload.needTitle')
      : !dateOk
        ? t('studio.upload.needFutureDate')
        : !subtitles.every(s => s.lang)
          ? t('studio.upload.needSubtitleLanguage')
          : pubkey !== null && !mayPublish
            ? t('studio.upload.notConnected')
            : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.upload.title')}</CardTitle>
          <CardDescription>{t('studio.upload.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="file" label={t('studio.upload.file')}>
            <FileDropzone
              id="file"
              accept={{ 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] }}
              disabled={running}
              onDrop={files => void choose(files[0])}
            />
          </Field>
          {file && (
            <p className="text-sm text-muted-foreground">
              {file.name} · {sizeText(file.size, locale)}
              {probe &&
                ` · ${probe.width}×${probe.height} · ${formatDuration(probe.duration)}` +
                  (probe.height > probe.width ? ` · ${t('studio.upload.vertical')}` : '')}
            </p>
          )}
          {file && !probeError && !probe && (
            <p className="text-sm text-muted-foreground">{t('studio.upload.reading')}</p>
          )}
          {probeError && (
            <Alert variant="destructive">
              <AlertDescription>{probeError}</AlertDescription>
            </Alert>
          )}
          {/* From md on the thumbnail sits beside the fields; it follows them in the DOM. */}
          <div className={`grid gap-6 ${probe ? 'md:grid-cols-[3fr_2fr]' : ''}`}>
            <div className="min-w-0 space-y-4">
              <Field id="video-title" label={t('studio.upload.videoTitle')}>
                <Input
                  id="video-title"
                  value={title}
                  disabled={running}
                  onChange={e => setTitle(e.target.value)}
                />
              </Field>
              <Field
                id="video-description"
                label={t('studio.upload.videoDescription')}
                hint={t('studio.upload.videoDescriptionHint')}
              >
                <Textarea
                  id="video-description"
                  rows={4}
                  value={description}
                  disabled={running}
                  onChange={e => setDescription(e.target.value)}
                />
              </Field>
              <Field
                id="video-tags"
                label={t('studio.upload.tags')}
                hint={t('studio.upload.tagsHint')}
              >
                <TagInput id="video-tags" tags={tags} onTagsChange={setTags} disabled={running} />
              </Field>
              <ContentWarning
                enabled={warning}
                reason={reason}
                onEnabledChange={setWarning}
                onReasonChange={setReason}
                disabled={running}
              />
              <Field
                id="video-publish-at"
                label={t('studio.upload.publishAt')}
                hint={t(dateOk ? 'studio.upload.publishAtHint' : 'studio.upload.publishAtPast')}
              >
                <Input
                  id="video-publish-at"
                  type="datetime-local"
                  value={publishAtText}
                  disabled={running}
                  onChange={e => setPublishAtText(e.target.value)}
                />
              </Field>
              <div role="group" aria-labelledby="video-subtitles" className="space-y-1.5">
                <p id="video-subtitles" className="text-sm font-medium leading-none">
                  {t('studio.upload.subtitles')}
                </p>
                <SubtitleSection
                  subtitles={subtitles.map(subtitle => ({
                    id: subtitle.id,
                    filename: subtitle.file.name,
                    lang: subtitle.lang,
                    uploadedBlobs: job?.subtitles?.[subtitle.id]
                      ? [job.subtitles[subtitle.id]]
                      : [],
                    mirroredBlobs: [],
                  }))}
                  onDrop={files => {
                    if (busy.current) return
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
                    if (!busy.current)
                      setSubtitles(current => current.filter(subtitle => subtitle.id !== id))
                  }}
                  onLanguageChange={(id, lang) => {
                    if (!busy.current)
                      setSubtitles(current =>
                        current.map(subtitle =>
                          subtitle.id === id ? { ...subtitle, lang } : subtitle
                        )
                      )
                  }}
                  disabled={running}
                />
              </div>
            </div>
            {probe && (
              <div className="min-w-0 md:sticky md:top-6 md:self-start">
                <ThumbnailSection
                  key={videoUrl}
                  thumbnailSource={thumbnailSource}
                  onThumbnailSourceChange={setThumbnailSource}
                  thumbnailBlob={thumbnail}
                  onThumbnailDrop={files => {
                    if (!busy.current && files[0]) setThumbnail(files[0])
                  }}
                  onDeleteThumbnail={async () => {
                    if (!busy.current) setThumbnail(null)
                  }}
                  thumbnailUploadInfo={{
                    uploadedBlobs:
                      job && job.input.thumbnail === thumbnail && job.thumbnail
                        ? [job.thumbnail]
                        : [],
                    uploading: running && job?.steps.thumbnail.status === 'running',
                    error: job?.steps.thumbnail.error,
                  }}
                  videoUrl={videoUrl}
                  onUrlFetchError={message => setNotice(`${message.title}: ${message.description}`)}
                  disabled={running}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <ol className="space-y-2" aria-label={t('studio.upload.progress')}>
              {STEPS.map(step => {
                const s = job.steps[step.id]
                const skipped =
                  s.status === 'done' &&
                  ((step.id === 'subtitles' && !job.input.subtitles?.length) ||
                    (step.id === 'thumbnail' && !job.thumbnail))
                return (
                  <li key={step.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className={s.status === 'pending' ? 'text-muted-foreground' : ''}>
                        {t(`studio.upload.steps.${step.id}`)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {skipped
                          ? t('studio.upload.skipped')
                          : s.status === 'done'
                            ? t('studio.upload.done')
                            : s.status === 'error'
                              ? t('studio.upload.failed')
                              : s.status === 'running'
                                ? new Intl.NumberFormat(locale, {
                                    style: 'percent',
                                    maximumFractionDigits: 0,
                                  }).format(s.progress ?? 0)
                                : ''}
                      </span>
                    </div>
                    {s.status === 'running' && (
                      <Progress value={Math.round((s.progress ?? 0) * 100)} />
                    )}
                    {s.status === 'error' && <p className="text-sm text-destructive">{s.error}</p>}
                    {s.status === 'error' && s.detail && (
                      <p className="break-all text-xs text-muted-foreground">{s.detail}</p>
                    )}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {notice && (
        <Alert variant="destructive">
          <AlertTitle>{t('studio.upload.notStarted')}</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={start}
          disabled={!canStart || (pubkey !== null && !mayPublish)}
        >
          {running
            ? t('studio.upload.uploading')
            : failed
              ? t('studio.upload.retry')
              : t(publishAt ? 'studio.upload.schedule' : 'studio.upload.start')}
        </Button>
        {!running && missing ? (
          <p className="text-sm text-muted-foreground">{missing}</p>
        ) : (
          !running &&
          signer &&
          mode !== 'managed' && (
            <p className="text-xs text-muted-foreground">{t('studio.upload.approveHint')}</p>
          )
        )}
      </div>
    </div>
  )
}
