import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useDvmTranscode, type TranscodeStatus } from '@/hooks/useDvmTranscode'
import type { VideoVariant } from '@/lib/video-processing'
import { shouldOfferTranscode } from '@/lib/dvm-utils'
import { Loader2, Wand2, X, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'

interface DvmTranscodeAlertProps {
  video: VideoVariant
  onComplete: (transcodedVideo: VideoVariant) => void
  onStatusChange?: (status: TranscodeStatus) => void
}

/**
 * Alert component that offers DVM transcoding for high-resolution or incompatible videos.
 * Shown in Step 1 of the upload wizard below VideoVariantsTable.
 */
export function DvmTranscodeAlert({ video, onComplete, onStatusChange }: DvmTranscodeAlertProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  const { status, progress, error, startTranscode, cancel, transcodedVideo } = useDvmTranscode(
    transcodedVideo => {
      onComplete(transcodedVideo)
    }
  )

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // Check if transcode should be offered
  const transcodeCheck = shouldOfferTranscode(video)

  // Don't show if not needed or dismissed
  if (!transcodeCheck.needed || dismissed) {
    return null
  }

  // Don't show after completion (component will be unmounted by parent)
  if (status === 'complete' && transcodedVideo) {
    return null
  }

  const getInputVideoUrl = (): string => {
    if (video.inputMethod === 'url' && video.url) {
      return video.url
    }
    return video.uploadedBlobs[0]?.url || video.url || ''
  }

  const handleStartTranscode = () => {
    const inputUrl = getInputVideoUrl()
    if (inputUrl) {
      startTranscode(inputUrl)
    }
  }

  // Idle state: Show prompt with buttons
  if (status === 'idle') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.title', { defaultValue: 'Create 720p Version?' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          <p className="mb-3">
            {t('upload.transcode.reason', {
              defaultValue: transcodeCheck.reason,
              reason: transcodeCheck.reason,
            })}{' '}
            {t('upload.transcode.suggestion', {
              defaultValue:
                'Creating a 720p version improves playback compatibility across all devices.',
            })}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleStartTranscode} className="cursor-pointer">
              <Wand2 className="h-4 w-4 mr-2" />
              {t('upload.transcode.create720p', { defaultValue: 'Create 720p Version' })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDismissed(true)}
              className="cursor-pointer"
            >
              {t('upload.transcode.skip', { defaultValue: 'Skip' })}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Discovering state
  if (status === 'discovering') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.discovering', { defaultValue: 'Finding transcoding service...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {progress.message}
        </AlertDescription>
      </Alert>
    )
  }

  // Transcoding state
  if (status === 'transcoding') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.transcoding', { defaultValue: 'Transcoding video...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          <p className="mb-2">{progress.message}</p>
          {progress.percentage !== undefined && (
            <div className="space-y-1 mb-3">
              <Progress value={progress.percentage} className="h-2" />
              <p className="text-xs text-right">{progress.percentage}%</p>
            </div>
          )}
          {progress.eta !== undefined && (
            <p className="text-xs mb-3">
              {t('upload.transcode.eta', {
                defaultValue: 'Estimated time remaining: {{time}}',
                time: formatEta(progress.eta),
              })}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={cancel} className="cursor-pointer">
            <X className="h-4 w-4 mr-2" />
            {t('upload.transcode.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  // Mirroring state
  if (status === 'mirroring') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.mirroring', { defaultValue: 'Copying to your servers...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          <p className="mb-3">{progress.message}</p>
          <Button size="sm" variant="outline" onClick={cancel} className="cursor-pointer">
            <X className="h-4 w-4 mr-2" />
            {t('upload.transcode.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>
          {t('upload.transcode.error', { defaultValue: 'Transcoding failed' })}
        </AlertTitle>
        <AlertDescription>
          <p className="mb-3">{error}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartTranscode}
              className="cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('upload.transcode.retry', { defaultValue: 'Retry' })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDismissed(true)}
              className="cursor-pointer"
            >
              {t('upload.transcode.dismiss', { defaultValue: 'Dismiss' })}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Complete state (briefly shown before component unmounts)
  if (status === 'complete') {
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-200">
          {t('upload.transcode.complete', { defaultValue: 'Transcode complete!' })}
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          {t('upload.transcode.completeMessage', {
            defaultValue: '720p version has been added to your video.',
          })}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

/**
 * Format ETA in human-readable format
 */
function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
