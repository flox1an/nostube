import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { VideoVariantsTable } from './VideoVariantsTable'
import { DvmTranscodeAlert } from './DvmTranscodeAlert'
import type { VideoVariant } from '@/lib/video-processing'
import type { ChunkedUploadProgress } from '@/lib/blossom-upload'
import type { TranscodeStatus } from '@/hooks/useDvmTranscode'

export interface VideoFilesPanelProps {
  draftId: string
  videos: VideoVariant[]
  uploadState: 'initial' | 'transcoding' | 'uploading' | 'finished'
  uploadProgress: ChunkedUploadProgress | null
  deletingIndex: number | null
  hasHlsVideo: boolean
  onRemove: (index: number) => void
  onAddAdditional: (files: File[]) => void
  onComplete: (video: VideoVariant) => void
  onStatusChange: (status: TranscodeStatus) => void
}

export function VideoFilesPanel({
  draftId,
  videos,
  uploadState,
  uploadProgress,
  deletingIndex,
  hasHlsVideo,
  onRemove,
  onAddAdditional,
  onComplete,
  onStatusChange,
}: VideoFilesPanelProps) {
  const { t } = useTranslation()

  const onDropAdditional = useCallback(
    (acceptedFiles: File[]) => {
      onAddAdditional(acceptedFiles)
    },
    [onAddAdditional]
  )

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: onDropAdditional,
    accept: { 'video/*': [] },
    multiple: false,
  })

  return (
    <div className="space-y-4">
      {/* Upload progress */}
      {uploadState === 'uploading' && !uploadProgress && (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('upload.uploading')}</span>
        </div>
      )}
      {uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t('upload.uploading')}</span>
            <span>{Math.round(uploadProgress.percentage)}%</span>
          </div>
          <Progress value={uploadProgress.percentage} />
        </div>
      )}

      {/* Video variants table */}
      {videos.length > 0 && (
        <>
          <VideoVariantsTable videos={videos} onRemove={onRemove} deletingIndex={deletingIndex} />

          {/* DVM Transcode Alert */}
          {uploadState === 'finished' && videos[0] && !hasHlsVideo && (
            <DvmTranscodeAlert
              draftId={draftId}
              video={videos[0]}
              existingResolutions={videos
                .map(v => v.qualityLabel)
                .filter((label): label is string => !!label)}
              onComplete={onComplete}
              onStatusChange={onStatusChange}
            />
          )}

          {/* Add another quality — hidden for HLS streams */}
          {uploadState === 'finished' && !hasHlsVideo && (
            <div className="border-2 border-dashed rounded-lg p-4">
              <div
                {...getRootProps()}
                className="flex flex-col items-center justify-center gap-2 cursor-pointer py-4"
              >
                <input {...getInputProps()} />
                <Button type="button" variant="outline" className="cursor-pointer">
                  {t('upload.addAnotherQuality')}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {t('upload.addAnotherQualityHint')}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
