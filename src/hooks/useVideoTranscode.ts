import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  assessTranscodeNeed,
  defaultVariants,
  isWebCodecsSupported,
  probeTranscodeSource,
  transcodeFile,
  type BrowserTranscodeVariant,
  type TranscodeRecommendation,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'

export type VideoTranscodeStatus =
  | 'idle'
  | 'analyzing'
  | 'waiting'
  | 'transcoding'
  | 'done'
  | 'error'

export interface VariantProgress {
  variant: BrowserTranscodeVariant
  progress: number
  status: 'pending' | 'active' | 'done' | 'error'
}

export interface UseVideoTranscodeReturn {
  status: VideoTranscodeStatus
  sourceMeta: TranscodeSourceMeta | null
  recommendation: TranscodeRecommendation | null
  availableVariants: BrowserTranscodeVariant[]
  variants: BrowserTranscodeVariant[]
  variantProgress: VariantProgress[]
  error: string | null
  supported: boolean
  setVariants: Dispatch<SetStateAction<BrowserTranscodeVariant[]>>
  analyze: (file: File) => Promise<void>
  startTranscode: (file: File) => Promise<File[]>
  cancel: () => void
  reset: () => void
}

export function useVideoTranscode(): UseVideoTranscodeReturn {
  const [status, setStatus] = useState<VideoTranscodeStatus>('idle')
  const [sourceMeta, setSourceMeta] = useState<TranscodeSourceMeta | null>(null)
  const [recommendation, setRecommendation] = useState<TranscodeRecommendation | null>(null)
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
        const vars = defaultVariants(meta, supportedCodecs)

        setSourceMeta(meta)
        setRecommendation(rec)
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
    async (file: File): Promise<File[]> => {
      if (!sourceMeta || variants.length === 0) return []

      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      setStatus('transcoding')
      setVariantProgress(variants.map(v => ({ variant: v, progress: 0, status: 'pending' })))
      setError(null)

      const results: File[] = []

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i]

        setVariantProgress(prev =>
          prev.map((vp, idx) => (idx === i ? { ...vp, status: 'active', progress: 0 } : vp))
        )

        try {
          const outFile = await transcodeFile(
            file,
            variant,
            sourceMeta,
            progress => {
              setVariantProgress(prev =>
                prev.map((vp, idx) => (idx === i ? { ...vp, progress } : vp))
              )
            },
            signal
          )

          results.push(outFile)

          setVariantProgress(prev =>
            prev.map((vp, idx) => (idx === i ? { ...vp, status: 'done', progress: 1 } : vp))
          )
        } catch (err) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

          setVariantProgress(prev =>
            prev.map((vp, idx) => (idx === i ? { ...vp, status: 'error' } : vp))
          )
          console.warn(`[useVideoTranscode] Variant ${variant.label} failed:`, err)
        }
      }

      abortRef.current = null

      if (results.length === 0) {
        const message = 'All transcode variants failed. Try uploading the original.'
        setError(message)
        setStatus('error')
        throw new Error(message)
      }

      setStatus('done')
      return results
    },
    [sourceMeta, variants]
  )

  return {
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
    reset,
  }
}
