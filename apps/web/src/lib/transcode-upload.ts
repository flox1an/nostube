import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
  type MirrorServerOutcome,
  type UploadToServersOptions,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'
import {
  beginPublication,
  dismissPublication,
  updatePublication,
  type PublicationActivity,
  type PublicationTarget,
} from '@nostube/widgets/publication'

export const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024
export const DEFAULT_MAX_CONCURRENT_CHUNKS = 2

const BYTE_UPDATE_INTERVAL_MS = 250

type ActivityPatch = Partial<Omit<PublicationActivity, 'id' | 'startedAt' | 'updatedAt'>>
type Counters = Partial<Pick<PublicationActivity, 'phase' | 'completed' | 'total' | 'unit'>>

/**
 * One shared publication activity for a user-facing Blossom upload/mirror operation,
 * however many files and servers it spans. Targets are the servers involved; a server is
 * pending while it has work in flight, failed/timeout once any of its transfers failed.
 */
export interface BlobActivity {
  /** Keeps servers pending across several transfers (e.g. one HLS stage); pair with `release`. */
  hold(servers: string[]): void
  release(servers: string[]): void
  /** Sets phase/counters; emits only when something actually changed. */
  set(counters: Counters): void
  /** Bytes sent to servers: `uploading` while flowing, `processing` once all await confirmation. */
  bytes(sent: number, total: number): void
  upload(options: Omit<UploadToServersOptions, 'signer'>): Promise<BlobDescriptor[]>
  /** Mirrors `blob`; confirmed bytes count toward an active `mirroring` byte total. */
  mirror(blob: BlobDescriptor, servers: string[], signal?: AbortSignal): Promise<BlobDescriptor[]>
  /** Settles the activity; a cancellation (`AbortError`) removes it instead. */
  finish(error?: unknown): void
}

export interface BlobActivityOptions {
  phase?: PublicationActivity['phase']
  cancel?: () => void
  /**
   * Receives blobs a user-triggered mirror retry placed. Retry is only offered when this is
   * given, because otherwise the recovered copies could not reach the published metadata.
   */
  onMirrorRetry?: (blobs: BlobDescriptor[]) => void
}

type ServerState = { running: number; failures: number; error?: Error; stopped?: boolean }

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'function' || typeof b === 'function') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export function trackBlobActivity(
  label: string,
  signer: Signer,
  { phase = 'preparing', cancel, onMirrorRetry }: BlobActivityOptions = {}
): BlobActivity {
  const id = beginPublication({ label, phase, lifetime: 'browser', cancel })
  let last: ActivityPatch = { phase, cancel }
  let lastBytesAt = 0
  const servers = new Map<string, ServerState>()
  const failedMirrors: { blob: BlobDescriptor; server: string }[] = []

  const server = (url: string) => {
    let state = servers.get(url)
    if (!state) servers.set(url, (state = { running: 0, failures: 0 }))
    return state
  }

  const targets = (): PublicationTarget[] =>
    Array.from(servers, ([url, state]): PublicationTarget => {
      if (state.failures > 0 && state.error) {
        const cause = (state.error as Error & { cause?: unknown }).cause as Error | undefined
        const timedOut = state.error.name === 'TimeoutError' || cause?.name === 'TimeoutError'
        return { url, status: timedOut ? 'timeout' : 'failed', message: state.error.message }
      }
      if (state.running > 0) return { url, status: 'pending' }
      return { url, status: state.stopped ? 'failed' : 'confirmed' }
    })

  const emit = (patch: ActivityPatch = {}) => {
    const next: ActivityPatch = { ...patch, targets: targets() }
    const delta = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) => !sameValue(value, last[key as keyof ActivityPatch])
      )
    ) as ActivityPatch
    if (Object.keys(delta).length === 0) return
    last = { ...last, ...delta }
    updatePublication(id, delta)
  }

  const settle = (outcome: MirrorServerOutcome, mirroredFrom?: BlobDescriptor) => {
    const state = server(outcome.server)
    state.running = Math.max(0, state.running - 1)
    if (!outcome.ok) {
      state.failures++
      state.error = outcome.error
      if (mirroredFrom) failedMirrors.push({ blob: mirroredFrom, server: outcome.server })
      emit()
      return
    }
    const countsBytes = mirroredFrom && last.phase === 'mirroring' && last.unit === 'bytes'
    emit(countsBytes ? { completed: (last.completed ?? 0) + mirroredFrom.size } : {})
  }

  const hold = (urls: string[]) => {
    for (const url of urls) server(url).running++
    emit()
  }

  const activity: BlobActivity = {
    hold,
    release(urls) {
      for (const url of urls) server(url).running = Math.max(0, server(url).running - 1)
      emit()
    },
    set: counters => emit(counters),
    bytes(sent, total) {
      const now = Date.now()
      const done = sent >= total
      if (!done && now - lastBytesAt < BYTE_UPDATE_INTERVAL_MS) return
      lastBytesAt = now
      emit({ phase: done ? 'processing' : 'uploading', completed: sent, total, unit: 'bytes' })
    },
    async upload(options) {
      hold(options.servers)
      return uploadFileToMultipleServersChunked({
        ...options,
        signer,
        onServerSettle: outcome => {
          settle(outcome)
          options.onServerSettle?.(outcome)
        },
      })
    },
    async mirror(blob, mirrorServers, signal) {
      hold(mirrorServers)
      return mirrorBlobsToServers({
        mirrorServers,
        blob,
        signer,
        signal,
        onServerSettle: outcome => settle(outcome, blob),
      })
    },
    finish(error) {
      if ((error as { name?: unknown } | undefined)?.name === 'AbortError') {
        // Terminal first: the store only hides pending entries on dismiss.
        updatePublication(id, { status: 'success', cancel: undefined, retry: undefined })
        dismissPublication(id)
        return
      }
      for (const state of servers.values()) {
        // Work that never settled did not reach the server.
        if (state.running > 0) state.stopped = true
        state.running = 0
      }
      const finalTargets = targets()
      const anyFailed = finalTargets.some(t => t.status === 'failed' || t.status === 'timeout')
      const anyConfirmed = finalTargets.some(t => t.status === 'confirmed')
      emit({
        status: error ? 'failed' : anyFailed ? (anyConfirmed ? 'partial' : 'failed') : 'success',
        error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
        cancel: undefined,
        retry: failedMirrors.length > 0 && onMirrorRetry && !error ? retryMirrors : undefined,
      })
    },
  }

  // Re-mirrors only the (blob, server) pairs that failed; idempotent per hash on the server.
  const retryMirrors = async () => {
    const pairs = failedMirrors.splice(0)
    const byBlob = new Map<BlobDescriptor, string[]>()
    for (const { blob, server: url } of pairs) {
      const state = server(url)
      state.failures--
      if (state.failures === 0) state.error = undefined
      byBlob.set(blob, [...(byBlob.get(blob) ?? []), url])
    }
    emit({ status: 'pending', phase: 'mirroring', retry: undefined, error: undefined })
    let failure: unknown
    try {
      const recovered = (
        await Promise.all(Array.from(byBlob, ([blob, urls]) => activity.mirror(blob, urls)))
      ).flat()
      if (recovered.length > 0) onMirrorRetry?.(recovered)
    } catch (error) {
      failure = error
    }
    activity.finish(failure)
  }

  return activity
}

export interface UploadAndMirrorOptions {
  file: File
  initialServers: string[]
  mirrorServers: string[]
  activity: BlobActivity
  onProgress?: (progress: ChunkedUploadProgress) => void
  signal?: AbortSignal
}

/**
 * Uploads one file to the initial servers, then has mirror servers copy it. Mirrors pull
 * the first uploaded copy; every copy has the same hash.
 */
export async function uploadAndMirror({
  file,
  initialServers,
  mirrorServers,
  activity,
  onProgress,
  signal,
}: UploadAndMirrorOptions): Promise<{
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
}> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const uploadedBlobs = await activity.upload({
    file,
    servers: initialServers,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
    signal,
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  let mirroredBlobs: BlobDescriptor[] = []
  if (mirrorServers.length > 0 && uploadedBlobs.length > 0) {
    activity.set({
      phase: 'mirroring',
      completed: 0,
      total: uploadedBlobs[0].size * mirrorServers.length,
      unit: 'bytes',
    })
    mirroredBlobs = await activity.mirror(uploadedBlobs[0], mirrorServers, signal)
  }
  return { uploadedBlobs, mirroredBlobs }
}

/**
 * Upload a single file to initial servers (chunked) and mirror to additional servers,
 * then extract video metadata from the resulting blobs. Without an `activity` the call is
 * its own user-facing operation; pass the caller's activity to group several files.
 */
export async function uploadAndProcessFile(
  file: File,
  initialServers: string[],
  mirrorServers: string[],
  signer: Signer,
  onProgress: (progress: ChunkedUploadProgress) => void,
  signal?: AbortSignal,
  activity?: BlobActivity
): Promise<VideoVariant> {
  const ownActivity = activity ? undefined : trackBlobActivity(file.name, signer)
  try {
    const { uploadedBlobs, mirroredBlobs } = await uploadAndMirror({
      file,
      initialServers,
      mirrorServers,
      activity: activity ?? ownActivity!,
      onProgress: progress => {
        onProgress(progress)
        ownActivity?.bytes(progress.uploadedBytes, progress.totalBytes)
      },
      signal,
    })
    const video = await processUploadedVideo(file, uploadedBlobs)
    ownActivity?.finish()
    return { ...video, mirroredBlobs }
  } catch (error) {
    ownActivity?.finish(error)
    throw error
  }
}
