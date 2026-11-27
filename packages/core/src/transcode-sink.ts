import type { StreamTargetChunk, Target } from 'mediabunny'

/**
 * Where a browser transcode writes its output.
 *
 * `opfs` streams each output file straight to disk (Origin Private File System), so a conversion
 * holds no more than one write chunk in memory and its size is bounded by free disk instead of by
 * the 4 GiB an in-memory buffer can hold. `memory` is the fallback when OPFS is unavailable
 * (browser or private mode without it, a denied write) or when the estimate exceeds the free quota;
 * it buffers each whole file, as before.
 */
export interface TranscodeSink {
  readonly kind: 'opfs' | 'memory'
  /** A mediabunny target that writes the file at `path` (subdirectories allowed). */
  target(path: string, mimeType: string): Target
  /** The finished file. Call after the conversion has executed. */
  file(path: string, mimeType: string): Promise<File>
}

const OPFS_ROOT = 'nostube-transcode'
/** Job directories older than this are leftovers of a lost job and get removed. */
const STALE_JOB_MS = 60 * 60 * 1000
/** Job directory names start with the moment the job began. */
const JOB_DIR_PATTERN = /^(\d+)-/

// OPFS types live in lib.webworker, which this package does not include.
export interface SyncAccessHandle {
  write(data: BufferSource, options?: { at?: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

export interface OpfsFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandle>
  getFile(): Promise<File>
}

export interface OpfsDirHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  entries?(): AsyncIterableIterator<[string, OpfsDirHandle]>
}

interface OpfsStorage {
  getDirectory?: () => Promise<OpfsDirHandle>
  estimate?: () => Promise<{ quota?: number; usage?: number }>
}

/**
 * Opens a sink for one transcode job. `expectedBytes` is the high-side estimate of everything the
 * job writes; when the free quota cannot hold it, the job stays in memory instead of failing
 * halfway through with a quota error.
 */
export async function openTranscodeSink({
  expectedBytes,
}: { expectedBytes?: number } = {}): Promise<TranscodeSink> {
  return (await tryOpenOpfsSink(expectedBytes)) ?? (await openMemorySink())
}

async function tryOpenOpfsSink(expectedBytes?: number): Promise<TranscodeSink | null> {
  // Sync access handles exist in workers only; without them the writes would fail at the first chunk.
  if (
    typeof FileSystemFileHandle === 'undefined' ||
    !('createSyncAccessHandle' in FileSystemFileHandle.prototype)
  ) {
    return null
  }

  // lib.dom types `FileSystemFileHandle` without `createSyncAccessHandle` (it lives in lib.webworker).
  const opfs =
    typeof navigator === 'undefined' ? undefined : (navigator.storage as unknown as OpfsStorage)
  if (!opfs?.getDirectory) return null

  if (expectedBytes !== undefined && (await freeQuotaTooSmall(opfs, expectedBytes))) return null

  try {
    const origin = await opfs.getDirectory()
    const root = await origin.getDirectoryHandle(OPFS_ROOT, { create: true })
    await removeStaleJobs(root)
    const jobDir = await root.getDirectoryHandle(
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      { create: true }
    )
    return openOpfsSink(jobDir)
  } catch (error) {
    // A denied or unavailable OPFS must not fail the upload: fall back to memory.
    if (import.meta.env.DEV) console.warn('[transcode-sink] OPFS unavailable, using memory', error)
    return null
  }
}

async function freeQuotaTooSmall(opfs: OpfsStorage, expectedBytes: number): Promise<boolean> {
  if (!opfs.estimate) return false
  try {
    const { quota, usage } = await opfs.estimate()
    if (typeof quota !== 'number') return false
    // Encoders overshoot the estimate; keep a fifth of it as headroom.
    return quota - (usage ?? 0) < expectedBytes * 1.2
  } catch {
    return false
  }
}

/**
 * Removes job directories left behind by a job that never finished. Files of a job that just
 * finished stay readable for an hour, so an upload already reading them is never pulled away.
 */
async function removeStaleJobs(root: OpfsDirHandle): Promise<void> {
  if (!root.entries) return
  const cutoff = Date.now() - STALE_JOB_MS
  try {
    for await (const [name] of root.entries()) {
      const startedAt = Number(JOB_DIR_PATTERN.exec(name)?.[1])
      if (!startedAt || startedAt > cutoff) continue
      await root.removeEntry(name, { recursive: true })
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[transcode-sink] stale job cleanup failed', error)
  }
}

/**
 * A writable that writes each mediabunny chunk at its own position in `resolveFile`'s file. The
 * file starts empty, so a retried conversion overwrites what an abandoned attempt left behind.
 */
export function createOpfsWritable(
  resolveFile: () => Promise<OpfsFileHandle>
): WritableStream<StreamTargetChunk> {
  let access: SyncAccessHandle | null = null
  let closed = false
  // mediabunny closes the stream when the output finalizes; a cancelled conversion aborts it.
  const closeAccess = () => {
    if (closed || !access) return
    closed = true
    access.flush()
    access.close()
  }
  return new WritableStream<StreamTargetChunk>({
    async start() {
      access = await (await resolveFile()).createSyncAccessHandle()
      access.truncate(0)
    },
    write(chunk) {
      access?.write(chunk.data, { at: chunk.position })
    },
    close() {
      closeAccess()
    },
    abort() {
      closeAccess()
    },
  })
}

async function openOpfsSink(jobDir: OpfsDirHandle): Promise<TranscodeSink> {
  // Lazy: mediabunny is a large chunk that only a conversion may load (see video-transcode).
  const { StreamTarget } = await import('mediabunny')
  const handles = new Map<string, OpfsFileHandle>()

  const fileHandleFor = async (path: string) => {
    const cached = handles.get(path)
    if (cached) return cached
    const parts = path.split('/')
    const name = parts.pop() as string
    let dir = jobDir
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true })
    const handle = await dir.getFileHandle(name, { create: true })
    handles.set(path, handle)
    return handle
  }

  return {
    kind: 'opfs',
    target(path) {
      return new StreamTarget(
        createOpfsWritable(() => fileHandleFor(path)),
        { chunked: true }
      )
    },
    async file(path, mimeType) {
      const file = await (await fileHandleFor(path)).getFile()
      if (file.type === mimeType) return file
      return new File([file], file.name, { type: mimeType, lastModified: file.lastModified })
    },
  }
}

async function openMemorySink(): Promise<TranscodeSink> {
  // Lazy: mediabunny is a large chunk that only a conversion may load (see video-transcode).
  const { BufferTarget } = await import('mediabunny')
  const buffers = new Map<string, ArrayBuffer>()

  return {
    kind: 'memory',
    target(path) {
      return new BufferTarget({ onFinalize: buffer => void buffers.set(path, buffer) })
    },
    async file(path, mimeType) {
      const buffer = buffers.get(path)
      if (!buffer) throw new Error(`No transcoded output for ${path}`)
      return new File([buffer], path.split('/').pop() as string, {
        type: mimeType,
        lastModified: Date.now(),
      })
    },
  }
}
