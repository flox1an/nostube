import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import { planUpload } from '@nostube/core/upload-plan'
import {
  httpStatusOf,
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
  type MirrorServerOutcome,
  type UploadToServersOptions,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'
import {
  getServerCapabilities,
  isMirrorUnsupported,
  recordMirrorResult,
  recordThroughput,
  recordTooLarge,
} from '@/lib/server-capabilities'
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
  /**
   * Mirrors `blob`; confirmed bytes count toward an active `mirroring` byte total. When
   * `onOutcome` returns true for a failure, the caller takes it over (e.g. falls back to a
   * direct upload) and the server is not marked failed.
   */
  mirror(
    blob: BlobDescriptor,
    servers: string[],
    signal?: AbortSignal,
    onOutcome?: (outcome: MirrorServerOutcome) => boolean
  ): Promise<BlobDescriptor[]>
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
    async mirror(blob, mirrorServers, signal, onOutcome) {
      hold(mirrorServers)
      return mirrorBlobsToServers({
        mirrorServers,
        blob,
        signer,
        signal,
        onServerSettle: outcome => {
          if (onOutcome?.(outcome) && !outcome.ok) {
            server(outcome.server).running = Math.max(0, server(outcome.server).running - 1)
            emit()
            return
          }
          settle(outcome, blob)
        },
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
  /** Servers the user picked as upload servers; together with `mirrorServers` one flat list. */
  initialServers: string[]
  mirrorServers: string[]
  activity: BlobActivity
  onProgress?: (progress: ChunkedUploadProgress) => void
  signal?: AbortSignal
}

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** Error for a file that no configured server accepts (all of them have a smaller size limit). */
export class NoServerAcceptsFileError extends Error {
  constructor(public readonly servers: string[]) {
    super(`None of the servers accepts a file of this size: ${servers.join(', ')}`)
    this.name = 'NoServerAcceptsFileError'
  }
}

/**
 * Feeds a mirror outcome into the learned server capabilities. Returns false, so as an
 * `activity.mirror` callback it leaves failures to the activity (shown, with retry).
 */
export function learnMirrorOutcome(outcome: MirrorServerOutcome): boolean {
  if (outcome.ok) {
    if (!outcome.alreadyExisted) recordMirrorResult(outcome.server, { ok: true })
  } else {
    const status = httpStatusOf(outcome.error)
    if (status !== undefined) recordMirrorResult(outcome.server, { status })
  }
  return false
}

/**
 * The upload strategy for a file of `fileSize` bytes on the user's servers: `direct` get the file
 * from the browser (the first is the primary), `copies` mirror it. Throws when no server accepts
 * the size.
 */
export function planServers(servers: string[], fileSize: number) {
  const plan = planUpload(servers, getServerCapabilities(servers), fileSize)
  if (plan.targets.length === 0) throw new NoServerAcceptsFileError(servers)
  return {
    direct: plan.targets.filter(t => t.method === 'upload').map(t => t.server),
    copies: plan.targets.filter(t => t.method === 'mirror').map(t => t.server),
  }
}

/**
 * Uploads one file following the upload strategy (`planUpload`): the browser sends it to the
 * primary server (and to servers known not to mirror), the others copy it from there. A server
 * that turns out to have no mirror endpoint gets a direct upload instead, and when the primary fails the next server takes
 * over. Outcomes feed the learned server capabilities. `uploadedBlobs` are the direct uploads,
 * `mirroredBlobs` every other copy; all have the same hash.
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
  abortIfNeeded(signal)
  const { direct, copies } = planServers([...initialServers, ...mirrorServers], file.size)

  const uploadTo = async (targets: string[]) => {
    const startedAt = Date.now()
    return activity.upload({
      file,
      servers: targets,
      options: {
        chunkSize: DEFAULT_CHUNK_SIZE,
        maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS,
      },
      callbacks: { onProgress },
      signal,
      onServerSettle: outcome => {
        if (outcome.ok) {
          // Parallel transfers share the line; only a lone transfer measures the server.
          if (!outcome.alreadyExisted && targets.length === 1) {
            recordThroughput(outcome.server, file.size, (Date.now() - startedAt) / 1000)
          }
        } else if (httpStatusOf(outcome.error) === 413) {
          recordTooLarge(outcome.server, file.size)
        }
      },
    })
  }

  // `uploadTo` rejects when every target failed; the activity already shows each failure.
  const tryUpload = async (targets: string[]) => {
    try {
      return { blobs: await uploadTo(targets) }
    } catch (error) {
      if ((error as { name?: unknown }).name === 'AbortError') throw error
      return { blobs: [] as BlobDescriptor[], error }
    }
  }

  let attempt = await tryUpload(direct)
  // The primary failed: the next server gets the file directly and becomes the mirror source.
  while (attempt.blobs.length === 0 && copies.length > 0) {
    abortIfNeeded(signal)
    attempt = await tryUpload([copies.shift()!])
  }
  abortIfNeeded(signal)
  if (attempt.blobs.length === 0) throw attempt.error ?? new Error('Upload failed')
  const uploadedBlobs = attempt.blobs

  let mirroredBlobs: BlobDescriptor[] = []
  if (copies.length > 0 && uploadedBlobs.length > 0) {
    activity.set({
      phase: 'mirroring',
      completed: 0,
      total: uploadedBlobs[0].size * copies.length,
      unit: 'bytes',
    })
    const fallback: string[] = []
    mirroredBlobs = await activity.mirror(uploadedBlobs[0], copies, signal, outcome => {
      learnMirrorOutcome(outcome)
      if (outcome.ok) return false
      if (httpStatusOf(outcome.error) === 413) recordTooLarge(outcome.server, file.size)
      // Only a server without a mirror endpoint gets the file directly. A timeout or 5xx may
      // still finish server-side and keeps the user's "retry" instead of a second transfer.
      if (!isMirrorUnsupported(outcome.error)) return false
      fallback.push(outcome.server)
      return true
    })
    abortIfNeeded(signal)
    // A failed direct upload here only costs that copy; the primary already holds the file.
    if (fallback.length > 0)
      mirroredBlobs = [...mirroredBlobs, ...(await tryUpload(fallback)).blobs]
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
