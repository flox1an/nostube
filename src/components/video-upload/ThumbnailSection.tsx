import { useCallback, useEffect, useRef, useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FileDropzone } from './FileDropzone'
import { UploadServer } from '../UploadServer'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

interface ThumbnailSectionProps {
  thumbnailSource: 'generated' | 'upload'
  onThumbnailSourceChange: (source: 'generated' | 'upload') => void
  thumbnailBlob: Blob | null
  onThumbnailDrop: (files: File[]) => void
  onDeleteThumbnail: () => Promise<void>
  isThumbDragActive: boolean
  thumbnailUploadInfo: {
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
    uploading: boolean
    error?: string
  }
  videoUrl?: string
}

export function ThumbnailSection({
  thumbnailSource,
  onThumbnailSourceChange,
  thumbnailBlob,
  onThumbnailDrop,
  onDeleteThumbnail,
  thumbnailUploadInfo,
  videoUrl,
}: ThumbnailSectionProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)

  const hasUploadedThumbnail = thumbnailUploadInfo.uploadedBlobs.length > 0
  const uploadedThumbnailUrl = hasUploadedThumbnail
    ? thumbnailUploadInfo.uploadedBlobs[0].url
    : null

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDeleteThumbnail()
    } finally {
      setIsDeleting(false)
    }
  }

  const generateThumbnail = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (ctx) {
        // Set canvas dimensions to video dimensions
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // Draw the current video frame onto the canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Convert canvas content to a Blob and trigger the onThumbnailDrop callback
        canvas.toBlob(blob => {
          if (blob) {
            const thumbnailFile = new File([blob], 'thumbnail.png', { type: 'image/png' })
            onThumbnailDrop([thumbnailFile])
          }
        }, 'image/png')
      }
    }
  }, [onThumbnailDrop])

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.load() // Reload video when source changes
    }
  }, [videoUrl])

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
      // If no thumbnail is selected, generate one from the first frame
      if (!thumbnailBlob && !uploadedThumbnailUrl) {
        generateThumbnail()
      }
    }
  }

  const handleSliderChange = (value: number[]) => {
    const newTime = value[0]
    setCurrentVideoTime(newTime)
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  const handleSeeked = () => {
    generateThumbnail()
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="thumbnail">
        {t('upload.thumbnail.title')} <span className="text-destructive">*</span>
      </Label>
      <RadioGroup
        value={thumbnailSource}
        onValueChange={onThumbnailSourceChange}
        className="flex gap-4 mb-2"
        aria-label="Thumbnail source"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="generated" id="generated-thumb" />
          <Label htmlFor="generated-thumb">{t('upload.thumbnail.useGenerated')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="upload" id="upload-thumb" />
          <Label htmlFor="upload-thumb">{t('upload.thumbnail.uploadCustom')}</Label>
        </div>
      </RadioGroup>

      {thumbnailSource === 'generated' && (
        <div className="">
          {videoUrl ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleLoadedMetadata}
                onSeeked={handleSeeked}
                preload="metadata"
                className="rounded border mt-2 w-full max-h-80 object-contain"
                muted
                crossOrigin="anonymous"
              />
              <canvas ref={canvasRef} className="hidden" />
              {thumbnailBlob && (
                <img
                  src={URL.createObjectURL(thumbnailBlob)}
                  alt={t('upload.thumbnail.generated')}
                  className="absolute top-2 left-2 rounded border max-h-20 object-contain pointer-events-none"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                <Slider
                  value={[currentVideoTime]}
                  max={videoDuration}
                  step={0.1}
                  onValueChange={handleSliderChange}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-white mt-1">
                  <span>{formatTime(currentVideoTime)}</span>
                  <span>{formatTime(videoDuration)}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={generateThumbnail}
                  title={t('upload.thumbnail.generateFromCurrentFrame')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm mt-2">
              {t('upload.thumbnail.noVideoFile')}
            </div>
          )}
        </div>
      )}

      {thumbnailSource === 'upload' && (
        <div className="mb-2">
          {hasUploadedThumbnail && uploadedThumbnailUrl ? (
            <div className="relative inline-block">
              <img
                src={uploadedThumbnailUrl}
                alt={t('upload.thumbnail.uploaded', { defaultValue: 'Uploaded thumbnail' })}
                className="rounded border max-h-80"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <FileDropzone
                onDrop={onThumbnailDrop}
                accept={{ 'image/*': [] }}
                className="h-24 mb-4"
              />

              {thumbnailUploadInfo.uploading && (
                <div className="text-sm text-muted-foreground mt-2">
                  {t('upload.thumbnail.uploading', { defaultValue: 'Uploading thumbnail...' })}
                </div>
              )}
            </>
          )}

          {thumbnailUploadInfo.error && (
            <div className="text-red-600 text-sm mt-2">{thumbnailUploadInfo.error}</div>
          )}

          {hasUploadedThumbnail && (
            <UploadServer
              inputMethod="file"
              uploadState={thumbnailUploadInfo.uploading ? 'uploading' : 'finished'}
              uploadedBlobs={thumbnailUploadInfo.uploadedBlobs}
              mirroredBlobs={thumbnailUploadInfo.mirroredBlobs}
              hasInitialUploadServers={true}
              forceShow={true}
            />
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const format = (num: number) => (num < 10 ? '0' + num : num)
  return `${format(minutes)}:${format(remainingSeconds)}`
}
