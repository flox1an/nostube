import { useTranslation } from 'react-i18next'
import { FileDropzone } from './FileDropzone'
import { InputMethodSelector } from './InputMethodSelector'
import { UrlInputSection } from './UrlInputSection'
import { BrowserTranscodeStep } from './BrowserTranscodeStep'
import { VideoFilesPanel } from './VideoFilesPanel'
import type { VideoVariant } from '@/lib/video-processing'
import type { BrowserTranscodeState, OriginalVideoInfo } from '@/types/upload-draft'
import type { TranscodeStatus } from '@/hooks/useDvmTranscode'
import type { ChunkedUploadProgress } from '@/lib/blossom-upload'
import type { UploadInfo } from '@/hooks/useVideoUpload'
import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@/lib/video-transcode'

export interface UploadSourceScreenProps {
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
  uploadServerCount: number
  mirrorServerCount: number
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
  onRemoveVideo: (index: number) => void
  onAddAdditional: (files: File[]) => void
  onAddTranscodedVideo: (video: VideoVariant) => void
  onStatusChange: (status: TranscodeStatus) => void
}

export function UploadSourceScreen({
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
  uploadServerCount,
  mirrorServerCount,
  onFileDrop,
  onUrlProcess,
  onStartBackground,
  onCancelBackground,
  onBrowserTranscodeComplete,
  onBrowserTranscodeSkip,
  onConfigureServers,
  onRemoveVideo,
  onAddAdditional,
  onAddTranscodedVideo,
  onStatusChange,
}: UploadSourceScreenProps) {
  const { t } = useTranslation()

  // ── State 1: background job already running (revisit via Back) ─────────────
  if (browserTranscodeState && browserTranscodeState.status !== 'complete') {
    const sourceName = browserTranscodeState.sourceName || originalVideoInfo?.name
    const sizeMB =
      browserTranscodeState.sourceSize != null
        ? (browserTranscodeState.sourceSize / 1024 / 1024).toFixed(2)
        : originalVideoInfo?.sizeMB?.toFixed(2)

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

  // ── State 2: file selected, analyzing (BrowserTranscodeStep) ──────────────
  if (file && uploadState === 'transcoding' && !browserTranscodeState) {
    return (
      <BrowserTranscodeStep
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

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t('upload.source.servers', {
            defaultValue: 'Servers: {{upload}} upload · {{mirror}} mirror',
            upload: uploadServerCount,
            mirror: mirrorServerCount,
          })}
        </span>
        <span>—</span>
        <button
          type="button"
          onClick={onConfigureServers}
          className="underline cursor-pointer hover:text-foreground"
        >
          {t('upload.source.configure', { defaultValue: 'Configure' })}
        </button>
      </div>
    </div>
  )
}
