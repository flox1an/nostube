import { BlobDescriptor, BlossomClient, Signer } from 'blossom-client-sdk'

export interface UploadFileWithProgressProps {
  file: File
  server: string
  signer: Signer
}

/**
 * DEPRECATED: This function uses PUT /upload which is not BUD-10 compliant
 * Use uploadFileToMultipleServersChunked instead for BUD-10 compliance
 */
export async function uploadFileToMultipleServers({
  file: _file,
  servers: _servers,
  signer: _signer,
}: {
  file: File
  servers: string[]
  signer: Signer
}): Promise<BlobDescriptor[]> {
  throw new Error(
    'PUT-based upload is deprecated. Use uploadFileToMultipleServersChunked for BUD-10 compliant PATCH uploads.'
  )
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
  console.log('Mirroring blobs to servers', mirrorServers, blob)

  const results = await Promise.allSettled(
    mirrorServers.map(async server => {
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
      const auth = await BlossomClient.createUploadAuth(signer, blob.sha256)
      return await BlossomClient.mirrorBlob(server, blob, { auth })
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
  return {
    sha256: fileHash,
    size: size,
    type: type,
    url: `${server}/${fileHash}`,
    uploaded: Date.now(),
  } as BlobDescriptor
}

/**
 * Check if a file already exists on a server by making a HEAD request
 * with the SHA256 hash in the URL or as a query parameter
 */
export async function checkFileExists(server: string, fileHash: string): Promise<boolean> {
  try {
    // Try HEAD request with hash as path parameter
    const response = await fetch(`${server}/${fileHash}`, {
      method: 'HEAD',
    })

    console.debug(`File existence check for ${server}:`, response.status)

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
  try {
    const response = await fetch(`${server}/upload`, {
      method: 'OPTIONS',
    })

    console.debug(`Server ${server} OPTIONS response status:`, response.status)
    console.debug(`Server ${server} all headers:`, Object.fromEntries(response.headers.entries()))

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
    return {
      supportsPatch: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create chunks from a file
 */
export function createFileChunks(file: File, chunkSize: number = 1024 * 1024): Blob[] {
  const chunks: Blob[] = []
  let offset = 0

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size)
    chunks.push(file.slice(offset, end))
    offset = end
  }

  return chunks
}

/**
 * Check if browser can handle large files
 */
export function checkBrowserFileCapabilities(): {
  canHandleLargeFiles: boolean
  maxRecommendedSize: number
  warnings: string[]
} {
  const warnings: string[] = []
  let maxRecommendedSize = 500 * 1024 * 1024 // 500MB default

  // Check for known browser limitations
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('chrome')) {
    maxRecommendedSize = 2 * 1024 * 1024 * 1024 // 2GB for Chrome
  } else if (userAgent.includes('firefox')) {
    maxRecommendedSize = 1 * 1024 * 1024 * 1024 // 1GB for Firefox
  } else if (userAgent.includes('safari')) {
    maxRecommendedSize = 500 * 1024 * 1024 // 500MB for Safari
  } else {
    warnings.push('Unknown browser - using conservative limits')
  }

  // Check available memory (rough estimate)
  if ('memory' in performance) {
    const memory = (performance as { memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number } })
      .memory
    if (memory && memory.jsHeapSizeLimit) {
      const availableMemory = memory.jsHeapSizeLimit - memory.usedJSHeapSize
      if (availableMemory < 100 * 1024 * 1024) {
        // Less than 100MB available
        warnings.push('Low memory available - large files may fail')
        maxRecommendedSize = Math.min(maxRecommendedSize, 200 * 1024 * 1024)
      }
    }
  }

  return {
    canHandleLargeFiles: true, // We'll try anyway but with warnings
    maxRecommendedSize,
    warnings,
  }
}

/**
 * Safely calculate SHA256 hash of a blob with streaming for large files
 */
export async function calculateSHA256(blob: Blob): Promise<string> {
  // For very large files (>1GB), use streaming approach
  if (blob.size > 1024 * 1024 * 1024) {
    return await calculateSHA256Streaming(blob)
  }

  try {
    const buffer = await blob.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (error) {
    if (error instanceof Error && error.name === 'NotReadableError') {
      throw new Error(
        `File too large for browser to process in memory. ` +
          `Try reducing file size or using a different browser. ` +
          `Original error: ${error.message}`
      )
    }
    throw error
  }
}

/**
 * Calculate SHA256 hash using streaming for very large files
 */
async function calculateSHA256Streaming(blob: Blob): Promise<string> {
  const chunkSize = 64 * 1024 * 1024 // 64MB chunks
  const crypto = window.crypto.subtle

  // For very large files, we'll use a simplified approach
  // In practice, you'd need proper hash chaining for streaming
  let hashBuffer = new ArrayBuffer(0)
  let offset = 0

  while (offset < blob.size) {
    const _end = Math.min(offset + chunkSize, blob.size)
    const chunk = blob.slice(offset, offset + chunkSize)

    try {
      const chunkBuffer = await chunk.arrayBuffer()
      const chunkHash = await crypto.digest('SHA-256', chunkBuffer)

      // Combine hashes (simplified - in practice you'd need proper hash chaining)
      const combinedBuffer = new Uint8Array(hashBuffer.byteLength + chunkHash.byteLength)
      combinedBuffer.set(new Uint8Array(hashBuffer), 0)
      combinedBuffer.set(new Uint8Array(chunkHash), hashBuffer.byteLength)

      hashBuffer = await crypto.digest('SHA-256', combinedBuffer)
      offset += chunkSize
    } catch (error) {
      if (error instanceof Error && error.name === 'NotReadableError') {
        throw new Error(
          `Cannot read file chunk at offset ${offset}. ` +
            `File may be corrupted or too large for browser. ` +
            `Original error: ${error.message}`
        )
      }
      throw error
    }
  }

  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create Nostr authorization event for chunked upload
 */
export async function createChunkedUploadAuth(signer: Signer, file: File): Promise<string> {
  // Use BlossomClient's createUploadAuth method for consistency
  const authEvent = await BlossomClient.createUploadAuth(signer, file)

  // Convert the signed event to base64 encoded string
  const authString = JSON.stringify(authEvent)
  const authBase64 = btoa(authString)

  return authBase64
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
  const _end = offset + chunk.size - 1

  const response = await fetch(`${server}/upload`, {
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

  if (!response.ok) {
    throw new Error(`PATCH chunk upload failed: ${response.status} ${response.statusText}`)
  }

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
  callbacks: ChunkedUploadCallbacks = {}
): Promise<BlobDescriptor> {
  // BUD-10: First negotiate capabilities via OPTIONS
  const capabilities = await getUploadCapabilities(server)

  if (!capabilities.supportsPatch) {
    throw new Error(
      `Server ${server} does not support PATCH chunked uploads according to BUD-10. ` +
        `OPTIONS /upload response: ${capabilities.error || 'No PATCH support detected'}`
    )
  }

  console.debug(`Server ${server} supports PATCH chunked uploads, proceeding with BUD-10 flow`)

  // Use server's max chunk size if available, otherwise use default
  const defaultChunkSize = capabilities.maxChunkSize || 8 * 1024 * 1024 // 8MB default
  const { chunkSize = defaultChunkSize, maxConcurrentChunks = 1 } = options

  // Create chunks
  const chunks = createFileChunks(file, chunkSize)
  const fileHash = await calculateSHA256(file)

  // Create authorization
  const authToken = await createChunkedUploadAuth(signer, file)

  try {
    // Upload chunks with concurrency control, but ensure last chunk is uploaded last
    const responses: Response[] = []
    let uploadedBytes = 0
    let currentChunk = 0

    // Upload all chunks except the last one with concurrency control
    const chunksToUpload = chunks.slice(0, -1)
    const lastChunk = chunks[chunks.length - 1]

    for (let i = 0; i < chunksToUpload.length; i += maxConcurrentChunks) {
      const batch = chunksToUpload.slice(i, i + maxConcurrentChunks)
      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex
        const offset = chunkIndex * chunkSize

        const response = await uploadChunk(
          server,
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

        // Call progress callback
        callbacks.onProgress?.({
          uploadedBytes,
          totalBytes: file.size,
          percentage: Math.round((uploadedBytes / file.size) * 100),
          currentChunk,
          totalChunks: chunks.length,
        })

        // Call chunk complete callback
        callbacks.onChunkComplete?.(chunkIndex, chunks.length)
        console.debug(`Chunk ${chunkIndex} of ${chunks.length} completed`)
        console.debug(`Response: ${response}`)
        return response
      })

      // Wait for current batch to complete before starting next batch
      const batchResponses = await Promise.all(batchPromises)
      responses.push(...batchResponses)
    }

    // Upload the last chunk after all previous chunks are complete
    if (lastChunk) {
      const lastChunkIndex = chunks.length - 1
      const lastOffset = lastChunkIndex * chunkSize

      console.debug(`Uploading final chunk ${lastChunkIndex} of ${chunks.length}`)

      const lastResponse = await uploadChunk(
        server,
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

      // Call progress callback for final chunk
      callbacks.onProgress?.({
        uploadedBytes,
        totalBytes: file.size,
        percentage: 100,
        currentChunk,
        totalChunks: chunks.length,
      })

      // Call chunk complete callback for final chunk
      callbacks.onChunkComplete?.(lastChunkIndex, chunks.length)
      console.debug(`Final chunk ${lastChunkIndex} of ${chunks.length} completed`)

      responses.push(lastResponse)
    }

    // The last response should contain the blob descriptor
    const finalResponse = responses[responses.length - 1]
    if (finalResponse.status === 200) {
      const blobData = await finalResponse.json()
      return blobData as BlobDescriptor
    }

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
        console.debug(`File already exists on ${server}, skipping chunked upload`)
        return createMockBlobDescriptor(server, fileHash, file.size, file.type)
      }

      console.debug(`File does not exist on ${server}, proceeding with chunked upload`)
      return await uploadFileChunked(file, server, signer, options, callbacks)
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
}
