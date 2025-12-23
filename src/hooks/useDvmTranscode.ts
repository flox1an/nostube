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
  RESOLUTION_DIMENSIONS,
  type DvmHandlerInfo,
} from '@/lib/dvm-utils'
import { extractBlossomHash } from '@/utils/video-event'
import type { VideoVariant } from '@/lib/video-processing'
import type { Subscription } from 'rxjs'

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
  | 'resuming'
  | 'mirroring'
  | 'complete'
  | 'error'

/**
 * State that can be persisted to allow resuming a transcode job
 */
export interface PersistableTranscodeState {
  requestEventId: string
  dvmPubkey: string
  inputVideoUrl: string
  originalDuration?: number
  startedAt: number
  status: 'transcoding' | 'mirroring'
  lastStatusMessage?: string
  lastPercentage?: number
  // Multi-resolution support
  resolutionQueue: string[]
  completedResolutions: string[]
  currentResolution: string
}

export interface StatusMessage {
  timestamp: number
  message: string
  percentage?: number
}

export interface TranscodeProgress {
  status: TranscodeStatus
  message: string
  eta?: number // seconds remaining
  percentage?: number
  statusMessages: StatusMessage[]
  // Multi-resolution queue info
  queue?: {
    resolutions: string[]
    currentIndex: number
    completed: string[]
  }
}

export interface UseDvmTranscodeOptions {
  onComplete?: (video: VideoVariant) => void
  onAllComplete?: () => void
  onStateChange?: (state: PersistableTranscodeState | null) => void
}

export interface UseDvmTranscodeResult {
  status: TranscodeStatus
  progress: TranscodeProgress
  error: string | null
  startTranscode: (
    inputVideoUrl: string,
    originalDuration?: number,
    resolutions?: string[]
  ) => Promise<void>
  resumeTranscode: (state: PersistableTranscodeState) => Promise<void>
  cancel: () => void
  transcodedVideo: VideoVariant | null
}

// 12 hour timeout for resumable jobs
const TRANSCODE_JOB_TIMEOUT_MS = 12 * 60 * 60 * 1000

/**
 * Hook for managing DVM video transcoding workflow
 * Supports resuming transcodes after navigation away
 */
export function useDvmTranscode(options: UseDvmTranscodeOptions = {}): UseDvmTranscodeResult {
  const { onComplete, onAllComplete, onStateChange } = options
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const [status, setStatus] = useState<TranscodeStatus>('idle')
  const [progress, setProgress] = useState<TranscodeProgress>({
    status: 'idle',
    message: '',
    statusMessages: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [transcodedVideo, setTranscodedVideo] = useState<VideoVariant | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const subscriptionRef = useRef<Subscription | null>(null)
  const requestEventIdRef = useRef<string | null>(null)
  const currentStateRef = useRef<PersistableTranscodeState | null>(null)

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
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          sub.unsubscribe()
          reject(new Error('DVM discovery timed out'))
        }
      }, 10000)

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
            if (resolved) return // Already resolved

            const nostrEvent = event as NostrEvent

            // Parse name/about from content (JSON) or tags
            let name: string | undefined
            let about: string | undefined

            try {
              const content = JSON.parse(nostrEvent.content || '{}')
              name = content.name
              about = content.about
            } catch {
              // Content is not JSON, check tags
            }

            // Also check tags for name/about (NIP-89 allows both)
            const nameTag = nostrEvent.tags.find(t => t[0] === 'name')
            const aboutTag = nostrEvent.tags.find(t => t[0] === 'about')
            if (nameTag?.[1]) name = nameTag[1]
            if (aboutTag?.[1]) about = aboutTag[1]

            const handler: DvmHandlerInfo = {
              pubkey: nostrEvent.pubkey,
              name,
              about,
            }

            // Resolve immediately when we find a handler (don't wait for complete)
            resolved = true
            clearTimeout(timeout)
            sub.unsubscribe()
            resolve(handler)
          },
          error: err => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              reject(err)
            }
          },
          complete: () => {
            // If we reach complete without finding a handler, resolve with null
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve(null)
            }
          },
        })
    })
  }, [config.relays])

  /**
   * Subscribe to DVM responses for a job request
   */
  const subscribeToDvmResponses = useCallback(
    (
      requestEventId: string,
      dvmPubkey: string,
      originalDuration?: number,
      requestedResolution?: string
    ): Promise<VideoVariant> => {
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
                  const [, feedbackStatus, statusExtraInfo] = statusTag

                  // Check for content tag (preferred) or fall back to status tag extra info
                  const contentTag = nostrEvent.tags.find(t => t[0] === 'content')
                  const message =
                    contentTag?.[1] ||
                    statusExtraInfo ||
                    (feedbackStatus === 'processing' ? 'Processing video...' : 'Processing...')

                  // Check for eta tag
                  const etaTag = nostrEvent.tags.find(t => t[0] === 'eta')
                  const eta = etaTag?.[1] ? parseInt(etaTag[1], 10) : undefined

                  // Extract percentage from message if present
                  const percentMatch = message?.match(/(\d+)%/)
                  const percentage = percentMatch ? parseInt(percentMatch[1], 10) : undefined

                  if (feedbackStatus === 'processing') {
                    setProgress(prev => {
                      // Skip duplicate consecutive messages
                      const lastMsg = prev.statusMessages[prev.statusMessages.length - 1]
                      if (lastMsg?.message === message) {
                        return { ...prev, status: 'transcoding', message, eta }
                      }
                      return {
                        status: 'transcoding',
                        message,
                        eta,
                        statusMessages: [
                          ...prev.statusMessages,
                          { timestamp: Date.now(), message },
                        ],
                      }
                    })
                  } else if (feedbackStatus === 'error') {
                    clearTimeout(timeout)
                    subscriptionRef.current?.unsubscribe()
                    reject(new Error(contentTag?.[1] || statusExtraInfo || 'DVM processing error'))
                  } else if (feedbackStatus === 'partial') {
                    setProgress(prev => {
                      // Skip duplicate consecutive messages
                      const lastMsg = prev.statusMessages[prev.statusMessages.length - 1]
                      if (lastMsg?.message === message) {
                        return { ...prev, status: 'transcoding', message, percentage, eta }
                      }
                      return {
                        status: 'transcoding',
                        message,
                        percentage,
                        eta,
                        statusMessages: [
                          ...prev.statusMessages,
                          { timestamp: Date.now(), message, percentage },
                        ],
                      }
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

                // Use duration from DVM result, or fall back to original video duration
                const duration = result.duration || originalDuration || 0

                // Calculate bitrate if we have size and duration
                // Bitrate = (size in bytes * 8) / duration in seconds
                let bitrate = result.bitrate
                if (!bitrate && result.size_bytes && duration > 0) {
                  bitrate = Math.round((result.size_bytes * 8) / duration)
                }

                // Use resolution from result, or fall back to requested resolution
                const resolution = result.resolution || requestedResolution || '720p'
                const dimension = RESOLUTION_DIMENSIONS[resolution] || '1280x720'

                // Build VideoVariant from DVM result
                const videoVariant: VideoVariant = {
                  url: result.urls[0],
                  dimension,
                  sizeMB: result.size_bytes ? result.size_bytes / (1024 * 1024) : undefined,
                  duration,
                  bitrate,
                  videoCodec,
                  audioCodec,
                  uploadedBlobs: [],
                  mirroredBlobs: [],
                  inputMethod: 'url',
                  qualityLabel: resolution,
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
   * Query for an existing DVM result event (for resuming)
   */
  const queryForExistingResult = useCallback(
    async (requestEventId: string, dvmPubkey: string): Promise<NostrEvent | null> => {
      const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

      return new Promise(resolve => {
        let found = false
        const timeout = setTimeout(() => {
          if (!found) {
            sub.unsubscribe()
            resolve(null)
          }
        }, 5000)

        const sub = relayPool
          .request(readRelays, [
            {
              kinds: [DVM_RESULT_KIND],
              authors: [dvmPubkey],
              '#e': [requestEventId],
              limit: 1,
            },
          ])
          .subscribe({
            next: event => {
              if (typeof event === 'string') return // EOSE
              found = true
              clearTimeout(timeout)
              sub.unsubscribe()
              resolve(event as NostrEvent)
            },
            complete: () => {
              if (!found) {
                clearTimeout(timeout)
                resolve(null)
              }
            },
          })
      })
    },
    [config.relays]
  )

  /**
   * Build VideoVariant from DVM result content
   */
  const buildVideoVariantFromResult = useCallback(
    (
      result: ReturnType<typeof parseDvmResultContent>,
      originalDuration?: number,
      requestedResolution?: string
    ): VideoVariant => {
      if (!result || !result.urls || result.urls.length === 0) {
        throw new Error('Invalid DVM result: no URLs returned')
      }

      const { videoCodec, audioCodec } = parseCodecsFromMimetype(result.mimetype || '')
      const duration = result.duration || originalDuration || 0

      let bitrate = result.bitrate
      if (!bitrate && result.size_bytes && duration > 0) {
        bitrate = Math.round((result.size_bytes * 8) / duration)
      }

      // Use resolution from result, or fall back to requested resolution, or default to 720p
      const resolution = result.resolution || requestedResolution || '720p'
      const dimension = RESOLUTION_DIMENSIONS[resolution] || '1280x720'

      return {
        url: result.urls[0],
        dimension,
        sizeMB: result.size_bytes ? result.size_bytes / (1024 * 1024) : undefined,
        duration,
        bitrate,
        videoCodec,
        audioCodec,
        uploadedBlobs: [],
        mirroredBlobs: [],
        inputMethod: 'url',
        qualityLabel: resolution,
      }
    },
    []
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
   * Process a single resolution transcode
   */
  const processResolution = useCallback(
    async (
      inputVideoUrl: string,
      resolution: string,
      dvm: DvmHandlerInfo,
      originalDuration?: number,
      queueInfo?: { resolutions: string[]; currentIndex: number; completed: string[] }
    ): Promise<VideoVariant> => {
      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

      // Update progress with queue info
      setProgress(prev => ({
        status: 'transcoding',
        message: `Submitting ${resolution} transcode job...`,
        statusMessages: [
          ...prev.statusMessages,
          { timestamp: Date.now(), message: `Submitting ${resolution} transcode job...` },
        ],
        queue: queueInfo,
      }))

      const jobRequest: EventTemplate = {
        kind: DVM_REQUEST_KIND,
        content: '',
        created_at: nowInSecs(),
        tags: [
          ['i', inputVideoUrl, 'url'],
          ['p', dvm.pubkey],
          ['param', 'mode', 'mp4'],
          ['param', 'resolution', resolution],
          ['relays', ...writeRelays],
        ],
      }

      const signedRequest = await user!.signer.signEvent(jobRequest)
      await relayPool.publish(writeRelays, signedRequest)

      requestEventIdRef.current = signedRequest.id

      // Persist state after successful publish
      const persistedState: PersistableTranscodeState = {
        requestEventId: signedRequest.id,
        dvmPubkey: dvm.pubkey,
        inputVideoUrl,
        originalDuration,
        startedAt: Date.now(),
        status: 'transcoding',
        resolutionQueue: queueInfo?.resolutions || [resolution],
        completedResolutions: queueInfo?.completed || [],
        currentResolution: resolution,
      }
      currentStateRef.current = persistedState
      onStateChange?.(persistedState)

      if (import.meta.env.DEV) {
        console.log(`[DVM] Published ${resolution} job request:`, signedRequest.id)
      }

      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Subscribe and wait for result
      setProgress(prev => ({
        status: 'transcoding',
        message: `Transcoding ${resolution}...`,
        statusMessages: [
          ...prev.statusMessages,
          { timestamp: Date.now(), message: `Waiting for ${resolution} transcode...` },
        ],
        queue: queueInfo,
      }))

      const transcodedResult = await subscribeToDvmResponses(
        signedRequest.id,
        dvm.pubkey,
        originalDuration,
        resolution
      )

      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Mirror to user's servers
      if (currentStateRef.current) {
        const mirroringState: PersistableTranscodeState = {
          ...currentStateRef.current,
          status: 'mirroring',
        }
        currentStateRef.current = mirroringState
        onStateChange?.(mirroringState)
      }

      setStatus('mirroring')
      setProgress(prev => ({
        status: 'mirroring',
        message: `Copying ${resolution} to your servers...`,
        statusMessages: [
          ...prev.statusMessages,
          { timestamp: Date.now(), message: `Copying ${resolution} to your servers...` },
        ],
        queue: queueInfo,
      }))

      const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)

      return mirroredVideo
    },
    [config.relays, user, subscribeToDvmResponses, mirrorTranscodedVideo, onStateChange]
  )

  /**
   * Resume a transcode from persisted state
   */
  const resumeTranscode = useCallback(
    async (persistedState: PersistableTranscodeState) => {
      if (!user) {
        setError('User not logged in')
        return
      }

      // Check for timeout (12 hour limit)
      if (Date.now() - persistedState.startedAt > TRANSCODE_JOB_TIMEOUT_MS) {
        setStatus('error')
        setError('Transcode job expired (started over 12 hours ago)')
        onStateChange?.(null)
        return
      }

      // Get queue info from persisted state
      const resolutionQueue = persistedState.resolutionQueue || [
        persistedState.currentResolution || '720p',
      ]
      const completedResolutions = [...(persistedState.completedResolutions || [])]
      const currentResolution = persistedState.currentResolution || '720p'
      const currentIndex = resolutionQueue.indexOf(currentResolution)

      const queueInfo = {
        resolutions: resolutionQueue,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        completed: completedResolutions,
      }

      setStatus('resuming')
      setProgress({
        status: 'resuming',
        message: `Checking ${currentResolution} transcode status...`,
        statusMessages: [{ timestamp: Date.now(), message: 'Reconnecting to transcode job...' }],
        queue: queueInfo,
      })

      abortControllerRef.current = new AbortController()
      currentStateRef.current = persistedState

      try {
        // Check if result already exists (DVM finished while we were away)
        const existingResult = await queryForExistingResult(
          persistedState.requestEventId,
          persistedState.dvmPubkey
        )

        let mirroredVideo: VideoVariant

        if (existingResult) {
          // DVM finished - start mirroring
          const result = parseDvmResultContent(existingResult.content)
          const videoVariant = buildVideoVariantFromResult(
            result,
            persistedState.originalDuration,
            currentResolution
          )

          // Update state to mirroring
          const mirroringState: PersistableTranscodeState = {
            ...persistedState,
            status: 'mirroring',
          }
          currentStateRef.current = mirroringState
          onStateChange?.(mirroringState)

          setStatus('mirroring')
          setProgress(prev => ({
            status: 'mirroring',
            message: `Copying ${currentResolution} to your servers...`,
            statusMessages: [
              ...prev.statusMessages,
              {
                timestamp: Date.now(),
                message: `${currentResolution} complete! Copying to your servers...`,
              },
            ],
            queue: queueInfo,
          }))

          mirroredVideo = await mirrorTranscodedVideo(videoVariant)
        } else {
          // DVM still processing - resubscribe
          setStatus('transcoding')
          setProgress(prev => ({
            status: 'transcoding',
            message: persistedState.lastStatusMessage || `Transcoding ${currentResolution}...`,
            percentage: persistedState.lastPercentage,
            statusMessages: [
              ...prev.statusMessages,
              { timestamp: Date.now(), message: 'Reconnected - waiting for completion...' },
            ],
            queue: queueInfo,
          }))

          requestEventIdRef.current = persistedState.requestEventId

          const transcodedResult = await subscribeToDvmResponses(
            persistedState.requestEventId,
            persistedState.dvmPubkey,
            persistedState.originalDuration,
            currentResolution
          )

          // Check if cancelled
          if (abortControllerRef.current?.signal.aborted) {
            setStatus('idle')
            return
          }

          // Update state to mirroring
          const mirroringState: PersistableTranscodeState = {
            ...persistedState,
            status: 'mirroring',
          }
          currentStateRef.current = mirroringState
          onStateChange?.(mirroringState)

          setStatus('mirroring')
          setProgress(prev => ({
            status: 'mirroring',
            message: `Copying ${currentResolution} to your servers...`,
            statusMessages: [
              ...prev.statusMessages,
              { timestamp: Date.now(), message: `Copying ${currentResolution} to your servers...` },
            ],
            queue: queueInfo,
          }))

          mirroredVideo = await mirrorTranscodedVideo(transcodedResult)
        }

        // Mark current resolution as complete
        completedResolutions.push(currentResolution)
        setTranscodedVideo(mirroredVideo)
        onComplete?.(mirroredVideo)

        // Check if there are more resolutions to process
        const remainingResolutions = resolutionQueue.slice(currentIndex + 1)

        if (remainingResolutions.length > 0) {
          // Continue with remaining resolutions
          setProgress(prev => ({
            status: 'transcoding',
            message: `${currentResolution} complete, continuing with remaining...`,
            statusMessages: [
              ...prev.statusMessages,
              { timestamp: Date.now(), message: `${currentResolution} complete!` },
            ],
            queue: {
              resolutions: resolutionQueue,
              currentIndex: currentIndex + 1,
              completed: completedResolutions,
            },
          }))

          // Discover DVM and continue with remaining resolutions
          const dvm = await discoverDvm()
          if (!dvm) {
            throw new Error('No DVM transcoding service found')
          }

          for (let i = currentIndex + 1; i < resolutionQueue.length; i++) {
            const resolution = resolutionQueue[i]
            const newQueueInfo = {
              resolutions: resolutionQueue,
              currentIndex: i,
              completed: [...completedResolutions],
            }

            const video = await processResolution(
              persistedState.inputVideoUrl,
              resolution,
              dvm,
              persistedState.originalDuration,
              newQueueInfo
            )

            completedResolutions.push(resolution)
            setTranscodedVideo(video)
            onComplete?.(video)

            setProgress(prev => ({
              status: i === resolutionQueue.length - 1 ? 'complete' : 'transcoding',
              message:
                i === resolutionQueue.length - 1
                  ? 'All transcodes complete!'
                  : `${resolution} complete, starting next...`,
              statusMessages: [
                ...prev.statusMessages,
                { timestamp: Date.now(), message: `${resolution} complete!` },
              ],
              queue: {
                resolutions: resolutionQueue,
                currentIndex: i + 1,
                completed: [...completedResolutions],
              },
            }))
          }
        }

        // All complete - clear persisted state
        currentStateRef.current = null
        onStateChange?.(null)

        setStatus('complete')
        setProgress(prev => ({
          status: 'complete',
          message: 'All transcodes complete!',
          statusMessages: [
            ...prev.statusMessages,
            { timestamp: Date.now(), message: 'All transcodes complete!' },
          ],
          queue: {
            resolutions: resolutionQueue,
            currentIndex: resolutionQueue.length,
            completed: completedResolutions,
          },
        }))

        onAllComplete?.()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setStatus('error')
        setError(errorMessage)
        currentStateRef.current = null
        onStateChange?.(null)
        setProgress(prev => ({
          status: 'error',
          message: errorMessage,
          statusMessages: [
            ...prev.statusMessages,
            { timestamp: Date.now(), message: `Error: ${errorMessage}` },
          ],
          queue: prev.queue,
        }))
      }
    },
    [
      user,
      onStateChange,
      onComplete,
      onAllComplete,
      queryForExistingResult,
      buildVideoVariantFromResult,
      subscribeToDvmResponses,
      mirrorTranscodedVideo,
      discoverDvm,
      processResolution,
    ]
  )

  /**
   * Start the transcode workflow for one or more resolutions
   */
  const startTranscode = useCallback(
    async (inputVideoUrl: string, originalDuration?: number, resolutions: string[] = ['720p']) => {
      if (!user) {
        setError('User not logged in')
        return
      }

      // Reset state
      setError(null)
      setTranscodedVideo(null)
      abortControllerRef.current = new AbortController()

      const completedResolutions: string[] = []

      try {
        // Step 1: Discover DVM
        setStatus('discovering')
        setProgress({
          status: 'discovering',
          message: 'Finding transcoding service...',
          statusMessages: [],
          queue: {
            resolutions,
            currentIndex: 0,
            completed: [],
          },
        })

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

        // Process each resolution sequentially
        setStatus('transcoding')

        for (let i = 0; i < resolutions.length; i++) {
          const resolution = resolutions[i]
          const queueInfo = {
            resolutions,
            currentIndex: i,
            completed: [...completedResolutions],
          }

          // Process this resolution
          const mirroredVideo = await processResolution(
            inputVideoUrl,
            resolution,
            dvm,
            originalDuration,
            queueInfo
          )

          // Add to completed list
          completedResolutions.push(resolution)

          // Notify completion for this resolution
          setTranscodedVideo(mirroredVideo)
          onComplete?.(mirroredVideo)

          // Update progress
          setProgress(prev => ({
            status: i === resolutions.length - 1 ? 'complete' : 'transcoding',
            message:
              i === resolutions.length - 1
                ? 'All transcodes complete!'
                : `${resolution} complete, starting next...`,
            statusMessages: [
              ...prev.statusMessages,
              { timestamp: Date.now(), message: `${resolution} complete!` },
            ],
            queue: {
              resolutions,
              currentIndex: i + 1,
              completed: [...completedResolutions],
            },
          }))
        }

        // All complete - clear persisted state
        currentStateRef.current = null
        onStateChange?.(null)

        setStatus('complete')
        setProgress(prev => ({
          status: 'complete',
          message: 'All transcodes complete!',
          statusMessages: [
            ...prev.statusMessages,
            { timestamp: Date.now(), message: 'All transcodes complete!' },
          ],
          queue: {
            resolutions,
            currentIndex: resolutions.length,
            completed: completedResolutions,
          },
        }))

        onAllComplete?.()
      } catch (err) {
        if (err instanceof Error && err.message === 'Cancelled') {
          currentStateRef.current = null
          onStateChange?.(null)
          setStatus('idle')
          setProgress({ status: 'idle', message: '', statusMessages: [] })
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setStatus('error')
        setError(errorMessage)
        currentStateRef.current = null
        onStateChange?.(null)
        setProgress(prev => ({
          status: 'error',
          message: errorMessage,
          statusMessages: [
            ...prev.statusMessages,
            { timestamp: Date.now(), message: `Error: ${errorMessage}` },
          ],
          queue: prev.queue,
        }))
      }
    },
    [user, discoverDvm, processResolution, onComplete, onAllComplete, onStateChange]
  )

  /**
   * Cancel the transcode operation
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    subscriptionRef.current?.unsubscribe()

    // Clear persisted state
    currentStateRef.current = null
    onStateChange?.(null)

    setStatus('idle')
    setProgress({ status: 'idle', message: '', statusMessages: [] })
    setError(null)
  }, [onStateChange])

  return {
    status,
    progress,
    error,
    startTranscode,
    resumeTranscode,
    cancel,
    transcodedVideo,
  }
}
