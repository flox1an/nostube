import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { estimateRemainingSeconds, formatEtaSeconds } from '@/lib/transcode-progress'
import { VideoFilesPanel } from './VideoFilesPanel'
import type { ChunkedUploadProgress } from '@/lib/blossom-upload'
import type { TranscodeStatus } from '@/hooks/useDvmTranscode'
import type { VideoVariant } from '@/lib/video-processing'
import type { BrowserTranscodeState } from '@/types/upload-draft'
export interface ProcessingRailProps {
  draftId: string
  browserTranscodeState: BrowserTranscodeState | undefined
  uploadState: 'initial' | 'transcoding' | 'uploading' | 'finished'
  uploadProgress: ChunkedUploadProgress | null
  videos: VideoVariant[]
  deletingIndex: number | null
  hasHlsVideo: boolean
  onCancel: () => void
  onChangeSettings: () => void
  onRemoveVideo: (index: number) => void
  onAddAdditional: (files: File[]) => void
  onAddTranscodedVideo: (video: VideoVariant) => void
  onStatusChange: (status: TranscodeStatus) => void
}

export function ProcessingRail({
  draftId,
  browserTranscodeState,
  uploadState,
  uploadProgress,
  videos,
  deletingIndex,
  hasHlsVideo,
  onCancel,
  onChangeSettings,
  onRemoveVideo,
  onAddAdditional,
  onAddTranscodedVideo,
  onStatusChange,
}: ProcessingRailProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const browserActive =
    !!browserTranscodeState &&
    ['queued', 'transcoding', 'uploading'].includes(browserTranscodeState.status)
  const uploadOnlyActive = uploadState === 'uploading' && !browserTranscodeState
  const complete = browserTranscodeState?.status === 'complete' || uploadState === 'finished'
  const failed =
    browserTranscodeState?.status === 'error' || browserTranscodeState?.status === 'cancelled'

  const progress = useMemo(() => {
    if (browserTranscodeState?.status === 'uploading') {
      return browserTranscodeState.uploadProgress?.percentage ?? 0
    }
    if (
      browserTranscodeState?.status === 'transcoding' &&
      browserTranscodeState.variants.length > 0
    ) {
      const total = browserTranscodeState.variants.reduce((sum, variant) => {
        if (variant.status === 'done') return sum + 1
        if (variant.status === 'active') return sum + variant.progress
        return sum
      }, 0)
      return Math.round((total / browserTranscodeState.variants.length) * 100)
    }
    if (uploadOnlyActive) return uploadProgress?.percentage ?? 0
    return 0
  }, [browserTranscodeState, uploadOnlyActive, uploadProgress?.percentage])

  const eta = useMemo(() => {
    if (!browserTranscodeState) return undefined
    if (browserTranscodeState.status === 'uploading' && browserTranscodeState.uploadProgress) {
      return estimateRemainingSeconds(
        browserTranscodeState.uploadProgress.percentage / 100,
        browserTranscodeState.startedAt,
        browserTranscodeState.updatedAt
      )
    }
    if (
      browserTranscodeState.status !== 'transcoding' ||
      browserTranscodeState.variants.length === 0
    ) {
      return undefined
    }
    const total = browserTranscodeState.variants.reduce((sum, variant) => {
      if (variant.status === 'done') return sum + 1
      if (variant.status === 'active') return sum + variant.progress
      return sum
    }, 0)
    return estimateRemainingSeconds(
      total / browserTranscodeState.variants.length,
      browserTranscodeState.startedAt,
      browserTranscodeState.updatedAt
    )
  }, [browserTranscodeState])

  if (browserActive || uploadOnlyActive) {
    const label = browserTranscodeState
      ? t(`upload.rail.${browserTranscodeState.status}`, {
          defaultValue:
            browserTranscodeState.status === 'uploading' ? 'Uploading...' : 'Processing...',
        })
      : t('upload.rail.uploading', { defaultValue: 'Uploading...' })

    const handleCancel = () => {
      if (browserTranscodeState?.status === 'uploading') {
        const ok = window.confirm(
          t('upload.rail.cancelConfirmBody', {
            defaultValue: 'Upload is in progress. Cancel processing anyway?',
          })
        )
        if (!ok) return
      }
      onCancel()
    }

    return (
      <div className="sticky top-0 z-10 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{label}</span>
              <span className="shrink-0 text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
            {eta !== undefined && (
              <p className="text-xs text-muted-foreground">
                {t('upload.rail.eta', {
                  defaultValue: 'ETA {{eta}}',
                  eta: formatEtaSeconds(eta),
                })}
              </p>
            )}
          </div>
          {browserTranscodeState?.variants.length ? (
            <Button type="button" variant="ghost" size="icon" onClick={() => setExpanded(v => !v)}>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </Button>
          ) : null}
          {browserTranscodeState && (
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              {t('upload.browserTranscode.cancel', { defaultValue: 'Cancel' })}
            </Button>
          )}
        </div>

        {expanded && browserTranscodeState?.variants.length ? (
          <div className="mt-3 space-y-2 border-t pt-3">
            {browserTranscodeState.variants.map(variant => (
              <div key={variant.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{variant.label}</span>
                  <span>{Math.round(variant.progress * 100)}%</span>
                </div>
                <Progress value={variant.progress * 100} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (failed && browserTranscodeState) {
    const isError = browserTranscodeState.status === 'error'
    return (
      <div
        className={`rounded-md border p-3 ${
          isError
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-amber-500/40 bg-amber-500/10'
        }`}
      >
        <div className="flex items-start gap-3">
          {isError ? (
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium">
              {t(`upload.rail.${browserTranscodeState.status}`, {
                defaultValue: isError ? 'Processing failed' : 'Processing cancelled',
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {browserTranscodeState.error ?? browserTranscodeState.message}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onChangeSettings}>
                {t('upload.rail.retry', { defaultValue: 'Retry' })}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onChangeSettings}>
                {t('upload.rail.changeSettings', { defaultValue: 'Change settings' })}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (complete) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>
            {t('upload.rail.filesUploaded', {
              count: videos.length,
              defaultValue: `${videos.length} file${videos.length === 1 ? '' : 's'} uploaded`,
            })}
          </span>
        </div>
        <VideoFilesPanel
          draftId={draftId}
          videos={videos}
          uploadState={uploadState}
          uploadProgress={uploadProgress}
          deletingIndex={deletingIndex}
          hasHlsVideo={hasHlsVideo}
          onRemove={onRemoveVideo}
          onAddAdditional={onAddAdditional}
          onComplete={onAddTranscodedVideo}
          onStatusChange={onStatusChange}
        />
      </div>
    )
  }

  return null
}
