import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { InputMethodSelector } from '@/components/video-upload/InputMethodSelector'
import { FileDropzone } from '@/components/video-upload/FileDropzone'
import { UrlInputSection } from '@/components/video-upload/UrlInputSection'
import { useVideoFileUpload } from '@/hooks/useVideoFileUpload'
import { useCurrentUser, useAppContext } from '@/hooks'
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

  const signer = user
    ? async (draft: Parameters<typeof user.signer.signEvent>[0]) =>
        await user.signer.signEvent(draft)
    : undefined

  const upload = useVideoFileUpload({
    initialUploadServers: blossomInitialUploadServers,
    mirrorServers: blossomMirrorServers,
    signer: signer!,
  })

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

      // Publish mirror announcements (non-blocking)
      if (
        upload.result.mirroredBlobs.length > 0 &&
        upload.result.uploadedBlobs[0]?.sha256 &&
        videoEventInfo
      ) {
        try {
          const relayHint = writeRelays[0] || ''
          const announcements: MirrorAnnouncementOptions[] = [
            {
              blob: {
                type: 'video',
                variant: {
                  url: upload.result.url || '',
                  hash: upload.result.uploadedBlobs[0].sha256,
                  size: upload.result.sizeMB
                    ? Math.round(upload.result.sizeMB * 1024 * 1024)
                    : undefined,
                  dimensions: upload.result.dimension,
                  mimeType: upload.result.file?.type,
                  quality: upload.result.qualityLabel,
                  fallbackUrls: upload.result.mirroredBlobs.map(b => b.url),
                },
                label: `Video ${upload.result.qualityLabel || upload.result.dimension}`,
                hash: upload.result.uploadedBlobs[0].sha256,
                ext: 'mp4',
              },
              mirrorResults: upload.result.mirroredBlobs,
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
      }

      onComplete(newTag)
    } catch (err) {
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
          onClick={onCancel}
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
          onClick={onCancel}
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
