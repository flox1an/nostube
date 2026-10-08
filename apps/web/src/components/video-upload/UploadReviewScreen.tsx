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

export interface UploadReviewScreenProps {
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
  // Navigation
  onGoToDetails: () => void
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

export function UploadReviewScreen({
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
  onGoToDetails,
}: UploadReviewScreenProps) {
  const { t } = useTranslation()
  const uploadManager = useUploadManager()

  const dvmActive = uploadManager.hasActiveTask(draftId)
  const browserJobActive =
    !!browserTranscodeState &&
    ['queued', 'transcoding', 'uploading'].includes(browserTranscodeState.status)
  const videoProcessing = dvmActive || browserJobActive

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
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Preview card (left column) */}
        <div>
          <div className="rounded-lg border overflow-hidden">
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt="Thumbnail preview"
                className="w-full aspect-video object-cover"
              />
            ) : (
              <div className="w-full aspect-video bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm">{t('upload.thumbnail.title')}</span>
              </div>
            )}
            <div className="p-4 space-y-2">
              <h3 className="font-semibold line-clamp-2">{title || t('upload.draft.untitled')}</h3>
              {description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.slice(0, 5).map(tag => (
                    <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {durationLabel && <p className="text-xs text-muted-foreground">{durationLabel}</p>}
            </div>
          </div>
        </div>

        {/* Checklist + publish (right column) */}
        <div>
          <div className="rounded-lg border divide-y">
            <ChecklistRow
              ok={videos.length > 0 && !videoProcessing}
              processing={videoProcessing}
              label={t('upload.review.checklist.video', { defaultValue: 'Video files' })}
              hint={
                videoProcessing
                  ? t('upload.review.checklist.videoProcessing', {
                      defaultValue: 'Processing...',
                    })
                  : undefined
              }
              onJump={onGoToDetails}
            />
            <ChecklistRow
              ok={title.trim().length > 0}
              label={t('upload.review.checklist.title', { defaultValue: 'Title' })}
              onJump={onGoToDetails}
            />
            <ChecklistRow
              ok={hasThumbnailSet}
              label={t('upload.review.checklist.thumbnail', { defaultValue: 'Thumbnail' })}
              onJump={onGoToDetails}
            />
          </div>

          <div className="mt-4">
            <PublishButton
              isPublishing={isPublishing}
              disabled={!canPublish || videoProcessing}
              writeRelays={writeRelays}
              selectedRelays={publishRelays}
              onSelectedRelaysChange={setPublishRelays}
            />
          </div>

          <EventPreview event={previewEvent} />
        </div>
      </div>
    </form>
  )
}
