import { useState, useCallback, useRef, useEffect } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import { type EventTemplate, type NostrEvent } from 'nostr-tools'
import { nowInSecs } from '@/lib/utils'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import {
  parseDvmResultContent,
  parseCodecsFromMimetype,
  RESOLUTION_DIMENSIONS,
  buildDvmEncryptedContent,
  parseDvmEncryptedStatus,
  parseDvmBid,
  type DvmBid,
  type DvmHandlerInfo,
  type TranscodeCodec,
} from '@/lib/dvm-utils'
import { extractBlossomHash } from '@/utils/video-event'
import type { VideoVariant } from '@/lib/video-processing'
import type { Subscription } from 'rxjs'
import { useMemo } from 'react'

// DVM kinds for video transform
const DVM_REQUEST_KIND = 5207
const DVM_RESULT_KIND = 6207
const DVM_FEEDBACK_KIND = 7000

// DVM event expiration (24 hours)
const DVM_EVENT_EXPIRATION_SECS = 24 * 60 * 60

export type TranscodeStatus =
  | 'idle'
  | 'discovering'
  | 'bidding'
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
  phase?: 'transcoding' | 'uploading' | 'mirroring'
  statusMessages: StatusMessage[]
  // Multi-resolution queue info
  queue?: {
    resolutions: string[]
    currentIndex: number
    completed: string[]
  }
}

/**
 * Detect the current transcode phase from a DVM feedback message.
 * DVM sends "Transcoding..." during re-encoding and "Uploading..." when uploading results.
 */
function detectPhaseFromMessage(message?: string): 'transcoding' | 'uploading' | 'mirroring' {
  if (!message) return 'transcoding'
  const lower = message.toLowerCase()
  if (lower.startsWith('uploading')) return 'uploading'
  if (lower.startsWith('transcoding') || lower.startsWith('re-encoding')) return 'transcoding'
  return 'transcoding'
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
 * Check if a Nostr event has the encrypted tag
 */
function hasEncryptedTag(event: NostrEvent): boolean {
  return event.tags.some(t => t[0] === 'encrypted')
}

/**
 * Hook for managing DVM video transcoding workflow
 * Supports resuming transcodes after navigation away
 */
export function useDvmTranscode(options: UseDvmTranscodeOptions = {}): UseDvmTranscodeResult {
  const { onComplete, onAllComplete, onStateChange } = options
  const { user } = useCurrentUser()
  const { config, relayOverride } = useAppContext()
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

  // Combined relays for DVM tracking (read + write + override + defaults)
  const dvmRelays = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const combined = new Set([...readRelays, ...writeRelays, ...DEFAULT_RELAYS])
    if (relayOverride) combined.add(relayOverride)
    return Array.from(combined)
  }, [config.relays, relayOverride])

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
    if (dvmRelays.length === 0) {
      throw new Error('No relays configured')
    }

    // Use a custom promise to handle collecting multiple DVM events and then selecting the newest
    return new Promise((resolve, reject) => {
      let dvmHandlers: (DvmHandlerInfo & { createdAt: number })[] = []
      let timer: number | undefined
      let sub: any // Subscription object

      // Timeout to resolve after a certain period if no DVMs are found or all relays have sent EOSE
      timer = window.setTimeout(() => {
        sub?.unsubscribe() // Ensure the subscription is cleaned up
        if (dvmHandlers.length > 0) {
          // Sort by createdAt descending and pick the newest
          const newestDvm = dvmHandlers.sort((a, b) => b.createdAt - a.createdAt)[0]
          resolve(newestDvm)
        } else {
          resolve(null) // No DVMs found
        }
      }, 5000) // 5 second timeout for DVM discovery

      sub = relayPool
        .request(dvmRelays, [
          {
            kinds: [31990],
            '#k': ['5207'],
            '#d': ['video-transform-hls'],
            // No limit here, we want to collect all
          },
        ])
        .subscribe({
          next: event => {
            if (typeof event === 'string') return // EOSE
            const nostrEvent = event as NostrEvent

            let name: string | undefined
            let about: string | undefined

            try {
              const content = JSON.parse(nostrEvent.content || '{}')
              name = content.name
              about = content.about
            } catch {
              // Content is not JSON, check tags
            }

            const nameTag = nostrEvent.tags.find(t => t[0] === 'name')
            const aboutTag = nostrEvent.tags.find(t => t[0] === 'about')
            if (nameTag?.[1]) name = nameTag[1]
            if (aboutTag?.[1]) about = aboutTag[1]

            dvmHandlers.push({
              pubkey: nostrEvent.pubkey,
              name,
              about,
              createdAt: nostrEvent.created_at, // Capture created_at for sorting
            })

            console.log('[DVM] Discovered DVM handler:', {
              pubkey: nostrEvent.pubkey,
              name,
              about,
            })
          },
          error: err => {
            clearTimeout(timer)
            reject(err)
          },
          complete: () => {
            clearTimeout(timer)
            if (dvmHandlers.length > 0) {
              // Sort by createdAt descending and pick the newest
              const newestDvm = dvmHandlers.sort((a, b) => b.createdAt - a.createdAt)[0]
              resolve(newestDvm)
            } else {
              resolve(null) // No DVMs found
            }
          },
        })
    })
  }, [dvmRelays])

  /**
   * Collect bids for a job request
   */
  const collectBids = useCallback(
    async (requestEventId: string, timeoutMs: number = 5000): Promise<DvmBid[]> => {
      return new Promise(resolve => {
        const bids: DvmBid[] = []
        const sub = relayPool
          .subscription(dvmRelays, [
            {
              kinds: [DVM_FEEDBACK_KIND],
              '#e': [requestEventId],
            },
          ])
          .subscribe({
            next: event => {
              if (typeof event === 'string') return
              const nostrEvent = event as NostrEvent

              // Log the feedback event (bids are usually unencrypted)
              console.log('[DVM] Bid feedback event:', {
                id: nostrEvent.id,
                pubkey: nostrEvent.pubkey,
                content: nostrEvent.content,
                tags: nostrEvent.tags,
              })

              const bid = parseDvmBid(event)
              if (bid) {
                bids.push(bid)
              }
            },
          })

        setTimeout(() => {
          sub.unsubscribe()
          resolve(bids)
        }, timeoutMs)
      })
    },
    [dvmRelays]
  )

  /**
   * Approve a DVM bid
   */
  const approveBid = useCallback(
    async (requestEventId: string, dvmPubkey: string) => {
      if (!user) throw new Error('User not logged in')

      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

      const approvalEvent: EventTemplate = {
        kind: DVM_FEEDBACK_KIND,
        content: '',
        created_at: nowInSecs(),
        tags: [
          ['e', requestEventId],
          ['p', dvmPubkey],
          ['status', 'approved'],
          ['expiration', String(nowInSecs() + DVM_EVENT_EXPIRATION_SECS)],
        ],
      }

      const signedApproval = await user.signer.signEvent(approvalEvent)
      
      console.log('[DVM] Sending bid approval:', {
        requestEventId,
        dvmPubkey,
        tags: signedApproval.tags,
      })

      await relayPool.publish(writeRelays, signedApproval)
      return signedApproval
    },
    [user, config.relays]
  )

  /**
   * Subscribe to DVM responses for a job request
   * Supports both encrypted (NIP-04) and unencrypted responses
   */
  const subscribeToDvmResponses = useCallback(
    (
      requestEventId: string,
      dvmPubkey: string,
      originalDuration?: number,
      requestedResolution?: string,
      wasEncrypted: boolean = false
    ): Promise<VideoVariant> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            subscriptionRef.current?.unsubscribe()
            reject(new Error('DVM job timed out after 10 minutes'))
          },
          10 * 60 * 1000
        ) // 10 minute timeout

        subscriptionRef.current = relayPool
          .subscription(dvmRelays, [
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
              const currentUser = user // user from outer scope

              if (nostrEvent.kind === DVM_FEEDBACK_KIND) {
                // Handle feedback - check if encrypted
                const isEncrypted = hasEncryptedTag(nostrEvent)

                let feedbackStatus: string | undefined
                let message: string | undefined
                let eta: number | undefined

                if (isEncrypted && wasEncrypted && currentUser?.signer.nip04) {
                  // Decrypt the status content
                  try {
                    const decrypted = await currentUser.signer.nip04.decrypt(
                      dvmPubkey,
                      nostrEvent.content
                    )
                    
                    // Log the unencrypted event content
                    console.log('[DVM] Decrypted feedback event:', {
                      id: nostrEvent.id,
                      pubkey: nostrEvent.pubkey,
                      content: decrypted,
                      tags: nostrEvent.tags,
                    })

                    const parsed = parseDvmEncryptedStatus(decrypted)
                    if (parsed) {
                      feedbackStatus = parsed.status
                      message = parsed.message || undefined
                      eta = parsed.eta || undefined
                    } else if (import.meta.env.DEV) {
                      console.warn('[DVM] Failed to parse decrypted status:', decrypted)
                    }
                  } catch (err) {
                    console.warn('[DVM] Failed to decrypt status event:', err)
                    // Try to fall back to tags if decryption fails
                    const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                    if (statusTag) {
                      const [, status, statusExtraInfo] = statusTag
                      feedbackStatus = status
                      message = statusExtraInfo || 'Processing...'
                    }
                  }
                } else {
                  // Log the unencrypted event
                  console.log('[DVM] Feedback event:', {
                    id: nostrEvent.id,
                    pubkey: nostrEvent.pubkey,
                    content: nostrEvent.content,
                    tags: nostrEvent.tags,
                  })

                  // Parse from tags (unencrypted)
                  const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                  if (statusTag) {
                    const [, status, statusExtraInfo] = statusTag
                    feedbackStatus = status
                    const contentTag = nostrEvent.tags.find(t => t[0] === 'content')
                    message =
                      contentTag?.[1] ||
                      statusExtraInfo ||
                      (feedbackStatus === 'processing' ? 'Processing video...' : 'Processing...')
                    const etaTag = nostrEvent.tags.find(t => t[0] === 'eta')
                    eta = etaTag?.[1] ? parseInt(etaTag[1], 10) : undefined
                  }
                }

                if (feedbackStatus) {
                  // Extract percentage from progress tag first, then fallback to message regex
                  const progressTag = nostrEvent.tags.find(t => t[0] === 'progress')
                  let percentage = progressTag?.[1] ? parseInt(progressTag[1], 10) : undefined

                  if (percentage === undefined) {
                    const percentMatch = message?.match(/(\d+)%/)
                    percentage = percentMatch ? parseInt(percentMatch[1], 10) : undefined
                  }

                  if (feedbackStatus === 'processing' || feedbackStatus === 'partial') {
                    const phase = detectPhaseFromMessage(message)
                    setProgress(prev => {
                      // Skip duplicate consecutive messages
                      const lastMsg = prev.statusMessages[prev.statusMessages.length - 1]
                      if (lastMsg?.message === message && prev.percentage === percentage && prev.phase === phase) {
                        return { ...prev, status: 'transcoding', message: message || '', eta, percentage, phase }
                      }
                      return {
                        status: 'transcoding',
                        message: message || 'Processing...',
                        eta,
                        percentage,
                        phase,
                        statusMessages: [
                          ...prev.statusMessages,
                          { timestamp: Date.now(), message: message || 'Processing...', percentage },
                        ],
                      }
                    })
                  } else if (feedbackStatus === 'error') {
                    clearTimeout(timeout)
                    subscriptionRef.current?.unsubscribe()
                    reject(new Error(message || 'DVM processing error'))
                  }
                }
              } else if (nostrEvent.kind === DVM_RESULT_KIND) {
                // Handle result - check if encrypted
                clearTimeout(timeout)
                subscriptionRef.current?.unsubscribe()

                let resultContent = nostrEvent.content
                const isEncrypted = hasEncryptedTag(nostrEvent)

                if (isEncrypted && wasEncrypted && currentUser?.signer.nip04) {
                  // Decrypt the result content
                  try {
                    resultContent = await currentUser.signer.nip04.decrypt(
                      dvmPubkey,
                      nostrEvent.content
                    )

                    // Log the unencrypted result
                    console.log('[DVM] Decrypted result event:', {
                      id: nostrEvent.id,
                      pubkey: nostrEvent.pubkey,
                      content: resultContent,
                      tags: nostrEvent.tags,
                    })
                  } catch {
                    reject(new Error('Failed to decrypt DVM result'))
                    return
                  }
                } else {
                  // Log the unencrypted result
                  console.log('[DVM] Result event:', {
                    id: nostrEvent.id,
                    pubkey: nostrEvent.pubkey,
                    content: nostrEvent.content,
                    tags: nostrEvent.tags,
                  })
                }

                const result = parseDvmResultContent(resultContent)
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
    [dvmRelays, user]
  )

  /**
   * Query for an existing DVM result event (for resuming)
   */
  const queryForExistingResult = useCallback(
    async (requestEventId: string, dvmPubkey: string): Promise<NostrEvent | null> => {
      return new Promise(resolve => {
        let found = false
        const timeout = setTimeout(() => {
          if (!found) {
            sub.unsubscribe()
            resolve(null)
          }
        }, 5000)

        const sub = relayPool
          .request(dvmRelays, [
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

              const nostrEvent = event as NostrEvent
              console.log('[DVM] Found existing result event:', {
                id: nostrEvent.id,
                pubkey: nostrEvent.pubkey,
                content: nostrEvent.content,
                tags: nostrEvent.tags,
              })

              resolve(nostrEvent)
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
    [dvmRelays]
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
   * Supports NIP-04 encrypted requests when signer supports it
   */
  const processResolution = useCallback(
    async (
      inputVideoUrl: string,
      resolution: string,
      dvm?: DvmHandlerInfo,
      originalDuration?: number,
      queueInfo?: { resolutions: string[]; currentIndex: number; completed: string[] },
      codec: TranscodeCodec = 'h264'
    ): Promise<VideoVariant & { dvmPubkey: string }> => {
      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

      // Update progress with queue info
      setProgress(prev => ({
        status: dvm ? 'transcoding' : 'bidding',
        message: dvm
          ? `Submitting ${resolution} transcode job...`
          : `Broadcasting ${resolution} transcode request...`,
        statusMessages: [
          ...prev.statusMessages,
          {
            timestamp: Date.now(),
            message: dvm
              ? `Submitting ${resolution} transcode job...`
              : `Broadcasting ${resolution} transcode request...`,
          },
        ],
        queue: queueInfo,
      }))

      // Determine if we should use encryption (if signer supports NIP-04)
      const canEncrypt = !!(dvm && user?.signer.nip04)
      let wasEncrypted = false

      let jobRequest: EventTemplate

      if (canEncrypt && dvm) {
        // Build encrypted request - put input and params in encrypted content
        const encryptedContent = buildDvmEncryptedContent(inputVideoUrl, 'mp4', resolution, codec)
        const encryptedJson = await user!.signer.nip04!.encrypt(
          dvm.pubkey,
          JSON.stringify(encryptedContent)
        )

        jobRequest = {
          kind: DVM_REQUEST_KIND,
          content: encryptedJson,
          created_at: nowInSecs(),
          tags: [
            ['p', dvm.pubkey],
            ['relays', ...writeRelays],
            ['encrypted'],
            ['expiration', String(nowInSecs() + DVM_EVENT_EXPIRATION_SECS)],
          ],
        }
        wasEncrypted = true

        console.log('[DVM] Sending encrypted transcode request:', {
          resolution,
          dvm: dvm.pubkey,
          unencryptedContent: encryptedContent,
        })
      } else {
        // Build unencrypted request (broadcast or fallback)
        jobRequest = {
          kind: DVM_REQUEST_KIND,
          content: '',
          created_at: nowInSecs(),
          tags: [
            ['i', inputVideoUrl, 'url'],
            ['param', 'mode', 'mp4'],
            ['param', 'resolution', resolution],
            ['param', 'codec', codec],
            ['relays', ...writeRelays],
            ['expiration', String(nowInSecs() + DVM_EVENT_EXPIRATION_SECS)],
          ],
        }

        if (dvm) {
          jobRequest.tags.push(['p', dvm.pubkey])
        }

        console.log('[DVM] Sending unencrypted transcode request:', {
          resolution,
          dvm: dvm?.pubkey || 'broadcast',
          tags: jobRequest.tags,
        })
      }

      const signedRequest = await user!.signer.signEvent(jobRequest)
      await relayPool.publish(writeRelays, signedRequest)

      requestEventIdRef.current = signedRequest.id

      let selectedDvmPubkey = dvm?.pubkey

      // Step 2: If broadcast, collect bids and approve one
      if (!selectedDvmPubkey) {
        setStatus('bidding')
        setProgress(prev => ({
          ...prev,
          status: 'bidding',
          message: 'Waiting for DVM bids...',
          statusMessages: [
            ...prev.statusMessages,
            { timestamp: Date.now(), message: 'Waiting for DVM bids...' },
          ],
        }))

        const bids = await collectBids(signedRequest.id)
        if (bids.length === 0) {
          throw new Error('No DVMs responded to the request')
        }

        // Pick best bid (first free one)
        const freeBid = bids.find(b => b.amount === '0') || bids[0]
        selectedDvmPubkey = freeBid.pubkey

        if (import.meta.env.DEV) {
          console.log('[DVM] Selected DVM from bids:', selectedDvmPubkey)
        }

        // Approve
        await approveBid(signedRequest.id, selectedDvmPubkey!)

        setStatus('transcoding')
        setProgress(prev => ({
          ...prev,
          status: 'transcoding',
          message: `Selected DVM ${selectedDvmPubkey!.substring(0, 8)}...`,
          statusMessages: [
            ...prev.statusMessages,
            {
              timestamp: Date.now(),
              message: `Selected DVM ${selectedDvmPubkey!.substring(0, 8)}...`,
            },
          ],
        }))
      }

      // Persist state after successful publish/selection
      const persistedState: PersistableTranscodeState = {
        requestEventId: signedRequest.id,
        dvmPubkey: selectedDvmPubkey!,
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
        console.log(
          `[DVM] Published ${resolution} job request:`,
          signedRequest.id,
          wasEncrypted ? '(encrypted)' : '(unencrypted)'
        )
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
        selectedDvmPubkey!,
        originalDuration,
        resolution,
        wasEncrypted
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
        phase: 'mirroring',
        statusMessages: [
          ...prev.statusMessages,
          { timestamp: Date.now(), message: `Copying ${resolution} to your servers...` },
        ],
        queue: queueInfo,
      }))

      const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)

      return { ...mirroredVideo, dvmPubkey: selectedDvmPubkey! }
    },
    [
      config.relays,
      user,
      collectBids,
      approveBid,
      subscribeToDvmResponses,
      mirrorTranscodedVideo,
      onStateChange,
    ]
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
            phase: 'mirroring',
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
            phase: 'mirroring',
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
          let selectedDvm: DvmHandlerInfo | undefined = undefined

          for (let i = currentIndex + 1; i < resolutionQueue.length; i++) {
            const resolution = resolutionQueue[i]
            const newQueueInfo = {
              resolutions: resolutionQueue,
              currentIndex: i,
              completed: [...completedResolutions],
            }

            const videoResult = await processResolution(
              persistedState.inputVideoUrl,
              resolution,
              selectedDvm,
              persistedState.originalDuration,
              newQueueInfo
            )

            if (!selectedDvm) {
              selectedDvm = {
                pubkey: videoResult.dvmPubkey,
                createdAt: nowInSecs(),
              }
            }

            const video = videoResult
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
        // Process each resolution sequentially
        setStatus('transcoding')

        let selectedDvm: DvmHandlerInfo | undefined = undefined

        for (let i = 0; i < resolutions.length; i++) {
          const resolution = resolutions[i]
          const queueInfo = {
            resolutions,
            currentIndex: i,
            completed: [...completedResolutions],
          }

          // Process this resolution
          const videoResult = await processResolution(
            inputVideoUrl,
            resolution,
            selectedDvm,
            originalDuration,
            queueInfo
          )

          // Remember the DVM for subsequent resolutions
          if (!selectedDvm) {
            selectedDvm = {
              pubkey: videoResult.dvmPubkey,
              createdAt: nowInSecs(),
            }
          }

          const mirroredVideo = videoResult

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
    [user, processResolution, onComplete, onAllComplete, onStateChange]
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
