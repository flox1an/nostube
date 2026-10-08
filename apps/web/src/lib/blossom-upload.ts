import { type BlobDescriptor, createBlossomAuthorization, type Signer } from '@/lib/blossom-auth'
import { createSHA256 } from 'hash-wasm'
import { encodeAuthToken, extractServerDomain, normalizeServerUrl } from './blossom-utils'

export interface UploadFileWithProgressProps {
  file: File
  server: string
  signer: Signer
}

export interface DeleteBlobsProgress {
  completed: number
  total: number
  successful: number
  failed: number
}

export interface DeleteBlobsOptions {
  concurrency?: number
  onProgress?: (progress: DeleteBlobsProgress) => void
}

/**
 * Custom implementation of blob mirroring without X-SHA-256 header
 * Makes a PUT request to /mirror endpoint with the blob URL to copy
 */
async function customMirrorBlob(
  server: string,
  blob: BlobDescriptor,
  authToken: string
): Promise<BlobDescriptor> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  console.log(`[MIRROR] Mirroring blob to ${normalizedServer}`)
  console.log(
    `[MIRROR] Auth token received:`,
    authToken ? 'YES' : 'NO',
    'Length:',
    authToken?.length || 0,
    'First 50:',
    authToken?.substring(0, 50) || 'EMPTY'
  )

  const response = await fetch(`${normalizedServer}/mirror`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Nostr ${authToken}`,
    },
    body: JSON.stringify({ url: blob.url }),
  })

  if (!response.ok) {
    throw new Error(`Mirror request failed: ${response.status} ${response.statusText}`)
  }

  const blobData = await response.json()
  if (import.meta.env.DEV) {
    console.log(`[MIRROR] Successfully mirrored to ${server}`)
  }
  return blobData as BlobDescriptor
}

/**
 * Outcome of a single server in a `mirrorBlobsToServers` batch. Reported via the
 * optional `onServerSettle` callback so callers (e.g. the mirror dialog) can show
 * live per-server progress and per-cell error messages without re-implementing
 * the upload logic.
 */
export type MirrorServerOutcome =
  | { ok: true; server: string; blob: BlobDescriptor; alreadyExisted: boolean }
  | { ok: false; server: string; error: Error }

export interface MirrorBlobsToServersOptions {
  mirrorServers: string[]
  blob: BlobDescriptor
  signer: Signer
  /** Fires the moment work begins on a given server (after `mirrorServers.map` schedules it). */
  onServerStart?: (server: string) => void
  /** Fires exactly once per server with the resolved outcome (success or failure). */
  onServerSettle?: (outcome: MirrorServerOutcome) => void
}

export async function mirrorBlobsToServers({
  mirrorServers,
  blob,
  signer,
  onServerStart,
  onServerSettle,
}: MirrorBlobsToServersOptions): Promise<BlobDescriptor[]> {
  if (import.meta.env.DEV) console.log('Mirroring blobs to servers', mirrorServers, blob)

  // Create per-server auth tokens with server tags for BUD-11 scoping
  console.log(`[MIRROR] Creating auth tokens for ${mirrorServers.length} servers`)

  const results = await Promise.allSettled(
    mirrorServers.map(async (server, index) => {
      console.log(`[MIRROR ${index + 1}/${mirrorServers.length}] Processing server: ${server}`)
      onServerStart?.(server)

      try {
        // Check if file already exists on this server
        const fileExists = await checkFileExists(server, blob.sha256)
        if (fileExists) {
          console.debug(`File already exists on ${server}, skipping mirror`)
          const existing = createMockBlobDescriptor(
            server,
            blob.sha256,
            blob.size,
            blob.type || 'application/octet-stream'
          )
          onServerSettle?.({ ok: true, server, blob: existing, alreadyExisted: true })
          return existing
        }

        console.debug(`File does not exist on ${server}, proceeding with mirror`)
        // Create server-scoped auth token per BUD-11
        const auth = await createBlossomAuthorization(
          signer,
          'upload',
          blob.sha256,
          extractServerDomain(server)
        )
        const authToken = encodeAuthToken(auth)
        const uploaded = await customMirrorBlob(server, blob, authToken)
        onServerSettle?.({ ok: true, server, blob: uploaded, alreadyExisted: false })
        return uploaded
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error))
        onServerSettle?.({ ok: false, server, error: wrapped })
        throw wrapped
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
}

// Chunked upload implementation
export interface ChunkedUploadOptions {
  chunkSize?: number
  maxConcurrentChunks?: number
}

export interface ChunkedUploadProgress {
  uploadedBytes: number
  totalBytes: number
  percentage: number
  currentChunk: number
  totalChunks: number
  speedMBps?: number
}

export interface ChunkedUploadCallbacks {
  onProgress?: (progress: ChunkedUploadProgress) => void
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * Create a mock BlobDescriptor for existing files
 */
function createMockBlobDescriptor(
  server: string,
  fileHash: string,
  size: number,
  type: string
): BlobDescriptor {
  // Normalize server URL to prevent double slashes in blob.url
  const normalizedServer = normalizeServerUrl(server)

  return {
    sha256: fileHash,
    size: size,
    type: type,
    url: `${normalizedServer}/${fileHash}`,
    uploaded: Date.now(),
  } as BlobDescriptor
}

/**
 * Check if a file already exists on a server by making a HEAD request
 * with the SHA256 hash in the URL or as a query parameter
 */
export async function checkFileExists(
  server: string,
  fileHash: string,
  signal?: AbortSignal
): Promise<boolean> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  try {
    throwIfAborted(signal)
    // Try HEAD request with hash as path parameter
    const response = await fetch(`${normalizedServer}/${fileHash}`, {
      method: 'HEAD',
      signal,
    })

    console.debug(`File existence check for ${normalizedServer}:`, response.status)

    // 200 means file exists, 404 means it doesn't exist
    return response.status === 200
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    console.debug(`Failed to check file existence for ${server}:`, error)
    return false
  }
}

/**
 * Get upload capabilities from server according to BUD-10
 * Performs OPTIONS /upload to negotiate capabilities
 */
export async function getUploadCapabilities(server: string): Promise<{
  supportsPatch: boolean
  maxChunkSize?: number
  requiredHeaders?: string[]
  error?: string
}> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  try {
    const response = await fetch(`${normalizedServer}/upload`, {
      method: 'OPTIONS',
    })

    console.debug(`Server ${normalizedServer} OPTIONS response status:`, response.status)
    console.debug(
      `Server ${normalizedServer} all headers:`,
      Object.fromEntries(response.headers.entries())
    )

    if (!response.ok) {
      return {
        supportsPatch: false,
        error: `OPTIONS /upload failed: ${response.status} ${response.statusText}`,
      }
    }

    // BUD-10: Check for PATCH support via Accept-Patch header
    const acceptPatch =
      response.headers.get('Accept-Patch') || response.headers.get('accept-patch') || ''
    const allowHeader = response.headers.get('Allow') || response.headers.get('allow') || ''

    // Check for Blossom-specific upload modes header
    const uploadModes =
      response.headers.get('Blossom-Upload-Modes') ||
      response.headers.get('blossom-upload-modes') ||
      ''

    console.debug(`Server ${server} Accept-Patch:`, acceptPatch)
    console.debug(`Server ${server} Allow:`, allowHeader)
    console.debug(`Server ${server} Blossom-Upload-Modes:`, uploadModes)

    // Determine PATCH support
    const supportsPatch =
      acceptPatch.includes('application/') ||
      allowHeader.includes('PATCH') ||
      uploadModes.includes('chunked') ||
      uploadModes.includes('patch')

    // Extract additional capabilities
    const maxChunkSizeHeader =
      response.headers.get('Max-Chunk-Size') || response.headers.get('max-chunk-size')
    const maxChunkSize = maxChunkSizeHeader ? parseInt(maxChunkSizeHeader, 10) : undefined

    console.debug(`Server ${server} suppors PATCH:`, supportsPatch)
    console.debug(`Server ${server} max chunk size:`, maxChunkSize)

    return {
      supportsPatch,
      maxChunkSize,
      requiredHeaders: supportsPatch ? ['Content-Type'] : undefined,
    }
  } catch (error) {
    console.debug(`Failed to get upload capabilities for ${server}:`, error)

    // Check if this is a CORS error - indicates chunked upload not supported
    if (error instanceof TypeError) {
      const errorMessage = error.message.toLowerCase()
      if (errorMessage.includes('cors') || errorMessage.includes('failed to fetch')) {
        return {
          supportsPatch: false,
          error: 'CORS error: Chunked upload not supported by server',
        }
      }
    }

    return {
      supportsPatch: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create chunks from a file using Blob.slice() only
 * NEVER loads entire file into memory
 */
export function createFileChunks(file: File, chunkSize: number = 8 * 1024 * 1024): Blob[] {
  if (import.meta.env.DEV) {
    console.log(
      `[CHUNKS] Creating chunks for file: ${(file.size / (1024 * 1024)).toFixed(2)}MB with chunk size: ${(chunkSize / (1024 * 1024)).toFixed(1)}MB`
    )
  }

  const chunks: Blob[] = []
  let offset = 0
  let chunkCount = 0

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size)
    const chunk = file.slice(offset, end) // Use Blob.slice() only - never loads entire file
    chunks.push(chunk)
    chunkCount++

    if (import.meta.env.DEV) {
      console.log(
        `[CHUNKS] Created chunk ${chunkCount}: bytes ${offset}-${end} (${(chunk.size / (1024 * 1024)).toFixed(1)}MB)`
      )
    }
    offset = end
  }

  if (import.meta.env.DEV) console.log(`[CHUNKS] Total chunks created: ${chunkCount}`)
  return chunks
}

/**
 * Safely calculate SHA256 hash of a blob using streaming approach
 * NEVER loads entire file into memory - uses Blob.slice() only
 */
export async function calculateSHA256(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (import.meta.env.DEV) {
    console.log(
      `[SHA256] Starting hash calculation for file: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`
    )
  }
  const startTime = Date.now()

  // Always use streaming approach to avoid memory issues
  const hash = await calculateSHA256Streaming(blob, signal)

  const duration = Date.now() - startTime
  if (import.meta.env.DEV) {
    console.log(`[SHA256] Hash calculation completed in ${duration}ms: ${hash.substring(0, 16)}...`)
  }

  return hash
}

/**
 * Calculate SHA256 hash using streaming approach with hash-wasm
 * Streams file in chunks to avoid loading entire file into memory
 */
async function calculateSHA256Streaming(blob: Blob, signal?: AbortSignal): Promise<string> {
  const chunkSize = 20 * 1024 * 1024 // 20MB chunks
  if (import.meta.env.DEV) {
    console.log(
      `[SHA256] Streaming hash calculation for file: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`
    )
  }

  try {
    // Create SHA256 hasher instance
    const hasher = await createSHA256()

    // Stream file in chunks and update hash incrementally
    let offset = 0
    let chunkCount = 0

    while (offset < blob.size) {
      throwIfAborted(signal)
      const end = Math.min(offset + chunkSize, blob.size)
      const chunk = blob.slice(offset, end)

      // Read chunk into memory
      const chunkBuffer = await chunk.arrayBuffer()
      throwIfAborted(signal)

      // Update hash with chunk data
      hasher.update(new Uint8Array(chunkBuffer))

      offset = end
      chunkCount++

      if (import.meta.env.DEV) {
        console.log(
          `[SHA256] Processed chunk ${chunkCount}: ${(chunk.size / (1024 * 1024)).toFixed(1)}MB`
        )
      }
    }

    // Get final hash
    const hashHex = hasher.digest('hex')
    if (import.meta.env.DEV)
      console.log(`[SHA256] Hash calculation completed: ${hashHex.substring(0, 16)}...`)
    return hashHex
  } catch (error) {
    console.error(`[SHA256] Error calculating hash:`, error)
    if (error instanceof Error && error.name === 'NotReadableError') {
      throw Object.assign(
        new Error(
          `Cannot read file for hash calculation. ` +
            `File may be corrupted or too large. ` +
            `Original error: ${error.message}`
        ),
        { cause: error }
      )
    }
    throw error
  }
}

/**
 * Create Nostr authorization event for chunked upload using file hash
 * This avoids re-reading the file for large files
 */
export async function createChunkedUploadAuthWithHash(
  signer: Signer,
  fileHash: string,
  serverUrl?: string
): Promise<string> {
  try {
    if (import.meta.env.DEV)
      console.log(`[AUTH] Creating upload auth with hash: ${fileHash.substring(0, 16)}...`)

    const authEvent = await createBlossomAuthorization(
      signer,
      'upload',
      fileHash,
      serverUrl ? extractServerDomain(serverUrl) : undefined
    )
    if (import.meta.env.DEV) console.log(`[AUTH] Blossom upload authorization created successfully`)

    // Encode as Base64url without padding per BUD-11
    const authBase64url = encodeAuthToken(authEvent)
    if (import.meta.env.DEV) console.log(`[AUTH] Authorization token encoded successfully`)

    return authBase64url
  } catch (error) {
    console.error(`[AUTH] Error creating authorization:`, error)
    throw error
  }
}

/**
 * Upload a single chunk to a server using BUD-10 PATCH method
 */
export async function uploadChunk(
  server: string,
  chunk: Blob,
  chunkIndex: number,
  totalChunks: number,
  fileHash: string,
  fileType: string,
  fileSize: number,
  offset: number,
  authToken: string,
  signal?: AbortSignal
): Promise<Response> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  if (import.meta.env.DEV) {
    console.log(`[CHUNK] Uploading chunk ${chunkIndex + 1}/${totalChunks} to ${normalizedServer}`)
    console.log(
      `[CHUNK] Chunk size: ${(chunk.size / (1024 * 1024)).toFixed(1)}MB, offset: ${offset}`
    )
  }

  throwIfAborted(signal)
  const response = await fetch(`${normalizedServer}/upload`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-SHA-256': fileHash,
      'Upload-Type': fileType,
      'Upload-Length': fileSize.toString(),
      'Upload-Offset': offset.toString(),
      'Content-Length': chunk.size.toString(),
      Authorization: `Nostr ${authToken}`,
    },
    body: chunk,
    signal,
  })

  if (import.meta.env.DEV) {
    console.log(
      `[CHUNK] Chunk ${chunkIndex + 1}/${totalChunks} response: ${response.status} ${response.statusText}`
    )
  }

  if (!response.ok) {
    console.error(
      `[CHUNK] Chunk ${chunkIndex + 1}/${totalChunks} failed: ${response.status} ${response.statusText}`
    )
    throw new Error(`PATCH chunk upload failed: ${response.status} ${response.statusText}`)
  }

  if (import.meta.env.DEV)
    console.log(`[CHUNK] Chunk ${chunkIndex + 1}/${totalChunks} uploaded successfully`)
  return response
}

/**
 * Upload file using BUD-10 compliant chunked upload to a single server
 * NO PUT fallback - PATCH only according to BUD-10
 */
export async function uploadFileChunked(
  file: File,
  server: string,
  signer: Signer,
  options: ChunkedUploadOptions = {},
  callbacks: ChunkedUploadCallbacks = {},
  providedFileHash?: string,
  signal?: AbortSignal
): Promise<BlobDescriptor> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  throwIfAborted(signal)
  // BUD-10: First negotiate capabilities via OPTIONS
  const capabilities = await getUploadCapabilities(normalizedServer)
  throwIfAborted(signal)

  if (!capabilities.supportsPatch) {
    throw new Error(
      `Server ${normalizedServer} does not support PATCH chunked uploads according to BUD-10. ` +
        `OPTIONS /upload response: ${capabilities.error || 'No PATCH support detected'}`
    )
  }

  console.debug(
    `Server ${normalizedServer} supports PATCH chunked uploads, proceeding with BUD-10 flow`
  )

  // Use server's max chunk size if available, otherwise use default
  const defaultChunkSize = capabilities.maxChunkSize || 8 * 1024 * 1024 // 8MB default
  const { chunkSize = defaultChunkSize, maxConcurrentChunks = 1 } = options

  if (import.meta.env.DEV) {
    console.log(
      `[UPLOAD] Starting BUD-10 chunked upload for file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
    )
    console.log(`[UPLOAD] Server: ${normalizedServer}`)
    console.log(`[UPLOAD] Chunk size: ${(chunkSize / (1024 * 1024)).toFixed(1)}MB`)
  }

  // Use provided hash or calculate it if not provided
  let fileHash: string
  if (providedFileHash) {
    if (import.meta.env.DEV)
      console.log(`[UPLOAD] Using provided file hash: ${providedFileHash.substring(0, 16)}...`)
    fileHash = providedFileHash
  } else {
    // For large files, calculate SHA256 first to avoid reading file twice
    if (file.size > 500 * 1024 * 1024) {
      console.log(
        `[UPLOAD] Calculating SHA256 for large file (${(file.size / (1024 * 1024)).toFixed(2)}MB) before chunked upload`
      )
      fileHash = await calculateSHA256(file, signal)
      console.log(`[UPLOAD] SHA256 calculation completed: ${fileHash.substring(0, 16)}...`)
    } else {
      console.log(`[UPLOAD] Starting SHA256 calculation...`)
      fileHash = await calculateSHA256(file, signal)
      console.log(`[UPLOAD] SHA256 calculation completed: ${fileHash.substring(0, 16)}...`)
    }
  }

  // Create chunks using Blob.slice() only - never loads entire file
  const chunks = createFileChunks(file, chunkSize)
  throwIfAborted(signal)
  console.log(`[UPLOAD] Chunks created successfully: ${chunks.length} chunks`)

  // Create authorization using the hash instead of reading the file again
  // Include server tag for BUD-11 scoping
  console.log(`[UPLOAD] Creating authorization token...`)
  const authToken = await createChunkedUploadAuthWithHash(signer, fileHash, normalizedServer)
  throwIfAborted(signal)
  console.log(`[UPLOAD] Authorization token created successfully`)

  try {
    console.log(
      `[UPLOAD] Starting upload of ${chunks.length} chunks with max concurrency: ${maxConcurrentChunks}`
    )

    // Upload chunks with concurrency control, but ensure last chunk is uploaded last
    const responses: Response[] = []
    let uploadedBytes = 0
    let currentChunk = 0
    const startTime = Date.now()

    // Upload all chunks except the last one with concurrency control
    const chunksToUpload = chunks.slice(0, -1)
    const lastChunk = chunks[chunks.length - 1]

    console.log(`[UPLOAD] Uploading ${chunksToUpload.length} chunks (excluding last chunk)`)
    console.log(
      `[UPLOAD] Starting upload loop with ${Math.ceil(chunksToUpload.length / maxConcurrentChunks)} batches`
    )

    for (let i = 0; i < chunksToUpload.length; i += maxConcurrentChunks) {
      throwIfAborted(signal)
      const batch = chunksToUpload.slice(i, i + maxConcurrentChunks)
      console.log(
        `[UPLOAD] Processing batch ${Math.floor(i / maxConcurrentChunks) + 1}: chunks ${i + 1}-${Math.min(i + maxConcurrentChunks, chunksToUpload.length)}`
      )

      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex
        const offset = chunkIndex * chunkSize

        console.log(
          `[UPLOAD] Starting upload of chunk ${chunkIndex + 1}/${chunks.length} (${(chunk.size / (1024 * 1024)).toFixed(1)}MB) at offset ${offset}`
        )

        const response = await uploadChunk(
          normalizedServer,
          chunk,
          chunkIndex,
          chunks.length,
          fileHash,
          file.type,
          file.size,
          offset,
          authToken,
          signal
        )

        uploadedBytes += chunk.size
        currentChunk = chunkIndex + 1

        console.log(`[UPLOAD] Chunk ${chunkIndex + 1}/${chunks.length} completed successfully`)

        // Calculate upload speed
        const elapsedSeconds = (Date.now() - startTime) / 1000
        const speedMBps = uploadedBytes / (1024 * 1024) / elapsedSeconds

        // Call progress callback
        callbacks.onProgress?.({
          uploadedBytes,
          totalBytes: file.size,
          percentage: Math.round((uploadedBytes / file.size) * 100),
          currentChunk,
          totalChunks: chunks.length,
          speedMBps,
        })

        // Call chunk complete callback
        callbacks.onChunkComplete?.(chunkIndex, chunks.length)
        console.debug(`Chunk ${chunkIndex} of ${chunks.length} completed`)
        console.debug(`Response: ${response}`)
        return response
      })

      // Wait for current batch to complete before starting next batch
      console.log(
        `[UPLOAD] Waiting for batch ${Math.floor(i / maxConcurrentChunks) + 1} to complete...`
      )
      const batchResponses = await Promise.all(batchPromises)
      responses.push(...batchResponses)
      console.log(
        `[UPLOAD] Batch ${Math.floor(i / maxConcurrentChunks) + 1} completed successfully`
      )
    }

    // Upload the last chunk after all previous chunks are complete
    if (lastChunk) {
      throwIfAborted(signal)
      const lastChunkIndex = chunks.length - 1
      const lastOffset = lastChunkIndex * chunkSize

      console.log(
        `[UPLOAD] Uploading final chunk ${lastChunkIndex + 1}/${chunks.length} (${(lastChunk.size / (1024 * 1024)).toFixed(1)}MB) at offset ${lastOffset}`
      )

      const lastResponse = await uploadChunk(
        normalizedServer,
        lastChunk,
        lastChunkIndex,
        chunks.length,
        fileHash,
        file.type,
        file.size,
        lastOffset,
        authToken,
        signal
      )

      uploadedBytes += lastChunk.size
      currentChunk = chunks.length

      console.log(
        `[UPLOAD] Final chunk ${lastChunkIndex + 1}/${chunks.length} completed successfully`
      )

      // Calculate final upload speed
      const elapsedSeconds = (Date.now() - startTime) / 1000
      const speedMBps = uploadedBytes / (1024 * 1024) / elapsedSeconds

      // Call progress callback for final chunk
      callbacks.onProgress?.({
        uploadedBytes,
        totalBytes: file.size,
        percentage: 100,
        currentChunk,
        totalChunks: chunks.length,
        speedMBps,
      })

      // Call chunk complete callback for final chunk
      callbacks.onChunkComplete?.(lastChunkIndex, chunks.length)
      console.debug(`Final chunk ${lastChunkIndex} of ${chunks.length} completed`)

      responses.push(lastResponse)
    }

    // The last response should contain the blob descriptor
    const finalResponse = responses[responses.length - 1]
    console.log(`[UPLOAD] Final response status: ${finalResponse.status}`)

    if (finalResponse.status === 200) {
      const blobData = await finalResponse.json()
      console.log(`[UPLOAD] Upload completed successfully! Blob descriptor:`, blobData)
      return blobData as BlobDescriptor
    }

    console.error(`[UPLOAD] Upload failed: Final response status ${finalResponse.status}`)
    throw new Error('Chunked upload failed: No blob descriptor returned')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    console.debug(`BUD-10 PATCH chunked upload failed for ${server}:`, error)
    // NO PUT fallback - BUD-10 requires PATCH-only uploads
    throw Object.assign(
      new Error(
        `BUD-10 PATCH chunked upload failed for ${server}. ` +
          `Server must support PATCH /upload according to BUD-10 specification. ` +
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
      { cause: error }
    )
  }
}

/**
 * Upload file using chunked upload to multiple servers
 */
export async function uploadFileToMultipleServersChunked({
  file,
  servers,
  signer,
  options = {},
  callbacks = {},
  skipExistenceCheck = false,
  signal,
}: {
  file: File
  servers: string[]
  signer: Signer
  options?: ChunkedUploadOptions
  callbacks?: ChunkedUploadCallbacks
  /** Skip the HEAD existence check — use when the file is known to be new (e.g. freshly generated HLS segments). */
  skipExistenceCheck?: boolean
  signal?: AbortSignal
}): Promise<BlobDescriptor[]> {
  // Calculate file hash once for all servers
  const fileHash = await calculateSHA256(file, signal)
  throwIfAborted(signal)

  const results = await Promise.allSettled(
    servers.map(async server => {
      if (!skipExistenceCheck) {
        const fileExists = await checkFileExists(server, fileHash, signal)
        if (fileExists) {
          console.debug(`File already exists on ${server}, skipping upload`)
          return createMockBlobDescriptor(server, fileHash, file.size, file.type)
        }
      }

      // Use regular PUT (core Blossom BUD-01/02) by default.
      // BUD-10 PATCH chunked upload is only attempted for very large files where
      // resumability is actually useful. Most servers only reliably support PUT.
      const CHUNKED_THRESHOLD = 100 * 1024 * 1024 // 100 MB
      const useChunked = file.size > CHUNKED_THRESHOLD

      if (useChunked) {
        try {
          console.debug(`File does not exist on ${server}, attempting chunked upload (large file)`)
          return await uploadFileChunked(file, server, signer, options, callbacks, fileHash, signal)
        } catch (chunkedError) {
          console.debug(
            `Chunked upload failed for ${server}, falling back to regular upload:`,
            chunkedError
          )
        }
      }

      console.debug(`File does not exist on ${server}, uploading via regular PUT`)
      return await uploadFileToSingleServer(file, server, signer, fileHash, signal)
    })
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
  throwIfAborted(signal)

  // Surface the first real error when all servers fail so callers see why instead of
  // receiving a silent empty array.
  if (successful.length === 0 && results.length > 0) {
    const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    const reason = firstFailure?.reason
    throw reason instanceof Error
      ? reason
      : new Error(
          reason != null
            ? String(reason)
            : `Upload failed: all ${results.length} server(s) rejected`
        )
  }

  return successful
}

/**
 * Upload file to a single server (regular upload, not chunked)
 * This is used as a fallback when chunked upload is not supported
 */
async function uploadFileToSingleServer(
  file: File,
  server: string,
  signer: Signer,
  fileHash: string,
  signal?: AbortSignal
): Promise<BlobDescriptor> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  console.log(`[UPLOAD] Starting regular upload to ${normalizedServer}`)

  throwIfAborted(signal)
  // Create auth with server tag for BUD-11 scoping
  const authEvent = await createBlossomAuthorization(
    signer,
    'upload',
    fileHash,
    extractServerDomain(normalizedServer)
  )
  const authToken = encodeAuthToken(authEvent)
  throwIfAborted(signal)

  // Upload file
  const response = await fetch(`${normalizedServer}/upload`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'X-SHA-256': fileHash,
      Authorization: `Nostr ${authToken}`,
    },
    body: file,
    signal,
  })

  if (!response.ok) {
    throw new Error(`Regular upload failed: ${response.status} ${response.statusText}`)
  }

  const blobData = await response.json()
  console.log(`[UPLOAD] Regular upload completed successfully to ${normalizedServer}`)
  return blobData as BlobDescriptor
}

/**
 * Delete a blob from a Blossom server using DELETE method with Nostr auth
 */
export async function deleteBlobFromServer(
  server: string,
  blobHash: string,
  signer: Signer
): Promise<boolean> {
  const normalizedServer = normalizeServerUrl(server)

  if (import.meta.env.DEV) {
    console.log(`[DELETE] Deleting blob ${blobHash.substring(0, 16)}... from ${normalizedServer}`)
  }

  try {
    // Create deletion auth event with server tag for BUD-11 scoping
    // (unscoped delete tokens can be replayed on other servers)
    const authEvent = await createBlossomAuthorization(
      signer,
      'delete',
      blobHash,
      extractServerDomain(normalizedServer)
    )
    const authToken = encodeAuthToken(authEvent)

    const response = await fetch(`${normalizedServer}/${blobHash}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Nostr ${authToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        if (import.meta.env.DEV) {
          console.log(`[DELETE] Blob already gone from ${normalizedServer} (404)`)
        }
        return true
      }
      console.warn(
        `[DELETE] Failed to delete blob from ${normalizedServer}: ${response.status} ${response.statusText}`
      )
      return false
    }

    if (import.meta.env.DEV) {
      console.log(`[DELETE] Successfully deleted blob from ${normalizedServer}`)
    }
    return true
  } catch (error) {
    console.error(`[DELETE] Error deleting blob from ${normalizedServer}:`, error)
    return false
  }
}

/**
 * Delete a blob from multiple servers
 * Returns an object with successful and failed deletions
 */
export async function deleteBlobFromMultipleServers(
  servers: string[],
  blobHash: string,
  signer: Signer
): Promise<{ successful: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    servers.map(server => deleteBlobFromServer(server, blobHash, signer))
  )

  const successful: string[] = []
  const failed: string[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      successful.push(servers[index])
    } else {
      failed.push(servers[index])
    }
  })

  if (import.meta.env.DEV) {
    console.log(
      `[DELETE] Deletion results: ${successful.length} successful, ${failed.length} failed`
    )
  }

  return { successful, failed }
}

function getBlobDeletionTargets(blobs: BlobDescriptor[]): { hash: string; server: string }[] {
  const targets = new Map<string, { hash: string; server: string }>()

  for (const blob of blobs) {
    try {
      const url = new URL(blob.url)
      const server = `${url.protocol}//${url.host}`
      const key = `${blob.sha256}:${server}`
      targets.set(key, { hash: blob.sha256, server })
    } catch {
      // Skip invalid URLs
    }
  }

  return Array.from(targets.values())
}

export function countBlobDeletionTargets(blobs: BlobDescriptor[]): number {
  return getBlobDeletionTargets(blobs).length
}

/**
 * Delete blobs from their servers based on BlobDescriptor arrays
 * Groups blobs by hash to avoid duplicate deletions
 * @param blobs - Array of BlobDescriptor objects to delete
 * @param signer - Function to sign the delete authorization
 * @param options - Optional progress callback and concurrency limit
 * @returns Object with totalSuccessful and totalFailed counts
 */
export async function deleteBlobsFromServers(
  blobs: BlobDescriptor[],
  signer: Signer,
  options: DeleteBlobsOptions = {}
): Promise<{ totalSuccessful: number; totalFailed: number }> {
  if (blobs.length === 0) {
    return { totalSuccessful: 0, totalFailed: 0 }
  }

  const targets = getBlobDeletionTargets(blobs)

  if (targets.length === 0) {
    return { totalSuccessful: 0, totalFailed: 0 }
  }

  if (import.meta.env.DEV) {
    console.log('[DELETE BLOBS] Deleting blobs:', targets)
  }

  let totalSuccessful = 0
  let totalFailed = 0
  let completed = 0
  let nextIndex = 0
  const concurrency = Math.max(1, options.concurrency ?? 3)

  const notifyProgress = () => {
    options.onProgress?.({
      completed,
      total: targets.length,
      successful: totalSuccessful,
      failed: totalFailed,
    })
  }

  notifyProgress()

  async function worker() {
    while (nextIndex < targets.length) {
      const target = targets[nextIndex]
      nextIndex += 1

      const successful = await deleteBlobFromServer(target.server, target.hash, signer)
      if (successful) {
        totalSuccessful += 1
      } else {
        totalFailed += 1
      }
      completed += 1
      notifyProgress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()))

  if (import.meta.env.DEV) {
    console.log(
      `[DELETE BLOBS] Deleted from ${totalSuccessful} server(s), failed on ${totalFailed} server(s)`
    )
  }

  return { totalSuccessful, totalFailed }
}
