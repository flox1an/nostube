import { useEffect, useMemo, useState } from 'react'
import type { NostrEvent } from 'nostr-tools'
import { Check, Lock, X, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { TranscodeVariantPicker } from '@/components/video-upload/TranscodeVariantPicker'
import type { BlossomServer } from '@/contexts/AppContext'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useContributeVariant } from '@/hooks/useContributeVariant'
import {
  availableResolutions,
  defaultContributeResolutions,
  defaultSelectedTargetHeights,
  isWebCodecsSupported,
  type ResolutionOption,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'
import { isMp4VideoVariant, type VideoEvent, type VideoVariant } from '@/utils/video-event'

interface ContributeVariantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  video: VideoEvent | null
  videoEvent: NostrEvent | undefined
  blossomServers: BlossomServer[]
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return 'unknown size'
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function parseDimensions(dimensions: string | undefined): { width: number; height: number } | null {
  const match = dimensions?.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

function sourceMetaFromVariant(video: VideoEvent, variant: VideoVariant, resolvedSize?: number): TranscodeSourceMeta | null {
  const dimensions = parseDimensions(variant.dimensions ?? video.dimensions)
  if (!dimensions) return null
  const sizeBytes = variant.size ?? resolvedSize ?? video.size ?? 0
  const sizeMB = sizeBytes / 1024 / 1024
  return {
    width: dimensions.width,
    height: dimensions.height,
    duration: video.duration || 1,
    sizeMB,
    bitrateMbps: sizeMB > 0 && video.duration > 0 ? (sizeMB * 8) / video.duration : 0,
    mimeType: variant.mimeType ?? 'video/mp4',
    videoCodec: codecFromMimeType(variant.mimeType),
  }
}

function variantLabel(variant: VideoVariant): string {
  const codec = variant.mimeType?.toLowerCase().includes('hvc') ? 'HEVC' : 'H.264'
  return `${variant.dimensions ?? variant.quality ?? 'MP4'} · ${codec}`
}

function codecFromMimeType(mimeType: string | undefined): string | undefined {
  return mimeType?.match(/codecs="?([^,;"]+)/)?.[1]
}

function baseMimeType(mimeType: string | undefined): string {
  return mimeType?.split(';')[0]?.trim() || 'video/mp4'
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' | 'error' }) {
  if (state === 'done') {
    return (
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-white">
        <Check className="h-3.5 w-3.5" />
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground">
        <X className="h-3.5 w-3.5" />
      </div>
    )
  }
  return (
    <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
    </div>
  )
}

function StepRow({
  title,
  subtitle,
  progress,
  state,
}: {
  title: string
  subtitle?: string
  progress?: number
  state: 'done' | 'active' | 'pending' | 'error'
}) {
  return (
    <div className={`flex items-start gap-3 ${state === 'pending' ? 'opacity-50' : ''}`}>
      <StepIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-3">
          <p className="text-sm font-medium">{title}</p>
          {progress !== undefined && state === 'active' && (
            <p className="text-xs tabular-nums text-muted-foreground">{Math.round(progress * 100)}%</p>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {progress !== undefined && state === 'active' && (
          <Progress value={progress * 100} className="mt-1 h-1.5" />
        )}
      </div>
    </div>
  )
}

export function ContributeVariantDialog({
  open,
  onOpenChange,
  video,
  videoEvent,
  blossomServers,
}: ContributeVariantDialogProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const contribution = useContributeVariant()
  const { reset: resetContribution } = contribution
  const mp4Variants = useMemo(
    () => (video?.allVideoVariants ?? []).filter(isMp4VideoVariant),
    [video?.allVideoVariants]
  )
  const [showSources, setShowSources] = useState(false)
  const [sourceVariant, setSourceVariant] = useState<VideoVariant | null>(null)
  const [selectedHeights, setSelectedHeights] = useState<number[]>([])
  const [selectedServerUrls, setSelectedServerUrls] = useState<Set<string>>(new Set())
  const [supportsHevc, setSupportsHevc] = useState(false)
  const [hasDecodableMp4, setHasDecodableMp4] = useState<boolean | null>(null)
  const [resolvedSourceSize, setResolvedSourceSize] = useState<number | undefined>()

  useEffect(() => {
    if (!open) return
    setSourceVariant(mp4Variants[0] ?? null)
    setSelectedServerUrls(new Set(blossomServers.map(server => server.url)))
    resetContribution()
  }, [blossomServers, mp4Variants, open, resetContribution])

  useEffect(() => {
    if (!isWebCodecsSupported() || typeof VideoEncoder === 'undefined') return
    VideoEncoder.isConfigSupported({
      codec: 'hvc1.1.6.L93.B0',
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      framerate: 30,
    })
      .then(result => setSupportsHevc(result.supported ?? false))
      .catch(() => setSupportsHevc(false))
  }, [])


  const sourceMeta = useMemo(() => {
    if (!video || !sourceVariant) return null
    return sourceMetaFromVariant(video, sourceVariant, resolvedSourceSize)
  }, [resolvedSourceSize, sourceVariant, video])

  useEffect(() => {
    if (!open || !sourceVariant) {
      setHasDecodableMp4(false)
      return
    }
    if (!sourceMeta) {
      setHasDecodableMp4(null)
      return
    }
    if (!isWebCodecsSupported() || typeof VideoDecoder === 'undefined' || typeof VideoDecoder.isConfigSupported !== 'function') {
      setHasDecodableMp4(true)
      return
    }
    const codec = codecFromMimeType(sourceVariant.mimeType)
    if (!codec) {
      setHasDecodableMp4(true)
      return
    }
    let cancelled = false
    VideoDecoder.isConfigSupported({
      codec,
      codedWidth: sourceMeta.width,
      codedHeight: sourceMeta.height,
    })
      .then(result => {
        if (!cancelled) setHasDecodableMp4(result.supported ?? false)
      })
      .catch(() => {
        if (!cancelled) setHasDecodableMp4(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, sourceMeta, sourceVariant])

  useEffect(() => {
    setResolvedSourceSize(undefined)
    if (!open || !sourceVariant || sourceVariant.size || video?.size) return

    let cancelled = false
    const controller = new AbortController()
    fetch(sourceVariant.url, { method: 'HEAD', signal: controller.signal })
      .then(response => {
        const contentLength = Number(response.headers.get('Content-Length'))
        if (!cancelled && Number.isFinite(contentLength) && contentLength > 0) {
          setResolvedSourceSize(contentLength)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, sourceVariant, video?.size])

  const availableResolutionOptions: ResolutionOption[] = useMemo(() => {
    if (!sourceMeta) return defaultContributeResolutions(supportsHevc)
    return availableResolutions(sourceMeta, supportsHevc ? ['hevc', 'avc'] : ['avc'])
  }, [sourceMeta, supportsHevc])

  const pickerSourceMeta = useMemo<TranscodeSourceMeta | null>(() => {
    if (sourceMeta) return sourceMeta
    if (!video || !sourceVariant) return null
    const sizeBytes = sourceVariant.size ?? resolvedSourceSize ?? video.size ?? 0
    const sizeMB = sizeBytes / 1024 / 1024
    return {
      width: 1280,
      height: 720,
      duration: video.duration || 1,
      sizeMB,
      bitrateMbps: sizeMB > 0 && video.duration > 0 ? (sizeMB * 8) / video.duration : 0,
      mimeType: sourceVariant.mimeType ?? 'video/mp4',
      videoCodec: codecFromMimeType(sourceVariant.mimeType),
    }
  }, [resolvedSourceSize, sourceMeta, sourceVariant, video])


  const sourcePreviewUrl = video?.thumbnailVariants[0]?.url ?? video?.images[0]
  const sourceSizeBytes = sourceVariant?.size ?? resolvedSourceSize ?? video?.size
  const sourceResolution = sourceVariant?.dimensions ?? video?.dimensions
  const sourceCodec = codecFromMimeType(sourceVariant?.mimeType)
  const sourceMimeType = baseMimeType(sourceVariant?.mimeType)
  useEffect(() => {
    if (availableResolutionOptions.length === 0) {
      setSelectedHeights([])
      return
    }
    if (!sourceMeta) {
      setSelectedHeights(availableResolutionOptions.map(option => option.height))
      return
    }
    setSelectedHeights(defaultSelectedTargetHeights(sourceMeta, availableResolutionOptions))
  }, [availableResolutionOptions, sourceMeta])

  const blockers = useMemo(() => {
    const items: Array<'sign-in' | 'mp4' | 'webcodecs'> = []
    if (!user) items.push('sign-in')
    if (!isWebCodecsSupported()) items.push('webcodecs')
    if (mp4Variants.length === 0 || hasDecodableMp4 === false) items.push('mp4')
    return items
  }, [hasDecodableMp4, mp4Variants.length, user])

  const isBlocked = blockers.length > 0
  const selectedServers = blossomServers.filter(server => selectedServerUrls.has(server.url))
  const initialServers = selectedServers.filter(server => server.tags.includes('initial upload')).map(s => s.url)
  const mirrorServers = selectedServers.filter(server => server.tags.includes('mirror')).map(s => s.url)
  const resolvedInitialServers = initialServers.length > 0 ? initialServers : selectedServers.map(s => s.url)
  const resolvedMirrorServers = initialServers.length > 0 ? mirrorServers : []

  const startContribution = () => {
    if (!sourceVariant || !video || !videoEvent) return
    const dTag = videoEvent.tags.find(tag => tag[0] === 'd')?.[1]
    const relayHint = ''
    contribution.start({
      sourceVariant,
      targetHeights: selectedHeights,
      supportsHevc,
      initialServers: resolvedInitialServers,
      mirrorServers: resolvedMirrorServers,
      videoEvent: {
        id: videoEvent.id,
        kind: videoEvent.kind,
        pubkey: videoEvent.pubkey,
        dTag,
      },
      relayHint,
    })
  }

  const close = () => onOpenChange(false)
  const cancel = () => {
    contribution.cancel()
    onOpenChange(false)
  }

  const renderBlocked = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('video.contribute.blockedTitle')}</DialogTitle>
        <DialogDescription>{t('video.contribute.blockedDescription')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {blockers.includes('sign-in') && (
          <div className="flex gap-3 rounded-md border p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('video.contribute.blockedSignIn')}</p>
              <p className="text-xs text-muted-foreground">{t('video.contribute.blockedSignInDescription')}</p>
            </div>
          </div>
        )}
        {blockers.includes('mp4') && (
          <div className="flex gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
            <div>
              <p className="font-medium">{t('video.contribute.blockedNoMp4')}</p>
              <p className="text-xs text-muted-foreground">{t('video.contribute.blockedNoMp4Description')}</p>
            </div>
          </div>
        )}
        {blockers.includes('webcodecs') && (
          <div className="flex gap-3 rounded-md border p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('video.contribute.blockedWebCodecs')}</p>
              <p className="text-xs text-muted-foreground">{t('video.contribute.blockedWebCodecsDescription')}</p>
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>{t('video.contribute.close')}</Button>
      </DialogFooter>
    </>
  )

  const renderReview = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('video.contribute.dialogTitle')}</DialogTitle>
        <DialogDescription>{t('video.contribute.dialogDescription')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('video.contribute.source')}</h3>
            {mp4Variants.length > 1 && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowSources(v => !v)}>
                {t('video.contribute.changeSource')}
              </Button>
            )}
          </div>
          {showSources && (
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
              {mp4Variants.map(variant => (
                <label key={variant.url} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
                  <input
                    type="radio"
                    checked={sourceVariant?.url === variant.url}
                    onChange={() => setSourceVariant(variant)}
                  />
                  {variantLabel(variant)} · {formatBytes(variant.size)}
                </label>
              ))}
            </div>
          )}
          {sourceVariant && (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
              {sourcePreviewUrl ? (
                <img
                  src={sourcePreviewUrl}
                  alt={t('video.contribute.sourceThumbnailAlt', { title: video?.title ?? '' })}
                  className="h-10 w-16 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-10 w-16 shrink-0 place-items-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                  {sourceVariant.quality ?? sourceResolution?.split('x')[1] ?? 'MP4'}
                </div>
              )}
              <div className="min-w-0 text-sm">
                <p className="font-medium">{variantLabel(sourceVariant)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(sourceSizeBytes)} · {sourceResolution ?? t('video.contribute.unknownResolution')} · {sourceCodec ?? t('video.contribute.unknownCodec')} · {sourceMimeType}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('video.contribute.outputVariants')}</h3>
          {pickerSourceMeta && (
            <>
              <TranscodeVariantPicker
                sourceMeta={pickerSourceMeta}
                availableResolutionOptions={availableResolutionOptions}
                selectedHeights={selectedHeights}
                supportsHevc={supportsHevc}
                onChange={setSelectedHeights}
              />
              {!sourceMeta && (
                <p className="text-xs text-muted-foreground">
                  {t('video.contribute.missingDimensionsInfo')}
                </p>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('video.contribute.uploadToServers')}</h3>
          {blossomServers.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t('video.mirror.noServers')}</p>
          ) : (
            <div className="space-y-1.5">
              {blossomServers.map(server => (
                <Label key={server.url} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                  <Checkbox
                    checked={selectedServerUrls.has(server.url)}
                    onCheckedChange={checked => {
                      setSelectedServerUrls(current => {
                        const next = new Set(current)
                        if (checked === true) next.add(server.url)
                        else next.delete(server.url)
                        return next
                      })
                    }}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{domainFromUrl(server.url)}</p>
                    <p className="text-xs text-muted-foreground">
                      {server.tags.includes('initial upload') && t('video.contribute.serverInitial')}
                      {server.tags.includes('initial upload') && server.tags.includes('mirror') ? ' · ' : ''}
                      {server.tags.includes('mirror') && t('video.contribute.serverMirror')}
                    </p>
                  </div>
                </Label>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
          <ol className="ml-4 list-decimal space-y-0.5">
            <li>{t('video.contribute.step1')}</li>
            <li>{t('video.contribute.step2', { count: selectedHeights.length })}</li>
            <li>{t('video.contribute.step3')}</li>
            <li>{t('video.contribute.step4')}</li>
          </ol>
        </section>
      </div>
      <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
        <p className="mr-auto text-xs text-muted-foreground">{t('video.contribute.variantCount', { count: selectedHeights.length })}</p>
        <Button variant="outline" onClick={close}>{t('video.contribute.cancel')}</Button>
        <Button disabled={selectedHeights.length === 0 || selectedServerUrls.size === 0 || !videoEvent} onClick={startContribution}>
          {t('video.contribute.contributeButton_action')}
        </Button>
      </DialogFooter>
    </>
  )

  const renderProgress = () => {
    const downloadTotal = contribution.downloadProgress?.total
    const downloadLoaded = contribution.downloadProgress?.loaded ?? 0
    const downloadRatio = downloadTotal ? downloadLoaded / downloadTotal : undefined
    const isUploading = contribution.status === 'uploading'
    const isPublishing = contribution.status === 'publishing'
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {isUploading ? t('video.contribute.uploading') : isPublishing ? t('video.contribute.publishing') : t('video.contribute.transcoding')}
          </DialogTitle>
          <DialogDescription>{t('video.contribute.keepTabOpen')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <StepRow
            title={t('video.contribute.downloadedSource')}
            subtitle={downloadTotal ? `${formatBytes(downloadLoaded)} / ${formatBytes(downloadTotal)}` : undefined}
            progress={contribution.status === 'downloading' ? downloadRatio : undefined}
            state={contribution.status === 'downloading' ? 'active' : 'done'}
          />
          {contribution.variantProgress.map(row => (
            <StepRow
              title={isUploading ? t('video.contribute.uploadingVariant', { label: row.variantLabel }) : t('video.contribute.transcodingVariant', { label: row.variantLabel })}
              progress={row.progress}
              state={row.status}
            />
          ))}
          <StepRow
            title={t('video.contribute.uploadToCount', { count: selectedServers.length })}
            subtitle={contribution.status === 'transcoding' ? t('video.contribute.startsAfterTranscode') : undefined}
            state={isUploading ? 'active' : isPublishing || contribution.status === 'done' ? 'done' : 'pending'}
          />
          <StepRow
            title={t('video.contribute.publishEvents', { count: selectedHeights.length })}
            subtitle={!isPublishing ? t('video.contribute.startsAfterUpload') : undefined}
            state={isPublishing ? 'active' : contribution.status === 'done' ? 'done' : 'pending'}
          />
          {contribution.error && <p className="text-sm text-destructive">{contribution.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="text-destructive" onClick={cancel}>{t('video.contribute.cancel')}</Button>
        </DialogFooter>
      </>
    )
  }

  const renderDone = () => (
    <>
      <div className="flex flex-col items-center gap-3 border-b pb-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-green-600/15 text-green-600">
          <Check className="h-5 w-5" />
        </div>
        <div>
          <DialogTitle>{t('video.contribute.done')}</DialogTitle>
          <DialogDescription>{t('video.contribute.doneDescription', { count: contribution.results.length })}</DialogDescription>
        </div>
      </div>
      <div className="space-y-3">
        {contribution.results.map(result => (
          <div key={result.sha256 || result.variantLabel} className="rounded-md border p-3">
            <p className="text-sm font-medium">{result.variantLabel} · {result.dimension} · {result.sizeMB.toFixed(1)} MB</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">sha256: {result.sha256.slice(0, 12)}…</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{result.serverUrls.map(domainFromUrl).join(' · ')}</p>
          </div>
        ))}
        <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          {t('video.contribute.doneInfo')}
        </p>
      </div>
      <DialogFooter>
        <Button onClick={close}>{t('video.contribute.close')}</Button>
      </DialogFooter>
    </>
  )

  let body = renderReview()
  if (isBlocked) body = renderBlocked()
  if (['downloading', 'analyzing', 'transcoding', 'uploading', 'publishing', 'error'].includes(contribution.status)) {
    body = renderProgress()
  }
  if (contribution.status === 'done') body = renderDone()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {body}
      </DialogContent>
    </Dialog>
  )
}
