import { useEffect, useRef, useState, type ReactNode } from 'react'
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

const sizeText = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`

/** `my_holiday-clip.mp4` to `my holiday clip`. */
const titleFromName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()

/** Choose a video, describe it, and publish it to this instance. */
export default function UploadPage({ state, banner }: { state: AdminState; banner: ReactNode }) {
  const { signer, pubkey, connect } = useSigner()
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

  const key = pubkey
  const mayPublish = key !== null && isKeyConnected(state.config, key)

  const start = async () => {
    if (!file || !probe || busy.current) return
    busy.current = true
    setRunning(true)
    setNotice(null)
    try {
      let who = key
      try {
        who ??= await connect()
      } catch (e) {
        return setNotice(e instanceof Error ? e.message : String(e))
      }
      if (!isKeyConnected(state.config, who)) {
        return setNotice(
          'Your key is not yet a creator and uploader of this instance: connect it first.'
        )
      }
      if (!signer) return setNotice('No Nostr signer found in this browser.')
      // Use the just-connected key rather than the render behind it.
      const deps = makeUploadDeps({ signer, pubkey: who, title })
      const input = {
        file,
        title: title.trim(),
        description,
        tags,
        contentWarning: warning ? reason : undefined,
        thumbnail,
        subtitles,
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
    setDescription('')
    setTags([])
    setWarning(false)
    setReason('')
  }

  if (job && isDone(job)) {
    const published = job.published!
    const address = `${location.origin}/v/${published.link}`
    return (
      <Card>
        <CardHeader>
          <CardTitle>Published</CardTitle>
          <CardDescription>
            The video went to this instance&apos;s relay only ({published.accepted.join(', ')}); it
            is not sent to other relays.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="break-all text-sm">
            <a
              className="text-primary underline"
              href={address}
              target="_blank"
              rel="noopener noreferrer"
            >
              {address}
            </a>
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <a href={address} target="_blank" rel="noopener noreferrer">
                View on the site
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Upload another
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const failed = job && STEPS.find(s => job.steps[s.id].status === 'error')
  const canStart =
    !!file && !!probe && title.trim() !== '' && !running && subtitles.every(s => s.lang)

  return (
    <div className="space-y-6">
      {banner}
      <Card>
        <CardHeader>
          <CardTitle>Upload a video</CardTitle>
          <CardDescription>
            MP4 or WebM that your browser can play. It is stored on this instance and published to
            its relay; other formats and several quality levels are planned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="file" label="Video file">
            <FileDropzone
              id="file"
              accept={{ 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] }}
              disabled={running}
              selectedFile={file}
              onDrop={files => void choose(files[0])}
            />
          </Field>
          {file && !probeError && !probe && (
            <p className="text-sm text-muted-foreground">Reading the video…</p>
          )}
          {probeError && (
            <Alert variant="destructive">
              <AlertDescription>{probeError}</AlertDescription>
            </Alert>
          )}
          {probe && file && (
            <div className="flex gap-4">
              <p className="text-sm text-muted-foreground">
                {file.name} · {sizeText(file.size)} · {probe.width}×{probe.height} ·{' '}
                {Math.round(probe.duration)} s
                {probe.height > probe.width ? ' · vertical (published as a short)' : ''}
              </p>
            </div>
          )}
          <Field id="video-title" label="Title">
            <Input
              id="video-title"
              value={title}
              disabled={running}
              onChange={e => setTitle(e.target.value)}
            />
          </Field>
          <Field
            id="video-description"
            label="Description"
            hint="Optional. Links and #tags work here."
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
            label="Tags"
            hint="Press Enter to add tags. Separate multiple tags with spaces or commas."
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
          {probe && (
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
                  job && job.input.thumbnail === thumbnail && job.thumbnail ? [job.thumbnail] : [],
                uploading: running && job?.steps.thumbnail.status === 'running',
                error: job?.steps.thumbnail.error,
              }}
              videoUrl={videoUrl}
              onUrlFetchError={message => setNotice(`${message.title}: ${message.description}`)}
              disabled={running}
            />
          )}
          <SubtitleSection
            subtitles={subtitles.map(subtitle => ({
              id: subtitle.id,
              filename: subtitle.file.name,
              lang: subtitle.lang,
              uploadedBlobs: job?.subtitles?.[subtitle.id] ? [job.subtitles[subtitle.id]] : [],
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
                  current.map(subtitle => (subtitle.id === id ? { ...subtitle, lang } : subtitle))
                )
            }}
            disabled={running}
          />
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <ol className="space-y-2" aria-label="Upload progress">
              {STEPS.map(step => {
                const s = job.steps[step.id]
                return (
                  <li key={step.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className={s.status === 'pending' ? 'text-muted-foreground' : ''}>
                        {step.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.status === 'done'
                          ? 'done'
                          : s.status === 'error'
                            ? 'failed'
                            : s.status === 'running'
                              ? `${Math.round((s.progress ?? 0) * 100)} %`
                              : ''}
                      </span>
                    </div>
                    {s.status === 'running' && (
                      <Progress value={Math.round((s.progress ?? 0) * 100)} />
                    )}
                    {s.status === 'error' && <p className="text-sm text-destructive">{s.error}</p>}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {notice && (
        <Alert variant="destructive">
          <AlertTitle>Not started</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={start} disabled={!canStart || (key !== null && !mayPublish)}>
          {running ? 'Uploading…' : failed ? 'Try again' : 'Upload and publish'}
        </Button>
        {!running && (
          <p className="text-xs text-muted-foreground">
            Your signer asks you to approve the upload and the publication.
          </p>
        )}
      </div>
    </div>
  )
}
