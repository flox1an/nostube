/**
 * Upload Manager Provider
 *
 * Global context for managing background uploads, transcoding, and drafts.
 * Uploads and transcodes continue even when navigating away from the upload page.
 * Drafts are persisted to localStorage and synced to Nostr.
 *
 * The provider OWNS:
 * - DVM subscriptions (they run here, not in component hooks)
 * - Draft state (single source of truth)
 * - Nostr sync (debounced for form fields, immediate for uploads)
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { type EventTemplate } from 'nostr-tools'
import type { UploadTask, TranscodeState } from '@/types/upload-manager'
import type { UploadDraft } from '@/types/upload-draft'
import {
  getUploadTasks,
  saveUploadTasks,
  addUploadTask,
  updateUploadTask,
  removeUploadTask,
  cleanupCompletedTasks,
  getResumableTasks,
} from '@/lib/upload-manager-storage'
import { createEmptyDraft, isMilestoneUpdate, MAX_DRAFTS } from '@/lib/draft-storage'
import { useDraftPersistence } from '@/hooks/useDraftPersistence'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAppContext } from '@/hooks/useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import { nowInSecs } from '@/lib/utils'
import {
  buildDvmEncryptedContent,
  type DvmBid,
  type DvmHandlerInfo,
  type TranscodeCodec,
} from '@/lib/dvm-utils'
import {
  DVMTranscodeSession,
  DVM_REQUEST_KIND,
  DVM_EVENT_EXPIRATION_SECS,
  TRANSCODE_JOB_TIMEOUT_MS,
  type DVMFeedback,
} from '@/lib/dvm-transcode-session'
import { extractBlossomHash } from '@/utils/video-event'
import { getTrackedDvms } from '@/hooks/useDvmTracker'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import { workflowStateFromUploadTask } from '@/lib/video-publishing-workflow'
import {
  createBlobPlacement,
  normalizeVideoVariantPlacement,
  type VideoVariant,
} from '@/lib/video-processing'
import type { BlobDescriptor } from '@/lib/blossom-auth'
import { useUploadNotifications } from '@/hooks/useUploadNotifications'

import type { UploadManagerContextType, TranscodeJob, ResolutionQueueInfo } from './types'
import { ACTIVE_TASK_STATUSES } from './constants'

const UploadManagerContext = createContext<UploadManagerContextType | undefined>(undefined)

interface UploadManagerProviderProps {
  children: ReactNode
}

function normalizeDraftBlobPlacement(draft: UploadDraft): UploadDraft {
  return {
    ...draft,
    uploadInfo: {
      ...draft.uploadInfo,
      videos: draft.uploadInfo.videos.map(normalizeVideoVariantPlacement),
    },
  }
}

export function UploadManagerProvider({ children }: UploadManagerProviderProps) {
  const { user } = useCurrentUser()
  const { config, relayOverride } = useAppContext()
  const { addNotification } = useUploadNotifications()

  // Combined relays for DVM tracking (read + write + override + defaults)
  const dvmRelays = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const combined = new Set([...readRelays, ...writeRelays, ...DEFAULT_RELAYS])
    if (relayOverride) combined.add(relayOverride)
    return Array.from(combined)
  }, [config.relays, relayOverride])

  // Stable ref so callbacks always use current relays without extra deps
  const dvmRelaysRef = useRef(dvmRelays)
  dvmRelaysRef.current = dvmRelays

  // Task state - Map for O(1) lookups
  const [tasks, setTasks] = useState<Map<string, UploadTask>>(() => {
    const storedTasks = getUploadTasks()
    return new Map(storedTasks.map(t => [t.id, t]))
  })

  // Draft state via shared persistence hook
  const draftPersistence = useDraftPersistence<UploadDraft>({
    storageKey: 'nostube_upload_drafts',
    nostrIdentifier: 'nostube-uploads',
    maxItems: MAX_DRAFTS,
    isMilestone: isMilestoneUpdate,
  })

  const drafts = useMemo(
    () => draftPersistence.items.map(normalizeDraftBlobPlacement),
    [draftPersistence.items]
  )
  const refreshDrafts = draftPersistence.refreshItems
  const flushNostrSync = draftPersistence.flushSync

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)

  // Active transcode jobs (sessions + abort controllers)
  const jobsRef = useRef<Map<string, TranscodeJob>>(new Map())

  // Track tasks currently being started to prevent auto-resume conflicts
  const startingTasksRef = useRef<Set<string>>(new Set())

  // Refs for stable access in callbacks
  const userRef = useRef(user)
  const configRef = useRef(config)
  const tasksRef = useRef(tasks)
  userRef.current = user
  configRef.current = config
  tasksRef.current = tasks

  // Cleanup old tasks on mount
  useEffect(() => {
    cleanupCompletedTasks()
  }, [])

  // Persist tasks to storage when they change
  useEffect(() => {
    const taskArray = Array.from(tasks.values())
    saveUploadTasks(taskArray)
  }, [tasks])

  // Cleanup sessions on unmount (only when app closes)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[UploadManager] Provider mounted')
    }
    const jobs = jobsRef.current
    return () => {
      if (import.meta.env.DEV) {
        console.debug(
          '[UploadManager] Provider unmounting! Clearing jobs:',
          Array.from(jobs.keys())
        )
      }
      jobs.forEach(job => {
        job.session?.cancel()
        job.abortController.abort()
      })
      jobs.clear()
    }
  }, [])

  // ========== DRAFT MANAGEMENT ==========

  // Draft CRUD — thin wrappers around draftPersistence
  const createDraftFn = useCallback((): UploadDraft => {
    const newDraft = createEmptyDraft()
    draftPersistence.createItem(newDraft)
    return newDraft
  }, [draftPersistence])

  const updateDraftFn = useCallback(
    (id: string, updates: Partial<UploadDraft>) => {
      const currentDraft = draftPersistence.getItem(id)
      const normalizedCurrentDraft = currentDraft && normalizeDraftBlobPlacement(currentDraft)
      const uploadInfo = updates.uploadInfo ?? normalizedCurrentDraft?.uploadInfo

      draftPersistence.updateItem(id, {
        ...updates,
        ...(uploadInfo
          ? {
              uploadInfo: {
                ...uploadInfo,
                videos: uploadInfo.videos.map(normalizeVideoVariantPlacement),
              },
            }
          : {}),
      })
    },
    [draftPersistence]
  )

  const deleteDraftFn = useCallback(
    (id: string) => {
      draftPersistence.deleteItem(id)
    },
    [draftPersistence]
  )

  const getDraftFn = useCallback(
    (id: string): UploadDraft | undefined => {
      const draft = draftPersistence.getItem(id)
      return draft && normalizeDraftBlobPlacement(draft)
    },
    [draftPersistence]
  )

  // ========== TASK MANAGEMENT ==========

  // Helper to update tasks immutably
  const updateTasksState = useCallback((taskId: string, updates: Partial<UploadTask>) => {
    setTasks(prev => {
      const task = prev.get(taskId)
      if (!task) return prev

      const newMap = new Map(prev)
      newMap.set(taskId, {
        ...task,
        ...updates,
        updatedAt: Date.now(),
      })
      return newMap
    })

    // Also update storage
    updateUploadTask(taskId, updates)
  }, [])

  // Register a new task
  const registerTask = useCallback(
    (draftId: string, title?: string): UploadTask => {
      const existingTask = tasks.get(draftId)
      if (existingTask) {
        return existingTask
      }

      const task: UploadTask = {
        id: draftId,
        draftId,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        videoTitle: title,
      }

      setTasks(prev => new Map(prev).set(draftId, task))
      addUploadTask(task)

      return task
    },
    [tasks]
  )

  // Update task progress
  const updateTaskProgress = useCallback(
    (taskId: string, progress: Partial<UploadTask>) => {
      updateTasksState(taskId, progress)
    },
    [updateTasksState]
  )

  // Complete a task
  const completeTask = useCallback(
    (taskId: string) => {
      const task = tasks.get(taskId)
      updateTasksState(taskId, {
        status: 'complete',
        completedAt: Date.now(),
      })

      // Cleanup job if exists
      const job = jobsRef.current.get(taskId)
      if (job) {
        job.session?.cancel()
        jobsRef.current.delete(taskId)
      }

      // Fire notification
      addNotification('transcode_complete', taskId, task?.videoTitle)
    },
    [updateTasksState, tasks, addNotification]
  )

  // Fail a task
  const failTask = useCallback(
    (taskId: string, error: string, retryable = true) => {
      const task = tasks.get(taskId)
      updateTasksState(taskId, {
        status: 'error',
        error: { message: error, retryable },
      })

      // Cleanup job if exists
      const job = jobsRef.current.get(taskId)
      if (job) {
        job.session?.cancel()
        jobsRef.current.delete(taskId)
      }

      // Fire notification
      addNotification('transcode_error', taskId, task?.videoTitle, undefined, error)
    },
    [updateTasksState, tasks, addNotification]
  )

  // Cancel a task
  const cancelTask = useCallback(
    (taskId: string) => {
      updateTasksState(taskId, { status: 'cancelled' })

      // Cleanup job if exists
      const job = jobsRef.current.get(taskId)
      if (job) {
        job.abortController.abort()
        job.session?.cancel()
        jobsRef.current.delete(taskId)
      }
    },
    [updateTasksState]
  )

  // Remove a task completely
  const removeTaskFn = useCallback((taskId: string) => {
    setTasks(prev => {
      const newMap = new Map(prev)
      newMap.delete(taskId)
      return newMap
    })
    removeUploadTask(taskId)

    // Cleanup job if exists
    const job = jobsRef.current.get(taskId)
    if (job) {
      job.session?.cancel()
      jobsRef.current.delete(taskId)
    }
  }, [])

  // ========== DVM OPERATIONS ==========

  // Mirror transcoded video to user's servers
  const mirrorTranscodedVideo = useCallback(async (video: VideoVariant): Promise<VideoVariant> => {
    const currentUser = userRef.current
    const currentConfig = configRef.current

    if (!currentUser) throw new Error('User not logged in')

    const uploadServers =
      currentConfig.blossomServers
        ?.filter(s => s.tags.includes('initial upload'))
        .map(s => s.url) || []
    const mirrorServers =
      currentConfig.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []

    if (uploadServers.length === 0 && mirrorServers.length === 0) {
      return video
    }

    const { sha256: urlHash } = extractBlossomHash(video.url!)
    let sha256: string | undefined = urlHash
    let size: number | undefined

    if (!sha256) {
      try {
        const headResponse = await fetch(video.url!, { method: 'HEAD' })
        sha256 = headResponse.headers.get('x-sha-256') || undefined
        const contentLength = headResponse.headers.get('content-length')
        size = contentLength ? parseInt(contentLength, 10) : undefined
      } catch {
        // Continue without hash
      }
    } else {
      try {
        const headResponse = await fetch(video.url!, { method: 'HEAD' })
        const contentLength = headResponse.headers.get('content-length')
        size = contentLength ? parseInt(contentLength, 10) : undefined
      } catch {
        size = video.sizeMB ? Math.round(video.sizeMB * 1024 * 1024) : undefined
      }
    }

    if (!sha256) {
      console.warn('[UploadManager] Could not get SHA256 hash, cannot mirror')
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
    const directUrl = video.placement.directUrl ?? video.url

    if (uploadServers.length > 0) {
      try {
        const uploadedBlobs = await mirrorBlobsToServers({
          mirrorServers: uploadServers,
          blob: sourceBlob,
          signer: async draft => await currentUser.signer.signEvent(draft),
        })
        updatedVideo.uploadedBlobs = uploadedBlobs
        if (uploadedBlobs.length > 0) {
          updatedVideo.url = uploadedBlobs[0].url
        }
      } catch (err) {
        console.warn('[UploadManager] Failed to mirror to upload servers:', err)
      }
    }

    if (mirrorServers.length > 0) {
      try {
        const mirroredBlobs = await mirrorBlobsToServers({
          mirrorServers,
          blob: sourceBlob,
          signer: async draft => await currentUser.signer.signEvent(draft),
        })
        updatedVideo.mirroredBlobs = mirroredBlobs
      } catch (err) {
        console.warn('[UploadManager] Failed to mirror to mirror servers:', err)
      }
    }

    const candidateBlobs = [...updatedVideo.uploadedBlobs, ...updatedVideo.mirroredBlobs]
    updatedVideo.placement = createBlobPlacement({
      primaryBlob: updatedVideo.uploadedBlobs[0] ?? updatedVideo.mirroredBlobs[0],
      candidateBlobs,
      directUrl,
    })
    updatedVideo.url = updatedVideo.placement.primaryBlob?.url ?? directUrl

    return updatedVideo
  }, [])

  /**
   * Process a single resolution transcode.
   * Supports NIP-04 encrypted requests when signer supports it.
   * Delegates bid collection, approval, and result subscription to the job's DVMTranscodeSession.
   */
  const processResolution = useCallback(
    async (
      taskId: string,
      inputVideoUrl: string,
      resolution: string,
      dvm?: DvmHandlerInfo,
      originalDuration?: number,
      queueInfo?: ResolutionQueueInfo,
      codec: TranscodeCodec = 'h264',
      onPaymentRequired?: (bid: DvmBid) => Promise<void>
    ): Promise<VideoVariant & { dvmPubkey: string }> => {
      const currentUser = userRef.current
      const currentConfig = configRef.current

      if (!currentUser) throw new Error('User not logged in')

      const writeRelays = currentConfig.relays
        .filter(r => r.tags.includes('write') && r.url)
        .map(r => r.url)

      if (writeRelays.length === 0) {
        throw new Error('No write relays configured')
      }

      const job = jobsRef.current.get(taskId)
      if (!job || !job.session) throw new Error('Job not found or session missing')
      const session = job.session

      // Update state
      const initialMessage = dvm
        ? `Submitting ${resolution} transcode job...`
        : `Broadcasting ${resolution} transcode request...`

      updateTasksState(taskId, {
        status: 'transcoding',
        transcodeState: {
          status: dvm ? 'transcoding' : 'bidding',
          dvmPubkey: dvm?.pubkey,
          inputVideoUrl,
          originalDuration,
          startedAt: Date.now(),
          currentResolution: resolution,
          resolutionQueue: queueInfo?.resolutions || [resolution],
          completedResolutions: queueInfo?.completed || [],
          message: initialMessage,
          statusMessages: [{ timestamp: Date.now(), message: initialMessage }],
        },
      })

      // Build request - if no DVM specified, it's a broadcast
      let jobRequest: EventTemplate

      if (dvm && currentUser.signer.nip04) {
        // Build encrypted request for specific DVM
        const encryptedContent = buildDvmEncryptedContent(inputVideoUrl, 'mp4', resolution, codec)
        const encryptedJson = await currentUser.signer.nip04.encrypt(
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

        console.log('[UploadManager] Sending encrypted transcode request:', {
          taskId,
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

        // Add p tag only if we have a specific DVM
        if (dvm) {
          jobRequest.tags.push(['p', dvm.pubkey])
        }

        console.log('[UploadManager] Sending unencrypted transcode request:', {
          taskId,
          resolution,
          dvm: dvm?.pubkey || 'broadcast',
          tags: jobRequest.tags,
        })
      }

      const signedRequest = await currentUser.signer.signEvent(jobRequest)
      await relayPool.publish(writeRelays, signedRequest)

      // Update task state with request ID (use ref to avoid stale closure)
      updateTasksState(taskId, {
        transcodeState: {
          ...tasksRef.current.get(taskId)?.transcodeState,
          requestEventId: signedRequest.id,
        } as TranscodeState,
      })

      let selectedDvmPubkey = dvm?.pubkey

      // Step 2: If broadcast, collect bids and approve one
      if (!selectedDvmPubkey) {
        const biddingMsg = 'Waiting for DVM bids...'
        const currentTask = tasksRef.current.get(taskId)
        updateTasksState(taskId, {
          transcodeState: {
            ...currentTask?.transcodeState,
            status: 'bidding',
            message: biddingMsg,
            statusMessages: [
              ...(currentTask?.transcodeState?.statusMessages || []),
              { timestamp: Date.now(), message: biddingMsg },
            ],
          } as TranscodeState,
        })

        const bids = await session.collectBids(signedRequest.id)
        if (bids.length === 0) {
          throw new Error('No DVMs responded to the request')
        }

        // Prefer free bids; if only paid bids available and handler provided, use it
        const freeBid = bids.find(b => b.amount === '0' || parseInt(b.amount) === 0)
        const paidBid = freeBid ? undefined : bids[0]

        if (paidBid) {
          if (!onPaymentRequired) {
            throw new Error(
              `DVM requires payment of ${Math.ceil(parseInt(paidBid.amount) / 1000)} sats but no payment handler is configured`
            )
          }
          // Delegate payment to the UI layer; throws if user cancels or wallet insufficient
          await onPaymentRequired(paidBid)
          selectedDvmPubkey = paidBid.pubkey
        } else {
          selectedDvmPubkey = freeBid!.pubkey
        }

        if (import.meta.env.DEV) {
          console.log('[UploadManager] Selected DVM from bids:', selectedDvmPubkey)
        }

        // Approve the bid (free bids only — paid bids were approved via payment event)
        if (!paidBid) {
          await session.approveBid(signedRequest.id, selectedDvmPubkey, writeRelays)
        }

        const selectedMsg = `Selected DVM ${selectedDvmPubkey.substring(0, 8)}...`
        const afterBidTask = tasksRef.current.get(taskId)
        updateTasksState(taskId, {
          transcodeState: {
            ...afterBidTask?.transcodeState,
            status: 'transcoding',
            dvmPubkey: selectedDvmPubkey,
            message: selectedMsg,
            statusMessages: [
              ...(afterBidTask?.transcodeState?.statusMessages || []),
              { timestamp: Date.now(), message: selectedMsg },
            ],
          } as TranscodeState,
        })
      }

      // Check if cancelled
      if (job.abortController.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Subscribe and wait for result
      const transcodedResult = await session.subscribeToDvmResponses({
        requestEventId: signedRequest.id,
        dvmPubkey: selectedDvmPubkey!,
        originalDuration,
        requestedResolution: resolution,
        wasEncrypted: jobRequest.tags.some(t => t[0] === 'encrypted'),
        onFeedback: (feedback: DVMFeedback) => {
          const currentTask = tasksRef.current.get(taskId)
          const prevMessages = currentTask?.transcodeState?.statusMessages || []
          const lastMsg = prevMessages[prevMessages.length - 1]
          const newMessages =
            lastMsg?.message === feedback.message
              ? prevMessages
              : [
                  ...prevMessages,
                  {
                    timestamp: Date.now(),
                    message: feedback.message,
                    percentage: feedback.percentage,
                  },
                ]
          updateTasksState(taskId, {
            transcodeState: {
              ...currentTask?.transcodeState,
              status: 'transcoding',
              phase: feedback.phase,
              message: feedback.message,
              percentage: feedback.percentage,
              eta: feedback.eta,
              speed: feedback.speed,
              queuePosition: feedback.queuePosition,
              lastFeedbackAt: Date.now(),
              statusMessages: newMessages,
            } as TranscodeState,
          })
        },
        onSilenceWarning: () => {
          const currentTask2 = tasksRef.current.get(taskId)
          updateTasksState(taskId, {
            transcodeState: {
              ...currentTask2?.transcodeState,
              message: 'DVM seems unresponsive...',
            } as TranscodeState,
          })
        },
      })

      // Check if cancelled
      if (job.abortController.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Mirror to user's servers
      const mirroringMsg = `Copying ${resolution} to your servers...`
      const beforeMirrorTask = tasksRef.current.get(taskId)
      updateTasksState(taskId, {
        status: 'mirroring',
        transcodeState: {
          ...beforeMirrorTask?.transcodeState,
          status: 'mirroring',
          phase: 'mirroring',
          message: mirroringMsg,
          percentage: undefined,
          eta: undefined,
          statusMessages: [
            ...(beforeMirrorTask?.transcodeState?.statusMessages || []),
            { timestamp: Date.now(), message: mirroringMsg },
          ],
        } as TranscodeState,
      })

      const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)

      return { ...mirroredVideo, dvmPubkey: selectedDvmPubkey! }
    },
    [updateTasksState, mirrorTranscodedVideo]
  )

  // Start transcode - the main entry point
  const startTranscode = useCallback(
    async (
      taskId: string,
      inputVideoUrl: string,
      resolutions: string[],
      originalDuration?: number,
      onComplete?: (video: VideoVariant) => void,
      onAllComplete?: () => void,
      codecMap?: Record<string, TranscodeCodec>,
      /** If provided, skip tracker auto-selection and use this DVM directly */
      preferredDvmPubkey?: string,
      /** Called when DVM requires payment before processing; must resolve when payment is sent */
      onPaymentRequired?: (bid: DvmBid) => Promise<void>
    ) => {
      if (!userRef.current) {
        failTask(taskId, 'User not logged in')
        return
      }

      // Mark as starting to prevent auto-resume race condition
      startingTasksRef.current.add(taskId)

      // Create session + job entry
      const session = new DVMTranscodeSession(dvmRelaysRef.current, userRef.current, relayPool)
      const job: TranscodeJob = {
        session,
        abortController: new AbortController(),
        onComplete,
        onAllComplete,
      }
      jobsRef.current.set(taskId, job)

      if (import.meta.env.DEV) {
        console.debug('[UploadManager] startTranscode - Created job for taskId:', taskId)
        console.debug('[UploadManager] jobsRef now has keys:', Array.from(jobsRef.current.keys()))
      }
      const completedResolutions: string[] = []

      try {
        // Pre-select a DVM — use explicit choice if provided, otherwise pick best from tracker
        let selectedDvm: DvmHandlerInfo | undefined = undefined
        const trackedDvms = getTrackedDvms()

        if (preferredDvmPubkey) {
          // User explicitly selected a DVM from the selection UI
          const preferred = trackedDvms.get(preferredDvmPubkey)
          selectedDvm = {
            pubkey: preferredDvmPubkey,
            name: preferred?.name,
            about: preferred?.about,
            createdAt: preferred?.lastSeenAt ?? 0,
          }
          if (import.meta.env.DEV) {
            console.log('[UploadManager] Using user-selected DVM:', preferredDvmPubkey)
          }
        } else if (trackedDvms.size > 0) {
          // Auto-pick the DVM with lowest queue length, falling back to most recently seen
          let best:
            | {
                pubkey: string
                name?: string
                about?: string
                lastSeenAt: number
                queueLength?: number
              }
            | undefined
          for (const dvm of trackedDvms.values()) {
            if (!best) {
              best = dvm
              continue
            }
            const bestQueue = best.queueLength ?? Infinity
            const dvmQueue = dvm.queueLength ?? Infinity
            if (
              dvmQueue < bestQueue ||
              (dvmQueue === bestQueue && dvm.lastSeenAt > best.lastSeenAt)
            ) {
              best = dvm
            }
          }
          if (best) {
            selectedDvm = {
              pubkey: best.pubkey,
              name: best.name,
              about: best.about,
              createdAt: best.lastSeenAt,
            }
            if (import.meta.env.DEV) {
              console.log('[UploadManager] Auto-selected DVM:', {
                pubkey: best.pubkey,
                name: best.name,
                queueLength: best.queueLength,
              })
            }
          }
        }

        for (let i = 0; i < resolutions.length; i++) {
          const resolution = resolutions[i]
          const queueInfo: ResolutionQueueInfo = {
            resolutions,
            currentIndex: i,
            completed: [...completedResolutions],
          }

          const mirroredVideoResult = await processResolution(
            taskId,
            inputVideoUrl,
            resolution,
            selectedDvm,
            originalDuration,
            queueInfo,
            codecMap?.[resolution] || 'h264',
            onPaymentRequired
          )

          // Remember the DVM for subsequent resolutions
          if (!selectedDvm) {
            selectedDvm = {
              pubkey: mirroredVideoResult.dvmPubkey,
              createdAt: nowInSecs(),
            }
          }

          const mirroredVideo = mirroredVideoResult

          completedResolutions.push(resolution)

          // Store completed video in state for persistence (in case callbacks are stale)
          const currentState = tasksRef.current.get(taskId)?.transcodeState
          const completedVideos = [...(currentState?.completedVideos || [])]
          completedVideos.push({
            url: mirroredVideo.url!,
            dimension: mirroredVideo.dimension,
            sizeMB: mirroredVideo.sizeMB,
            duration: mirroredVideo.duration,
            bitrate: mirroredVideo.bitrate,
            videoCodec: mirroredVideo.videoCodec,
            audioCodec: mirroredVideo.audioCodec,
            qualityLabel: mirroredVideo.qualityLabel,
          })

          // Update state with completed video
          updateTasksState(taskId, {
            transcodeState: {
              ...currentState,
              completedResolutions: [...completedResolutions],
              completedVideos,
              currentResolution: resolutions[i + 1],
              message:
                i === resolutions.length - 1
                  ? 'All transcodes complete!'
                  : `${resolution} complete, starting next...`,
            } as TranscodeState,
          })

          // DIRECTLY UPDATE DRAFT - no stale callback issues
          // taskId === draftId, so we can update the draft's uploadInfo.videos
          const draft = draftPersistence.getItem(taskId)
          if (draft) {
            const existingVideos = draft.uploadInfo?.videos || []
            const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
            if (!isDuplicate) {
              const updatedVideos = [...existingVideos, mirroredVideo]
              updateDraftFn(taskId, { uploadInfo: { videos: updatedVideos } })

              if (import.meta.env.DEV) {
                console.debug(
                  '[UploadManager] Added transcoded video to draft:',
                  mirroredVideo.qualityLabel,
                  'total:',
                  updatedVideos.length
                )
              }
            }
          }

          // Notify completion for this resolution (may be stale callback, but draft is already updated)
          job.onComplete?.(mirroredVideo)
        }

        // All complete
        completeTask(taskId)
        job.onAllComplete?.()
      } catch (err) {
        if (err instanceof Error && err.message === 'Cancelled') {
          updateTasksState(taskId, { status: 'cancelled' })
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        failTask(taskId, errorMessage)
      } finally {
        // Clear starting flag
        startingTasksRef.current.delete(taskId)
      }
    },
    [updateTasksState, processResolution, completeTask, failTask, draftPersistence, updateDraftFn]
  )

  // Resume transcode from persisted state
  const resumeTranscode = useCallback(
    async (
      taskId: string,
      onComplete?: (video: VideoVariant) => void,
      onAllComplete?: () => void
    ) => {
      // Skip if job already exists (task is already being processed)
      if (jobsRef.current.has(taskId)) {
        if (import.meta.env.DEV) {
          console.debug('[UploadManager] resumeTranscode - job already exists for:', taskId)
        }
        return
      }

      const task = tasksRef.current.get(taskId)
      if (!task || !task.transcodeState) {
        console.debug('[UploadManager] Cannot resume - no transcode state')
        return
      }

      const state = task.transcodeState

      // Check timeout
      if (state.startedAt && Date.now() - state.startedAt > TRANSCODE_JOB_TIMEOUT_MS) {
        failTask(taskId, 'Transcode job expired (started over 12 hours ago)')
        return
      }

      if (!userRef.current) {
        failTask(taskId, 'User not logged in')
        return
      }

      // Create session + job entry
      const session = new DVMTranscodeSession(dvmRelaysRef.current, userRef.current, relayPool)
      const job: TranscodeJob = {
        session,
        abortController: new AbortController(),
        onComplete,
        onAllComplete,
      }
      jobsRef.current.set(taskId, job)

      const resolutionQueue = state.resolutionQueue || ['720p']
      const completedResolutions = [...(state.completedResolutions || [])]
      const currentResolution = state.currentResolution || '720p'
      const currentIndex = resolutionQueue.indexOf(currentResolution)

      try {
        const resumeMsg = `Resuming ${currentResolution} transcode...`
        updateTasksState(taskId, {
          status: 'transcoding',
          transcodeState: {
            ...state,
            status: 'transcoding',
            message: resumeMsg,
            statusMessages: [
              ...(state.statusMessages || []),
              { timestamp: Date.now(), message: resumeMsg },
            ],
          },
        })

        // Check if we have a pending request to resume
        if (state.requestEventId && state.dvmPubkey) {
          const existingVideo = await session.queryForExistingResult(
            state.requestEventId,
            state.dvmPubkey,
            state.originalDuration,
            currentResolution
          )

          if (existingVideo) {
            // Mirror it
            const mirrorMsg = `Copying ${currentResolution} to your servers...`
            const currentTask = tasksRef.current.get(taskId)
            updateTasksState(taskId, {
              status: 'mirroring',
              transcodeState: {
                ...currentTask?.transcodeState,
                status: 'mirroring',
                message: mirrorMsg,
                statusMessages: [
                  ...(currentTask?.transcodeState?.statusMessages || []),
                  { timestamp: Date.now(), message: mirrorMsg },
                ],
              } as TranscodeState,
            })

            const mirroredVideo = await mirrorTranscodedVideo(existingVideo)
            completedResolutions.push(currentResolution)

            // DIRECTLY UPDATE DRAFT
            const draft = draftPersistence.getItem(taskId)
            if (draft) {
              const existingVideos = draft.uploadInfo?.videos || []
              const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
              if (!isDuplicate) {
                const updatedVideos = [...existingVideos, mirroredVideo]
                updateDraftFn(taskId, { uploadInfo: { videos: updatedVideos } })
              }
            }

            job.onComplete?.(mirroredVideo)
          } else {
            // Still processing - resubscribe
            const transcodedResult = await session.subscribeToDvmResponses({
              requestEventId: state.requestEventId,
              dvmPubkey: state.dvmPubkey,
              originalDuration: state.originalDuration,
              requestedResolution: currentResolution,
              onFeedback: (feedback: DVMFeedback) => {
                const currentTask = tasksRef.current.get(taskId)
                const prevMessages = currentTask?.transcodeState?.statusMessages || []
                const lastMsg = prevMessages[prevMessages.length - 1]
                const newMessages =
                  lastMsg?.message === feedback.message
                    ? prevMessages
                    : [
                        ...prevMessages,
                        {
                          timestamp: Date.now(),
                          message: feedback.message,
                          percentage: feedback.percentage,
                        },
                      ]
                updateTasksState(taskId, {
                  transcodeState: {
                    ...currentTask?.transcodeState,
                    status: 'transcoding',
                    phase: feedback.phase,
                    message: feedback.message,
                    percentage: feedback.percentage,
                    eta: feedback.eta,
                    speed: feedback.speed,
                    queuePosition: feedback.queuePosition,
                    lastFeedbackAt: Date.now(),
                    statusMessages: newMessages,
                  } as TranscodeState,
                })
              },
              onSilenceWarning: () => {
                const currentTask2 = tasksRef.current.get(taskId)
                updateTasksState(taskId, {
                  transcodeState: {
                    ...currentTask2?.transcodeState,
                    message: 'DVM seems unresponsive...',
                  } as TranscodeState,
                })
              },
            })

            // Mirror
            const mirrorMsg = `Copying ${currentResolution} to your servers...`
            const currentTask = tasksRef.current.get(taskId)
            updateTasksState(taskId, {
              status: 'mirroring',
              transcodeState: {
                ...currentTask?.transcodeState,
                status: 'mirroring',
                message: mirrorMsg,
                resolutionQueue: currentTask?.transcodeState?.resolutionQueue || resolutionQueue,
                completedResolutions:
                  currentTask?.transcodeState?.completedResolutions || completedResolutions,
                statusMessages: [
                  ...(currentTask?.transcodeState?.statusMessages || []),
                  { timestamp: Date.now(), message: mirrorMsg },
                ],
              },
            })

            const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)
            completedResolutions.push(currentResolution)

            // DIRECTLY UPDATE DRAFT
            const draft = draftPersistence.getItem(taskId)
            if (draft) {
              const existingVideos = draft.uploadInfo?.videos || []
              const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
              if (!isDuplicate) {
                const updatedVideos = [...existingVideos, mirroredVideo]
                updateDraftFn(taskId, { uploadInfo: { videos: updatedVideos } })
              }
            }

            job.onComplete?.(mirroredVideo)
          }
        }

        // Continue with remaining resolutions
        const remainingResolutions = resolutionQueue.slice(currentIndex >= 0 ? currentIndex + 1 : 0)

        if (remainingResolutions.length > 0) {
          let selectedDvm: DvmHandlerInfo | undefined = undefined

          for (let i = 0; i < remainingResolutions.length; i++) {
            const resolution = remainingResolutions[i]
            const queueInfo: ResolutionQueueInfo = {
              resolutions: resolutionQueue,
              currentIndex: resolutionQueue.indexOf(resolution),
              completed: [...completedResolutions],
            }

            const videoResult = await processResolution(
              taskId,
              state.inputVideoUrl!,
              resolution,
              selectedDvm,
              state.originalDuration,
              queueInfo
            )

            if (!selectedDvm) {
              selectedDvm = {
                pubkey: videoResult.dvmPubkey,
                createdAt: nowInSecs(),
              }
            }

            const video = videoResult
            completedResolutions.push(resolution)

            // DIRECTLY UPDATE DRAFT
            const draft = draftPersistence.getItem(taskId)
            if (draft) {
              const existingVideos = draft.uploadInfo?.videos || []
              const isDuplicate = existingVideos.some(v => v.url === video.url)
              if (!isDuplicate) {
                const updatedVideos = [...existingVideos, video]
                updateDraftFn(taskId, { uploadInfo: { videos: updatedVideos } })
              }
            }

            job.onComplete?.(video)
          }
        }

        // All complete
        completeTask(taskId)
        job.onAllComplete?.()
      } catch (err) {
        if (err instanceof Error && err.message === 'Cancelled') {
          updateTasksState(taskId, { status: 'cancelled' })
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        failTask(taskId, errorMessage)
      }
    },
    [
      updateTasksState,
      processResolution,
      mirrorTranscodedVideo,
      completeTask,
      failTask,
      draftPersistence,
      updateDraftFn,
    ]
  )

  // Cancel transcode
  const cancelTranscode = useCallback(
    (taskId: string) => {
      const job = jobsRef.current.get(taskId)
      if (job) {
        job.abortController.abort()
        job.session?.cancel()
        jobsRef.current.delete(taskId)
      }

      updateTasksState(taskId, {
        status: 'cancelled',
        transcodeState: undefined,
      })
    },
    [updateTasksState]
  )

  // Auto-resume tasks on mount when user is available
  useEffect(() => {
    if (!user) return

    const resumable = getResumableTasks()
    if (resumable.length > 0 && import.meta.env.DEV) {
      console.debug('[UploadManager] Found resumable tasks:', resumable.length)
    }

    // Auto-resume transcoding tasks
    for (const task of resumable) {
      if (task.status === 'transcoding' && task.transcodeState) {
        // Skip if task is currently being started or already has a job
        if (startingTasksRef.current.has(task.id)) {
          if (import.meta.env.DEV) {
            console.debug('[UploadManager] Skipping auto-resume for task being started:', task.id)
          }
          continue
        }
        if (jobsRef.current.has(task.id)) {
          if (import.meta.env.DEV) {
            console.debug(
              '[UploadManager] Skipping auto-resume for task with existing job:',
              task.id
            )
          }
          continue
        }

        if (import.meta.env.DEV) {
          console.log('[UploadManager] Auto-resuming task:', task.id)
        }
        // Resume without callbacks - the upload page will connect when opened
        resumeTranscode(task.id)
      }
    }
  }, [user, resumeTranscode])

  // ========== QUERY HELPERS ==========

  const getTask = useCallback(
    (taskId: string): UploadTask | undefined => {
      return tasks.get(taskId)
    },
    [tasks]
  )

  const getWorkflowState = useCallback(
    (taskId: string) => {
      const task = tasks.get(taskId)
      return task ? workflowStateFromUploadTask(task) : undefined
    },
    [tasks]
  )

  const hasActiveTask = useCallback(
    (draftId: string): boolean => {
      const task = tasks.get(draftId)
      if (!task) return false
      return ACTIVE_TASK_STATUSES.includes(task.status as (typeof ACTIVE_TASK_STATUSES)[number])
    },
    [tasks]
  )

  const getActiveTasksForDraft = useCallback(
    (draftId: string): UploadTask[] => {
      return Array.from(tasks.values()).filter(
        t =>
          t.draftId === draftId &&
          ACTIVE_TASK_STATUSES.includes(t.status as (typeof ACTIVE_TASK_STATUSES)[number])
      )
    },
    [tasks]
  )

  // Computed values
  const hasActiveUploads = useMemo(() => {
    return Array.from(tasks.values()).some(t =>
      ACTIVE_TASK_STATUSES.includes(t.status as (typeof ACTIVE_TASK_STATUSES)[number])
    )
  }, [tasks])

  const activeTaskCount = useMemo(() => {
    return Array.from(tasks.values()).filter(t =>
      ACTIVE_TASK_STATUSES.includes(t.status as (typeof ACTIVE_TASK_STATUSES)[number])
    ).length
  }, [tasks])

  // ========== CONTEXT VALUE ==========

  const contextValue: UploadManagerContextType = useMemo(
    () => ({
      // Task state
      tasks,

      // Draft state
      drafts,
      currentDraftId,

      // Draft CRUD
      createDraft: createDraftFn,
      updateDraft: updateDraftFn,
      deleteDraft: deleteDraftFn,
      getDraft: getDraftFn,
      setCurrentDraftId,
      refreshDrafts,
      flushNostrSync,

      // Task operations
      registerTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      removeTask: removeTaskFn,
      startTranscode,
      resumeTranscode,
      cancelTranscode,
      getTask,
      getWorkflowState,
      hasActiveTask,
      getActiveTasksForDraft,
      hasActiveUploads,
      activeTaskCount,
    }),
    [
      tasks,
      drafts,
      currentDraftId,
      createDraftFn,
      updateDraftFn,
      deleteDraftFn,
      getDraftFn,
      refreshDrafts,
      flushNostrSync,
      registerTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      removeTaskFn,
      startTranscode,
      resumeTranscode,
      cancelTranscode,
      getTask,
      getWorkflowState,
      hasActiveTask,
      getActiveTasksForDraft,
      hasActiveUploads,
      activeTaskCount,
    ]
  )

  return (
    <UploadManagerContext.Provider value={contextValue}>{children}</UploadManagerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploadManager(): UploadManagerContextType {
  const context = useContext(UploadManagerContext)
  if (!context) {
    throw new Error('useUploadManager must be used within UploadManagerProvider')
  }
  return context
}
