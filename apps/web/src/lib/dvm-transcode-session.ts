/**
 * DVMTranscodeSession
 *
 * Encapsulates the Nostr DVM protocol for kind-5207 video transcoding jobs:
 * bid collection, bid approval, result subscription, and query for existing results.
 * Both useDvmTranscode and UploadManagerProvider delegate to this class.
 */

import type { EventTemplate, NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools'
import type { Subscription } from 'rxjs'
import type { RelayPool } from 'applesauce-relay'
import { nowInSecs } from '@/lib/utils'
import {
  parseDvmBid,
  parseDvmResultContent,
  parseDvmEncryptedStatus,
  parseCodecsFromMimetype,
  RESOLUTION_DIMENSIONS,
  type DvmBid,
  type DvmResultContent,
} from '@/lib/dvm-utils'
import { createBlobPlacement, type VideoVariant } from '@/lib/video-processing'

// ── Constants ────────────────────────────────────────────────────────────────

export const DVM_REQUEST_KIND = 5207
export const DVM_RESULT_KIND = 6207
export const DVM_FEEDBACK_KIND = 7000

/** DVM event expiration — 24 hours in seconds */
export const DVM_EVENT_EXPIRATION_SECS = 24 * 60 * 60

/** Maximum age of a persisted job before it is considered expired (12 hours) */
export const TRANSCODE_JOB_TIMEOUT_MS = 12 * 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

interface Nip04 {
  encrypt(pubkey: string, content: string): Promise<string>
  decrypt(pubkey: string, content: string): Promise<string>
}

interface SessionSigner {
  signEvent(event: EventTemplate): Promise<NostrEvent>
  nip04?: Nip04
}

export interface SessionUser {
  signer: SessionSigner
}

/** Decoded progress update from a DVM kind-7000 feedback event */
export interface DVMFeedback {
  status: 'processing' | 'partial'
  message: string
  percentage?: number
  phase: 'transcoding' | 'uploading' | 'mirroring'
  eta?: number
  /** Realtime speed multiplier (e.g. 3.5 = 3.5× realtime) or MB/s during upload */
  speed?: number
  /** 1-based position in DVM job queue */
  queuePosition?: number
}

export interface SubscribeParams {
  requestEventId: string
  dvmPubkey: string
  originalDuration?: number
  requestedResolution?: string
  wasEncrypted?: boolean
  /** Called for every 'processing' / 'partial' feedback event */
  onFeedback: (feedback: DVMFeedback) => void
  /** Called once when DVM has been silent for ≥90 s (before the 3-min hard rejection) */
  onSilenceWarning?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a VideoVariant from a parsed DVM result.
 * Exported so callers can use it for the "DVM finished while we were away" resume path.
 */
export function buildDvmVideoVariant(
  result: DvmResultContent,
  originalDuration?: number,
  requestedResolution?: string
): VideoVariant {
  const { videoCodec, audioCodec } = parseCodecsFromMimetype(result.mimetype || '')
  const duration = result.duration || originalDuration || 0
  let bitrate = result.bitrate
  if (!bitrate && result.size_bytes && duration > 0) {
    bitrate = Math.round((result.size_bytes * 8) / duration)
  }
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
    placement: createBlobPlacement({ directUrl: result.urls[0] }),
    inputMethod: 'url',
    qualityLabel: resolution,
  }
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class DVMTranscodeSession {
  private readonly _subs: Subscription[] = []

  constructor(
    private readonly relays: string[],
    private readonly user: SessionUser,
    private readonly pool: RelayPool
  ) {}

  // ── Static helpers ─────────────────────────────────────────────────────────

  static hasEncryptedTag(event: NostrEvent): boolean {
    return event.tags.some(t => t[0] === 'encrypted')
  }

  static detectPhaseFromMessage(message?: string): 'transcoding' | 'uploading' | 'mirroring' {
    if (!message) return 'transcoding'
    const lower = message.toLowerCase()
    if (lower.startsWith('uploading')) return 'uploading'
    if (lower.startsWith('transcoding') || lower.startsWith('re-encoding')) return 'transcoding'
    return 'transcoding'
  }

  // ── Bid collection ─────────────────────────────────────────────────────────

  /** Subscribe to kind-7000 for `timeoutMs`, collect bids, then resolve. */
  collectBids(requestEventId: string, timeoutMs = 5000): Promise<DvmBid[]> {
    return new Promise(resolve => {
      const bids: DvmBid[] = []

      const sub = this.pool
        .subscription(this.relays, [
          { kinds: [DVM_FEEDBACK_KIND], '#e': [requestEventId] } as Filter,
        ])
        .subscribe({
          next: event => {
            if (typeof event === 'string') return
            const bid = parseDvmBid(event as NostrEvent)
            if (bid) bids.push(bid)
          },
        })

      this._subs.push(sub)
      setTimeout(() => {
        sub.unsubscribe()
        resolve(bids)
      }, timeoutMs)
    })
  }

  // ── Bid approval ───────────────────────────────────────────────────────────

  async approveBid(
    requestEventId: string,
    dvmPubkey: string,
    writeRelays: string[]
  ): Promise<NostrEvent> {
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
    const signedApproval = await this.user.signer.signEvent(approvalEvent)
    console.log('[DVMTranscodeSession] Sending bid approval:', {
      requestEventId,
      dvmPubkey,
      tags: signedApproval.tags,
    })
    await this.pool.publish(writeRelays, signedApproval)
    return signedApproval
  }

  // ── Result subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to kind-7000 + kind-6207 for the given job.
   * Calls `onFeedback` for each progress event and resolves with the VideoVariant
   * when the result arrives. Rejects on DVM error, timeout (10 min), or silence (3 min).
   */
  subscribeToDvmResponses(params: SubscribeParams): Promise<VideoVariant> {
    const {
      requestEventId,
      dvmPubkey,
      originalDuration,
      requestedResolution,
      wasEncrypted = false,
      onFeedback,
      onSilenceWarning,
    } = params

    return new Promise((resolve, reject) => {
      let lastFeedbackAt: number | null = null
      let silenceWarned = false
      const signer = this.user.signer

      const timeout = setTimeout(
        () => {
          clearInterval(heartbeat)
          subscription.unsubscribe()
          reject(new Error('DVM job timed out after 10 minutes'))
        },
        10 * 60 * 1000
      )

      const heartbeat = setInterval(() => {
        if (!lastFeedbackAt) return
        const silentMs = Date.now() - lastFeedbackAt
        if (silentMs >= 180_000) {
          clearInterval(heartbeat)
          clearTimeout(timeout)
          subscription.unsubscribe()
          reject(new Error('DVM stopped responding. You can retry with a different service.'))
        } else if (silentMs >= 90_000 && !silenceWarned) {
          silenceWarned = true
          onSilenceWarning?.()
        }
      }, 30_000)

      const subscription = this.pool
        .subscription(this.relays, [
          {
            kinds: [DVM_FEEDBACK_KIND, DVM_RESULT_KIND],
            authors: [dvmPubkey],
            '#e': [requestEventId],
          } as Filter,
        ])
        .subscribe({
          next: async event => {
            if (typeof event === 'string') return
            const nostrEvent = event as NostrEvent

            if (nostrEvent.kind === DVM_FEEDBACK_KIND) {
              lastFeedbackAt = Date.now()
              const isEncrypted = DVMTranscodeSession.hasEncryptedTag(nostrEvent)

              let feedbackStatus: string | undefined
              let message: string | undefined
              let eta: number | undefined

              if (isEncrypted && wasEncrypted && signer.nip04) {
                try {
                  const decrypted = await signer.nip04.decrypt(dvmPubkey, nostrEvent.content)
                  console.log('[DVMTranscodeSession] Decrypted feedback event:', {
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
                    console.warn(
                      '[DVMTranscodeSession] Failed to parse decrypted status:',
                      decrypted
                    )
                  }
                } catch (err) {
                  console.warn('[DVMTranscodeSession] Failed to decrypt status event:', err)
                  const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                  if (statusTag) {
                    const [, st, extra] = statusTag
                    feedbackStatus = st
                    message = extra || 'Processing...'
                  }
                }
              } else {
                console.log('[DVMTranscodeSession] Feedback event:', {
                  id: nostrEvent.id,
                  pubkey: nostrEvent.pubkey,
                  content: nostrEvent.content,
                  tags: nostrEvent.tags,
                })
                const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                if (statusTag) {
                  const [, st, extra] = statusTag
                  feedbackStatus = st
                  const contentTag = nostrEvent.tags.find(t => t[0] === 'content')
                  message =
                    contentTag?.[1] ||
                    extra ||
                    (feedbackStatus === 'processing' ? 'Processing video...' : 'Processing...')
                  const etaTag = nostrEvent.tags.find(t => t[0] === 'eta')
                  eta = etaTag?.[1] ? parseInt(etaTag[1], 10) : undefined
                }
              }

              if (feedbackStatus) {
                // Percentage: prefer structured tag, fallback to message regex
                const progressTag = nostrEvent.tags.find(t => t[0] === 'progress')
                let percentage = progressTag?.[1] ? parseInt(progressTag[1], 10) : undefined
                if (percentage === undefined) {
                  const m = message?.match(/(\d+)%/)
                  percentage = m ? parseInt(m[1], 10) : undefined
                }

                // Phase: prefer structured tag over string detection
                const phaseTag = nostrEvent.tags.find(t => t[0] === 'phase')
                const phase =
                  (phaseTag?.[1] as 'transcoding' | 'uploading' | 'mirroring' | undefined) ??
                  DVMTranscodeSession.detectPhaseFromMessage(message)

                const speedTag = nostrEvent.tags.find(t => t[0] === 'speed')
                const speed = speedTag?.[1] ? parseFloat(speedTag[1]) : undefined
                const queueTag = nostrEvent.tags.find(t => t[0] === 'queue_position')
                const queuePosition = queueTag?.[1] ? parseInt(queueTag[1], 10) : undefined

                if (feedbackStatus === 'processing' || feedbackStatus === 'partial') {
                  onFeedback({
                    status: feedbackStatus as 'processing' | 'partial',
                    message: message || 'Processing...',
                    percentage,
                    phase,
                    eta,
                    speed,
                    queuePosition,
                  })
                } else if (feedbackStatus === 'error') {
                  clearTimeout(timeout)
                  clearInterval(heartbeat)
                  subscription.unsubscribe()
                  reject(new Error(message || 'DVM processing error'))
                }
              }
            } else if (nostrEvent.kind === DVM_RESULT_KIND) {
              clearTimeout(timeout)
              clearInterval(heartbeat)
              subscription.unsubscribe()

              let resultContent = nostrEvent.content
              const isEncrypted = DVMTranscodeSession.hasEncryptedTag(nostrEvent)

              if (isEncrypted && wasEncrypted && signer.nip04) {
                try {
                  resultContent = await signer.nip04.decrypt(dvmPubkey, nostrEvent.content)
                  console.log('[DVMTranscodeSession] Decrypted result event:', {
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
                console.log('[DVMTranscodeSession] Result event:', {
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

              resolve(buildDvmVideoVariant(result, originalDuration, requestedResolution))
            }
          },
          error: err => {
            clearTimeout(timeout)
            clearInterval(heartbeat)
            reject(err)
          },
        })

      this._subs.push(subscription)
    })
  }

  // ── Existing-result query (for resume) ─────────────────────────────────────

  /**
   * One-shot request for an existing kind-6207 result.
   * Resolves with a parsed VideoVariant, or null when no result arrives before timeout.
   */
  queryForExistingResult(
    requestEventId: string,
    dvmPubkey: string,
    originalDuration?: number,
    requestedResolution?: string
  ): Promise<VideoVariant | null> {
    return new Promise(resolve => {
      let found = false

      const timeout = setTimeout(() => {
        if (!found) {
          sub.unsubscribe()
          resolve(null)
        }
      }, 5000)

      const sub = this.pool
        .request(this.relays, [
          {
            kinds: [DVM_RESULT_KIND],
            authors: [dvmPubkey],
            '#e': [requestEventId],
            limit: 1,
          } as Filter,
        ])
        .subscribe({
          next: async event => {
            if (typeof event === 'string') return
            found = true
            clearTimeout(timeout)
            sub.unsubscribe()

            const nostrEvent = event as NostrEvent
            let resultContent = nostrEvent.content
            if (DVMTranscodeSession.hasEncryptedTag(nostrEvent) && this.user.signer.nip04) {
              try {
                resultContent = await this.user.signer.nip04.decrypt(dvmPubkey, nostrEvent.content)
              } catch {
                resolve(null)
                return
              }
            }

            const result = parseDvmResultContent(resultContent)
            resolve(
              result?.urls?.length
                ? buildDvmVideoVariant(result, originalDuration, requestedResolution)
                : null
            )
          },
          complete: () => {
            if (!found) {
              clearTimeout(timeout)
              resolve(null)
            }
          },
        })

      this._subs.push(sub)
    })
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Unsubscribe all active subscriptions created by this session. */
  cancel(): void {
    this._subs.forEach(s => s.unsubscribe())
    this._subs.length = 0
  }
}
