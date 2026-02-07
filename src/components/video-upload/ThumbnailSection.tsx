import { useCallback, useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FileDropzone } from './FileDropzone'
import { UploadServer } from '../UploadServer'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { useTranslation } from 'react-i18next'
import { Trash2, Check, Link as LinkIcon, Upload as UploadIcon, Film, Loader2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/useToast'

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
  onThumbnailSourceChange,
  thumbnailBlob,
  onThumbnailDrop,
  onDeleteThumbnail,
  thumbnailUploadInfo,
  videoUrl,
}: ThumbnailSectionProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [isPreviewImageLoaded, setIsPreviewImageLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // URL Input State
  const [urlInput, setUrlInput] = useState('')
  const [isProcessingUrl, setIsProcessingUrl] = useState(false)

  const hasUploadedThumbnail = thumbnailUploadInfo.uploadedBlobs.length > 0
  const uploadedThumbnailUrl = hasUploadedThumbnail
    ? thumbnailUploadInfo.uploadedBlobs[0].url
    : null

  const hasThumbnail = !!(thumbnailBlob || uploadedThumbnailUrl)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDeleteThumbnail()
      // Reset states
      setPreviewBlob(null)
      setUrlInput('')
    } finally {
      setIsDeleting(false)
    }
  }

  const captureCurrentFrame = useCallback((callback?: (blob: Blob) => void) => {
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

        // Convert canvas content to a Blob
        canvas.toBlob(
          blob => {
            if (blob) {
              setPreviewBlob(blob)
              if (callback) {
                callback(blob)
              } else {
                setHasUnsavedChanges(true)
              }
            }
          },
          'image/webp',
          0.85
        )
      }
    }
  }, [])

  const updatePreview = useCallback(() => {
    captureCurrentFrame()
  }, [captureCurrentFrame])

  const handleSetThumbnail = useCallback(() => {
    if (previewBlob) {
      const thumbnailFile = new File([previewBlob], 'thumbnail.webp', { type: 'image/webp' })
      onThumbnailDrop([thumbnailFile])
      setHasUnsavedChanges(false)
    }
  }, [previewBlob, onThumbnailDrop])

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return

    setIsProcessingUrl(true)
    try {
      const response = await fetch(urlInput)
      if (!response.ok) throw new Error('Failed to fetch image')

      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) {
        throw new Error('URL does not point to a valid image')
      }

      // Preserve the original image type from the URL
      const extension = blob.type.split('/')[1] || 'jpg'
      const file = new File([blob], `thumbnail.${extension}`, { type: blob.type })
      onThumbnailDrop([file])
      setUrlInput('')
    } catch (error) {
      console.error('Error fetching thumbnail URL:', error)
      toast({
        title: t('upload.thumbnail.urlError', { defaultValue: 'Error fetching image' }),
        description: t('upload.thumbnail.urlErrorDesc', {
          defaultValue:
            'Could not load image from the provided URL. Please try another URL or upload a file.',
        }),
        variant: 'destructive',
      })
    } finally {
      setIsProcessingUrl(false)
    }
  }

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.load() // Reload video when source changes
    }
  }, [videoUrl])

  // Reset unsaved changes when thumbnail is uploaded
  useEffect(() => {
    if (thumbnailBlob || uploadedThumbnailUrl) {
      setHasUnsavedChanges(false)
    }
  }, [thumbnailBlob, uploadedThumbnailUrl])

  // Reset image loaded state when thumbnail source changes
  useEffect(() => {
    setIsImageLoaded(false)
  }, [uploadedThumbnailUrl, thumbnailBlob])

  // Reset preview image loaded state when preview blob changes
  useEffect(() => {
    setIsPreviewImageLoaded(false)
  }, [previewBlob])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
    }
  }, [])

  const handleLoadedData = useCallback(() => {
    // Capture the first frame once actual pixel data is available
    // (loadedmetadata only guarantees dimensions, not frame pixels)
    updatePreview()
  }, [updatePreview])

  const handleSliderChange = (value: number[]) => {
    const newTime = value[0]
    setCurrentVideoTime(newTime)
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  const handleSeeked = () => {
    // Update preview when user seeks to a new position
    updatePreview()
  }

  // Handle tab change to sync with parent state
  const handleTabChange = (value: string) => {
    if (value === 'generated') {
      onThumbnailSourceChange('generated')
    } else {
      onThumbnailSourceChange('upload')
    }
  }

  if (hasThumbnail) {
    const thumbnailSrc =
      uploadedThumbnailUrl || (thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : '')
    return (
      <div className="flex flex-col gap-2">
        <Label>{t('upload.thumbnail.title')}</Label>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative inline-block w-fit min-w-48 min-h-28">
            {!isImageLoaded && (
              <div className="absolute inset-0 rounded border bg-muted animate-pulse flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <img
              src={thumbnailSrc}
              alt={t('upload.thumbnail.uploaded', { defaultValue: 'Thumbnail' })}
              className={`rounded border max-h-80 object-contain transition-opacity duration-200 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setIsImageLoaded(true)}
            />
            {isImageLoaded && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 shadow-sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {/* Show upload server status for the existing thumbnail */}
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Label htmlFor="thumbnail">
        {t('upload.thumbnail.title')} <span className="text-destructive">*</span>
      </Label>

      <Tabs
        defaultValue={videoUrl ? 'generated' : 'upload'}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="upload" className="flex gap-2">
            <UploadIcon className="h-4 w-4" />
            {t('upload.thumbnail.uploadCustom', { defaultValue: 'Upload' })}
          </TabsTrigger>
          <TabsTrigger value="url" className="flex gap-2">
            <LinkIcon className="h-4 w-4" />
            {t('upload.thumbnail.enterUrl', { defaultValue: 'Enter URL' })}
          </TabsTrigger>
          <TabsTrigger value="generated" className="flex gap-2" disabled={!videoUrl}>
            <Film className="h-4 w-4" />
            {t('upload.thumbnail.generate', { defaultValue: 'Generate from video' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-0">
          <div className="space-y-4">
            <FileDropzone onDrop={onThumbnailDrop} accept={{ 'image/*': [] }} className="h-32" />
            {thumbnailUploadInfo.uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('upload.thumbnail.uploading', { defaultValue: 'Uploading thumbnail...' })}
              </div>
            )}
            {thumbnailUploadInfo.error && (
              <div className="text-destructive text-sm">{thumbnailUploadInfo.error}</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="url" className="mt-0">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/image.jpg"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlSubmit()
                }
              }}
            />
            <Button type="button" onClick={handleUrlSubmit} disabled={!urlInput || isProcessingUrl}>
              {isProcessingUrl ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('upload.thumbnail.fetch', { defaultValue: 'Import' })
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('upload.thumbnail.urlHint', {
              defaultValue: 'Paste a direct link to an image file.',
            })}
          </p>
        </TabsContent>

        <TabsContent value="generated" className="mt-0">
          {videoUrl ? (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Video scrubbing section */}
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">{t('upload.thumbnail.selectFrame')}</p>

                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onLoadedData={handleLoadedData}
                  onSeeked={handleSeeked}
                  preload="auto"
                  className="rounded border w-full max-h-80 object-contain bg-black"
                  muted
                  crossOrigin="anonymous"
                />
                <canvas ref={canvasRef} className="hidden" />

                <div className="space-y-1 pt-2">
                  <Slider
                    value={[currentVideoTime]}
                    max={videoDuration}
                    step={0.1}
                    onValueChange={handleSliderChange}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatTime(currentVideoTime)}</span>
                    <span>{formatTime(videoDuration)}</span>
                  </div>
                </div>
              </div>

              {/* Thumbnail preview section */}
              <div className="lg:w-72 space-y-2">
                <Label className="text-sm font-medium">
                  {t('upload.thumbnail.thumbnailPreview')}
                </Label>
                {previewBlob && (
                  <div className="flex flex-col gap-3">
                    <div className="relative w-full min-h-20">
                      {!isPreviewImageLoaded && (
                        <div className="absolute inset-0 rounded border bg-muted animate-pulse" />
                      )}
                      <img
                        src={URL.createObjectURL(previewBlob)}
                        alt={t('upload.thumbnail.thumbnailPreview')}
                        className={`rounded border w-full object-contain transition-opacity duration-200 ${isPreviewImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setIsPreviewImageLoaded(true)}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleSetThumbnail}
                      disabled={!hasUnsavedChanges || thumbnailUploadInfo.uploading}
                      className="w-full"
                    >
                      {thumbnailUploadInfo.uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('upload.thumbnail.uploadingThumbnail')}
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          {t('upload.thumbnail.setAsThumbnail')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm py-4 text-center border rounded-md border-dashed">
              {t('upload.thumbnail.noVideoFile')}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const format = (num: number) => (num < 10 ? '0' + num : num)
  return `${format(minutes)}:${format(remainingSeconds)}`
}
