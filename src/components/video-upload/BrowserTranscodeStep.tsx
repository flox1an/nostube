import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import type { BrowserTranscodeVariant } from '@/lib/video-transcode'
import { Loader2, Upload, X, Zap } from 'lucide-react'

interface BrowserTranscodeStepProps {
  file: File
  onComplete: (files: File[]) => void
  onSkip: () => void
}

export function BrowserTranscodeStep({ file, onComplete, onSkip }: BrowserTranscodeStepProps) {
  const { t } = useTranslation()
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
    if (!supported) return
    analyze(file)
  }, [analyze, file, supported])

  useEffect(() => {
    if (!supported) onSkip()
  }, [supported, onSkip])

  const handleStart = useCallback(async () => {
    try {
      const files = await startTranscode(file)
      onComplete(files)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }, [file, onComplete, startTranscode])

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
          <Button type="button" size="sm" variant="outline" onClick={onSkip}>
            <Upload className="mr-2 h-4 w-4" />
            {t('upload.browserTranscode.uploadOriginal', { defaultValue: 'Upload original' })}
          </Button>
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
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStart}
                  disabled={variants.length === 0}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {t('upload.browserTranscode.optimiseUpload', {
                    defaultValue: 'Optimise & Upload',
                  })}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onSkip}>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('upload.browserTranscode.uploadOriginal', {
                    defaultValue: 'Upload original',
                  })}
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" size="sm" onClick={onSkip}>
              <Upload className="mr-2 h-4 w-4" />
              {t('upload.browserTranscode.uploadOriginal', { defaultValue: 'Upload original' })}
            </Button>
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
              onSkip()
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('upload.browserTranscode.cancel', {
              defaultValue: 'Cancel - upload original',
            })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
