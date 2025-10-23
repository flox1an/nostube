import { BlobDescriptor, BlossomClient, Signer } from 'blossom-client-sdk'

export interface UploadFileWithProgressProps {
  file: File
  server: string
  signer: Signer
}

export async function uploadFileToMultipleServers({
  file,
  servers,
  signer,
}: {
  file: File
  servers: string[]
  signer: Signer
}): Promise<BlobDescriptor[]> {
  const results = await Promise.allSettled(
    servers.map(async server => {
      const uploadAuth = await BlossomClient.createUploadAuth(signer, file)
      const blob = await BlossomClient.uploadBlob(server, file, {
        auth: uploadAuth,
      })
      return blob
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
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
  const auth = await BlossomClient.createUploadAuth(signer, blob.sha256)
  const results = await Promise.allSettled(
    mirrorServers.map(async server => {
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
 * Check if a server supports chunked uploads by making an OPTIONS request
 * Note: Due to CORS restrictions, we may not be able to read the Allow header
 * even if the server supports chunked uploads. In that case, we'll try chunked
 * upload first and fall back to regular upload if it fails.
 */
export async function checkChunkedUploadSupport(server: string): Promise<boolean> {
  try {
    const response = await fetch(`${server}/upload`, {
      method: 'OPTIONS',
    })

    console.debug(`Server ${server} OPTIONS response status:`, response.status)
    console.debug(`Server ${server} all headers:`, Object.fromEntries(response.headers.entries()))

    // Check if the server returns the expected Allow header (case-insensitive)
    const allowHeader = response.headers.get('Allow') || response.headers.get('allow')
    console.debug(`Server ${server} Allow header:`, allowHeader)

    // If we can read the Allow header, check for PATCH method
    if (allowHeader) {
      const supportsPatch = allowHeader.includes('PATCH')
      console.debug(`Server ${server} supports PATCH (from Allow header):`, supportsPatch)
      return supportsPatch
    }

    // If we can't read the Allow header due to CORS, assume the server might support chunked uploads
    // if it returns a 204 status (which indicates the OPTIONS request was successful)
    if (response.status === 204) {
      console.debug(`Server ${server} returned 204 for OPTIONS, assuming chunked upload support`)
      return true
    }

    return false
  } catch (error) {
    console.debug(`Failed to check chunked upload support for ${server}:`, error)
    return false
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
 * Calculate SHA256 hash of a blob
 */
export async function calculateSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
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
 * Upload a single chunk to a server
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
  const response = await fetch(`${server}/upload`, {
    method: 'PATCH',
    headers: {
      'X-SHA-256': fileHash,
      'Upload-Type': fileType,
      'Upload-Length': fileSize.toString(),
      'Upload-Offset': offset.toString(),
      'Content-Length': chunk.size.toString(),
      'Content-Type': 'application/octet-stream',
      Authorization: `Nostr ${authToken}`,
    },
    body: chunk,
  })

  if (!response.ok) {
    throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`)
  }

  return response
}

/**
 * Upload file using chunked upload to a single server
 */
export async function uploadFileChunked(
  file: File,
  server: string,
  signer: Signer,
  options: ChunkedUploadOptions = {},
  callbacks: ChunkedUploadCallbacks = {}
): Promise<BlobDescriptor> {
  const { chunkSize = 20 * 1024 * 1024, maxConcurrentChunks = 2 } = options

  // Check if server supports chunked uploads
  const supportsChunked = await checkChunkedUploadSupport(server)
  if (!supportsChunked) {
    console.debug(
      `Server ${server} does not support chunked uploads, falling back to regular upload`
    )
    const auth = await BlossomClient.createUploadAuth(signer, file)
    return await BlossomClient.uploadBlob(server, file, { auth })
  } else {
    console.debug(`Server ${server} supports chunked uploads, using chunked upload`)
  }

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
    console.debug(`Chunked upload failed for ${server}, falling back to regular upload:`, error)
    // Fallback to regular upload if chunked upload fails
    const auth = await BlossomClient.createUploadAuth(signer, file)
    return await BlossomClient.uploadBlob(server, file, { auth })
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
  const results = await Promise.allSettled(
    servers.map(async server => {
      return await uploadFileChunked(file, server, signer, options, callbacks)
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<BlobDescriptor> => r.status === 'fulfilled')
    .map(r => r.value)
}
