import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import { buildVariants, type ResolutionOption } from '@/lib/video-transcode'
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

export function BrowserTranscodeStep({
  file,
  backgroundState,
  previewUrl,
  onStartBackground,
  onComplete,
  onSkip,
}: BrowserTranscodeStepProps) {
  const { t } = useTranslation()

  // Format + resolution state — local to this component
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'hls'>('mp4')
  const [selectedHeights, setSelectedHeights] = useState<number[]>([])
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const {
    status,
    sourceMeta,
    recommendation,
    availableResolutionOptions,
    variantProgress,
    error,
    supported,
    analyze,
    startTranscode,
    cancel,
  } = useVideoTranscode()

  // Auto-select default resolutions once analysis finishes
  useEffect(() => {
    if (
      status === 'waiting' &&
      availableResolutionOptions.length > 0 &&
      selectedHeights.length === 0
    ) {
      // Default: top resolution + 480p fallback (mirrors previous behaviour)
      const heights = availableResolutionOptions.map(r => r.height)
      const top = heights[heights.length - 1]
      const fallback = 480
      const defaults = [top, ...(heights.includes(fallback) && fallback !== top ? [fallback] : [])]
      setSelectedHeights(defaults)
    }
  }, [status, availableResolutionOptions, selectedHeights.length])

  // Auto-set keepOriginal when nothing can be transcoded
  useEffect(() => {
    if (
      status === 'waiting' &&
      (recommendation === 'none' || availableResolutionOptions.length === 0)
    ) {
      setKeepOriginal(true)
    }
  }, [status, recommendation, availableResolutionOptions.length])

  useEffect(() => {
    if (!file || !supported || backgroundState?.status) return
    analyze(file)
  }, [analyze, backgroundState?.status, file, supported])

  const toggleHeight = useCallback((height: number) => {
    setSelectedHeights(prev =>
      prev.includes(height) ? prev.filter(h => h !== height) : [...prev, height]
    )
  }, [])

  /** Compute the variant array from current UI selections. */
  const computeVariants = useCallback((): BrowserTranscodeVariant[] => {
    const selected = availableResolutionOptions.filter(r => selectedHeights.includes(r.height))
    // Sort descending (highest first) — mediabunny expects highest bitrate first for HLS
    selected.sort((a, b) => b.height - a.height)
    return buildVariants(selected, outputFormat)
  }, [availableResolutionOptions, selectedHeights, outputFormat])

  const handleStart = useCallback(async () => {
    if (!file) return

    try {
      if (!sourceMeta && keepOriginal) {
        onSkip()
        return
      }

      const variants = computeVariants()
      const effectiveKeepOriginal = outputFormat === 'mp4' ? keepOriginal : false

      if (onStartBackground && sourceMeta) {
        await onStartBackground(variants, sourceMeta, effectiveKeepOriginal)
        return
      }

      const results = await startTranscode(file)
      if (results instanceof Array) {
        onComplete(effectiveKeepOriginal ? [...results, file] : results)
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
          <p className="text-sm text-muted-foreground">{backgroundState.message}</p>
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
          {backgroundState.uploadProgress && (
            <Progress value={backgroundState.uploadProgress.percentage} className="h-1.5" />
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
    const hasSelection = selectedHeights.length > 0

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
                {outputFormat === 'hls' && (
                  <p className="text-xs text-muted-foreground">
                    {t('upload.browserTranscode.hlsHint', {
                      defaultValue:
                        'All selected resolutions will be encoded as a single adaptive stream (H.264).',
                    })}
                  </p>
                )}
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
                      outputFormat={outputFormat}
                      checked={selectedHeights.includes(opt.height)}
                      onToggle={() => toggleHeight(opt.height)}
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
            /* No resolutions available — source is too small or not transcodeable */
            <div className="space-y-3">
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
  outputFormat: 'mp4' | 'hls'
  checked: boolean
  onToggle: () => void
}

function ResolutionRow({ option, outputFormat, checked, onToggle }: ResolutionRowProps) {
  const codecLabel =
    outputFormat === 'hls' ? 'H.264' : option.suggestedCodec === 'hevc' ? 'HEVC' : 'H.264'

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="text-sm">
        {option.height}p<span className="ml-1.5 text-xs text-muted-foreground">{codecLabel}</span>
      </span>
    </label>
  )
}
