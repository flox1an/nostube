import { useEffect, useMemo, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { VideoVariant } from '@/lib/video-processing'
import type { BrowserTranscodeState, OriginalVideoInfo } from '@/types/upload-draft'
import type { ThumbnailUploadInfo } from '@/hooks/useVideoUpload'
import { useUploadManager } from '@/providers/upload'
import { EventPreview } from './EventPreview'
import { PublishButton } from './PublishButton'

interface PreviewEvent {
  kind: number
  content: string
  created_at: number | string
  tags: string[][]
}

export interface UploadPublishPanelProps {
  // Preview card data
  title: string
  description: string
  tags: string[]
  thumbnailBlob: Blob | null
  thumbnailUploadInfo: ThumbnailUploadInfo
  originalVideoInfo: OriginalVideoInfo | undefined
  videos: VideoVariant[]
  // Readiness check state
  hasThumbnailSet: boolean
  browserTranscodeState: BrowserTranscodeState | undefined
  draftId: string
  // Publish
  writeRelays: string[]
  publishRelays: string[] | null
  setPublishRelays: (v: string[] | null) => void
  isPublishing: boolean
  canPublish: boolean
  handleSubmit: (e: FormEvent) => Promise<void>
  previewEvent: PreviewEvent | null
  /** Scrolls the form to the field a checklist row is about. */
  onJump: (field: 'processing' | 'title' | 'thumbnail') => void
  /** Pro mode: relay selection and the event preview. */
  pro: boolean
  /** A direct upload or URL import is running (not a background browser or DVM job). */
  uploadInProgress: boolean
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

interface ChecklistRowProps {
  ok: boolean
  processing?: boolean
  label: string
  hint?: string
  onJump?: () => void
}

function ChecklistRow({ ok, processing, label, hint, onJump }: ChecklistRowProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-b-0">
      <div className="mt-0.5 shrink-0">
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {onJump && !ok && !processing && (
        <button type="button" onClick={onJump} className="text-xs text-primary underline shrink-0">
          {t('common.edit', { defaultValue: 'Edit' })}
        </button>
      )}
    </div>
  )
}

/**
 * The right column of the upload page: how the video will look, what is still missing, and the
 * publish button. Publishing stays disabled until the video is processed and title and thumbnail
 * are set; every missing item jumps to its field.
 */
export function UploadPublishPanel({
  title,
  description,
  tags,
  thumbnailBlob,
  thumbnailUploadInfo,
  originalVideoInfo,
  videos,
  hasThumbnailSet,
  browserTranscodeState,
  draftId,
  writeRelays,
  publishRelays,
  setPublishRelays,
  isPublishing,
  canPublish,
  handleSubmit,
  previewEvent,
  onJump,
  pro,
  uploadInProgress,
}: UploadPublishPanelProps) {
  const { t } = useTranslation()
  const uploadManager = useUploadManager()

  const dvmActive = uploadManager.hasActiveTask(draftId)
  const browserJobActive =
    !!browserTranscodeState &&
    ['queued', 'transcoding', 'uploading'].includes(browserTranscodeState.status)
  const videoProcessing = dvmActive || browserJobActive || uploadInProgress

  // Memoize the object URL for the blob thumbnail and revoke on change
  const thumbnailSrc = useMemo<string | null>(() => {
    if (thumbnailBlob) return URL.createObjectURL(thumbnailBlob)
    return thumbnailUploadInfo.uploadedBlobs[0]?.url ?? null
  }, [thumbnailBlob, thumbnailUploadInfo.uploadedBlobs])

  useEffect(() => {
    if (!thumbnailBlob || !thumbnailSrc) return
    return () => {
      URL.revokeObjectURL(thumbnailSrc)
    }
  }, [thumbnailBlob, thumbnailSrc])

  const rawDuration = originalVideoInfo?.duration ?? videos[0]?.duration
  const durationLabel = rawDuration != null ? formatDuration(rawDuration) : undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="rounded-lg border overflow-hidden">
        <p className="px-3 pt-3 text-xs font-medium text-muted-foreground">
          {t('upload.panel.previewTitle', { defaultValue: 'How it will appear on nostube' })}
        </p>
        <div className="p-3">
          <div className="relative overflow-hidden rounded-md">
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt={t('upload.thumbnail.title')}
                className="w-full aspect-video object-cover"
              />
            ) : (
              <div className="w-full aspect-video bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm">{t('upload.thumbnail.title')}</span>
              </div>
            )}
            {durationLabel && (
              <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                {durationLabel}
              </span>
            )}
          </div>
          <h3 className="mt-3 font-semibold leading-snug line-clamp-2">
            {title || t('upload.draft.untitled')}
          </h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 5).map(tag => (
                <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border px-3">
        <ChecklistRow
          ok={videos.length > 0 && !videoProcessing}
          processing={videoProcessing}
          label={t('upload.review.checklist.video', { defaultValue: 'Video files' })}
          hint={
            videoProcessing
              ? t('upload.review.checklist.videoProcessing', { defaultValue: 'Processing...' })
              : undefined
          }
          onJump={() => onJump('processing')}
        />
        <ChecklistRow
          ok={title.trim().length > 0}
          label={t('upload.review.checklist.title', { defaultValue: 'Title' })}
          onJump={() => onJump('title')}
        />
        <ChecklistRow
          ok={hasThumbnailSet}
          label={t('upload.review.checklist.thumbnail', { defaultValue: 'Thumbnail' })}
          onJump={() => onJump('thumbnail')}
        />
      </div>

      <PublishButton
        isPublishing={isPublishing}
        disabled={!canPublish || videoProcessing}
        writeRelays={writeRelays}
        selectedRelays={publishRelays}
        onSelectedRelaysChange={setPublishRelays}
        showRelayPicker={pro}
      />

      {pro && <EventPreview event={previewEvent} />}
    </form>
  )
}
