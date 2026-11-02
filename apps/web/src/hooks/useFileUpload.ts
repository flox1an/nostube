import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import { type ChunkedUploadProgress, deleteBlobsFromServers } from '@/lib/blossom-upload'
import { type BlobActivity, trackBlobActivity, uploadAndMirror } from '@/lib/transcode-upload'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileUploadOptions {
  initialServers: string[]
  mirrorServers?: string[]
  signer: Signer
}

export interface FileUploadResult {
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
}

export interface UploadCallOptions {
  /** Report into the caller's activity (several files, one operation) instead of a new one. */
  activity?: BlobActivity
  /** Enables retrying failed mirrors later; receives the copies the retry placed. */
  onMirrorRetry?: (blobs: BlobDescriptor[]) => void
}

export interface UseFileUploadReturn {
  upload: (file: File, options?: UploadCallOptions) => Promise<FileUploadResult>
  deleteBlobs: (blobs: BlobDescriptor[]) => Promise<void>
  progress: ChunkedUploadProgress | null
  uploading: boolean
  error: string | null
  reset: () => void
}

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

  const upload = useCallback(
    async (file: File, callOptions: UploadCallOptions = {}): Promise<FileUploadResult> => {
      const { initialServers, mirrorServers = [], signer } = optionsRef.current

      setUploading(true)
      setError(null)
      setProgress(null)

      const controller = new AbortController()
      const activity =
        callOptions.activity ??
        trackBlobActivity(file.name, signer, {
          cancel: () => controller.abort(),
          onMirrorRetry: callOptions.onMirrorRetry,
        })
      const ownsActivity = !callOptions.activity

      try {
        const result = await uploadAndMirror({
          file,
          initialServers,
          mirrorServers,
          activity,
          signal: controller.signal,
          onProgress: next => {
            setProgress(next)
            activity.bytes(next.uploadedBytes, next.totalBytes)
          },
        })
        if (ownsActivity) activity.finish()
        setUploading(false)
        return result
      } catch (err) {
        if (ownsActivity) activity.finish(err)
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setUploading(false)
        throw err
      }
    },
    []
  )

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
