import { type BlobDescriptor, BlossomClient, type Signer } from 'blossom-client-sdk'
import { createSHA256 } from 'hash-wasm'
import { normalizeServerUrl } from './blossom-utils'

export interface UploadFileWithProgressProps {
  file: File
  server: string
  signer: Signer
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

export async function mirrorBlobsToServers({
  mirrorServers,
  blob,
  signer,
}: {
  mirrorServers: string[]
  blob: BlobDescriptor
  signer: Signer
}): Promise<BlobDescriptor[]> {
  if (import.meta.env.DEV) console.log('Mirroring blobs to servers', mirrorServers, blob)

  // Create auth token ONCE and reuse for all servers
  // This prevents concurrent signing requests from producing duplicate event IDs with different signatures
  console.log(`[MIRROR] Creating single auth token for all servers`)
  const auth = await BlossomClient.createUploadAuth(signer, blob.sha256)
  console.log(`[MIRROR] Auth event created:`, auth ? 'YES' : 'NO', auth)

  const authString = JSON.stringify(auth)
  const authBase64 = btoa(authString)
  console.log(`[MIRROR] Auth token will be reused for ${mirrorServers.length} servers`)

  const results = await Promise.allSettled(
    mirrorServers.map(async (server, index) => {
      console.log(`[MIRROR ${index + 1}/${mirrorServers.length}] Processing server: ${server}`)

      // Check if file already exists on this server
      const fileExists = await checkFileExists(server, blob.sha256)
      if (fileExists) {
        console.debug(`File already exists on ${server}, skipping mirror`)
        return createMockBlobDescriptor(
          server,
          blob.sha256,
          blob.size,
          blob.type || 'application/octet-stream'
        )
      }

      console.debug(`File does not exist on ${server}, proceeding with mirror`)
      return await customMirrorBlob(server, blob, authBase64)
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
export async function checkFileExists(server: string, fileHash: string): Promise<boolean> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  try {
    // Try HEAD request with hash as path parameter
    const response = await fetch(`${normalizedServer}/${fileHash}`, {
      method: 'HEAD',
    })

    console.debug(`File existence check for ${normalizedServer}:`, response.status)

    // 200 means file exists, 404 means it doesn't exist
    return response.status === 200
  } catch (error) {
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
export async function calculateSHA256(blob: Blob): Promise<string> {
  if (import.meta.env.DEV) {
    console.log(
      `[SHA256] Starting hash calculation for file: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`
    )
  }
  const startTime = Date.now()

  // Always use streaming approach to avoid memory issues
  const hash = await calculateSHA256Streaming(blob)

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
async function calculateSHA256Streaming(blob: Blob): Promise<string> {
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
      const end = Math.min(offset + chunkSize, blob.size)
      const chunk = blob.slice(offset, end)

      // Read chunk into memory
      const chunkBuffer = await chunk.arrayBuffer()

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
      throw new Error(
        `Cannot read file for hash calculation. ` +
          `File may be corrupted or too large. ` +
          `Original error: ${error.message}`
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
  fileHash: string
): Promise<string> {
  try {
    if (import.meta.env.DEV)
      console.log(`[AUTH] Creating upload auth with hash: ${fileHash.substring(0, 16)}...`)

    // Use BlossomClient's createUploadAuth method with hash to avoid re-reading file
    const authEvent = await BlossomClient.createUploadAuth(signer, fileHash)
    if (import.meta.env.DEV)
      console.log(`[AUTH] BlossomClient.createUploadAuth completed successfully`)

    // Convert the signed event to base64 encoded string
    const authString = JSON.stringify(authEvent)
    const authBase64 = btoa(authString)
    if (import.meta.env.DEV) console.log(`[AUTH] Authorization token encoded successfully`)

    return authBase64
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
  authToken: string
): Promise<Response> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  if (import.meta.env.DEV) {
    console.log(`[CHUNK] Uploading chunk ${chunkIndex + 1}/${totalChunks} to ${normalizedServer}`)
    console.log(
      `[CHUNK] Chunk size: ${(chunk.size / (1024 * 1024)).toFixed(1)}MB, offset: ${offset}`
    )
  }

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
  providedFileHash?: string
): Promise<BlobDescriptor> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  // BUD-10: First negotiate capabilities via OPTIONS
  const capabilities = await getUploadCapabilities(normalizedServer)

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
      fileHash = await calculateSHA256(file)
      console.log(`[UPLOAD] SHA256 calculation completed: ${fileHash.substring(0, 16)}...`)
    } else {
      console.log(`[UPLOAD] Starting SHA256 calculation...`)
      fileHash = await calculateSHA256(file)
      console.log(`[UPLOAD] SHA256 calculation completed: ${fileHash.substring(0, 16)}...`)
    }
  }

  // Create chunks using Blob.slice() only - never loads entire file
  const chunks = createFileChunks(file, chunkSize)
  console.log(`[UPLOAD] Chunks created successfully: ${chunks.length} chunks`)

  // Create authorization using the hash instead of reading the file again
  console.log(`[UPLOAD] Creating authorization token...`)
  const authToken = await createChunkedUploadAuthWithHash(signer, fileHash)
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
          authToken
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
        authToken
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
    console.debug(`BUD-10 PATCH chunked upload failed for ${server}:`, error)
    // NO PUT fallback - BUD-10 requires PATCH-only uploads
    throw new Error(
      `BUD-10 PATCH chunked upload failed for ${server}. ` +
        `Server must support PATCH /upload according to BUD-10 specification. ` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
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
}: {
  file: File
  servers: string[]
  signer: Signer
  options?: ChunkedUploadOptions
  callbacks?: ChunkedUploadCallbacks
}): Promise<BlobDescriptor[]> {
  // Calculate file hash once for all servers
  const fileHash = await calculateSHA256(file)

  const results = await Promise.allSettled(
    servers.map(async server => {
      // Check if file already exists on this server
      const fileExists = await checkFileExists(server, fileHash)
      if (fileExists) {
        console.debug(`File already exists on ${server}, skipping upload`)
        return createMockBlobDescriptor(server, fileHash, file.size, file.type)
      }

      // Try chunked upload first
      try {
        console.debug(`File does not exist on ${server}, attempting chunked upload`)
        return await uploadFileChunked(file, server, signer, options, callbacks, fileHash)
      } catch (chunkedError) {
        // If chunked upload fails, check if it's because chunked upload is not supported
        const errorMessage =
          chunkedError instanceof Error ? chunkedError.message : String(chunkedError)

        if (
          errorMessage.includes('does not support PATCH chunked uploads') ||
          errorMessage.includes('CORS error')
        ) {
          console.debug(`Chunked upload not supported on ${server}, falling back to regular upload`)

          // Fall back to regular upload
          try {
            return await uploadFileToSingleServer(file, server, signer, fileHash)
          } catch (regularError) {
            console.error(`Both chunked and regular upload failed for ${server}:`, regularError)
            throw regularError
          }
        }

        // If it's another error, rethrow it
        throw chunkedError
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
}

/**
 * Upload file to a single server (regular upload, not chunked)
 * This is used as a fallback when chunked upload is not supported
 */
async function uploadFileToSingleServer(
  file: File,
  server: string,
  signer: Signer,
  fileHash: string
): Promise<BlobDescriptor> {
  // Normalize server URL to prevent double slashes
  const normalizedServer = normalizeServerUrl(server)

  console.log(`[UPLOAD] Starting regular upload to ${normalizedServer}`)

  // Create auth
  const authEvent = await BlossomClient.createUploadAuth(signer, fileHash)
  const authString = JSON.stringify(authEvent)
  const authBase64 = btoa(authString)

  // Upload file
  const response = await fetch(`${normalizedServer}/upload`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'X-SHA-256': fileHash,
      Authorization: `Nostr ${authBase64}`,
    },
    body: file,
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
    // Create deletion auth event
    const authEvent = await BlossomClient.createDeleteAuth(signer, blobHash)
    const authString = JSON.stringify(authEvent)
    const authBase64 = btoa(authString)

    const response = await fetch(`${normalizedServer}/${blobHash}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Nostr ${authBase64}`,
      },
    })

    if (!response.ok) {
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
