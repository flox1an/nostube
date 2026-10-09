import type { EventTemplate } from 'nostr-tools'
import { buildVideoEvent, type UploadedBlob } from '@nostube/core/video-publish'
import { prepareSubtitleFile } from '@nostube/core/subtitle-utils'
import i18n from '../i18n'
import type { VideoProbe } from './probe-video'

export type StepId = 'check' | 'hash' | 'video' | 'thumbnail' | 'subtitles' | 'publish'
export type StepStatus = 'pending' | 'running' | 'done' | 'error'

/** In order; the names shown are translated at render (`studio.upload.steps.*`). */
export const STEPS: { id: StepId }[] = [
  { id: 'check' },
  { id: 'hash' },
  { id: 'video' },
  { id: 'thumbnail' },
  { id: 'subtitles' },
  { id: 'publish' },
]

export interface UploadInput {
  file: File
  title: string
  description: string
  tags: string[]
  /** A content warning's reason (empty: NSFW); undefined for none. */
  contentWarning?: string
  /** Undefined uses the probed frame; null deliberately omits a thumbnail. */
  thumbnail?: Blob | null
  subtitles?: { id: string; file: File; lang: string }[]
}

export interface StepState {
  status: StepStatus
  /** 0 to 1 while the step runs and reports it. */
  progress?: number
  error?: string
}

export interface PublishedVideo {
  eventId: string
  /** The naddr of the video: the page of the video on the site is `/v/<link>`. */
  link: string
  /** The relays that accepted the event. */
  accepted: string[]
}

/** Everything a run has achieved so far, so a retry continues where the last one stopped. */
export interface UploadJob {
  input: UploadInput
  identifier: string
  steps: Record<StepId, StepState>
  probe?: VideoProbe
  sha256?: string
  video?: UploadedBlob
  /** How many bytes of the video the server has (a chunked upload that failed halfway). */
  videoOffset?: number
  thumbnail?: UploadedBlob
  /** Successful files survive retries independently of the remaining subtitle files. */
  subtitles?: Record<string, UploadedBlob>
  subtitleOffsets?: Record<string, number>
  published?: PublishedVideo
}

/** What the pipeline needs from the outside: the browser, the network and the signer. */
export interface UploadDeps {
  probe(file: File): Promise<VideoProbe>
  hash(blob: Blob, onProgress: (done: number, total: number) => void): Promise<string>
  upload(args: {
    blob: Blob
    name: string
    type: string
    sha256: string
    onProgress: (sent: number, total: number) => void
    /** Where a chunked upload continues (a retry), and where to report how far it got. */
    resumeFrom?: number
    onOffset?: (offset: number) => void
  }): Promise<UploadedBlob>
  publish(template: EventTemplate): Promise<PublishedVideo>
  newIdentifier(): string
}

const pending = (): StepState => ({ status: 'pending' })

/** `probe`: the file was already checked when it was chosen, so that step starts out done. */
export function newJob(
  input: UploadInput,
  deps: Pick<UploadDeps, 'newIdentifier'>,
  probe?: VideoProbe
): UploadJob {
  return {
    input,
    identifier: deps.newIdentifier(),
    steps: {
      check: probe ? { status: 'done', progress: 1 } : pending(),
      hash: pending(),
      video: pending(),
      thumbnail: pending(),
      subtitles: pending(),
      publish: pending(),
    },
    probe,
  }
}

/** Update an interrupted job, retaining only uploads that still match the selected files. */
export function updateJobInput(job: UploadJob, input: UploadInput): UploadJob {
  const steps = { ...job.steps, publish: pending() }
  const changed: UploadJob = { ...job, input, steps, published: undefined }
  if (input.file !== job.input.file) {
    changed.probe = undefined
    changed.sha256 = undefined
    changed.video = undefined
    changed.videoOffset = undefined
    steps.check = pending()
    steps.hash = pending()
    steps.video = pending()
  }
  if (input.file !== job.input.file || input.thumbnail !== job.input.thumbnail) {
    changed.thumbnail = undefined
    steps.thumbnail = pending()
  }
  const subtitles = input.subtitles ?? []
  const oldSubtitles = job.input.subtitles ?? []
  if (
    subtitles.length !== oldSubtitles.length ||
    subtitles.some(
      (subtitle, index) =>
        subtitle.id !== oldSubtitles[index]?.id || subtitle.file !== oldSubtitles[index]?.file
    )
  ) {
    const retained = subtitles.filter(subtitle =>
      oldSubtitles.some(old => old.id === subtitle.id && old.file === subtitle.file)
    )
    changed.subtitles = Object.fromEntries(
      retained.flatMap(subtitle =>
        job.subtitles?.[subtitle.id] ? [[subtitle.id, job.subtitles[subtitle.id]]] : []
      )
    )
    changed.subtitleOffsets = Object.fromEntries(
      retained.flatMap(subtitle =>
        job.subtitleOffsets?.[subtitle.id] === undefined
          ? []
          : [[subtitle.id, job.subtitleOffsets[subtitle.id]]]
      )
    )
    steps.subtitles = pending()
  }
  return changed
}

/** True once the video is published. */
export const isDone = (job: UploadJob) => job.steps.publish.status === 'done'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Runs the steps that are not done yet, in order, and stops at the first one that fails (its
 * error is in the job). Run it again with the same job to continue: finished steps are not
 * repeated, so a failed publish does not upload the video a second time.
 */
export async function runUpload(
  job: UploadJob,
  deps: UploadDeps,
  onChange: (job: UploadJob) => void
): Promise<UploadJob> {
  let current = job
  const set = (id: StepId, state: StepState) => {
    current = { ...current, steps: { ...current.steps, [id]: state } }
    onChange(current)
  }
  const update = (patch: Partial<UploadJob>) => {
    current = { ...current, ...patch }
    onChange(current)
  }
  const progress = (id: StepId) => (done: number, total: number) =>
    set(id, { status: 'running', progress: total > 0 ? done / total : 0 })

  const step = async (id: StepId, work: () => Promise<void>): Promise<boolean> => {
    if (current.steps[id].status === 'done') return true
    set(id, { status: 'running', progress: 0 })
    try {
      await work()
      set(id, { status: 'done', progress: 1 })
      return true
    } catch (error) {
      set(id, { status: 'error', error: messageOf(error) })
      return false
    }
  }

  const { file } = current.input

  if (!(await step('check', async () => update({ probe: await deps.probe(file) })))) return current
  if (
    !(await step('hash', async () => update({ sha256: await deps.hash(file, progress('hash')) })))
  ) {
    return current
  }
  if (
    !(await step('video', async () => {
      const video = await deps.upload({
        blob: file,
        name: file.name,
        type: file.type,
        sha256: current.sha256!,
        onProgress: progress('video'),
        resumeFrom: current.videoOffset,
        onOffset: offset => update({ videoOffset: offset }),
      })
      update({ video })
    }))
  ) {
    return current
  }
  if (
    !(await step('thumbnail', async () => {
      const blob =
        current.input.thumbnail === undefined ? current.probe!.thumbnail : current.input.thumbnail
      if (!blob) return
      const type = blob.type
      if (!type.startsWith('image/')) throw new Error(i18n.t('studio.errors.thumbnailType'))
      const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1]
      const sha256 = await deps.hash(blob, () => {})
      const thumbnail = await deps.upload({
        blob,
        name: blob instanceof File ? blob.name : `thumbnail.${extension}`,
        type,
        sha256,
        onProgress: progress('thumbnail'),
      })
      update({ thumbnail })
    }))
  ) {
    return current
  }
  if (
    !(await step('subtitles', async () => {
      for (const subtitle of current.input.subtitles ?? []) {
        if (!subtitle.lang)
          throw new Error(i18n.t('studio.errors.subtitleLanguage', { name: subtitle.file.name }))
        if (current.subtitles?.[subtitle.id]) continue
        const blob = await prepareSubtitleFile(subtitle.file)
        const sha256 = await deps.hash(blob, () => {})
        const uploaded = await deps.upload({
          blob,
          name: blob.name,
          type: 'text/vtt',
          sha256,
          onProgress: progress('subtitles'),
          resumeFrom: current.subtitleOffsets?.[subtitle.id],
          onOffset: offset =>
            update({ subtitleOffsets: { ...current.subtitleOffsets, [subtitle.id]: offset } }),
        })
        update({ subtitles: { ...current.subtitles, [subtitle.id]: uploaded } })
      }
    }))
  ) {
    return current
  }
  await step('publish', async () => {
    const { probe, video, thumbnail, input } = current
    const template = buildVideoEvent({
      identifier: current.identifier,
      title: input.title,
      description: input.description,
      tags: input.tags,
      contentWarning: input.contentWarning,
      video: {
        ...video!,
        // The server's description should carry these; the file itself is the fallback.
        size: video!.size || file.size,
        type: video!.type || file.type,
        width: probe!.width,
        height: probe!.height,
        duration: probe!.duration,
      },
      thumbnail,
      subtitles: (input.subtitles ?? []).map(subtitle => ({
        url: current.subtitles![subtitle.id].url,
        lang: subtitle.lang,
      })),
    })
    update({ published: await deps.publish(template) })
  })
  return current
}
