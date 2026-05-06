import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import type { BrowserTranscodeVariant } from '@/lib/video-transcode'
import type { BrowserTranscodeState } from '@/types/upload-draft'
import { CheckCircle2, Loader2, Play, Upload, X, Zap } from 'lucide-react'
import { HlsPreviewDialog } from './HlsPreviewDialog'

interface BrowserTranscodeStepProps {
  file: File | null
  backgroundState?: BrowserTranscodeState
  /** Master playlist URL – shown as a Preview button when upload is complete. */
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
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const {
    status,
    sourceMeta,
    recommendation,
    availableVariants,
    variants,
    variantProgress,
    error,
    supported,
    setVariants,
    analyze,
    startTranscode,
    cancel,
  } = useVideoTranscode()

  useEffect(() => {
    if (status === 'waiting') {
      if (recommendation === 'none' || availableVariants.length === 0) {
        setKeepOriginal(true)
      }
    }
  }, [status, recommendation, availableVariants.length])

  useEffect(() => {
    if (!file || !supported || backgroundState?.status) return
    analyze(file)
  }, [analyze, backgroundState?.status, file, supported])

  const handleStart = useCallback(async () => {
    if (!file) return

    try {
      if (!sourceMeta && keepOriginal) {
        onSkip()
        return
      }

      if (onStartBackground && sourceMeta) {
        await onStartBackground(variants, sourceMeta, keepOriginal)
        return
      }

      const results = await startTranscode(file)
      if (results instanceof Array) {
        onComplete(keepOriginal ? [...results, file] : results)
      } else {
        // HLS (Map) doesn't support 'keepOriginal' in the same way here,
        // but it's handled in the background path anyway.
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
    variants,
  ])

  const toggleVariant = useCallback(
    (variant: BrowserTranscodeVariant) => {
      setVariants(prev => {
        const exists = prev.some(v => v.label === variant.label)
        if (exists) return prev.filter(v => v.label !== variant.label)
        return [...prev, variant]
      })
    },
    [setVariants]
  )

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
              {t('upload.browserTranscode.keepOriginal', {
                defaultValue: 'Keep original',
              })}
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
    const recommendationMessage =
      recommendation === 'full'
        ? t('upload.browserTranscode.recommendFull', {
            defaultValue:
              'Your video needs conversion for Nostr compatibility (wrong container or codec).',
          })
        : recommendation === 'bitrate'
          ? t('upload.browserTranscode.recommendBitrate', {
              bitrate: sourceMeta.bitrateMbps.toFixed(0),
              defaultValue:
                'Your video is well-encoded but at {{bitrate}} Mbps - a re-encode will reduce file size significantly.',
            })
          : t('upload.browserTranscode.recommendNone', {
              defaultValue: 'Your video is already optimised - only creating the 480p fallback.',
            })

    return (
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertTitle>
          {t('upload.browserTranscode.title', { defaultValue: 'Optimise for Nostr' })}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sourceMeta.width}x{sourceMeta.height} - {durationStr} - {sourceMeta.sizeMB.toFixed(0)}{' '}
            MB - {sourceMeta.bitrateMbps.toFixed(0)} Mbps
          </p>
          <p>{recommendationMessage}</p>

          {availableVariants.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {availableVariants.map(variant => (
                  <label key={variant.label} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={variants.some(v => v.label === variant.label)}
                      onCheckedChange={() => toggleVariant(variant)}
                    />
                    <span className="text-sm">{variant.label}</span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={keepOriginal}
                    onCheckedChange={checked => setKeepOriginal(checked === true)}
                  />
                  <span className="text-sm">
                    {t('upload.browserTranscode.keepOriginal', {
                      defaultValue: 'Keep original',
                    })}
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStart}
                  disabled={variants.length === 0 && !keepOriginal}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {t('upload.browserTranscode.optimiseUpload', {
                    defaultValue: 'Optimise & Upload',
                  })}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={keepOriginal}
                  onCheckedChange={checked => setKeepOriginal(checked === true)}
                />
                <span className="text-sm">
                  {t('upload.browserTranscode.keepOriginal', {
                    defaultValue: 'Keep original',
                  })}
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
            {t('upload.browserTranscode.cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
