import type { EventTemplate } from 'nostr-tools'
import { blossomAuthorization, buildUploadAuth, uploadAuthTtl } from '@nostube/core/blossom-auth'
import type { UploadedBlob } from '@nostube/core/video-publish'
import type { SignedEvent } from '../signer'

/** One piece of a large file: well inside the server's 60 s limit per request, far below its chunk cap. */
export const CHUNK_SIZE = 8 * 1024 * 1024

/** An error with a reason a person can read, and whether trying again could help. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message)
  }
}

export interface UploadOptions {
  file: Blob
  fileName: string
  sha256: string
  /** The MIME type the blob is stored and served with. */
  type: string
  /** Signs the upload authorization (the signer asks the owner for it). */
  sign: (template: EventTemplate) => Promise<SignedEvent>
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** Pause before a retry, in ms (tests pass 0). */
  retryDelayMs?: number
  chunkSize?: number
  /** Continue a chunked upload at this byte offset: everything before it is already on the server. */
  resumeFrom?: number
  /** Called after each piece the server has, with the offset to continue at. 0: start over. */
  onOffset?: (offset: number) => void
  /** Where the blossom endpoints are; the instance itself by default. */
  base?: string
}

const ATTEMPTS = 3

async function reason(response: Response): Promise<string> {
  const header = response.headers.get('X-Reason')
  if (header) return header
  const text = await response.text().catch(() => '')
  return text.trim().slice(0, 200) || `The server answered ${response.status}.`
}

/** 5xx, 408 and network trouble may pass; a 4xx is the server saying no. */
const transient = (status: number) => status >= 500 || status === 408 || status === 429

async function withRetries<T>(
  attempt: () => Promise<T>,
  { signal, retryDelayMs = 800 }: Pick<UploadOptions, 'signal' | 'retryDelayMs'>
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt()
    } catch (error) {
      signal?.throwIfAborted()
      const retryable = !(error instanceof UploadError) || error.retryable
      if (!retryable || n >= ATTEMPTS) throw error
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * n))
    }
  }
}

function toDescriptor(body: unknown, expected: { sha256: string }): UploadedBlob {
  const d = body as Partial<UploadedBlob> | null
  if (!d || typeof d.url !== 'string' || typeof d.sha256 !== 'string') {
    throw new UploadError('The server did not answer with a blob description.', false)
  }
  if (d.sha256 !== expected.sha256) {
    throw new UploadError(
      'The server stored a different file than the one sent (the hashes differ).',
      false
    )
  }
  return {
    url: d.url,
    sha256: d.sha256,
    size: typeof d.size === 'number' ? d.size : 0,
    type: typeof d.type === 'string' ? d.type : '',
  }
}

/**
 * Stores a file on the instance's Blossom server (BUD-02). Small files go up in one `PUT`; larger
 * ones in pieces with `PATCH /upload` under one authorization, so no single request runs into the
 * server's 60 s limit. The answer's hash must be the one we computed.
 */
export async function uploadBlob(options: UploadOptions): Promise<UploadedBlob> {
  const { file, sha256, type, sign, onProgress, signal } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const chunkSize = options.chunkSize ?? CHUNK_SIZE
  const base = options.base ?? ''

  const authorization = blossomAuthorization(
    await sign(
      buildUploadAuth({
        sha256,
        fileName: options.fileName,
        ttlSeconds: uploadAuthTtl(file.size),
      })
    )
  )

  const send = async (path: string, init: RequestInit): Promise<Response> => {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, signal })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new UploadError('The connection to the server failed.', true)
    }
    if (!response.ok) {
      throw new UploadError(await reason(response), transient(response.status), response.status)
    }
    return response
  }

  if (file.size <= chunkSize) {
    const response = await withRetries(
      () =>
        send('/upload', {
          method: 'PUT',
          headers: { Authorization: authorization, 'Content-Type': type, 'X-SHA-256': sha256 },
          body: file,
        }),
      options
    )
    onProgress?.(file.size, file.size)
    return toDescriptor(await response.json(), { sha256 })
  }

  // A piece the server already has answers 409 "conflicts with an existing session" (its answer
  // to the first try got lost, say). That piece is there: go on. A gap would show at the end, in
  // the hash of the finished blob. Any other 409 (no room for another session) is a real failure.
  const alreadyThere = (error: unknown) =>
    error instanceof UploadError && error.status === 409 && /existing session/i.test(error.message)

  let last: Response | null = null
  const start = options.resumeFrom && options.resumeFrom < file.size ? options.resumeFrom : 0
  for (let offset = start; offset < file.size; offset += chunkSize) {
    const piece = file.slice(offset, Math.min(offset + chunkSize, file.size))
    try {
      last = await withRetries(
        () =>
          send('/upload', {
            method: 'PATCH',
            headers: {
              Authorization: authorization,
              'Content-Type': 'application/octet-stream',
              'X-SHA-256': sha256,
              'Upload-Type': type,
              'Upload-Length': String(file.size),
              'Upload-Offset': String(offset),
            },
            body: piece,
          }),
        options
      )
    } catch (error) {
      if (!alreadyThere(error)) throw error
      last = null
    }
    options.onOffset?.(offset + piece.size)
    onProgress?.(offset + piece.size, file.size)
  }
  if (!last || last.status !== 200) {
    // The server does not have all of it (it restarted, or the session ran out): begin again.
    options.onOffset?.(0)
    throw new UploadError('The server did not finish the upload after the last piece.', true)
  }
  return toDescriptor(await last.json(), { sha256 })
}
