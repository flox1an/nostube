import { useState, useCallback, useMemo, useRef } from 'react'
import { Button } from '@nostube/widgets/components/button'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import { Label } from '@nostube/widgets/components/label'
import { Progress } from '@nostube/widgets/components/progress'
import { type ChunkedUploadProgress } from '@/lib/blossom-upload'
import { type BlobDescriptor } from '@/lib/blossom-auth'
import {
  type VideoVariant,
  createBlobPlacement,
  processUploadedVideo,
  processVideoUrl,
} from '@/lib/video-processing'
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_MAX_CONCURRENT_CHUNKS,
  trackBlobActivity,
  type BlobActivity,
} from '@/lib/transcode-upload'
import { parseBlossomUrl } from '@nostube/core/blossom-url'
import { InputMethodSelector } from '@/components/video-upload/InputMethodSelector'

import { FileDropzone } from '@nostube/widgets/components/FileDropzone'
import { UrlInputSection } from '@/components/video-upload/UrlInputSection'
import { useCurrentUser, useAppContext } from '@/hooks'

type VideoFileUploadStatus = 'idle' | 'uploading' | 'probing' | 'mirroring' | 'done' | 'error'
import { buildImetaTagFromParsed, type ParsedImeta } from '@/lib/imeta-builder'
import { deleteBlobsFromServers } from '@/lib/blossom-upload'
import {
  publishMirrorAnnouncements,
  getMirrorAnnouncementRelays,
  type MirrorAnnouncementOptions,
} from '@/lib/mirror-announcements'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/** Mirrored copies are verified same-hash locations, so they belong in the published placement. */
function withMirroredBlobs(variant: VideoVariant, blobs: BlobDescriptor[]): VideoVariant {
  const mirroredBlobs = [
    ...variant.mirroredBlobs,
    ...blobs.filter(blob => !variant.mirroredBlobs.some(existing => existing.url === blob.url)),
  ]
  return {
    ...variant,
    mirroredBlobs,
    placement: createBlobPlacement({
      primaryBlob: variant.placement.primaryBlob,
      candidateBlobs: [...variant.uploadedBlobs, ...mirroredBlobs],
      directUrl: variant.placement.directUrl,
    }),
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | undefined)?.name === 'AbortError'
}

interface ReplaceVideoFlowProps {
  originalImeta?: ParsedImeta // undefined when adding new variant
  thumbnailUrls: string[]
  blurhash?: string
  onComplete: (newImetaTag: string[]) => void
  onCancel: () => void
  writeRelays?: string[]
  videoEventInfo?: {
    id: string
    kind: number
    pubkey: string
    dTag?: string
  }
}

export function ReplaceVideoFlow({
  originalImeta,
  thumbnailUrls,
  blurhash,
  onComplete,
  onCancel,
  writeRelays = [],
  videoEventInfo,
}: ReplaceVideoFlowProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config } = useAppContext()

  const [inputMethod, setInputMethod] = useState<'file' | 'url'>('file')
  const [videoUrl, setVideoUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [deleteOldFiles, setDeleteOldFiles] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)

  const blossomInitialUploadServers = (
    config.blossomServers?.filter(server => server.tags.includes('initial upload')) || []
  ).map(s => s.url)

  const blossomMirrorServers = (
    config.blossomServers?.filter(server => server.tags.includes('mirror')) || []
  ).map(s => s.url)

  const signer = useMemo(
    () =>
      user
        ? async (draft: Parameters<typeof user.signer.signEvent>[0]) =>
            await user.signer.signEvent(draft)
        : undefined,
    [user]
  )

  // Inlined from useVideoFileUpload (its only consumer — #44): upload → probe → mirror,
  // or probe a URL with best-effort mirroring of Blossom sources.
  const [status, setStatus] = useState<VideoFileUploadStatus>('idle')
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [mirrorProgress, setMirrorProgress] = useState<{ completed: number; total: number } | null>(
    null
  )
  const [result, setResult] = useState<VideoVariant | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // The running operation; its retries only touch the result that operation produced.
  const operationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const resultRef = useRef<VideoVariant | null>(null)
  // Set once the imeta tag is built: later mirror retries can only reach 1063 announcements.
  const confirmedRef = useRef(false)

  const resetUpload = useCallback(() => {
    operationRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    resultRef.current = null
    setStatus('idle')
    setUploadProgress(null)
    setMirrorProgress(null)
    setResult(null)
    setUploadError(null)
  }, [])

  const announceMirrors = useCallback(
    async (variant: VideoVariant) => {
      const hash = variant.uploadedBlobs[0]?.sha256
      if (!user || !videoEventInfo || !hash || variant.mirroredBlobs.length === 0) return
      try {
        const relayHint = writeRelays[0] || ''
        const announcements: MirrorAnnouncementOptions[] = [
          {
            blob: {
              type: 'video',
              variant: {
                url: variant.url || '',
                hash,
                size: variant.sizeMB ? Math.round(variant.sizeMB * 1024 * 1024) : undefined,
                dimensions: variant.dimension,
                mimeType: variant.file?.type,
                quality: variant.qualityLabel,
                fallbackUrls: variant.mirroredBlobs.map(b => b.url),
              },
              label: `Video ${variant.qualityLabel || variant.dimension}`,
              hash,
              ext: 'mp4',
            },
            mirrorResults: variant.mirroredBlobs,
            videoEvent: {
              id: videoEventInfo.id,
              kind: videoEventInfo.kind,
              pubkey: videoEventInfo.pubkey,
              dTag: videoEventInfo.dTag,
            },
            relayHint,
          },
        ]

        const publishRelays = getMirrorAnnouncementRelays(writeRelays, writeRelays)
        await publishMirrorAnnouncements(
          announcements,
          { signEvent: async eventTemplate => await user.signer.signEvent(eventTemplate) },
          publishRelays
        )
      } catch (err) {
        console.warn('Failed to publish mirror announcements:', err)
      }
    },
    [user, videoEventInfo, writeRelays]
  )

  // A retried mirror lands after the result exists: fold the copies into the pending
  // replacement, and announce them when the imeta tag was already handed off.
  const mirrorRetryFor = useCallback(
    (operation: number) => (blobs: BlobDescriptor[]) => {
      if (operation !== operationRef.current || !resultRef.current) return
      const merged = withMirroredBlobs(resultRef.current, blobs)
      resultRef.current = merged
      setResult(merged)
      if (confirmedRef.current) void announceMirrors(merged)
    },
    [announceMirrors]
  )

  const uploadFile = useCallback(
    async (file: File): Promise<VideoVariant> => {
      const operation = ++operationRef.current
      const controller = new AbortController()
      controllerRef.current = controller
      resultRef.current = null
      setUploadError(null)
      setResult(null)
      setMirrorProgress(null)

      // One status entry for the whole replacement: upload, probe and mirrors.
      const activity = trackBlobActivity(file.name, signer!, {
        cancel: () => controller.abort(),
        onMirrorRetry: mirrorRetryFor(operation),
      })
      try {
        // Step 1: Upload
        setStatus('uploading')
        setUploadProgress({
          uploadedBytes: 0,
          totalBytes: file.size,
          percentage: 0,
          currentChunk: 0,
          totalChunks: 1,
        })

        const uploadedBlobs = await activity.upload({
          file,
          servers: blossomInitialUploadServers,
          options: {
            chunkSize: DEFAULT_CHUNK_SIZE,
            maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS,
          },
          callbacks: {
            onProgress: progress => {
              setUploadProgress(progress)
              activity.bytes(progress.uploadedBytes, progress.totalBytes)
            },
          },
          signal: controller.signal,
        })

        // Step 2: Probe video metadata
        setStatus('probing')
        setUploadProgress(null)
        const videoVariant = await processUploadedVideo(file, uploadedBlobs)

        // Step 3: Mirror
        let mirroredBlobs: BlobDescriptor[] = []
        if (blossomMirrorServers.length > 0 && uploadedBlobs[0]) {
          setStatus('mirroring')
          setMirrorProgress({ completed: 0, total: blossomMirrorServers.length })
          activity.set({
            phase: 'mirroring',
            completed: 0,
            total: uploadedBlobs[0].size * blossomMirrorServers.length,
            unit: 'bytes',
          })

          mirroredBlobs = await activity.mirror(
            uploadedBlobs[0],
            blossomMirrorServers,
            controller.signal
          )

          setMirrorProgress({ completed: mirroredBlobs.length, total: blossomMirrorServers.length })
        }

        const finalVariant = withMirroredBlobs(videoVariant, mirroredBlobs)
        resultRef.current = finalVariant
        setResult(finalVariant)
        setStatus('done')
        activity.finish()
        return finalVariant
      } catch (err) {
        activity.finish(err)
        if (isAbortError(err)) {
          if (operation === operationRef.current) resetUpload()
          throw err
        }
        const message = err instanceof Error ? err.message : 'Unknown upload error'
        setUploadError(message)
        setStatus('error')
        throw err
      }
    },
    [blossomInitialUploadServers, blossomMirrorServers, signer, mirrorRetryFor, resetUpload]
  )

  const processUrl = useCallback(
    async (url: string): Promise<VideoVariant> => {
      const operation = ++operationRef.current
      const controller = new AbortController()
      controllerRef.current = controller
      resultRef.current = null
      setUploadError(null)
      setResult(null)
      setUploadProgress(null)
      setMirrorProgress(null)

      let activity: BlobActivity | undefined
      try {
        setStatus('probing')

        // Check if it's a Blossom URL and mirror if possible
        const blossomInfo = parseBlossomUrl(url)
        let mirroredBlobs: BlobDescriptor[] = []

        if (blossomInfo.isBlossomUrl && blossomInfo.sha256 && blossomMirrorServers.length > 0) {
          activity = trackBlobActivity(url, signer!, {
            phase: 'mirroring',
            cancel: () => controller.abort(),
            onMirrorRetry: mirrorRetryFor(operation),
          })
          try {
            setStatus('mirroring')
            setMirrorProgress({ completed: 0, total: blossomMirrorServers.length })

            const originalBlob: BlobDescriptor = {
              url,
              sha256: blossomInfo.sha256,
              size: 0,
              type: 'video/mp4',
              uploaded: Date.now(),
            }

            mirroredBlobs = await activity.mirror(
              originalBlob,
              blossomMirrorServers,
              controller.signal
            )

            setMirrorProgress({
              completed: mirroredBlobs.length,
              total: blossomMirrorServers.length,
            })
          } catch (mirrorErr) {
            if (isAbortError(mirrorErr)) throw mirrorErr
            console.error('Failed to mirror Blossom URL:', mirrorErr)
          }
        }

        setStatus('probing')
        const videoVariant = await processVideoUrl(url, mirroredBlobs)

        resultRef.current = videoVariant
        setResult(videoVariant)
        setStatus('done')
        activity?.finish()
        return videoVariant
      } catch (err) {
        activity?.finish(err)
        if (isAbortError(err)) {
          if (operation === operationRef.current) resetUpload()
          throw err
        }
        const message = err instanceof Error ? err.message : 'Unknown error processing URL'
        setUploadError(message)
        setStatus('error')
        throw err
      }
    },
    [blossomMirrorServers, signer, mirrorRetryFor, resetUpload]
  )

  // Leaving the flow drops the replacement, so stop its transfers too.
  const handleCancel = useCallback(() => {
    controllerRef.current?.abort()
    onCancel()
  }, [onCancel])

  const upload = useMemo(
    () => ({
      status,
      uploadProgress,
      mirrorProgress,
      result,
      error: uploadError,
      uploadFile,
      processUrl,
      reset: resetUpload,
    }),
    [
      status,
      uploadProgress,
      mirrorProgress,
      result,
      uploadError,
      uploadFile,
      processUrl,
      resetUpload,
    ]
  )

  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles[0] || !signer) return
      setSelectedFile(acceptedFiles[0])
      try {
        await upload.uploadFile(acceptedFiles[0])
      } catch {
        // error is already set in the hook
      }
    },
    [signer, upload]
  )

  const handleProcessUrl = useCallback(async () => {
    if (!videoUrl || !signer) return
    try {
      await upload.processUrl(videoUrl)
    } catch {
      // error is already set in the hook
    }
  }, [videoUrl, signer, upload])

  const handleConfirm = async () => {
    if (!upload.result || !user) return
    setIsConfirming(true)

    try {
      confirmedRef.current = true
      // Build new imeta tag
      const newTag = buildImetaTagFromParsed({
        variant: upload.result,
        originalImeta,
        thumbnailUrls,
        blurhash,
      })

      // Delete old files if requested (best-effort)
      if (deleteOldFiles && originalImeta?.hash) {
        try {
          const result = await deleteBlobsFromServers(
            // Build blob descriptors from the original imeta URLs
            [originalImeta.url, ...originalImeta.fallbackUrls]
              .map(url => {
                try {
                  const urlObj = new URL(url)
                  return {
                    url,
                    sha256: originalImeta.hash!,
                    size: originalImeta.size || 0,
                    type: originalImeta.mimeType || 'video/mp4',
                    uploaded: 0,
                    server: `${urlObj.protocol}//${urlObj.host}`,
                  }
                } catch {
                  return null
                }
              })
              .filter(Boolean) as Array<{
              url: string
              sha256: string
              size: number
              type: string
              uploaded: number
            }>,
            async draft => await user.signer.signEvent(draft)
          )

          if (result.totalFailed > 0) {
            toast.warning(
              t('editVideo.deletePartialFail', {
                successful: result.totalSuccessful,
                failed: result.totalFailed,
              })
            )
          }
        } catch (err) {
          console.warn('Failed to delete old files:', err)
        }
      }

      // Publish mirror announcements (best-effort)
      await announceMirrors(upload.result)

      onComplete(newTag)
    } catch (err) {
      confirmedRef.current = false
      console.error('Failed to confirm replacement:', err)
      toast.error(t('editVideo.replaceFailed'))
    } finally {
      setIsConfirming(false)
    }
  }

  const isProcessing =
    upload.status !== 'idle' && upload.status !== 'done' && upload.status !== 'error'
  const isDone = upload.status === 'done'
  const hasError = upload.status === 'error'
  const hasOriginalHash = Boolean(originalImeta?.hash)

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {originalImeta
            ? t('editVideo.replacing', { quality: originalImeta.quality || '?' })
            : t('editVideo.addingVariant')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCancel}
          disabled={isConfirming}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Input method selector */}
      {upload.status === 'idle' && (
        <>
          <InputMethodSelector
            value={inputMethod}
            onChange={setInputMethod}
            disabled={isProcessing}
          />

          {inputMethod === 'file' ? (
            <FileDropzone
              onDrop={handleFileDrop}
              accept={{ 'video/*': [] }}
              disabled={isProcessing || !signer}
              selectedFile={selectedFile}
            />
          ) : (
            <UrlInputSection
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              onProcess={handleProcessUrl}
              isProcessing={isProcessing}
              disabled={!signer}
            />
          )}
        </>
      )}

      {/* Upload progress */}
      {upload.status === 'uploading' && upload.uploadProgress && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('editVideo.uploadProgress')}
          </div>
          <Progress value={upload.uploadProgress.percentage} />
          <div className="text-xs text-muted-foreground text-right">
            {upload.uploadProgress.percentage}%
            {upload.uploadProgress.speedMBps
              ? ` (${upload.uploadProgress.speedMBps.toFixed(1)} MB/s)`
              : ''}
          </div>
        </div>
      )}

      {/* Probing */}
      {upload.status === 'probing' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('editVideo.probing')}
        </div>
      )}

      {/* Mirror progress */}
      {upload.status === 'mirroring' && upload.mirrorProgress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('editVideo.mirrorProgress', {
            completed: upload.mirrorProgress.completed,
            total: upload.mirrorProgress.total,
          })}
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {upload.error}
        </div>
      )}

      {/* Result preview */}
      {isDone && upload.result && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {upload.result.qualityLabel || upload.result.dimension}
            </span>
            {upload.result.sizeMB && (
              <span className="text-muted-foreground">{upload.result.sizeMB.toFixed(1)} MB</span>
            )}
            {upload.result.videoCodec && (
              <span className="text-muted-foreground">{upload.result.videoCodec}</span>
            )}
          </div>

          {/* Orientation warning */}
          {originalImeta?.dimensions &&
            upload.result.dimension &&
            (() => {
              const [origW, origH] = originalImeta.dimensions!.split('x').map(Number)
              const [newW, newH] = upload.result!.dimension.split('x').map(Number)
              const origIsPortrait = origH > origW
              const newIsPortrait = newH > newW
              if (origIsPortrait !== newIsPortrait) {
                return (
                  <div className="flex items-center gap-2 text-xs text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    {t('editVideo.orientationWarning')}
                  </div>
                )
              }
              return null
            })()}

          {/* Delete old files checkbox */}
          {originalImeta && hasOriginalHash && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-old-files"
                checked={deleteOldFiles}
                onCheckedChange={checked => setDeleteOldFiles(checked === true)}
              />
              <Label htmlFor="delete-old-files" className="text-sm cursor-pointer">
                {t('editVideo.deleteOldFiles')}
              </Label>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isConfirming}
        >
          {t('common.cancel')}
        </Button>
        {(isDone || hasError) && (
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={!isDone || isConfirming}
          >
            {isConfirming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            {t('editVideo.replaceConfirm')}
          </Button>
        )}
      </div>
    </div>
  )
}
