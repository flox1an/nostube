import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { FileDropzone } from '@nostube/widgets/components/FileDropzone'
import { InputMethodSelector } from './InputMethodSelector'
import { UrlInputSection } from './UrlInputSection'
import { BrowserTranscodeStep } from './BrowserTranscodeStep'
import { VideoFilesPanel } from './VideoFilesPanel'
import type { VideoVariant } from '@/lib/video-processing'
import type { BrowserTranscodeState, OriginalVideoInfo } from '@/types/upload-draft'
import type { TranscodeStatus } from '@/hooks/useDvmTranscodeManager'
import type { ChunkedUploadProgress } from '@/lib/blossom-upload'
import type { UploadInfo } from '@/hooks/useVideoUpload'
import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@nostube/core/video-transcode'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export interface UploadSourceScreenProps {
  /** Pro mode: the video settings start open. */
  pro?: boolean
  draftId: string
  file: File | null
  videoUrl: string
  setVideoUrl: (url: string) => void
  inputMethod: 'file' | 'url'
  setInputMethod: (method: 'file' | 'url') => void
  uploadState: 'initial' | 'transcoding' | 'uploading' | 'finished'
  uploadInfo: UploadInfo
  uploadProgress: ChunkedUploadProgress | null
  browserTranscodeState: BrowserTranscodeState | undefined
  originalVideoInfo: OriginalVideoInfo | undefined
  deletingIndex: number | null
  hasHlsVideo: boolean
  /** Every configured Blossom server: the storage the next upload lands on. */
  servers: string[]
  onFileDrop: (files: File[]) => void
  onUrlProcess: (url: string) => void
  onStartBackground: (
    variants: BrowserTranscodeVariant[],
    sourceMeta: TranscodeSourceMeta,
    keepOriginal: boolean
  ) => Promise<void>
  onCancelBackground: () => void
  onBrowserTranscodeComplete: (files: File[] | Map<string, File>) => void
  onBrowserTranscodeSkip: () => void
  onConfigureServers: () => void
  onAddDefaultServers: () => void
  onRemoveVideo: (index: number) => void
  onAddAdditional: (files: File[]) => void
  onAddTranscodedVideo: (video: VideoVariant) => void
  onStatusChange: (status: TranscodeStatus) => void
}

export function UploadSourceScreen({
  pro,
  draftId,
  file,
  videoUrl,
  setVideoUrl,
  inputMethod,
  setInputMethod,
  uploadState,
  uploadInfo,
  uploadProgress,
  browserTranscodeState,
  originalVideoInfo,
  deletingIndex,
  hasHlsVideo,
  servers,
  onFileDrop,
  onUrlProcess,
  onStartBackground,
  onCancelBackground,
  onBrowserTranscodeComplete,
  onBrowserTranscodeSkip,
  onConfigureServers,
  onAddDefaultServers,
  onRemoveVideo,
  onAddAdditional,
  onAddTranscodedVideo,
  onStatusChange,
}: UploadSourceScreenProps) {
  const { t } = useTranslation()

  // ── State 1: background job actively running (revisit via Back) ───────────
  const jobActive =
    !!browserTranscodeState &&
    ['queued', 'transcoding', 'uploading'].includes(browserTranscodeState.status)
  const jobFailedOrCancelled =
    !!browserTranscodeState &&
    (browserTranscodeState.status === 'error' || browserTranscodeState.status === 'cancelled')

  if (jobActive || jobFailedOrCancelled) {
    const sourceName = browserTranscodeState?.sourceName || originalVideoInfo?.name
    const sizeMB =
      browserTranscodeState?.sourceSize != null
        ? (browserTranscodeState.sourceSize / 1024 / 1024).toFixed(2)
        : originalVideoInfo?.sizeMB?.toFixed(2)

    // A failed/cancelled job never locks source selection or claims to still
    // be running — only a genuinely active job does. If the source file
    // didn't survive (e.g. the draft was reopened after a reload), say so
    // explicitly and let the dropzone accept a fresh selection.
    if (jobActive) {
      return (
        <div className="space-y-4">
          <div className="text-sm space-y-1">
            {sourceName && <div className="font-medium truncate">{sourceName}</div>}
            {sizeMB && <div className="text-muted-foreground">{sizeMB} MB</div>}
            <p className="text-muted-foreground text-xs">
              {t('upload.source.jobRunning', {
                defaultValue:
                  'Processing continues in the background — manage it on the Details screen',
              })}
            </p>
          </div>
          <FileDropzone onDrop={() => {}} accept={{ 'video/*': [] }} disabled />
        </div>
      )
    }

    if (!file) {
      return (
        <div className="space-y-4">
          <div className="text-sm space-y-1">
            {sourceName && <div className="font-medium truncate">{sourceName}</div>}
            {sizeMB && <div className="text-muted-foreground">{sizeMB} MB</div>}
            <p className="text-muted-foreground text-xs">
              {t('upload.source.reselectRequired', {
                defaultValue: 'This file needs to be reselected before processing can be retried.',
              })}
            </p>
          </div>
          <FileDropzone onDrop={onFileDrop} accept={{ 'video/*': [] }} />
        </div>
      )
    }
  }

  // ── State 2: file selected, analyzing (BrowserTranscodeStep) ──────────────
  if (file && uploadState === 'transcoding' && !browserTranscodeState) {
    return (
      <BrowserTranscodeStep
        pro={pro}
        file={file}
        backgroundState={undefined}
        onStartBackground={onStartBackground}
        onCancelBackground={onCancelBackground}
        onComplete={onBrowserTranscodeComplete}
        onSkip={onBrowserTranscodeSkip}
      />
    )
  }

  // ── State 4: URL processing complete ──────────────────────────────────────
  if (inputMethod === 'url' && uploadInfo.videos.length > 0) {
    return (
      <VideoFilesPanel
        draftId={draftId}
        videos={uploadInfo.videos}
        uploadState={uploadState}
        uploadProgress={uploadProgress}
        deletingIndex={deletingIndex}
        hasHlsVideo={hasHlsVideo}
        onRemove={onRemoveVideo}
        onAddAdditional={onAddAdditional}
        onComplete={onAddTranscodedVideo}
        onStatusChange={onStatusChange}
      />
    )
  }

  // ── State 3: no video yet ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {uploadState === 'initial' && (
        <InputMethodSelector value={inputMethod} onChange={setInputMethod} />
      )}

      {inputMethod === 'file' ? (
        <FileDropzone onDrop={onFileDrop} accept={{ 'video/*': [] }} selectedFile={file} />
      ) : (
        <UrlInputSection
          videoUrl={videoUrl}
          onVideoUrlChange={setVideoUrl}
          onProcess={() => onUrlProcess(videoUrl)}
          isProcessing={uploadState === 'transcoding'}
        />
      )}

      <div className="mt-4 rounded-md border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t('upload.storage.title', { defaultValue: 'Where your files are stored' })}
            </p>
            {servers.length > 0 ? (
              <p className="truncate text-xs text-muted-foreground">
                {servers.map(hostOf).join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-destructive">
                {t('upload.storage.none', {
                  defaultValue: 'No server yet — choose one before uploading.',
                })}
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onConfigureServers}>
            {t('upload.storage.change', { defaultValue: 'Change' })}
          </Button>
        </div>
        {servers.length === 0 && (
          <Button type="button" size="sm" className="mt-2" onClick={onAddDefaultServers}>
            {t('upload.storage.addDefaults', { defaultValue: 'Use the free default servers' })}
          </Button>
        )}
      </div>
    </div>
  )
}
