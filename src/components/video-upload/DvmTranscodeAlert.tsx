import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  useDvmTranscodeManager,
  type TranscodeStatus,
  type StatusMessage,
} from '@/hooks/useDvmTranscodeManager'
import { useDvmAvailability } from '@/hooks/useDvmAvailability'
import type { VideoVariant } from '@/lib/video-processing'
import type { DvmTranscodeState } from '@/types/upload-draft'
import { shouldOfferTranscode, AVAILABLE_RESOLUTIONS } from '@/lib/dvm-utils'
import { Loader2, Wand2, X, AlertCircle, RefreshCw, CheckCircle2, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useRef } from 'react'

interface DvmTranscodeAlertProps {
  draftId: string
  video: VideoVariant
  existingResolutions?: string[]
  onComplete: (transcodedVideo: VideoVariant) => void
  onAllComplete?: () => void
  onStatusChange?: (status: TranscodeStatus) => void
  initialTranscodeState?: DvmTranscodeState
  onTranscodeStateChange?: (state: DvmTranscodeState | null) => void
}

/**
 * Alert component that offers DVM transcoding for high-resolution or incompatible videos.
 * Shown in Step 1 of the upload wizard below VideoVariantsTable.
 */
export function DvmTranscodeAlert({
  draftId,
  video,
  existingResolutions = [],
  onComplete,
  onAllComplete,
  onStatusChange,
  initialTranscodeState,
}: DvmTranscodeAlertProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  // Default to 720p only if it doesn't already exist
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>(() =>
    existingResolutions.includes('720p') ? [] : ['720p']
  )
  const hasResumedRef = useRef(false)

  // Check if a DVM is available (only check if not resuming)
  const { isAvailable: isDvmAvailable, isLoading: isDvmLoading } = useDvmAvailability()

  // Use the manager-backed hook for background transcoding
  const { status, progress, error, startTranscode, resumeTranscode, cancel, transcodedVideo } =
    useDvmTranscodeManager({
      taskId: draftId,
      onComplete,
      onAllComplete,
    })

  // Auto-resume if we have initial state (or if there's an active task in the manager)
  useEffect(() => {
    if (initialTranscodeState && !hasResumedRef.current && status === 'idle') {
      hasResumedRef.current = true
      resumeTranscode()
    }
  }, [initialTranscodeState, status, resumeTranscode])

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // Check if transcode should be offered (skip check if resuming)
  const transcodeCheck = shouldOfferTranscode(video)
  const isResuming = !!initialTranscodeState

  // Don't show if not needed or dismissed (unless we're resuming)
  if ((!transcodeCheck.needed && !isResuming) || dismissed) {
    return null
  }

  // Don't show if still checking for DVM availability (unless resuming)
  if (!isResuming && isDvmLoading) {
    return null
  }

  // Don't show if no DVM is available (unless resuming an active transcode)
  if (!isResuming && !isDvmAvailable) {
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
    if (inputUrl && selectedResolutions.length > 0) {
      // Sort resolutions high to low using AVAILABLE_RESOLUTIONS order
      const sortedResolutions = [...selectedResolutions].sort((a, b) => {
        const aIndex = AVAILABLE_RESOLUTIONS.indexOf(a as (typeof AVAILABLE_RESOLUTIONS)[number])
        const bIndex = AVAILABLE_RESOLUTIONS.indexOf(b as (typeof AVAILABLE_RESOLUTIONS)[number])
        return aIndex - bIndex
      })
      startTranscode(inputUrl, video.duration, sortedResolutions)
    }
  }

  const toggleResolution = (resolution: string) => {
    setSelectedResolutions(prev =>
      prev.includes(resolution) ? prev.filter(r => r !== resolution) : [...prev, resolution]
    )
  }

  const isResolutionDisabled = (resolution: string) => {
    return existingResolutions.includes(resolution)
  }

  const hasSelectableResolutions = AVAILABLE_RESOLUTIONS.some(r => !isResolutionDisabled(r))

  // Idle state: Show prompt with resolution checkboxes
  if (status === 'idle') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.title', { defaultValue: 'Create Additional Versions?' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          <p className="mb-3">
            {t('upload.transcode.suggestion', {
              defaultValue:
                'Creating smaller versions improves playback compatibility across all devices.',
            })}
          </p>
          {hasSelectableResolutions ? (
            <>
              <div className="flex flex-wrap gap-4 mb-4">
                {AVAILABLE_RESOLUTIONS.map(resolution => {
                  const disabled = isResolutionDisabled(resolution)
                  const checked = selectedResolutions.includes(resolution)
                  return (
                    <label
                      key={resolution}
                      className={`flex items-center gap-2 ${
                        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => !disabled && toggleResolution(resolution)}
                        className="cursor-pointer"
                      />
                      <span className={disabled ? 'line-through' : ''}>
                        {resolution}
                        {disabled && (
                          <span className="text-xs ml-1 text-blue-500 dark:text-blue-400">
                            (exists)
                          </span>
                        )}
                        {resolution === '720p' && !disabled && (
                          <span className="text-xs ml-1 text-blue-500 dark:text-blue-400">
                            (default)
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleStartTranscode}
                  disabled={selectedResolutions.length === 0}
                  className="cursor-pointer"
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  {t('upload.transcode.createSelected', {
                    defaultValue: 'Create Selected',
                    count: selectedResolutions.length,
                  })}
                  {selectedResolutions.length > 0 && ` (${selectedResolutions.length})`}
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
            </>
          ) : (
            <p className="text-sm">
              {t('upload.transcode.allExist', {
                defaultValue: 'All available resolutions already exist.',
              })}
            </p>
          )}
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
          {progress.queue && <QueueStatus queue={progress.queue} />}
        </AlertDescription>
      </Alert>
    )
  }

  // Resuming state
  if (status === 'resuming') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.resuming', { defaultValue: 'Reconnecting to transcode...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {progress.queue && <QueueStatus queue={progress.queue} />}
          <StatusLog messages={progress.statusMessages} />
        </AlertDescription>
      </Alert>
    )
  }

  // Transcoding state
  if (status === 'transcoding') {
    const queue = progress.queue
    const currentResolution = queue?.resolutions?.[queue?.currentIndex ?? 0]
    const totalCount = queue?.resolutions?.length || 1
    const currentNum = (queue?.currentIndex ?? 0) + 1

    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {totalCount > 1
            ? t('upload.transcode.transcodingMulti', {
                defaultValue: 'Resolution {{current}} of {{total}}: {{resolution}}',
                current: currentNum,
                total: totalCount,
                resolution: currentResolution,
              })
            : t('upload.transcode.transcoding', { defaultValue: 'Transcoding video...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
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
          {queue && <QueueStatus queue={queue} />}
          <StatusLog messages={progress.statusMessages} />
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={cancel} className="cursor-pointer">
              <X className="h-4 w-4 mr-2" />
              {t('upload.transcode.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
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
          {progress.queue && <QueueStatus queue={progress.queue} />}
          <StatusLog messages={progress.statusMessages} />
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={cancel} className="cursor-pointer">
              <X className="h-4 w-4 mr-2" />
              {t('upload.transcode.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
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
    const completedCount = progress.queue?.completed.length || 1
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-200">
          {t('upload.transcode.complete', { defaultValue: 'Transcode complete!' })}
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          {completedCount > 1
            ? t('upload.transcode.completeMessageMulti', {
                defaultValue: '{{count}} versions have been added to your video.',
                count: completedCount,
              })
            : t('upload.transcode.completeMessage', {
                defaultValue: 'New version has been added to your video.',
              })}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

/**
 * Component to display queue status with icons
 */
function QueueStatus({
  queue,
}: {
  queue: { resolutions?: string[]; currentIndex?: number; completed?: string[] }
}) {
  if (!queue.resolutions || queue.resolutions.length <= 1) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mb-3 text-xs">
      {queue.resolutions.map((resolution, index) => {
        const isCompleted = queue.completed?.includes(resolution) ?? false
        const isCurrent = index === (queue.currentIndex ?? 0)
        const isWaiting = index > (queue.currentIndex ?? 0)

        return (
          <span key={resolution} className="flex items-center gap-1">
            {isCompleted && <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />}
            {isCurrent && <Loader2 className="h-3 w-3 animate-spin" />}
            {isWaiting && <Circle className="h-3 w-3 opacity-50" />}
            <span className={isCompleted ? 'text-green-600 dark:text-green-400' : ''}>
              {resolution}
            </span>
            {index < (queue.resolutions?.length ?? 0) - 1 && <span className="mx-1">•</span>}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Component to display scrollable status message log
 */
function StatusLog({ messages }: { messages: StatusMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  if (messages.length === 0) {
    return null
  }

  return (
    <div
      ref={scrollRef}
      className="mt-2 max-h-24 overflow-y-auto rounded bg-blue-100/50 dark:bg-blue-900/30 p-2 font-mono text-xs"
    >
      {messages.map((msg, index) => (
        <div key={index} className="flex gap-2 py-0.5">
          <span className="text-blue-500/70 dark:text-blue-400/70 shrink-0">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-blue-800 dark:text-blue-200">{msg.message}</span>
        </div>
      ))}
    </div>
  )
}

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
