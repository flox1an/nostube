import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import { formatDuration } from '@/lib/formatDuration'
import {
  BROWSER_TRANSCODE_AUDIO_BITRATE,
  assignMp4ResolutionCodecs,
  buildVariants,
  canUseOriginalHlsVariant,
  computeBrowserTranscodeVideoBitrate,
  computeTargetDimensions,
  type BrowserTranscodeQualityPreset,
  type ResolutionOption,
} from '@/lib/video-transcode'
import type { BrowserTranscodeVariant } from '@/lib/video-transcode'
import type { BrowserTranscodeState } from '@/types/upload-draft'
import { HlsSegmentGrid } from '@/components/hls-segment-grid'
import { Layers, Loader2, Upload, X, Zap } from 'lucide-react'

interface BrowserTranscodeStepProps {
  file: File | null
  backgroundState?: BrowserTranscodeState
  hidePrimaryAction?: boolean
  onPrimaryActionChange?: (state: BrowserTranscodePrimaryActionState) => void
  onStartBackground?: (
    variants: BrowserTranscodeVariant[],
    sourceMeta: NonNullable<ReturnType<typeof useVideoTranscode>['sourceMeta']>,
    keepOriginal: boolean
  ) => Promise<void>
  onCancelBackground?: () => void
  onComplete: (files: File[] | Map<string, File>) => void
  onSkip: () => void
}

export interface BrowserTranscodeStepHandle {
  start: () => void
}

export interface BrowserTranscodePrimaryActionState {
  label: string
  disabled: boolean
  visible: boolean
}

type BrowserOutputFormat = 'upload-only' | 'mp4' | 'hls'

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
  const videoBitrateBps = computeBrowserTranscodeVideoBitrate(
    width,
    height,
    variant.qualityPreset,
    sourceMeta
  )
  const audioBitrateBps = BROWSER_TRANSCODE_AUDIO_BITRATE
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

export const BrowserTranscodeStep = forwardRef<
  BrowserTranscodeStepHandle,
  BrowserTranscodeStepProps
>(function BrowserTranscodeStep(
  {
    file,
    backgroundState,
    hidePrimaryAction = false,
    onPrimaryActionChange,
    onStartBackground,
    onCancelBackground,
    onComplete,
    onSkip,
  },
  ref
) {
  const SINGLE_MP4_MAX_SIZE_MB = 50
  const { t } = useTranslation()

  // Format + resolution state — local to this component
  const [outputFormat, setOutputFormat] = useState<BrowserOutputFormat>('mp4')
  const [selectedHeights, setSelectedHeights] = useState<number[] | null>(null)
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [includeSourceVariant, setIncludeSourceVariant] = useState(true)
  const [qualityPreset, setQualityPreset] = useState<BrowserTranscodeQualityPreset>('balanced')

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

  useEffect(() => {
    if (outputFormat !== 'hls') {
      setIncludeSourceVariant(false)
      return
    }
    setIncludeSourceVariant(hasOriginalHlsVariant)
  }, [hasOriginalHlsVariant, outputFormat])

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
    if (outputFormat === 'upload-only') return []

    const selected = availableResolutionOptions.filter(
      r =>
        effectiveSelectedHeights.includes(r.height) &&
        (!hasOriginalHlsVariant || includeSourceVariant || r.height !== sourceShortSide)
    )
    // Apply codec policy for both MP4 and HLS: HEVC for higher resolutions, H.264 for lowest
    const selectedWithCodecs = assignMp4ResolutionCodecs(selected, supportsHevc)

    // Sort descending (highest first) — mediabunny expects highest bitrate first for HLS
    selectedWithCodecs.sort((a, b) => b.height - a.height)
    const variants = buildVariants(selectedWithCodecs, outputFormat, undefined, qualityPreset)
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
  }, [
    availableResolutionOptions,
    effectiveSelectedHeights,
    hasOriginalHlsVariant,
    includeSourceVariant,
    outputFormat,
    qualityPreset,
    sourceMeta,
    sourceShortSide,
    supportsHevc,
  ])
  const estimatedOutputSizeMB = useMemo(() => {
    if (status !== 'waiting' || !sourceMeta) return undefined

    if (outputFormat === 'upload-only') return sourceMeta.sizeMB

    const variants = computeVariants()
    const transcodedEstimate = variants.reduce(
      (sum, variant) => sum + estimateVariantSizeMB(variant, sourceMeta),
      0
    )
    const includeOriginal = outputFormat === 'mp4' && keepOriginal
    return transcodedEstimate + (includeOriginal ? sourceMeta.sizeMB : 0)
  }, [computeVariants, keepOriginal, outputFormat, sourceMeta, status])

  const estimateLabel = useMemo(() => {
    if (outputFormat === 'upload-only') return 'source file'
    if (outputFormat === 'hls') return 'total for selected variants'
    return keepOriginal ? 'total' : ''
  }, [keepOriginal, outputFormat])

  const outputFormatDescription = useMemo(() => {
    if (outputFormat === 'upload-only') {
      return 'Upload the source file unchanged. Fastest path, no browser transcoding.'
    }
    if (outputFormat === 'hls') {
      return 'Generate adaptive HLS variants for playback across network conditions.'
    }
    return 'Create one or more MP4 files optimised for Nostr video delivery.'
  }, [outputFormat])

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
      if (outputFormat === 'upload-only' || (!sourceMeta && keepOriginal)) {
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

  const canTranscode = availableResolutionOptions.length > 0
  const selectedVariantCount = useMemo(() => {
    if (status !== 'waiting' || !sourceMeta) return 0
    return computeVariants().length
  }, [computeVariants, sourceMeta, status])
  const primaryActionLabel =
    outputFormat === 'upload-only'
      ? t('upload.browserTranscode.uploadOriginalOnly', {
          defaultValue: 'Upload only',
        })
      : outputFormat === 'hls'
        ? t('upload.browserTranscode.generateHls', {
            defaultValue: 'Generate HLS & Upload',
          })
        : t('upload.browserTranscode.optimiseUpload', {
            defaultValue: 'Optimise & Upload',
          })
  const primaryActionDisabled =
    status !== 'waiting' ||
    !sourceMeta ||
    (outputFormat === 'upload-only'
      ? false
      : canTranscode
        ? selectedVariantCount === 0 && !(outputFormat === 'mp4' && keepOriginal)
        : !keepOriginal)

  useImperativeHandle(
    ref,
    () => ({
      start: handleStart,
    }),
    [handleStart]
  )

  useEffect(() => {
    onPrimaryActionChange?.({
      label: primaryActionLabel,
      disabled: primaryActionDisabled,
      visible: status === 'waiting' && !!file && !backgroundState,
    })
  }, [
    backgroundState,
    file,
    onPrimaryActionChange,
    primaryActionDisabled,
    primaryActionLabel,
    status,
  ])

  // ── Background / active progress rendering ─────────────────────────────────

  if (backgroundState) {
    if (backgroundState.status === 'complete') {
      return null
    }

    return (
      <TranscodeProgressScreen
        title={
          backgroundState.status === 'uploading'
            ? t('upload.browserTranscode.backgroundUploading', {
                defaultValue: 'Uploading optimised video...',
              })
            : backgroundState.status === 'error'
              ? t('upload.browserTranscode.errorTitle', { defaultValue: 'Transcode failed' })
              : t('upload.browserTranscode.backgroundTranscoding', {
                  defaultValue: 'Optimising video in background...',
                })
        }
        description={shouldShowBackgroundMessage ? backgroundState.message : undefined}
        variants={backgroundState.variants}
        uploadProgress={backgroundState.uploadProgress}
        mirrorProgress={backgroundState.mirrorProgress}
        segmentStates={backgroundState.segmentStates}
        mirrorSegmentStates={backgroundState.mirrorSegmentStates}
        etaSeconds={backgroundEtaSeconds}
        error={backgroundState.error}
        canCancel={backgroundState.status !== 'error' && backgroundState.status !== 'cancelled'}
        onCancel={onCancelBackground ?? cancel}
      />
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
    return (
      <div className="rounded-md border bg-card">
        <div className="flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4" />
            <span>
              {t('upload.browserTranscode.title', { defaultValue: 'Optimise for Nostr' })}
            </span>
          </div>
          {estimatedOutputSizeMB !== undefined && (
            <p className="text-xs text-muted-foreground sm:text-right">
              {t('upload.browserTranscode.estimatedSize', {
                defaultValue: 'Estimated output: {{size}}',
                size: formatEstimatedSize(estimatedOutputSizeMB),
              })}
              {estimateLabel ? ` · ${estimateLabel}` : ''}
            </p>
          )}
        </div>
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
          {canTranscode ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium sm:text-sm">
                    {t('upload.browserTranscode.format', { defaultValue: 'Output format' })}
                  </p>
                  <ToggleGroup
                    type="single"
                    value={outputFormat}
                    onValueChange={v => {
                      if (v) setOutputFormat(v as BrowserOutputFormat)
                    }}
                    className="grid w-full grid-cols-1 gap-1 sm:grid-cols-3 lg:grid-cols-1"
                  >
                    <ToggleGroupItem
                      value="upload-only"
                      size="sm"
                      className="h-8 w-full gap-1 px-2 text-xs sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm lg:justify-start"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload only
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="mp4"
                      size="sm"
                      className="h-8 w-full gap-1 px-2 text-xs sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm lg:justify-start"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      MP4
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="hls"
                      size="sm"
                      className="h-8 w-full gap-1 px-2 text-xs sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm lg:justify-start"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      HLS Adaptive
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                    {outputFormatDescription}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium sm:text-sm">
                    {t('upload.browserTranscode.resolutions', { defaultValue: 'Resolutions' })}
                  </p>
                  <div className="overflow-hidden rounded-md border bg-card">
                    {outputFormat === 'upload-only' && (
                      <StaticOptionRow
                        title={t('upload.browserTranscode.sourceOriginal', {
                          defaultValue: 'Source / Original',
                        })}
                        subtitle={`${sourceShortSide ?? 'Original'}p · unchanged`}
                      />
                    )}
                    {hasOriginalHlsVariant && outputFormat === 'hls' && sourceShortSide && (
                      <OptionRow
                        title={t('upload.browserTranscode.sourceOriginal', {
                          defaultValue: 'Source / Original',
                        })}
                        subtitle={`${sourceShortSide}p · ${getCodecLabel(getSourceVariantCodec(sourceMeta))}`}
                        checked={includeSourceVariant}
                        onToggle={setIncludeSourceVariant}
                      />
                    )}
                    {outputFormat !== 'upload-only' &&
                      [...availableResolutionOptions]
                        .reverse()
                        .map(opt => (
                          <ResolutionRow
                            key={opt.height}
                            option={opt}
                            codec={getDisplayCodecForHeight(opt.height)}
                            checked={effectiveSelectedHeights.includes(opt.height)}
                            onToggle={checked => setHeightSelection(opt.height, checked)}
                          />
                        ))}
                    {outputFormat === 'mp4' && (
                      <OptionRow
                        title={t('upload.browserTranscode.sourceOriginal', {
                          defaultValue: 'Source / Original',
                        })}
                        subtitle={t('upload.browserTranscode.keepOriginal', {
                          defaultValue: 'Keep original',
                        })}
                        checked={keepOriginal}
                        onToggle={setKeepOriginal}
                      />
                    )}
                  </div>
                </div>
              </div>

              {outputFormat !== 'upload-only' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium sm:text-sm">
                    {t('upload.browserTranscode.qualityPreset', {
                      defaultValue: 'Quality preset',
                    })}
                  </p>
                  <ToggleGroup
                    type="single"
                    value={qualityPreset}
                    onValueChange={value => {
                      if (value) setQualityPreset(value as BrowserTranscodeQualityPreset)
                    }}
                    className="grid w-full grid-cols-1 gap-1 sm:grid-cols-3"
                  >
                    <ToggleGroupItem
                      value="compact"
                      size="sm"
                      className="h-8 w-full px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                    >
                      Compact
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="balanced"
                      size="sm"
                      className="h-8 w-full px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                    >
                      Balanced
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="high-motion"
                      size="sm"
                      className="h-8 w-full px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                    >
                      High motion
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                    Higher presets use more bitrate for motion-heavy videos.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-1 sm:flex-row sm:flex-wrap sm:gap-2">
                {!hidePrimaryAction && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleStart}
                    disabled={primaryActionDisabled}
                    className="w-full sm:w-auto"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {primaryActionLabel}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('upload.browserTranscode.noVariants', {
                  defaultValue:
                    'No lower local transcode variants are available for this file. You can still upload the original explicitly.',
                })}
              </p>
              <div className="overflow-hidden rounded-md border bg-card">
                <OptionRow
                  title={t('upload.browserTranscode.sourceOriginal', {
                    defaultValue: 'Source / Original',
                  })}
                  subtitle={t('upload.browserTranscode.keepOriginal', {
                    defaultValue: 'Keep original',
                  })}
                  checked={keepOriginal}
                  onToggle={setKeepOriginal}
                />
              </div>
              {!hidePrimaryAction && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStart}
                  disabled={!keepOriginal}
                  className="w-full sm:w-auto"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t('upload.upload', { defaultValue: 'Upload' })}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (status === 'transcoding') {
    return (
      <TranscodeProgressScreen
        title={t('upload.browserTranscode.transcoding', { defaultValue: 'Optimising video...' })}
        variants={variantProgress.map(vp => ({
          label: vp.variant.label,
          progress: vp.progress,
          status: vp.status,
        }))}
        canCancel={true}
        onCancel={cancel}
      />
    )
  }

  return null
})

// ── Sub-component ────────────────────────────────────────────────────────────

interface ResolutionRowProps {
  option: ResolutionOption
  codec: ResolutionOption['suggestedCodec']
  checked: boolean
  onToggle: (checked: boolean) => void
}

function ResolutionRow({ option, codec, checked, onToggle }: ResolutionRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 border-b px-2.5 py-1.5 last:border-b-0 hover:bg-muted/40 sm:items-center sm:py-2">
      <Checkbox checked={checked} onCheckedChange={value => onToggle(value === true)} />
      <span className="text-xs sm:text-sm">
        {option.height}p
        {option.height === 360 && (
          <span className="ml-1 text-xs text-muted-foreground">(standard fallback resolution)</span>
        )}
        <span className="ml-1.5 text-xs text-muted-foreground">{getCodecLabel(codec)}</span>
      </span>
    </label>
  )
}

interface OptionRowProps {
  title: string
  subtitle: string
  checked: boolean
  onToggle: (checked: boolean) => void
}

function OptionRow({ title, subtitle, checked, onToggle }: OptionRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 border-b bg-muted/20 px-2.5 py-1.5 last:border-b-0 hover:bg-muted/40 sm:items-center sm:py-2">
      <Checkbox checked={checked} onCheckedChange={value => onToggle(value === true)} />
      <span className="text-xs sm:text-sm">
        <span className="font-medium">{title}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </label>
  )
}

interface StaticOptionRowProps {
  title: string
  subtitle: string
}

function StaticOptionRow({ title, subtitle }: StaticOptionRowProps) {
  return (
    <div className="flex items-start gap-2 border-b bg-muted/20 px-2.5 py-1.5 last:border-b-0 sm:items-center sm:py-2">
      <Checkbox checked disabled />
      <span className="text-xs sm:text-sm">
        <span className="font-medium">{title}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </div>
  )
}

interface ProgressVariant {
  label: string
  progress: number
  status: 'pending' | 'active' | 'done' | 'error'
}

interface TranscodeProgressScreenProps {
  title: string
  description?: string
  variants: ProgressVariant[]
  uploadProgress?: BrowserTranscodeState['uploadProgress']
  mirrorProgress?: BrowserTranscodeState['mirrorProgress']
  segmentStates?: BrowserTranscodeState['segmentStates']
  mirrorSegmentStates?: BrowserTranscodeState['mirrorSegmentStates']
  etaSeconds?: number
  error?: string
  canCancel: boolean
  onCancel: () => void
}

function TranscodeProgressScreen({
  title,
  description,
  variants,
  uploadProgress,
  mirrorProgress,
  segmentStates,
  mirrorSegmentStates,
  etaSeconds,
  error,
  canCancel,
  onCancel,
}: TranscodeProgressScreenProps) {
  const transcodePercent =
    variants.length === 0
      ? 0
      : Math.round(
          (variants.reduce((sum, variant) => {
            if (variant.status === 'done') return sum + 1
            if (variant.status === 'active') return sum + variant.progress
            return sum
          }, 0) /
            variants.length) *
            100
        )
  const uploadPercent = uploadProgress?.percentage ?? 0
  // When both a transcode and an upload phase exist, split the overall bar 50/50
  // so the bar never jumps backward: transcode fills 0→50%, upload fills 50→100%.
  // If there's only an upload phase (no variants), use the full 0→100% range.
  const overallPercent =
    variants.length === 0
      ? uploadPercent
      : uploadProgress !== undefined
        ? Math.round(transcodePercent / 2 + uploadPercent / 2)
        : Math.round(transcodePercent / 2)

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-b pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-start gap-2 text-sm font-medium leading-tight sm:items-center">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>{title}</span>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
              Settings are locked during processing.
            </p>
          </div>
          <span className="text-2xl font-semibold leading-none tabular-nums">
            {overallPercent}%
          </span>
        </div>
        <Progress value={overallPercent} className="h-2" />
      </div>

      {description && (
        <p className="text-xs leading-tight text-muted-foreground sm:text-sm">{description}</p>
      )}

      {variants.length > 0 && uploadProgress === undefined && !segmentStates && (
        <div className="space-y-2">
          <p className="text-xs font-medium sm:text-sm">Transcode variants</p>
          {variants.map(variant => (
            <div key={variant.label} className="space-y-1 border-b py-2 last:border-b-0">
              <div className="flex items-start justify-between gap-2 text-xs sm:text-sm">
                <span className="leading-tight">{variant.label}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
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
        </div>
      )}

      {/* Upload progress — segment grid for HLS, progress bar for regular files */}
      {segmentStates && segmentStates.length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium sm:text-sm">Upload progress</p>
            {uploadProgress !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {uploadProgress.percentage}%
              </span>
            )}
          </div>
          <HlsSegmentGrid
            streams={segmentStates.map(s => ({
              label: s.serverLabel ? `${s.streamLabel} · ${s.serverLabel}` : s.streamLabel,
              statuses: s.statuses,
            }))}
          />
        </div>
      ) : uploadProgress !== undefined ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium sm:text-sm">Upload progress</p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {uploadProgress.percentage}%
            </span>
          </div>
          <Progress value={uploadProgress.percentage} className="h-1.5" />
          <div className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground sm:text-xs">
            <span className="leading-tight">
              {uploadProgress.currentChunk}/{uploadProgress.totalChunks} files
              {uploadProgress.totalBytes > 0 && (
                <>
                  {' · '}
                  {(uploadProgress.uploadedBytes / 1024 / 1024).toFixed(1)}
                  {' / '}
                  {(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB
                </>
              )}
            </span>
          </div>
        </div>
      ) : null}

      {/* Mirror progress — segment grid for HLS, progress bar otherwise */}
      {mirrorSegmentStates && mirrorSegmentStates.length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium sm:text-sm">Mirror progress</p>
            {mirrorProgress !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {mirrorProgress.percentage}%
              </span>
            )}
          </div>
          <HlsSegmentGrid
            streams={mirrorSegmentStates.map(s => ({
              label: s.streamLabel,
              statuses: s.statuses,
            }))}
          />
        </div>
      ) : mirrorProgress !== undefined ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium sm:text-sm">Mirror progress</p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {mirrorProgress.percentage}%
            </span>
          </div>
          <Progress value={mirrorProgress.percentage} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {mirrorProgress.mirrored}/{mirrorProgress.total} blobs mirrored
          </p>
        </div>
      ) : null}

      {etaSeconds !== undefined && (
        <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
          Estimated time remaining: {formatDuration(etaSeconds)}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {canCancel && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          className="w-full sm:w-auto"
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      )}
    </div>
  )
}
