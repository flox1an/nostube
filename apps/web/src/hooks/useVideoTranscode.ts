import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  assessTranscodeNeed,
  assignMp4ResolutionCodecs,
  availableResolutions,
  defaultResolutions,
  isWebCodecsSupported,
  probeTranscodeSource,
  type BrowserTranscodeVariant,
  type ResolutionOption,
  type TranscodeRecommendation,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'
import { runBrowserTranscodeJob } from '@/lib/browser-transcode-worker'

export type VideoTranscodeStatus =
  'idle' | 'analyzing' | 'waiting' | 'transcoding' | 'done' | 'error'

export interface VariantProgress {
  variant: BrowserTranscodeVariant
  progress: number
  status: 'pending' | 'active' | 'done' | 'error'
}

export interface UseVideoTranscodeReturn {
  status: VideoTranscodeStatus
  sourceMeta: TranscodeSourceMeta | null
  recommendation: TranscodeRecommendation | null
  /** All standard resolutions ≤ source resolution. */
  availableResolutionOptions: ResolutionOption[]
  availableVariants: BrowserTranscodeVariant[]
  variants: BrowserTranscodeVariant[]
  variantProgress: VariantProgress[]
  error: string | null
  supported: boolean
  setVariants: Dispatch<SetStateAction<BrowserTranscodeVariant[]>>
  analyze: (file: File) => Promise<void>
  startTranscode: (file: File) => Promise<File[] | Map<string, File>>
  cancel: () => void
  reset: () => void
}

export function useVideoTranscode(): UseVideoTranscodeReturn {
  const [status, setStatus] = useState<VideoTranscodeStatus>('idle')
  const [sourceMeta, setSourceMeta] = useState<TranscodeSourceMeta | null>(null)
  const [recommendation, setRecommendation] = useState<TranscodeRecommendation | null>(null)
  const [availableResolutionOptions, setAvailableResolutionOptions] = useState<ResolutionOption[]>(
    []
  )
  const [availableVariants, setAvailableVariants] = useState<BrowserTranscodeVariant[]>([])
  const [variants, setVariants] = useState<BrowserTranscodeVariant[]>([])
  const [variantProgress, setVariantProgress] = useState<VariantProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const supported = isWebCodecsSupported()
  const abortRef = useRef<AbortController | null>(null)
  const supportedCodecsRef = useRef<Promise<string[]> | null>(null)

  const getSupportedCodecs = useCallback(() => {
    if (!supportedCodecsRef.current) {
      supportedCodecsRef.current = import('mediabunny')
        .then(({ getEncodableVideoCodecs }) => getEncodableVideoCodecs(['hevc', 'avc']))
        .then(codecs => (codecs.length > 0 ? codecs : ['avc']))
        .catch(() => ['avc'])
    }

    return supportedCodecsRef.current
  }, [])

  useEffect(() => {
    if (supported) void getSupportedCodecs()
  }, [getSupportedCodecs, supported])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setSourceMeta(null)
    setRecommendation(null)
    setAvailableResolutionOptions([])
    setAvailableVariants([])
    setVariants([])
    setVariantProgress([])
    setError(null)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setVariantProgress([])
    setError(null)
  }, [])

  const analyze = useCallback(
    async (file: File) => {
      if (!supported) return

      setStatus('analyzing')
      setError(null)

      try {
        const meta = await probeTranscodeSource(file)
        const rec = assessTranscodeNeed(meta)
        const supportedCodecs = await getSupportedCodecs()
        const resOptions = availableResolutions(meta, supportedCodecs)
        const supportsHevc = supportedCodecs.includes('hevc')
        const defaultRes = assignMp4ResolutionCodecs(
          defaultResolutions(meta, supportedCodecs),
          supportsHevc
        )
        const vars = defaultRes.map(r => ({
          codec: r.suggestedCodec,
          targetHeight: r.height,
          format: 'mp4' as const,
          label: `${r.height}p ${r.suggestedCodec === 'hevc' ? 'HEVC' : 'H.264'}`,
        }))

        setSourceMeta(meta)
        setRecommendation(rec)
        setAvailableResolutionOptions(resOptions)
        setAvailableVariants(vars)
        setVariants(vars)
        setStatus('waiting')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyse video')
        setStatus('error')
      }
    },
    [getSupportedCodecs, supported]
  )

  const startTranscode = useCallback(
    async (file: File): Promise<File[] | Map<string, File>> => {
      if (!sourceMeta || variants.length === 0) return []

      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      setStatus('transcoding')
      setVariantProgress(variants.map(v => ({ variant: v, progress: 0, status: 'pending' })))
      setError(null)

      const results = await runBrowserTranscodeJob(
        file,
        variants,
        sourceMeta,
        ({ variantIndex, progress }) => {
          setVariantProgress(prev =>
            prev.map((vp, idx) => {
              if (idx < variantIndex) return { ...vp, status: 'done', progress: 1 }
              if (idx === variantIndex) return { ...vp, status: 'active', progress }
              return vp
            })
          )
        },
        (variantIndex, message) => {
          setVariantProgress(prev =>
            prev.map((vp, idx) => (idx === variantIndex ? { ...vp, status: 'error' } : vp))
          )
          console.warn(
            `[useVideoTranscode] Variant ${variants[variantIndex]?.label} failed:`,
            message
          )
        },
        signal
      ).finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      })

      const hasResults = results instanceof Array ? results.length > 0 : results.size > 0

      if (!hasResults) {
        const message = 'All transcode variants failed. Try uploading the original.'
        setError(message)
        setStatus('error')
        throw new Error(message)
      }

      setVariantProgress(prev => prev.map(vp => ({ ...vp, status: 'done', progress: 1 })))
      setStatus('done')
      return results
    },
    [sourceMeta, variants]
  )

  return {
    status,
    sourceMeta,
    recommendation,
    availableResolutionOptions,
    availableVariants,
    variants,
    variantProgress,
    error,
    supported,
    setVariants,
    analyze,
    startTranscode,
    cancel,
    reset,
  }
}
