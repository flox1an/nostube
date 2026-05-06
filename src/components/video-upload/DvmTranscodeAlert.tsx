import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  useDvmTranscodeManager,
  type TranscodeStatus,
  type StatusMessage,
} from '@/hooks/useDvmTranscodeManager'
import { useDvmTracker } from '@/hooks/useDvmTracker'
import { useUploadManager } from '@/providers/upload'
import type { VideoVariant } from '@/lib/video-processing'
import {
  AVAILABLE_RESOLUTIONS,
  type TranscodeCodec,
  getTranscodeRecommendation,
} from '@/lib/dvm-utils'
import { Loader2, Wand2, X, AlertCircle, RefreshCw, CheckCircle2, Circle, Bot } from 'lucide-react'
import type { TrackedDvm, DvmBid } from '@/lib/dvm-utils'
import { DvmSelector } from './DvmSelector'
import { DvmPayment } from './DvmPayment'
import { useAppContext } from '@/hooks/useAppContext'
import { DEFAULT_RELAYS } from '@/nostr/core'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useRef, useCallback } from 'react'

interface DvmTranscodeAlertProps {
  draftId: string
  video: VideoVariant
  existingResolutions?: string[]
  onComplete: (transcodedVideo: VideoVariant) => void
  onAllComplete?: () => void
  onStatusChange?: (status: TranscodeStatus) => void
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
}: DvmTranscodeAlertProps) {
  const { t } = useTranslation()
  const { config } = useAppContext()
  const [dismissed, setDismissed] = useState(false)
  // When multiple DVMs are available, show the selector before starting
  const [selectingDvm, setSelectingDvm] = useState(false)
  // Pending payment: set when DVM requires payment, cleared after payment or cancel
  const [pendingPayment, setPendingPayment] = useState<{
    bid: DvmBid
    requestEventId: string
    resolve: () => void
    reject: (err: Error) => void
  } | null>(null)

  const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
  const effectiveWriteRelays = writeRelays.length > 0 ? writeRelays : DEFAULT_RELAYS

  // Each variant is a resolution + codec pair
  interface VariantSelection {
    resolution: string
    codec: TranscodeCodec
  }

  // Default: 720p/h265 + 360p/h264, excluding already-existing resolutions
  const [selectedVariants, setSelectedVariants] = useState<VariantSelection[]>(() => {
    const defaults: VariantSelection[] = []
    if (!existingResolutions.includes('720p')) defaults.push({ resolution: '720p', codec: 'h265' })
    if (!existingResolutions.includes('360p')) defaults.push({ resolution: '360p', codec: 'h264' })
    return defaults
  })
  const hasResumedRef = useRef(false)

  // Check if a DVM is available (only check if not resuming)
  const { isDvmAvailable, isLoading: isDvmLoading, dvmHandlers } = useDvmTracker()
  const uploadManager = useUploadManager()
  const activeTask = uploadManager.getTask(draftId)
  const isResuming = !!activeTask?.transcodeState

  // Use the manager-backed hook for background transcoding
  const { status, progress, error, startTranscode, resumeTranscode, cancel, transcodedVideo } =
    useDvmTranscodeManager({
      taskId: draftId,
      onComplete,
      onAllComplete,
    })

  // Auto-resume if there's an active task in the manager.
  useEffect(() => {
    if (isResuming && !hasResumedRef.current && status === 'idle') {
      hasResumedRef.current = true
      resumeTranscode()
    }
  }, [isResuming, status, resumeTranscode])

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // Called by UploadManagerProvider when the DVM requires payment before processing.
  // Returns a promise that resolves when the user completes payment, rejects if cancelled.
  const onPaymentRequired = useCallback(
    (bid: DvmBid): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const requestEventId = uploadManager.getTask(draftId)?.transcodeState?.requestEventId ?? ''
        setPendingPayment({ bid, requestEventId, resolve, reject })
      })
    },
    [uploadManager, draftId]
  )

  // Debug logging
  if (import.meta.env.DEV) {
    console.debug('[DvmTranscodeAlert] State:', {
      isResuming,
      isDvmAvailable,
      isDvmLoading,
      dismissed,
      video: { dimension: video.dimension, videoCodec: video.videoCodec },
    })
  }

  // Don't show if dismissed
  if (dismissed) {
    return null
  }

  // Don't show if still checking for DVM availability (unless resuming)
  if (!isResuming && isDvmLoading) {
    return null
  }

  // Don't show if no DVM is available (unless resuming an active transcode)
  if (!isResuming && !isDvmAvailable) {
    if (import.meta.env.DEV) {
      console.log('[DvmTranscodeAlert] Hidden: no DVM available')
    }
    return null
  }

  // Don't show after completion (component will be unmounted by parent)
  if (status === 'complete' && transcodedVideo) {
    return null
  }

  // Payment pending — show payment UI (interrupts all other states)
  if (pendingPayment) {
    return (
      <DvmPayment
        bid={pendingPayment.bid}
        requestEventId={pendingPayment.requestEventId}
        writeRelays={effectiveWriteRelays}
        onPaid={() => {
          const p = pendingPayment
          setPendingPayment(null)
          p.resolve()
        }}
        onCancel={() => {
          const p = pendingPayment
          setPendingPayment(null)
          p.reject(new Error('Payment cancelled'))
        }}
      />
    )
  }

  const getInputVideoUrl = (): string => {
    if (video.inputMethod === 'url' && video.url) {
      return video.url
    }
    return video.uploadedBlobs[0]?.url || video.url || ''
  }

  const getSortedVariants = () => {
    return [...effectiveVariants].sort((a, b) => {
      const aIndex = AVAILABLE_RESOLUTIONS.indexOf(
        a.resolution as (typeof AVAILABLE_RESOLUTIONS)[number]
      )
      const bIndex = AVAILABLE_RESOLUTIONS.indexOf(
        b.resolution as (typeof AVAILABLE_RESOLUTIONS)[number]
      )
      return aIndex - bIndex
    })
  }

  const handleStartTranscode = (dvmPubkey?: string) => {
    const inputUrl = getInputVideoUrl()
    if (inputUrl && effectiveVariants.length > 0) {
      const sortedVariants = getSortedVariants()
      const resolutions = sortedVariants.map(v => v.resolution)
      const codecMap: Record<string, TranscodeCodec> = {}
      for (const v of sortedVariants) {
        codecMap[v.resolution] = v.codec
      }
      startTranscode(inputUrl, video.duration, resolutions, codecMap, dvmPubkey, onPaymentRequired)
    }
  }

  const handleCreateSelected = () => {
    if (effectiveVariants.length === 0) return
    // If multiple DVMs are available, let the user pick one first
    if (dvmHandlers.size > 1) {
      setSelectingDvm(true)
    } else {
      handleStartTranscode()
    }
  }

  const handleDvmSelected = (dvmPubkey: string) => {
    setSelectingDvm(false)
    handleStartTranscode(dvmPubkey)
  }

  const toggleResolution = (resolution: string) => {
    setSelectedVariants(prev => {
      const exists = prev.find(v => v.resolution === resolution)
      if (exists) return prev.filter(v => v.resolution !== resolution)
      // Default codec for newly toggled resolutions
      const defaultCodec: TranscodeCodec = resolution === '360p' ? 'h264' : 'h265'
      return [...prev, { resolution, codec: defaultCodec }]
    })
  }

  const toggleCodec = (resolution: string) => {
    setSelectedVariants(prev =>
      prev.map(v =>
        v.resolution === resolution ? { ...v, codec: v.codec === 'h264' ? 'h265' : 'h264' } : v
      )
    )
  }

  const isResolutionDisabled = (resolution: string) => {
    return existingResolutions.includes(resolution)
  }

  // Derive effective selections: exclude any resolutions that now exist
  const effectiveVariants = selectedVariants.filter(
    v => !existingResolutions.includes(v.resolution)
  )

  const hasSelectableResolutions = AVAILABLE_RESOLUTIONS.some(r => !isResolutionDisabled(r))

  // Idle state: Show prompt with resolution checkboxes (and optionally DVM selector)
  if (status === 'idle') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.title', { defaultValue: 'Create Additional Versions?' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {selectingDvm ? (
            <>
              <DvmSelector
                dvms={Array.from(dvmHandlers.values())}
                selectedResolutions={getSortedVariants().map(v => v.resolution)}
                videoDurationSecs={video.duration}
                onSelect={handleDvmSelected}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectingDvm(false)}
                className="mt-2 cursor-pointer"
              >
                Back
              </Button>
            </>
          ) : (
            <>
              <p className="mb-3">{getTranscodeRecommendation(video).message}</p>
              {hasSelectableResolutions ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-4">
                    {AVAILABLE_RESOLUTIONS.map(resolution => {
                      const disabled = isResolutionDisabled(resolution)
                      const variant = effectiveVariants.find(v => v.resolution === resolution)
                      const checked = !!variant
                      return (
                        <div key={resolution} className="flex items-center gap-2">
                          <label
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
                            </span>
                          </label>
                          {checked && !disabled && (
                            <button
                              type="button"
                              onClick={() => toggleCodec(resolution)}
                              className="text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 cursor-pointer"
                            >
                              {variant.codec === 'h265' ? 'H.265' : 'H.264'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateSelected}
                      disabled={effectiveVariants.length === 0}
                      className="cursor-pointer"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      {t('upload.transcode.createSelected', {
                        defaultValue: 'Create Selected',
                        count: effectiveVariants.length,
                      })}
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
            </>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  // Resolve the active DVM info from the tracker
  const activeDvm = progress.dvmPubkey ? dvmHandlers.get(progress.dvmPubkey) : undefined

  // Discovering state
  if (status === 'discovering' || status === 'bidding') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {status === 'bidding'
            ? t('upload.transcode.bidding', { defaultValue: 'Waiting for DVM bids...' })
            : t('upload.transcode.discovering', { defaultValue: 'Finding transcoding service...' })}
          <span className="ml-1 text-sm text-blue-700 dark:text-blue-300">
            ({t('common.pleaseWait', { defaultValue: 'Please wait...' })})
          </span>
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {progress.message}
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
          <span className="ml-1 text-sm text-blue-700 dark:text-blue-300">
            ({t('common.pleaseWait', { defaultValue: 'Please wait...' })})
          </span>
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {activeDvm && <DvmInfoBanner dvm={activeDvm} />}
          <StatusLog messages={progress.statusMessages} />
        </AlertDescription>
      </Alert>
    )
  }

  // Active transcoding/mirroring state - show per-variant progress
  if (status === 'transcoding' || status === 'mirroring') {
    const queue = progress.queue
    const resolutions = queue?.resolutions || []
    const currentIndex = queue?.currentIndex ?? 0
    const completed = queue?.completed || []

    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">
          {t('upload.transcode.transcoding', { defaultValue: 'Transcoding video...' })}
        </AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          {activeDvm && <DvmInfoBanner dvm={activeDvm} />}
          <div className="divide-y divide-blue-200/50 dark:divide-blue-800/50">
            {resolutions.map((resolution, index) => {
              const isCompleted = completed.includes(resolution)
              const isCurrent = index === currentIndex && !isCompleted
              const isWaiting = index > currentIndex && !isCompleted

              return (
                <TranscodeVariantProgress
                  key={resolution}
                  resolution={resolution}
                  isActive={isCurrent}
                  isCompleted={isCompleted}
                  isWaiting={isWaiting}
                  phase={isCurrent ? progress.phase : undefined}
                  percentage={isCurrent ? progress.percentage : undefined}
                  eta={isCurrent ? progress.eta : undefined}
                  statusMessages={isCurrent ? progress.statusMessages : undefined}
                />
              )
            })}
          </div>
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
        <div className="flex-1">
          <AlertTitle className="flex justify-between items-center">
            {t('upload.transcode.error', { defaultValue: 'Transcoding failed' })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="h-6 w-6 p-0 hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartTranscode()}
                className="cursor-pointer bg-transparent border-destructive-foreground/20"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('upload.transcode.retry', { defaultValue: 'Retry' })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancel}
                className="cursor-pointer bg-transparent border-destructive-foreground/20"
              >
                {t('upload.transcode.back', { defaultValue: 'Back' })}
              </Button>
            </div>
          </AlertDescription>
        </div>
      </Alert>
    )
  }

  // Complete state (briefly shown before component unmounts)
  if (status === 'complete') {
    const completedCount = progress.queue?.completed?.length || 1
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <div className="flex-1">
          <AlertTitle className="text-green-800 dark:text-green-200 flex justify-between items-center">
            {t('upload.transcode.complete', { defaultValue: 'Transcode complete!' })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            <p className="mb-3">
              {completedCount > 1
                ? t('upload.transcode.completeMessageMulti', {
                    defaultValue: '{{count}} versions have been added to your video.',
                    count: completedCount,
                  })
                : t('upload.transcode.completeMessage', {
                    defaultValue: 'New version has been added to your video.',
                  })}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={cancel}
              className="cursor-pointer border-green-300 hover:bg-green-100 dark:border-green-800 dark:hover:bg-green-900"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('upload.transcode.createMore', { defaultValue: 'Create More' })}
            </Button>
          </AlertDescription>
        </div>
      </Alert>
    )
  }

  return null
}

/**
 * Banner showing DVM name and description above progress
 */
function DvmInfoBanner({ dvm }: { dvm: TrackedDvm }) {
  return (
    <div className="flex items-start gap-2 mb-3 rounded bg-blue-100/50 dark:bg-blue-900/30 p-2">
      <Bot className="h-4 w-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-400" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {dvm.name || dvm.pubkey.substring(0, 12) + '...'}
        </div>
        {dvm.about && (
          <div className="text-xs text-blue-600 dark:text-blue-400 line-clamp-2">{dvm.about}</div>
        )}
      </div>
    </div>
  )
}

type PhaseStep = 'transcoding' | 'uploading' | 'mirroring'

const PHASE_ORDER: PhaseStep[] = ['transcoding', 'uploading', 'mirroring']

function getPhaseIndex(phase?: PhaseStep): number {
  if (!phase) return 0
  return PHASE_ORDER.indexOf(phase)
}

interface VariantProgressProps {
  resolution: string
  isActive: boolean
  isCompleted: boolean
  isWaiting: boolean
  phase?: PhaseStep
  percentage?: number
  eta?: number
  statusMessages?: StatusMessage[]
}

function TranscodeVariantProgress({
  resolution,
  isActive,
  isCompleted,
  isWaiting,
  phase,
  percentage,
  eta,
  statusMessages,
}: VariantProgressProps) {
  const { t } = useTranslation()

  const phaseLabels = [
    t('upload.transcode.phaseReencoding', { defaultValue: 'Re-encoding' }),
    t('upload.transcode.phaseUploading', { defaultValue: 'Uploading' }),
    t('upload.transcode.phaseCopying', { defaultValue: 'Copying' }),
  ]

  const activePhaseIndex = isActive ? getPhaseIndex(phase) : -1

  return (
    <div className="py-2">
      {/* Resolution label */}
      <div className="text-sm font-medium mb-1.5">{resolution}</div>

      {/* Phase steps */}
      <div className="flex items-center gap-1 mb-1.5">
        {PHASE_ORDER.map((step, index) => {
          const isStepComplete = isCompleted || (isActive && activePhaseIndex > index)
          const isStepActive = isActive && activePhaseIndex === index
          const isStepWaiting = isWaiting || (isActive && activePhaseIndex < index)

          return (
            <div key={step} className="flex items-center gap-1">
              {index > 0 && (
                <div
                  className={`h-px w-4 ${isStepComplete ? 'bg-green-500 dark:bg-green-400' : 'bg-muted-foreground/30'}`}
                />
              )}
              <div className="flex items-center gap-1">
                {isStepComplete && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" />
                )}
                {isStepActive && (
                  <Loader2 className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 animate-spin shrink-0" />
                )}
                {isStepWaiting && (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span
                  className={`text-xs ${
                    isStepComplete
                      ? 'text-green-600 dark:text-green-400'
                      : isStepActive
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  {phaseLabels[index]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar for active variant */}
      {isActive && percentage !== undefined && (
        <div className="space-y-0.5">
          <Progress value={percentage} className="h-1.5 [&>div]:bg-blue-500" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{percentage}%</span>
            {eta !== undefined && <span>{formatEta(eta)}</span>}
          </div>
        </div>
      )}

      {/* Status log for active variant */}
      {isActive && statusMessages && statusMessages.length > 0 && (
        <StatusLog messages={statusMessages} />
      )}

      {/* Waiting label */}
      {isWaiting && (
        <p className="text-xs text-muted-foreground/50">
          {t('upload.transcode.waiting', { defaultValue: 'Waiting' })}
        </p>
      )}
    </div>
  )
}

/**
 * Component to display scrollable status message log
 */
function StatusLog({ messages = [] }: { messages?: StatusMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages?.length])

  if (!messages || messages.length === 0) {
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
