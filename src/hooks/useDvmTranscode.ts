import { useState, useCallback, useRef, useEffect } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { relayPool } from '@/nostr/core'
import { type EventTemplate, type NostrEvent } from 'nostr-tools'
import { nowInSecs } from '@/lib/utils'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import {
  parseDvmResultContent,
  parseCodecsFromMimetype,
  type DvmHandlerInfo,
} from '@/lib/dvm-utils'
import { extractBlossomHash } from '@/utils/video-event'
import type { VideoVariant } from '@/lib/video-processing'
import { Subscription } from 'rxjs'

// DVM kinds for video transform
const DVM_REQUEST_KIND = 5207
const DVM_RESULT_KIND = 6207
const DVM_FEEDBACK_KIND = 7000

// NIP-89 handler info kind
const HANDLER_INFO_KIND = 31990

export type TranscodeStatus =
  | 'idle'
  | 'discovering'
  | 'transcoding'
  | 'mirroring'
  | 'complete'
  | 'error'

export interface TranscodeProgress {
  status: TranscodeStatus
  message: string
  eta?: number // seconds remaining
  percentage?: number
}

export interface UseDvmTranscodeResult {
  status: TranscodeStatus
  progress: TranscodeProgress
  error: string | null
  startTranscode: (inputVideoUrl: string) => Promise<void>
  cancel: () => void
  transcodedVideo: VideoVariant | null
}

/**
 * Hook for managing DVM video transcoding workflow
 */
export function useDvmTranscode(onComplete?: (video: VideoVariant) => void): UseDvmTranscodeResult {
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const [status, setStatus] = useState<TranscodeStatus>('idle')
  const [progress, setProgress] = useState<TranscodeProgress>({
    status: 'idle',
    message: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [transcodedVideo, setTranscodedVideo] = useState<VideoVariant | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const subscriptionRef = useRef<Subscription | null>(null)
  const requestEventIdRef = useRef<string | null>(null)

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
      abortControllerRef.current?.abort()
    }
  }, [])

  /**
   * Discover available DVM handlers for video transform
   */
  const discoverDvm = useCallback(async (): Promise<DvmHandlerInfo | null> => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    if (readRelays.length === 0) {
      throw new Error('No read relays configured')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.unsubscribe()
        reject(new Error('DVM discovery timed out'))
      }, 10000)

      let foundHandler: DvmHandlerInfo | null = null

      const sub = relayPool
        .request(readRelays, [
          {
            kinds: [HANDLER_INFO_KIND],
            '#k': ['5207'],
            '#d': ['video-transform-hls'],
            limit: 1,
          },
        ])
        .subscribe({
          next: event => {
            if (typeof event === 'string') return // EOSE

            const nostrEvent = event as NostrEvent
            try {
              const content = JSON.parse(nostrEvent.content || '{}')
              foundHandler = {
                pubkey: nostrEvent.pubkey,
                name: content.name,
                about: content.about,
              }
            } catch {
              foundHandler = {
                pubkey: nostrEvent.pubkey,
              }
            }
          },
          error: err => {
            clearTimeout(timeout)
            sub.unsubscribe()
            reject(err)
          },
          complete: () => {
            clearTimeout(timeout)
            resolve(foundHandler)
          },
        })
    })
  }, [config.relays])

  /**
   * Subscribe to DVM responses for a job request
   */
  const subscribeToDvmResponses = useCallback(
    (requestEventId: string, dvmPubkey: string): Promise<VideoVariant> => {
      const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            subscriptionRef.current?.unsubscribe()
            reject(new Error('DVM job timed out after 10 minutes'))
          },
          10 * 60 * 1000
        ) // 10 minute timeout

        subscriptionRef.current = relayPool
          .subscription(readRelays, [
            {
              kinds: [DVM_FEEDBACK_KIND, DVM_RESULT_KIND],
              authors: [dvmPubkey],
              '#e': [requestEventId],
            },
          ])
          .subscribe({
            next: async event => {
              if (typeof event === 'string') return // EOSE

              const nostrEvent = event as NostrEvent

              if (nostrEvent.kind === DVM_FEEDBACK_KIND) {
                // Handle feedback
                const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                if (statusTag) {
                  const [, feedbackStatus, extraInfo] = statusTag

                  if (feedbackStatus === 'processing') {
                    setProgress({
                      status: 'transcoding',
                      message: extraInfo || 'Processing video...',
                    })
                  } else if (feedbackStatus === 'error') {
                    clearTimeout(timeout)
                    subscriptionRef.current?.unsubscribe()
                    reject(new Error(extraInfo || 'DVM processing error'))
                  } else if (feedbackStatus === 'partial') {
                    // Parse percentage from extra info if available
                    const percentMatch = extraInfo?.match(/(\d+)%/)
                    const percentage = percentMatch ? parseInt(percentMatch[1], 10) : undefined
                    setProgress({
                      status: 'transcoding',
                      message: extraInfo || 'Processing...',
                      percentage,
                    })
                  }
                }
              } else if (nostrEvent.kind === DVM_RESULT_KIND) {
                // Handle result
                clearTimeout(timeout)
                subscriptionRef.current?.unsubscribe()

                const result = parseDvmResultContent(nostrEvent.content)
                if (!result || !result.urls || result.urls.length === 0) {
                  reject(new Error('Invalid DVM result: no URLs returned'))
                  return
                }

                // Parse codecs from mimetype
                const { videoCodec, audioCodec } = parseCodecsFromMimetype(result.mimetype || '')

                // Build VideoVariant from DVM result
                const videoVariant: VideoVariant = {
                  url: result.urls[0],
                  dimension: result.resolution === '720p' ? '1280x720' : '1280x720',
                  sizeMB: result.size_bytes ? result.size_bytes / (1024 * 1024) : undefined,
                  duration: 0, // Will be updated when mirroring
                  videoCodec,
                  audioCodec,
                  uploadedBlobs: [],
                  mirroredBlobs: [],
                  inputMethod: 'url',
                  qualityLabel: result.resolution || '720p',
                }

                resolve(videoVariant)
              }
            },
            error: err => {
              clearTimeout(timeout)
              reject(err)
            },
          })
      })
    },
    [config.relays]
  )

  /**
   * Mirror transcoded video to user's Blossom servers
   */
  const mirrorTranscodedVideo = useCallback(
    async (video: VideoVariant): Promise<VideoVariant> => {
      if (!user) throw new Error('User not logged in')

      const uploadServers =
        config.blossomServers?.filter(s => s.tags.includes('initial upload')).map(s => s.url) || []
      const mirrorServers =
        config.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []

      if (uploadServers.length === 0 && mirrorServers.length === 0) {
        // No servers configured, return video as-is with DVM URL
        console.warn('[DVM] No Blossom servers configured, using temp DVM URL')
        return video
      }

      // Try to extract SHA256 from Blossom URL first (format: /sha256.ext)
      const { sha256: urlHash } = extractBlossomHash(video.url!)

      // Create a BlobDescriptor from the DVM result URL
      let sha256: string | undefined = urlHash
      let size: number | undefined

      // If not found in URL, try HEAD request
      if (!sha256) {
        try {
          const headResponse = await fetch(video.url!, { method: 'HEAD' })
          sha256 = headResponse.headers.get('x-sha-256') || undefined
          const contentLength = headResponse.headers.get('content-length')
          size = contentLength ? parseInt(contentLength, 10) : undefined
        } catch {
          // Continue without hash - mirroring may still work
        }
      } else {
        // We have hash from URL, still try to get size from HEAD
        try {
          const headResponse = await fetch(video.url!, { method: 'HEAD' })
          const contentLength = headResponse.headers.get('content-length')
          size = contentLength ? parseInt(contentLength, 10) : undefined
        } catch {
          // Use size from video if available
          size = video.sizeMB ? Math.round(video.sizeMB * 1024 * 1024) : undefined
        }
      }

      if (!sha256) {
        console.warn('[DVM] Could not get SHA256 hash, cannot mirror to user servers')
        return video
      }

      const sourceBlob: BlobDescriptor = {
        url: video.url!,
        sha256,
        size: size || 0,
        type: 'video/mp4',
        uploaded: Date.now(),
      }

      const updatedVideo = { ...video }

      // Mirror to upload servers first (these become the primary URL)
      if (uploadServers.length > 0) {
        try {
          const uploadedBlobs = await mirrorBlobsToServers({
            mirrorServers: uploadServers,
            blob: sourceBlob,
            signer: async draft => await user.signer.signEvent(draft),
          })
          updatedVideo.uploadedBlobs = uploadedBlobs
          // Use the first uploaded blob URL as primary
          if (uploadedBlobs.length > 0) {
            updatedVideo.url = uploadedBlobs[0].url
            if (import.meta.env.DEV) {
              console.log('[DVM] Mirrored to upload server:', uploadedBlobs[0].url)
            }
          }
        } catch (err) {
          console.warn('[DVM] Failed to mirror to upload servers:', err)
        }
      }

      // Mirror to mirror servers (these become fallbacks)
      if (mirrorServers.length > 0) {
        try {
          const mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers,
            blob: sourceBlob,
            signer: async draft => await user.signer.signEvent(draft),
          })
          updatedVideo.mirroredBlobs = mirroredBlobs
          if (import.meta.env.DEV) {
            console.log('[DVM] Mirrored to', mirroredBlobs.length, 'mirror servers')
          }
        } catch (err) {
          console.warn('[DVM] Failed to mirror to mirror servers:', err)
        }
      }

      return updatedVideo
    },
    [user, config.blossomServers]
  )

  /**
   * Start the transcode workflow
   */
  const startTranscode = useCallback(
    async (inputVideoUrl: string) => {
      if (!user) {
        setError('User not logged in')
        return
      }

      // Reset state
      setError(null)
      setTranscodedVideo(null)
      abortControllerRef.current = new AbortController()

      try {
        // Step 1: Discover DVM
        setStatus('discovering')
        setProgress({ status: 'discovering', message: 'Finding transcoding service...' })

        const dvm = await discoverDvm()
        if (!dvm) {
          throw new Error('No DVM transcoding service found')
        }

        if (import.meta.env.DEV) {
          console.log('[DVM] Found handler:', dvm)
        }

        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          setStatus('idle')
          return
        }

        // Step 2: Publish job request
        setStatus('transcoding')
        setProgress({ status: 'transcoding', message: 'Submitting transcode job...' })

        const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

        const jobRequest: EventTemplate = {
          kind: DVM_REQUEST_KIND,
          content: '',
          created_at: nowInSecs(),
          tags: [
            ['i', inputVideoUrl, 'url'],
            ['p', dvm.pubkey],
            ['param', 'mode', 'mp4'],
            ['param', 'resolution', '720p'],
            ['relays', ...writeRelays],
          ],
        }

        const signedRequest = await user.signer.signEvent(jobRequest)
        await relayPool.publish(writeRelays, signedRequest)

        requestEventIdRef.current = signedRequest.id

        if (import.meta.env.DEV) {
          console.log('[DVM] Published job request:', signedRequest.id)
        }

        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          setStatus('idle')
          return
        }

        // Step 3: Subscribe and wait for result
        setProgress({ status: 'transcoding', message: 'Waiting for transcode to complete...' })

        const transcodedResult = await subscribeToDvmResponses(signedRequest.id, dvm.pubkey)

        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          setStatus('idle')
          return
        }

        // Step 4: Mirror to user's servers
        setStatus('mirroring')
        setProgress({ status: 'mirroring', message: 'Copying to your servers...' })

        const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)

        // Complete
        setStatus('complete')
        setProgress({ status: 'complete', message: 'Transcode complete!' })
        setTranscodedVideo(mirroredVideo)

        if (onComplete) {
          onComplete(mirroredVideo)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setStatus('error')
        setError(errorMessage)
        setProgress({ status: 'error', message: errorMessage })
      }
    },
    [user, config.relays, discoverDvm, subscribeToDvmResponses, mirrorTranscodedVideo, onComplete]
  )

  /**
   * Cancel the transcode operation
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    subscriptionRef.current?.unsubscribe()

    // Optionally publish delete request for the job
    // (not implemented yet - would require kind:5 event)

    setStatus('idle')
    setProgress({ status: 'idle', message: '' })
    setError(null)
  }, [])

  return {
    status,
    progress,
    error,
    startTranscode,
    cancel,
    transcodedVideo,
  }
}
