import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import { formatDuration } from '@/lib/formatDuration'
import {
  BPP_MEDIUM,
  TARGET_FPS,
  assignMp4ResolutionCodecs,
  buildVariants,
  canUseOriginalHlsVariant,
  computeTargetDimensions,
  type ResolutionOption,
} from '@/lib/video-transcode'
import type { BrowserTranscodeVariant } from '@/lib/video-transcode'
import type { BrowserTranscodeState } from '@/types/upload-draft'
import { CheckCircle2, Layers, Loader2, Play, Upload, X, Zap } from 'lucide-react'
import { HlsPreviewDialog } from './HlsPreviewDialog'

interface BrowserTranscodeStepProps {
  file: File | null
  backgroundState?: BrowserTranscodeState
  /** Master playlist URL – shown as a Preview button when HLS upload is complete. */
  previewUrl?: string
  onStartBackground?: (
    variants: BrowserTranscodeVariant[],
    sourceMeta: NonNullable<ReturnType<typeof useVideoTranscode>['sourceMeta']>,
    keepOriginal: boolean
  ) => Promise<void>
  onComplete: (files: File[] | Map<string, File>) => void
  onSkip: () => void
}

function estimateRemainingSeconds(
  progress: number | undefined,
  startedAt: number,
  updatedAt?: number
): number | undefined {
  if (!progress || progress <= 0.01 || progress >= 0.99) return undefined
  const now = updatedAt ?? Date.now()
  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000)
  if (elapsedSeconds < 1) return undefined
  const totalSeconds = elapsedSeconds / progress
  const remaining = Math.round(totalSeconds - elapsedSeconds)
  if (!Number.isFinite(remaining) || remaining <= 0) return undefined
  return remaining
}

function estimateVariantSizeMB(
  variant: BrowserTranscodeVariant,
  sourceMeta: NonNullable<ReturnType<typeof useVideoTranscode>['sourceMeta']>
): number {
  if (variant.passthrough) return sourceMeta.sizeMB

  const { width, height } = computeTargetDimensions(
    sourceMeta.width,
    sourceMeta.height,
    variant.targetHeight
  )
  const videoBitrateBps = Math.round(width * height * TARGET_FPS * BPP_MEDIUM)
  const audioBitrateBps = 128_000
  const bytes = ((videoBitrateBps + audioBitrateBps) * sourceMeta.duration) / 8
  return bytes / (1024 * 1024)
}

function formatEstimatedSize(sizeMB: number): string {
  if (sizeMB < 1024) return `${sizeMB.toFixed(1)} MB`
  return `${(sizeMB / 1024).toFixed(2)} GB`
}

function getCodecLabel(codec: ResolutionOption['suggestedCodec']): string {
  return codec === 'hevc' ? 'HEVC' : 'H.264'
}

function getSourceVariantCodec(
  sourceMeta: NonNullable<ReturnType<typeof useVideoTranscode>['sourceMeta']>
): ResolutionOption['suggestedCodec'] {
  const codec = sourceMeta.videoCodec?.toLowerCase()
  return codec?.startsWith('hvc1') || codec?.startsWith('hev1') ? 'hevc' : 'avc'
}

export function BrowserTranscodeStep({
  file,
  backgroundState,
  previewUrl,
  onStartBackground,
  onComplete,
  onSkip,
}: BrowserTranscodeStepProps) {
  const SINGLE_MP4_MAX_SIZE_MB = 50
  const { t } = useTranslation()

  // Format + resolution state — local to this component
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'hls'>('mp4')
  const [selectedHeights, setSelectedHeights] = useState<number[] | null>(null)
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const {
    status,
    sourceMeta,
    availableResolutionOptions,
    variantProgress,
    error,
    supported,
    analyze,
    startTranscode,
    cancel,
  } = useVideoTranscode()

  const defaultSelectedHeights = useMemo(() => {
    if (status !== 'waiting' || availableResolutionOptions.length === 0) return []

    const heights = availableResolutionOptions.map(r => r.height)
    const sourceSizeMB = sourceMeta?.sizeMB ?? 0
    const useSingleMp4Default = sourceSizeMB > 0 && sourceSizeMB < SINGLE_MP4_MAX_SIZE_MB

    if (useSingleMp4Default) {
      const top = heights[heights.length - 1]
      return top ? [top] : []
    }

    const hlsDefaults = [720, 360].filter(height => heights.includes(height))
    if (hlsDefaults.length > 0) return hlsDefaults

    const top = heights[heights.length - 1]
    return top ? [top] : []
  }, [availableResolutionOptions, sourceMeta?.sizeMB, status])

  const effectiveSelectedHeights = selectedHeights ?? defaultSelectedHeights
  const supportsHevc = availableResolutionOptions.some(option => option.suggestedCodec === 'hevc')
  const sourceShortSide = sourceMeta ? Math.min(sourceMeta.width, sourceMeta.height) : undefined
  const hasOriginalHlsVariant =
    outputFormat === 'hls' && sourceMeta ? canUseOriginalHlsVariant(sourceMeta) : false
  const shouldShowBackgroundMessage = useMemo(() => {
    if (!backgroundState?.message) return false
    if (backgroundState.status !== 'transcoding') return true

    const normalized = backgroundState.message.trim().toLowerCase()
    return normalized !== 'transcoding video in background...'
  }, [backgroundState])

  const backgroundEtaSeconds = useMemo(() => {
    if (!backgroundState) return undefined

    if (backgroundState.status === 'uploading' && backgroundState.uploadProgress) {
      return estimateRemainingSeconds(
        backgroundState.uploadProgress.percentage / 100,
        backgroundState.startedAt,
        backgroundState.updatedAt
      )
    }

    if (backgroundState.status !== 'transcoding') return undefined
    if (backgroundState.variants.length === 0) return undefined

    const totalProgress = backgroundState.variants.reduce((sum, variant) => {
      if (variant.status === 'done') return sum + 1
      if (variant.status === 'active') return sum + variant.progress
      return sum
    }, 0)
    const avgProgress = totalProgress / backgroundState.variants.length

    return estimateRemainingSeconds(
      avgProgress,
      backgroundState.startedAt,
      backgroundState.updatedAt
    )
  }, [backgroundState])
  useEffect(() => {
    if (!file || !supported || backgroundState?.status) return
    analyze(file)
  }, [analyze, backgroundState?.status, file, supported])

  useEffect(() => {
    if (status !== 'waiting' || !sourceMeta) return
    setOutputFormat(sourceMeta.sizeMB < SINGLE_MP4_MAX_SIZE_MB ? 'mp4' : 'hls')
  }, [sourceMeta, status])

  const setHeightSelection = useCallback(
    (height: number, checked: boolean) => {
      setSelectedHeights(prev => {
        const current = prev ?? defaultSelectedHeights
        if (checked) {
          return current.includes(height) ? current : [...current, height]
        }
        return current.filter(h => h !== height)
      })
    },
    [defaultSelectedHeights]
  )

  /** Compute the variant array from current UI selections. */
  const computeVariants = useCallback((): BrowserTranscodeVariant[] => {
    const selected = availableResolutionOptions.filter(r =>
      effectiveSelectedHeights.includes(r.height)
    )
    // Apply codec policy for both MP4 and HLS: HEVC for higher resolutions, H.264 for lowest
    const selectedWithCodecs = assignMp4ResolutionCodecs(selected, supportsHevc)

    // Sort descending (highest first) — mediabunny expects highest bitrate first for HLS
    selectedWithCodecs.sort((a, b) => b.height - a.height)
    const variants = buildVariants(selectedWithCodecs, outputFormat)
    if (!sourceMeta || outputFormat !== 'hls' || !canUseOriginalHlsVariant(sourceMeta)) {
      return variants
    }

    const originalHeight = Math.min(sourceMeta.width, sourceMeta.height)
    const originalCodec = getSourceVariantCodec(sourceMeta)
    return variants.map(variant =>
      variant.targetHeight === originalHeight
        ? {
            ...variant,
            codec: originalCodec,
            label: `${originalHeight}p (original)`,
            passthrough: true,
          }
        : variant
    )
  }, [availableResolutionOptions, effectiveSelectedHeights, outputFormat, sourceMeta, supportsHevc])
  const estimatedOutputSizeMB = useMemo(() => {
    if (status !== 'waiting' || !sourceMeta) return undefined

    const variants = computeVariants()
    const transcodedEstimate = variants.reduce(
      (sum, variant) => sum + estimateVariantSizeMB(variant, sourceMeta),
      0
    )
    const includeOriginal = outputFormat === 'mp4' && keepOriginal
    return transcodedEstimate + (includeOriginal ? sourceMeta.sizeMB : 0)
  }, [computeVariants, keepOriginal, outputFormat, sourceMeta, status])

  const getDisplayCodecForHeight = useCallback(
    (height: number): ResolutionOption['suggestedCodec'] => {
      if (
        outputFormat === 'hls' &&
        hasOriginalHlsVariant &&
        sourceMeta &&
        height === sourceShortSide
      ) {
        return getSourceVariantCodec(sourceMeta)
      }

      const selectedForPreview = effectiveSelectedHeights.includes(height)
        ? effectiveSelectedHeights
        : [...effectiveSelectedHeights, height]
      const codecOptions = assignMp4ResolutionCodecs(
        selectedForPreview.map(selectedHeight => ({
          height: selectedHeight,
          suggestedCodec: 'avc' as const,
        })),
        supportsHevc
      )
      return codecOptions.find(option => option.height === height)?.suggestedCodec ?? 'avc'
    },
    [
      effectiveSelectedHeights,
      hasOriginalHlsVariant,
      outputFormat,
      sourceMeta,
      sourceShortSide,
      supportsHevc,
    ]
  )

  const handleStart = useCallback(async () => {
    if (!file) return

    try {
      if (!sourceMeta && keepOriginal) {
        onSkip()
        return
      }

      const variants = computeVariants()
      const shouldKeepOriginal = outputFormat === 'mp4' ? keepOriginal : false

      if (onStartBackground && sourceMeta) {
        await onStartBackground(variants, sourceMeta, shouldKeepOriginal)
        return
      }

      const results = await startTranscode(file)
      if (results instanceof Array) {
        onComplete(shouldKeepOriginal ? [...results, file] : results)
      } else {
        onComplete(results)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }, [
    file,
    keepOriginal,
    onComplete,
    onSkip,
    onStartBackground,
    sourceMeta,
    startTranscode,
    computeVariants,
    outputFormat,
  ])

  // ── Background state rendering ──────────────────────────────────────────────

  if (backgroundState) {
    if (backgroundState.status === 'complete') {
      return (
        <>
          {previewUrl && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>
                {t('upload.browserTranscode.complete', {
                  defaultValue: 'Transcode & upload complete',
                })}
              </AlertTitle>
              <AlertDescription>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {t('upload.browserTranscode.previewHls', { defaultValue: 'Preview HLS' })}
                </Button>
                <HlsPreviewDialog
                  url={previewUrl}
                  open={previewOpen}
                  onOpenChange={setPreviewOpen}
                />
              </AlertDescription>
            </Alert>
          )}
        </>
      )
    }

    return (
      <Alert variant={backgroundState.status === 'error' ? 'destructive' : 'default'}>
        {backgroundState.status === 'error' ? (
          <X className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        <AlertTitle>
          {backgroundState.status === 'uploading'
            ? t('upload.browserTranscode.backgroundUploading', {
                defaultValue: 'Uploading optimised video...',
              })
            : backgroundState.status === 'error'
              ? t('upload.browserTranscode.errorTitle', { defaultValue: 'Transcode failed' })
              : t('upload.browserTranscode.backgroundTranscoding', {
                  defaultValue: 'Optimising video in background...',
                })}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          {shouldShowBackgroundMessage && (
            <p className="text-sm text-muted-foreground">{backgroundState.message}</p>
          )}
          {backgroundState.variants.map(variant => (
            <div key={variant.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{variant.label}</span>
                <span>
                  {variant.status === 'done'
                    ? 'Done'
                    : variant.status === 'active'
                      ? `${Math.round(variant.progress * 100)}%`
                      : variant.status === 'error'
                        ? 'Error'
                        : 'Waiting'}
                </span>
              </div>
              {variant.status === 'active' && (
                <Progress value={variant.progress * 100} className="h-1.5" />
              )}
            </div>
          ))}
          {backgroundState.uploadProgress !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {backgroundState.uploadProgress.currentChunk}/
                  {backgroundState.uploadProgress.totalChunks}{' '}
                  {t('upload.browserTranscode.files', { defaultValue: 'files' })}
                  {backgroundState.uploadProgress.totalBytes > 0 && (
                    <>
                      {' · '}
                      {(backgroundState.uploadProgress.uploadedBytes / 1024 / 1024).toFixed(1)}
                      {' / '}
                      {(backgroundState.uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB
                    </>
                  )}
                </span>
                <span>{backgroundState.uploadProgress.percentage}%</span>
              </div>
              <Progress value={backgroundState.uploadProgress.percentage} className="h-1.5" />
            </div>
          )}
          {backgroundEtaSeconds !== undefined && (
            <p className="text-xs text-muted-foreground">
              {t('upload.transcode.eta', {
                time: formatDuration(backgroundEtaSeconds),
                defaultValue: 'Estimated time remaining: {{time}}',
              })}
            </p>
          )}
          {backgroundState.error && <p className="text-sm">{backgroundState.error}</p>}
        </AlertDescription>
      </Alert>
    )
  }

  // ── Normal flow ─────────────────────────────────────────────────────────────

  if (!file) return null

  if (!supported) {
    return (
      <Alert>
        <Upload className="h-4 w-4" />
        <AlertTitle>
          {t('upload.browserTranscode.notSupported', {
            defaultValue: 'Browser optimisation is not available',
          })}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={keepOriginal}
              onCheckedChange={checked => setKeepOriginal(checked === true)}
            />
            <span className="text-sm">
              {t('upload.browserTranscode.keepOriginal', { defaultValue: 'Keep original' })}
            </span>
          </label>
          <Button type="button" size="sm" onClick={handleStart} disabled={!keepOriginal}>
            <Upload className="mr-2 h-4 w-4" />
            {t('upload.upload', { defaultValue: 'Upload' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (status === 'analyzing' || status === 'idle') {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>
          {t('upload.browserTranscode.analyzing', { defaultValue: 'Analysing video...' })}
        </AlertTitle>
      </Alert>
    )
  }

  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <X className="h-4 w-4" />
        <AlertTitle>
          {t('upload.browserTranscode.errorTitle', { defaultValue: 'Transcode failed' })}
        </AlertTitle>
        <AlertDescription>
          <p className="mb-3">{error}</p>
        </AlertDescription>
      </Alert>
    )
  }

  if (status === 'waiting' && sourceMeta) {
    const durationMin = Math.floor(sourceMeta.duration / 60)
    const durationSec = Math.round(sourceMeta.duration % 60)
    const durationStr = `${durationMin}:${durationSec.toString().padStart(2, '0')}`

    const canTranscode = availableResolutionOptions.length > 0
    const hasSelection = effectiveSelectedHeights.length > 0

    return (
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertTitle>
          {t('upload.browserTranscode.title', { defaultValue: 'Optimise for Nostr' })}
        </AlertTitle>
        <AlertDescription className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {sourceMeta.width}×{sourceMeta.height} · {durationStr} · {sourceMeta.sizeMB.toFixed(0)}{' '}
            MB · {sourceMeta.bitrateMbps.toFixed(0)} Mbps
          </p>
          {estimatedOutputSizeMB !== undefined && (
            <p className="text-sm text-muted-foreground">
              {t('upload.browserTranscode.estimatedSize', {
                defaultValue: 'Estimated output size: {{size}}',
                size: formatEstimatedSize(estimatedOutputSizeMB),
              })}
            </p>
          )}

          {canTranscode ? (
            <>
              {/* Format toggle */}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('upload.browserTranscode.format', { defaultValue: 'Output format' })}
                </p>
                <ToggleGroup
                  type="single"
                  value={outputFormat}
                  onValueChange={v => {
                    if (v) setOutputFormat(v as 'mp4' | 'hls')
                  }}
                  className="justify-start gap-1"
                >
                  <ToggleGroupItem value="mp4" size="sm" className="gap-1.5 px-3">
                    <Upload className="h-3.5 w-3.5" />
                    MP4
                  </ToggleGroupItem>
                  <ToggleGroupItem value="hls" size="sm" className="gap-1.5 px-3">
                    <Layers className="h-3.5 w-3.5" />
                    HLS Adaptive
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Resolution checkboxes */}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('upload.browserTranscode.resolutions', { defaultValue: 'Resolutions' })}
                </p>
                <div className="flex flex-col gap-1.5">
                  {[...availableResolutionOptions].reverse().map(opt => (
                    <ResolutionRow
                      key={opt.height}
                      option={opt}
                      codec={getDisplayCodecForHeight(opt.height)}
                      original={hasOriginalHlsVariant && opt.height === sourceShortSide}
                      checked={effectiveSelectedHeights.includes(opt.height)}
                      onToggle={checked => setHeightSelection(opt.height, checked)}
                    />
                  ))}
                </div>
              </div>

              {/* Keep original — MP4 only */}
              {outputFormat === 'mp4' && (
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={keepOriginal}
                    onCheckedChange={checked => setKeepOriginal(checked === true)}
                  />
                  <span className="text-sm">
                    {t('upload.browserTranscode.keepOriginal', { defaultValue: 'Keep original' })}
                  </span>
                </label>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStart}
                  disabled={!hasSelection && !(outputFormat === 'mp4' && keepOriginal)}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {outputFormat === 'hls'
                    ? t('upload.browserTranscode.generateHls', {
                        defaultValue: 'Generate HLS & Upload',
                      })
                    : t('upload.browserTranscode.optimiseUpload', {
                        defaultValue: 'Optimise & Upload',
                      })}
                </Button>
              </div>
            </>
          ) : (
            /* No resolutions available — keep original is an explicit fallback only. */
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('upload.browserTranscode.noVariants', {
                  defaultValue:
                    'No lower local transcode variants are available for this file. You can still upload the original explicitly.',
                })}
              </p>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={keepOriginal}
                  onCheckedChange={checked => setKeepOriginal(checked === true)}
                />
                <span className="text-sm">
                  {t('upload.browserTranscode.keepOriginal', { defaultValue: 'Keep original' })}
                </span>
              </label>
              <Button type="button" size="sm" onClick={handleStart} disabled={!keepOriginal}>
                <Upload className="mr-2 h-4 w-4" />
                {t('upload.upload', { defaultValue: 'Upload' })}
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (status === 'transcoding') {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>
          {t('upload.browserTranscode.transcoding', { defaultValue: 'Optimising video...' })}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          {variantProgress.map(vp => (
            <div key={vp.variant.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{vp.variant.label}</span>
                <span>
                  {vp.status === 'done'
                    ? 'Done'
                    : vp.status === 'active'
                      ? `${Math.round(vp.progress * 100)}%`
                      : vp.status === 'error'
                        ? 'Error'
                        : 'Waiting'}
                </span>
              </div>
              {vp.status === 'active' && <Progress value={vp.progress * 100} className="h-1.5" />}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              cancel()
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('upload.browserTranscode.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

// ── Sub-component ────────────────────────────────────────────────────────────

interface ResolutionRowProps {
  option: ResolutionOption
  codec: ResolutionOption['suggestedCodec']
  original?: boolean
  checked: boolean
  onToggle: (checked: boolean) => void
}

function ResolutionRow({ option, codec, original = false, checked, onToggle }: ResolutionRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={value => onToggle(value === true)} />
      <span className="text-sm">
        {option.height}p
        {option.height === 360 && (
          <span className="ml-1 text-xs text-muted-foreground">(standard fallback resolution)</span>
        )}
        <span className="ml-1.5 text-xs text-muted-foreground">
          {original ? '(original)' : getCodecLabel(codec)}
        </span>
      </span>
    </label>
  )
}
