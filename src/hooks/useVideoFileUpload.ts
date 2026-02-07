import { useState, useCallback } from 'react'
import { type BlobDescriptor, type Signer } from 'blossom-client-sdk'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { type VideoVariant, processUploadedVideo, processVideoUrl } from '@/lib/video-processing'
import { parseBlossomUrl } from '@/lib/blossom-url'

export type VideoFileUploadStatus =
  | 'idle'
  | 'uploading'
  | 'probing'
  | 'mirroring'
  | 'done'
  | 'error'

export interface VideoFileUploadResult {
  variant: VideoVariant
}

interface UseVideoFileUploadOptions {
  initialUploadServers: string[]
  mirrorServers: string[]
  signer: Signer
}

export interface UseVideoFileUploadReturn {
  status: VideoFileUploadStatus
  uploadProgress: ChunkedUploadProgress | null
  mirrorProgress: { completed: number; total: number } | null
  result: VideoVariant | null
  error: string | null
  uploadFile: (file: File) => Promise<VideoVariant>
  processUrl: (url: string) => Promise<VideoVariant>
  reset: () => void
}

/**
 * Reusable hook for uploading a video file to blossom servers,
 * probing metadata, and mirroring to backup servers.
 *
 * Used by both the upload wizard and the edit video dialog.
 */
export function useVideoFileUpload(options: UseVideoFileUploadOptions): UseVideoFileUploadReturn {
  const { initialUploadServers, mirrorServers, signer } = options

  const [status, setStatus] = useState<VideoFileUploadStatus>('idle')
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [mirrorProgress, setMirrorProgress] = useState<{
    completed: number
    total: number
  } | null>(null)
  const [result, setResult] = useState<VideoVariant | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setUploadProgress(null)
    setMirrorProgress(null)
    setResult(null)
    setError(null)
  }, [])

  const uploadFile = useCallback(
    async (file: File): Promise<VideoVariant> => {
      setError(null)
      setResult(null)
      setMirrorProgress(null)

      try {
        // Step 1: Upload
        setStatus('uploading')
        setUploadProgress({
          uploadedBytes: 0,
          totalBytes: file.size,
          percentage: 0,
          currentChunk: 0,
          totalChunks: 1,
        })

        const uploadedBlobs = await uploadFileToMultipleServersChunked({
          file,
          servers: initialUploadServers,
          signer,
          options: {
            chunkSize: 10 * 1024 * 1024,
            maxConcurrentChunks: 2,
          },
          callbacks: {
            onProgress: progress => {
              setUploadProgress(progress)
            },
          },
        })

        // Step 2: Probe video metadata
        setStatus('probing')
        setUploadProgress(null)
        const videoVariant = await processUploadedVideo(file, uploadedBlobs)

        // Step 3: Mirror
        let mirroredBlobs: BlobDescriptor[] = []
        if (mirrorServers.length > 0 && uploadedBlobs[0]) {
          setStatus('mirroring')
          setMirrorProgress({ completed: 0, total: mirrorServers.length })

          mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers,
            blob: uploadedBlobs[0],
            signer,
          })

          setMirrorProgress({ completed: mirroredBlobs.length, total: mirrorServers.length })
        }

        const finalVariant: VideoVariant = { ...videoVariant, mirroredBlobs }
        setResult(finalVariant)
        setStatus('done')
        return finalVariant
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown upload error'
        setError(message)
        setStatus('error')
        throw err
      }
    },
    [initialUploadServers, mirrorServers, signer]
  )

  const processUrl = useCallback(
    async (url: string): Promise<VideoVariant> => {
      setError(null)
      setResult(null)
      setUploadProgress(null)
      setMirrorProgress(null)

      try {
        setStatus('probing')

        // Check if it's a Blossom URL and mirror if possible
        const blossomInfo = parseBlossomUrl(url)
        let mirroredBlobs: BlobDescriptor[] = []

        if (blossomInfo.isBlossomUrl && blossomInfo.sha256 && mirrorServers.length > 0) {
          try {
            setStatus('mirroring')
            setMirrorProgress({ completed: 0, total: mirrorServers.length })

            const originalBlob: BlobDescriptor = {
              url,
              sha256: blossomInfo.sha256,
              size: 0,
              type: 'video/mp4',
              uploaded: Date.now(),
            }

            mirroredBlobs = await mirrorBlobsToServers({
              mirrorServers,
              blob: originalBlob,
              signer,
            })

            setMirrorProgress({ completed: mirroredBlobs.length, total: mirrorServers.length })
          } catch (mirrorErr) {
            console.error('Failed to mirror Blossom URL:', mirrorErr)
          }
        }

        setStatus('probing')
        const videoVariant = await processVideoUrl(url, mirroredBlobs)

        setResult(videoVariant)
        setStatus('done')
        return videoVariant
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error processing URL'
        setError(message)
        setStatus('error')
        throw err
      }
    },
    [mirrorServers, signer]
  )

  return {
    status,
    uploadProgress,
    mirrorProgress,
    result,
    error,
    uploadFile,
    processUrl,
    reset,
  }
}
