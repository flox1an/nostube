import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import {
  type ChunkedUploadProgress,
  deleteBlobsFromServers,
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
} from '@/lib/blossom-upload'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileUploadOptions {
  initialServers: string[]
  mirrorServers?: string[]
  signer: Signer
  chunkSize?: number // default 10 * 1024 * 1024 (10 MB)
  maxConcurrentChunks?: number // default 2
}

export interface FileUploadResult {
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
}

export interface UseFileUploadReturn {
  upload: (file: File) => Promise<FileUploadResult>
  deleteBlobs: (blobs: BlobDescriptor[]) => Promise<void>
  progress: ChunkedUploadProgress | null
  uploading: boolean
  error: string | null
  reset: () => void
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024 // 10 MB
const DEFAULT_MAX_CONCURRENT_CHUNKS = 2

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileUpload(options: FileUploadOptions): UseFileUploadReturn {
  const [progress, setProgress] = useState<ChunkedUploadProgress | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep a stable ref to options so the callbacks never go stale
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const upload = useCallback(async (file: File): Promise<FileUploadResult> => {
    const {
      initialServers,
      mirrorServers = [],
      signer,
      chunkSize = DEFAULT_CHUNK_SIZE,
      maxConcurrentChunks = DEFAULT_MAX_CONCURRENT_CHUNKS,
    } = optionsRef.current

    setUploading(true)
    setError(null)
    setProgress(null)

    try {
      // Upload to initial servers
      const uploadedBlobs = await uploadFileToMultipleServersChunked({
        file,
        servers: initialServers,
        signer,
        options: { chunkSize, maxConcurrentChunks },
        callbacks: { onProgress: setProgress },
      })

      // Mirror to backup servers if configured
      let mirroredBlobs: BlobDescriptor[] = []
      if (mirrorServers.length > 0 && uploadedBlobs.length > 0) {
        const mirrorResults = await Promise.all(
          uploadedBlobs.map(blob => mirrorBlobsToServers({ mirrorServers, blob, signer }))
        )
        mirroredBlobs = mirrorResults.flat()
      }

      setUploading(false)
      return { uploadedBlobs, mirroredBlobs }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setUploading(false)
      throw err
    }
  }, [])

  const deleteBlobs = useCallback(async (blobs: BlobDescriptor[]): Promise<void> => {
    if (blobs.length === 0) return
    await deleteBlobsFromServers(blobs, optionsRef.current.signer)
  }, [])

  const reset = useCallback(() => {
    setProgress(null)
    setUploading(false)
    setError(null)
  }, [])

  return { upload, deleteBlobs, progress, uploading, error, reset }
}
