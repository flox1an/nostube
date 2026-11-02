import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EventTemplate } from 'nostr-tools'
import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import { loadSourceForContribution } from '@/lib/variant-source'
import {
  assignMp4ResolutionCodecs,
  availableResolutions,
  buildVariants,
  type BrowserTranscodeVariant,
} from '@nostube/core/video-transcode'
import { runBrowserTranscodeJob } from '@nostube/core/browser-transcode-worker'
import { trackBlobActivity, uploadAndProcessFile, type BlobActivity } from '@/lib/transcode-upload'
import { beginUploadWork } from '@/lib/active-work'
import type { VideoVariant as UploadedVideoVariant } from '@/lib/video-processing'
import type { VideoVariant } from '@nostube/core/video-event'
import {
  buildContributedVariantAnnouncement,
  getMirrorAnnouncementRelays,
  publishMirrorAnnouncements,
  type VideoEventInfo,
} from '@/lib/mirror-announcements'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAppContext } from '@/hooks/useAppContext'

export type ContributeStatus =
  | 'idle'
  | 'downloading'
  | 'analyzing'
  | 'transcoding'
  | 'uploading'
  | 'publishing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface ContributeVariantProgress {
  variantLabel: string
  progress: number
  status: 'pending' | 'active' | 'done' | 'error'
}

export interface ContributeResult {
  variantLabel: string
  dimension: string
  sizeMB: number
  sha256: string
  serverUrls: string[]
}

export interface UseContributeVariantReturn {
  status: ContributeStatus
  downloadProgress: { loaded: number; total: number | undefined } | null
  variantProgress: ContributeVariantProgress[]
  results: ContributeResult[]
  error: string | null
  start: (params: ContributeParams) => Promise<void>
  cancel: () => void
  reset: () => void
}

export interface ContributeParams {
  sourceVariant: VideoVariant
  targetHeights: number[]
  supportsHevc: boolean
  initialServers: string[]
  mirrorServers: string[]
  videoEvent: VideoEventInfo
  relayHint: string
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function progressRowsForVariants(variants: BrowserTranscodeVariant[]): ContributeVariantProgress[] {
  return variants.map(variant => ({
    variantLabel: variant.label,
    progress: 0,
    status: 'pending' as const,
  }))
}

function toContributeResults(variants: UploadedVideoVariant[]): ContributeResult[] {
  return variants.map(variant => {
    const blobs = [...variant.uploadedBlobs, ...variant.mirroredBlobs]
    return {
      variantLabel: variant.qualityLabel ?? variant.dimension,
      dimension: variant.dimension,
      sizeMB: variant.sizeMB ?? 0,
      sha256: blobs[0]?.sha256 ?? '',
      serverUrls: blobs.map(blob => blob.url),
    }
  })
}

export function useContributeVariant(): UseContributeVariantReturn {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const [status, setStatus] = useState<ContributeStatus>('idle')
  const [downloadProgress, setDownloadProgress] = useState<{
    loaded: number
    total: number | undefined
  } | null>(null)
  const [variantProgress, setVariantProgress] = useState<ContributeVariantProgress[]>([])
  const [results, setResults] = useState<ContributeResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  // The run whose results are on screen; a later mirror retry only updates that run.
  const runRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    runRef.current = null
    setStatus('idle')
    setDownloadProgress(null)
    setVariantProgress([])
    setResults([])
    setError(null)
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('cancelled')
  }, [])

  const start = useCallback(
    async (params: ContributeParams) => {
      if (!user?.signer) {
        setStatus('error')
        setError(t('video.contribute.errorSignIn'))
        return
      }
      if (params.initialServers.length === 0) {
        setStatus('error')
        setError(t('video.contribute.errorNoServers'))
        return
      }

      const controller = new AbortController()
      controllerRef.current = controller
      runRef.current = controller
      setError(null)
      setResults([])
      setVariantProgress([])
      setDownloadProgress(null)

      const endWork = beginUploadWork()
      let activity: BlobActivity | undefined
      try {
        setStatus('downloading')
        const { file, meta } = await loadSourceForContribution(
          params.sourceVariant,
          (loaded, total) => setDownloadProgress({ loaded, total }),
          controller.signal
        )

        setStatus('analyzing')
        const supportedCodecs = params.supportsHevc ? ['hevc', 'avc'] : ['avc']
        const selectedResolutions = availableResolutions(meta, supportedCodecs).filter(r =>
          params.targetHeights.includes(r.height)
        )
        const variants = buildVariants(
          assignMp4ResolutionCodecs(selectedResolutions, params.supportsHevc),
          'mp4',
          undefined,
          'balanced'
        )
        if (variants.length === 0) throw new Error(t('video.contribute.errorNoVariants'))

        setVariantProgress(progressRowsForVariants(variants))
        setStatus('transcoding')
        const transcoded = await runBrowserTranscodeJob(
          file,
          variants,
          meta,
          ({ variantIndex, progress }) => {
            setVariantProgress(current =>
              current.map((row, index) => {
                if (index < variantIndex) return { ...row, progress: 1, status: 'done' }
                if (index === variantIndex) return { ...row, progress, status: 'active' }
                return row
              })
            )
          },
          variantIndex => {
            setVariantProgress(current =>
              current.map((row, index) =>
                index === variantIndex ? { ...row, status: 'error' } : row
              )
            )
          },
          controller.signal
        )
        if (!(transcoded instanceof Array)) {
          throw new Error(t('video.contribute.errorBadOutput'))
        }
        setVariantProgress(current => current.map(row => ({ ...row, progress: 1, status: 'done' })))

        setStatus('uploading')
        const signer = (async (draft: EventTemplate) =>
          await user.signer.signEvent(draft)) as Signer
        const userWriteRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
        const relayHint = params.relayHint || userWriteRelays[0] || ''
        const publishRelays = getMirrorAnnouncementRelays(
          userWriteRelays,
          relayHint ? [relayHint] : []
        )
        const announce = (variants: UploadedVideoVariant[]) =>
          publishMirrorAnnouncements(
            variants.map(variant =>
              buildContributedVariantAnnouncement({
                uploadedBlobs: [...variant.uploadedBlobs, ...variant.mirroredBlobs],
                variant,
                videoEvent: params.videoEvent,
                relayHint,
              })
            ),
            { signEvent: async draft => await user.signer.signEvent(draft) },
            publishRelays
          )
        const uploadedVariants: UploadedVideoVariant[] = []
        // A retried mirror lands after the 1063s went out: attach the recovered copies to
        // their variant and announce that variant again with every location it now has.
        const mergeRetriedMirrors = (recovered: BlobDescriptor[]) => {
          const touched = uploadedVariants.filter(variant => {
            const added = recovered.filter(
              blob =>
                blob.sha256 === variant.uploadedBlobs[0]?.sha256 &&
                !variant.mirroredBlobs.some(existing => existing.url === blob.url)
            )
            variant.mirroredBlobs.push(...added)
            return added.length > 0
          })
          if (touched.length === 0) return
          if (runRef.current === controller) setResults(toContributeResults(uploadedVariants))
          void announce(touched)
        }
        // One status entry for every transcoded variant of this contribution.
        activity = trackBlobActivity(file.name, signer, {
          cancel: () => controller.abort(),
          onMirrorRetry: mergeRetriedMirrors,
        })
        const totalBytes = transcoded.reduce((sum, output) => sum + output.size, 0)
        let sentBytes = 0
        for (let index = 0; index < transcoded.length; index += 1) {
          const uploaded = await uploadAndProcessFile(
            transcoded[index],
            params.initialServers,
            params.mirrorServers,
            signer,
            progress => {
              activity?.bytes(sentBytes + progress.uploadedBytes, totalBytes)
              setVariantProgress(current =>
                current.map((row, rowIndex) => {
                  if (rowIndex < index) return { ...row, progress: 1, status: 'done' }
                  if (rowIndex === index) {
                    return { ...row, progress: progress.percentage / 100, status: 'active' }
                  }
                  return row
                })
              )
            },
            controller.signal,
            activity
          )
          sentBytes += transcoded[index].size
          uploadedVariants.push(uploaded)
        }
        activity.finish()
        activity = undefined
        setVariantProgress(current => current.map(row => ({ ...row, progress: 1, status: 'done' })))

        setStatus('publishing')
        await announce(uploadedVariants)

        setResults(toContributeResults(uploadedVariants))
        setStatus('done')
      } catch (err) {
        activity?.finish(err)
        if (isAbortError(err)) {
          setStatus('cancelled')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : t('video.contribute.errorGeneric'))
      } finally {
        endWork()
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t from useTranslation is a stable reference
    [config.relays, user]
  )

  return { status, downloadProgress, variantProgress, results, error, start, cancel, reset }
}
