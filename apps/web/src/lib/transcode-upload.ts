import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'

export const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024
export const DEFAULT_MAX_CONCURRENT_CHUNKS = 2

/**
 * Upload a single file to initial servers (chunked) and mirror to additional servers,
 * then extract video metadata from the resulting blobs.
 */
export async function uploadAndProcessFile(
  file: File,
  initialServers: string[],
  mirrorServers: string[],
  signer: Signer,
  onProgress: (progress: ChunkedUploadProgress) => void,
  signal?: AbortSignal
): Promise<VideoVariant> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const uploadedBlobs = await uploadFileToMultipleServersChunked({
    file,
    servers: initialServers,
    signer,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
    signal,
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  let mirroredBlobs: BlobDescriptor[] = []
  if (mirrorServers.length > 0 && uploadedBlobs.length > 0) {
    const mirrorResults = await Promise.all(
      uploadedBlobs.map(blob => mirrorBlobsToServers({ mirrorServers, blob, signer }))
    )
    mirroredBlobs = mirrorResults.flat()
  }

  const video = await processUploadedVideo(file, uploadedBlobs)
  return { ...video, mirroredBlobs }
}
