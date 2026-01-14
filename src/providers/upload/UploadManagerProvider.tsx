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
import { type NostrEvent, type EventTemplate } from 'nostr-tools'
import type { UploadTask, TranscodeState } from '@/types/upload-manager'
import type { UploadDraft, UploadDraftsData } from '@/types/upload-draft'
import {
  getUploadTasks,
  saveUploadTasks,
  addUploadTask,
  updateUploadTask,
  removeUploadTask,
  cleanupCompletedTasks,
  getResumableTasks,
} from '@/lib/upload-manager-storage'
import {
  getDraftsFromStorage,
  saveDraftsToStorage,
  createEmptyDraft,
  getDraftFromStorage,
  updateDraftInStorage,
  deleteDraftFromStorage,
  addDraftToStorage,
  mergeDraftsFromNostr,
  isMilestoneUpdate,
  MAX_DRAFTS,
} from '@/lib/draft-storage'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAppContext } from '@/hooks/useAppContext'
import { relayPool } from '@/nostr/core'
import { nowInSecs } from '@/lib/utils'
import {
  parseDvmResultContent,
  parseCodecsFromMimetype,
  RESOLUTION_DIMENSIONS,
  type DvmHandlerInfo,
} from '@/lib/dvm-utils'
import { extractBlossomHash } from '@/utils/video-event'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import type { VideoVariant } from '@/lib/video-processing'
import type { BlobDescriptor } from 'blossom-client-sdk'
import { useUploadNotifications } from '@/hooks/useUploadNotifications'
import { createAddressLoader } from 'applesauce-loaders/loaders'

import type { UploadManagerContextType, TranscodeJob, ResolutionQueueInfo } from './types'
import {
  DVM_REQUEST_KIND,
  DVM_RESULT_KIND,
  DVM_FEEDBACK_KIND,
  HANDLER_INFO_KIND,
  TRANSCODE_JOB_TIMEOUT_MS,
  NOSTR_SYNC_DEBOUNCE_MS,
  ACTIVE_TASK_STATUSES,
} from './constants'
import { debounce } from './utils'

const UploadManagerContext = createContext<UploadManagerContextType | undefined>(undefined)

interface UploadManagerProviderProps {
  children: ReactNode
}

export function UploadManagerProvider({ children }: UploadManagerProviderProps) {
  const { user } = useCurrentUser()
  const { config, pool } = useAppContext()
  const { addNotification } = useUploadNotifications()

  // Task state - Map for O(1) lookups
  const [tasks, setTasks] = useState<Map<string, UploadTask>>(() => {
    const storedTasks = getUploadTasks()
    return new Map(storedTasks.map(t => [t.id, t]))
  })

  // Draft state - source of truth
  const [draftsVersion, setDraftsVersion] = useState(0)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)

  // Always read from localStorage (source of truth) - re-read when version changes
  const drafts = useMemo(() => {
    const freshDrafts = getDraftsFromStorage()
    if (import.meta.env.DEV) {
      console.log(
        '[UploadManager] Reading drafts, version:',
        draftsVersion,
        'count:',
        freshDrafts.length
      )
    }
    return freshDrafts
  }, [draftsVersion])

  // Active transcode jobs (subscriptions + abort controllers)
  const jobsRef = useRef<Map<string, TranscodeJob>>(new Map())

  // Track tasks currently being started to prevent auto-resume conflicts
  const startingTasksRef = useRef<Set<string>>(new Set())

  // Track in-flight Nostr saves so we can wait for them
  const inflightSaveRef = useRef<Promise<void> | null>(null)

  // Track last synced content to avoid redundant Nostr publishes
  const lastSyncedContentRef = useRef<string | null>(null)

  // Refs for stable access in callbacks
  const userRef = useRef(user)
  const configRef = useRef(config)
  const poolRef = useRef(pool)
  userRef.current = user
  configRef.current = config
  poolRef.current = pool

  // Cleanup old tasks on mount
  useEffect(() => {
    cleanupCompletedTasks()
  }, [])

  // Persist tasks to storage when they change
  useEffect(() => {
    const taskArray = Array.from(tasks.values())
    saveUploadTasks(taskArray)
  }, [tasks])

  // Cleanup subscriptions on unmount (only when app closes)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[UploadManager] Provider mounted')
    }
    return () => {
      if (import.meta.env.DEV) {
        console.log(
          '[UploadManager] Provider unmounting! Clearing jobs:',
          Array.from(jobsRef.current.keys())
        )
      }
      jobsRef.current.forEach(job => {
        job.subscription?.unsubscribe()
        job.abortController.abort()
      })
      jobsRef.current.clear()
    }
  }, [])

  // ========== DRAFT MANAGEMENT ==========

  // Save drafts to Nostr (NIP-78 encrypted)
  const saveToNostr = useCallback(async (draftsToSave: UploadDraft[]) => {
    const currentUser = userRef.current
    const currentConfig = configRef.current

    if (!currentUser?.signer?.nip44) {
      if (import.meta.env.DEV) {
        console.log('[UploadManager] saveToNostr - no signer or nip44')
      }
      return
    }

    const saveOperation = async () => {
      try {
        // Create content without lastModified for comparison (lastModified always changes)
        const draftsContent = JSON.stringify(draftsToSave)

        // Skip if content hasn't changed
        if (draftsContent === lastSyncedContentRef.current) {
          if (import.meta.env.DEV) {
            console.log('[UploadManager] saveToNostr - skipping, content unchanged')
          }
          return
        }

        const plaintext = JSON.stringify({
          version: '1',
          lastModified: Date.now(),
          drafts: draftsToSave,
        } as UploadDraftsData)

        const content = await currentUser.signer.nip44!.encrypt(currentUser.pubkey, plaintext)

        const event = {
          kind: 30078,
          content,
          created_at: nowInSecs(),
          tags: [['d', 'nostube-uploads']],
        }

        const writeRelays = currentConfig.relays
          .filter(r => r.tags.includes('write'))
          .map(r => r.url)

        if (import.meta.env.DEV) {
          console.log('[UploadManager] saveToNostr - publishing to', writeRelays.length, 'relays')
        }

        const signedEvent = await currentUser.signer.signEvent(event)
        await relayPool.publish(writeRelays, signedEvent)

        // Update last synced content after successful publish
        lastSyncedContentRef.current = draftsContent

        if (import.meta.env.DEV) {
          console.log('[UploadManager] saveToNostr - published successfully')
        }
      } catch (error) {
        console.error('[UploadManager] Failed to sync to Nostr:', error)
      } finally {
        inflightSaveRef.current = null
      }
    }

    const promise = saveOperation()
    inflightSaveRef.current = promise
    return promise
  }, [])

  // Keep a ref to the latest saveToNostr so debounced function doesn't need recreation
  const saveToNostrRef = useRef(saveToNostr)
  useEffect(() => {
    saveToNostrRef.current = saveToNostr
  }, [saveToNostr])

  // Create debounced function once
  const debouncedSaveToNostr = useMemo(
    () =>
      debounce((draftsToSave: UploadDraft[]) => {
        saveToNostrRef.current(draftsToSave)
      }, NOSTR_SYNC_DEBOUNCE_MS),
    []
  )

  // Flush pending Nostr sync on unmount
  useEffect(() => {
    return () => {
      debouncedSaveToNostr.flush()
    }
  }, [debouncedSaveToNostr])

  // Trigger re-read from localStorage
  const refreshDrafts = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[UploadManager] refreshDrafts - forcing re-fetch')
    }
    setDraftsVersion(v => v + 1)
  }, [])

  // Flush any pending Nostr sync
  const flushNostrSync = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log('[UploadManager] flushNostrSync')
    }
    debouncedSaveToNostr.flush()
    if (inflightSaveRef.current) {
      await inflightSaveRef.current
    }
  }, [debouncedSaveToNostr])

  // Create a new draft
  const createDraftFn = useCallback((): UploadDraft => {
    const currentDrafts = getDraftsFromStorage()
    if (currentDrafts.length >= MAX_DRAFTS) {
      throw new Error(`Maximum ${MAX_DRAFTS} drafts allowed`)
    }

    const newDraft = createEmptyDraft()
    addDraftToStorage(newDraft)
    setDraftsVersion(v => v + 1)

    return newDraft
  }, [])

  // Update a draft
  const updateDraftFn = useCallback(
    (id: string, updates: Partial<UploadDraft>) => {
      const updatedDraft = updateDraftInStorage(id, updates)
      if (!updatedDraft) {
        console.warn('[UploadManager] updateDraft - draft not found:', id)
        return
      }

      setDraftsVersion(v => v + 1)

      // Get fresh drafts for sync
      const freshDrafts = getDraftsFromStorage()

      // Immediate sync for milestones, debounced for form fields
      if (isMilestoneUpdate(updates)) {
        saveDraftsToStorage(freshDrafts) // Already saved, but ensure timestamp
        saveToNostr(freshDrafts)
      } else {
        debouncedSaveToNostr(freshDrafts)
      }
    },
    [saveToNostr, debouncedSaveToNostr]
  )

  // Delete a draft
  const deleteDraftFn = useCallback(
    (id: string) => {
      deleteDraftFromStorage(id)
      setDraftsVersion(v => v + 1)

      // Immediate sync for deletions
      const freshDrafts = getDraftsFromStorage()
      saveToNostr(freshDrafts)
    },
    [saveToNostr]
  )

  // Get a draft by ID
  const getDraftFn = useCallback((id: string): UploadDraft | undefined => {
    return getDraftFromStorage(id)
  }, [])

  // Subscribe to NIP-78 event changes (Nostr sync)
  useEffect(() => {
    if (!user?.pubkey || !user.signer?.nip44) return

    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

    const loader = createAddressLoader(pool)
    const sub = loader({
      kind: 30078,
      pubkey: user.pubkey,
      identifier: 'nostube-uploads',
      relays: readRelays,
    }).subscribe(async event => {
      if (event) {
        try {
          let plaintext = event.content
          if (user.signer.nip44) {
            try {
              plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content)
            } catch {
              // Legacy unencrypted draft
            }
          }

          const parsed = JSON.parse(plaintext)
          const nostrDrafts = parsed.drafts || []
          const merged = mergeDraftsFromNostr(nostrDrafts, event.created_at)
          saveDraftsToStorage(merged)

          // Update last synced content to prevent re-publishing the same data
          lastSyncedContentRef.current = JSON.stringify(merged)

          setDraftsVersion(v => v + 1)
        } catch (error) {
          console.error('[UploadManager] Failed to parse NIP-78 event:', error)
        }
      }
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, user?.signer, pool, config.relays])

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
        job.subscription?.unsubscribe()
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
        job.subscription?.unsubscribe()
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
        job.subscription?.unsubscribe()
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
      job.subscription?.unsubscribe()
      jobsRef.current.delete(taskId)
    }
  }, [])

  // ========== DVM OPERATIONS ==========

  // Discover DVM handler
  const discoverDvm = useCallback(async (): Promise<DvmHandlerInfo | null> => {
    const readRelays = configRef.current.relays
      .filter(r => r.tags.includes('read') && r.url)
      .map(r => r.url)
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
            if (typeof event === 'string') return
            if (resolved) return

            const nostrEvent = event as NostrEvent
            let name: string | undefined
            let about: string | undefined

            try {
              const content = JSON.parse(nostrEvent.content || '{}')
              name = content.name
              about = content.about
            } catch {
              // Content is not JSON
            }

            const nameTag = nostrEvent.tags.find(t => t[0] === 'name')
            const aboutTag = nostrEvent.tags.find(t => t[0] === 'about')
            if (nameTag?.[1]) name = nameTag[1]
            if (aboutTag?.[1]) about = aboutTag[1]

            resolved = true
            clearTimeout(timeout)
            sub.unsubscribe()
            resolve({ pubkey: nostrEvent.pubkey, name, about })
          },
          error: err => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              reject(err)
            }
          },
          complete: () => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve(null)
            }
          },
        })
    })
  }, [])

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

    return updatedVideo
  }, [])

  // Subscribe to DVM responses - returns a promise that resolves with the result
  const subscribeToDvmResponses = useCallback(
    (
      taskId: string,
      requestEventId: string,
      dvmPubkey: string,
      originalDuration?: number,
      requestedResolution?: string
    ): Promise<VideoVariant> => {
      if (import.meta.env.DEV) {
        console.log('[UploadManager] subscribeToDvmResponses called for taskId:', taskId)
        console.log('[UploadManager] jobsRef current keys:', Array.from(jobsRef.current.keys()))
      }

      const readRelays = configRef.current.relays
        .filter(r => r.tags.includes('read') && r.url)
        .map(r => r.url)

      return new Promise((resolve, reject) => {
        const job = jobsRef.current.get(taskId)
        if (!job) {
          if (import.meta.env.DEV) {
            console.error('[UploadManager] Job not found for taskId:', taskId)
            console.error('[UploadManager] Available jobs:', Array.from(jobsRef.current.keys()))
          }
          reject(new Error('Job not found'))
          return
        }

        const timeout = setTimeout(
          () => {
            job.subscription?.unsubscribe()
            reject(new Error('DVM job timed out after 10 minutes'))
          },
          10 * 60 * 1000
        )

        const subscription = relayPool
          .subscription(readRelays, [
            {
              kinds: [DVM_FEEDBACK_KIND, DVM_RESULT_KIND],
              authors: [dvmPubkey],
              '#e': [requestEventId],
            },
          ])
          .subscribe({
            next: async event => {
              if (typeof event === 'string') return

              const nostrEvent = event as NostrEvent

              if (nostrEvent.kind === DVM_FEEDBACK_KIND) {
                const statusTag = nostrEvent.tags.find(t => t[0] === 'status')
                if (statusTag) {
                  const [, feedbackStatus, statusExtraInfo] = statusTag
                  const contentTag = nostrEvent.tags.find(t => t[0] === 'content')
                  const message =
                    contentTag?.[1] ||
                    statusExtraInfo ||
                    (feedbackStatus === 'processing' ? 'Processing video...' : 'Processing...')

                  const etaTag = nostrEvent.tags.find(t => t[0] === 'eta')
                  const eta = etaTag?.[1] ? parseInt(etaTag[1], 10) : undefined

                  const percentMatch = message?.match(/(\d+)%/)
                  const percentage = percentMatch ? parseInt(percentMatch[1], 10) : undefined

                  if (feedbackStatus === 'processing' || feedbackStatus === 'partial') {
                    // Update task state
                    updateTasksState(taskId, {
                      transcodeState: {
                        ...tasks.get(taskId)?.transcodeState,
                        status: 'transcoding',
                        message,
                        percentage,
                        eta,
                      } as TranscodeState,
                    })
                  } else if (feedbackStatus === 'error') {
                    clearTimeout(timeout)
                    subscription.unsubscribe()
                    reject(new Error(contentTag?.[1] || statusExtraInfo || 'DVM processing error'))
                  }
                }
              } else if (nostrEvent.kind === DVM_RESULT_KIND) {
                clearTimeout(timeout)
                subscription.unsubscribe()

                const result = parseDvmResultContent(nostrEvent.content)
                if (!result || !result.urls || result.urls.length === 0) {
                  reject(new Error('Invalid DVM result: no URLs returned'))
                  return
                }

                const { videoCodec, audioCodec } = parseCodecsFromMimetype(result.mimetype || '')
                const duration = result.duration || originalDuration || 0

                let bitrate = result.bitrate
                if (!bitrate && result.size_bytes && duration > 0) {
                  bitrate = Math.round((result.size_bytes * 8) / duration)
                }

                const resolution = result.resolution || requestedResolution || '720p'
                const dimension = RESOLUTION_DIMENSIONS[resolution] || '1280x720'

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

        // Store subscription in job
        job.subscription = subscription
      })
    },
    [updateTasksState, tasks]
  )

  // Process a single resolution
  const processResolution = useCallback(
    async (
      taskId: string,
      inputVideoUrl: string,
      resolution: string,
      dvm: DvmHandlerInfo,
      originalDuration?: number,
      queueInfo?: ResolutionQueueInfo
    ): Promise<VideoVariant> => {
      const currentUser = userRef.current
      const currentConfig = configRef.current

      if (!currentUser) throw new Error('User not logged in')

      // Filter relays and ensure no undefined values
      const writeRelays = currentConfig.relays
        .filter(r => r.tags.includes('write') && r.url)
        .map(r => r.url)

      if (writeRelays.length === 0) {
        throw new Error('No write relays configured')
      }

      // Update state
      updateTasksState(taskId, {
        status: 'transcoding',
        transcodeState: {
          status: 'transcoding',
          dvmPubkey: dvm.pubkey,
          inputVideoUrl,
          originalDuration,
          startedAt: Date.now(),
          currentResolution: resolution,
          resolutionQueue: queueInfo?.resolutions || [resolution],
          completedResolutions: queueInfo?.completed || [],
          message: `Submitting ${resolution} transcode job...`,
        },
      })

      // Validate all tag values are strings
      if (!inputVideoUrl || typeof inputVideoUrl !== 'string') {
        throw new Error('Invalid input video URL')
      }
      if (!dvm.pubkey || typeof dvm.pubkey !== 'string') {
        throw new Error('Invalid DVM pubkey')
      }
      if (!resolution || typeof resolution !== 'string') {
        throw new Error('Invalid resolution')
      }

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

      if (import.meta.env.DEV) {
        console.log('[UploadManager] Signing job request:', jobRequest)
      }

      const signedRequest = await currentUser.signer.signEvent(jobRequest)
      await relayPool.publish(writeRelays, signedRequest)

      if (import.meta.env.DEV) {
        console.log(`[UploadManager] Published ${resolution} job request:`, signedRequest.id)
      }

      // Check if cancelled
      const job = jobsRef.current.get(taskId)
      if (job?.abortController.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Update state with request ID
      updateTasksState(taskId, {
        transcodeState: {
          ...tasks.get(taskId)?.transcodeState,
          requestEventId: signedRequest.id,
          message: `Transcoding ${resolution}...`,
        } as TranscodeState,
      })

      // Subscribe and wait for result
      const transcodedResult = await subscribeToDvmResponses(
        taskId,
        signedRequest.id,
        dvm.pubkey,
        originalDuration,
        resolution
      )

      // Check if cancelled
      if (job?.abortController.signal.aborted) {
        throw new Error('Cancelled')
      }

      // Mirror to user's servers
      updateTasksState(taskId, {
        status: 'mirroring',
        transcodeState: {
          ...tasks.get(taskId)?.transcodeState,
          status: 'mirroring',
          message: `Copying ${resolution} to your servers...`,
        } as TranscodeState,
      })

      const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)

      return mirroredVideo
    },
    [updateTasksState, tasks, subscribeToDvmResponses, mirrorTranscodedVideo]
  )

  // Start transcode - the main entry point
  const startTranscode = useCallback(
    async (
      taskId: string,
      inputVideoUrl: string,
      resolutions: string[],
      originalDuration?: number,
      onComplete?: (video: VideoVariant) => void,
      onAllComplete?: () => void
    ) => {
      if (!userRef.current) {
        failTask(taskId, 'User not logged in')
        return
      }

      // Mark as starting to prevent auto-resume race condition
      startingTasksRef.current.add(taskId)

      // Create job entry
      const job: TranscodeJob = {
        subscription: null,
        abortController: new AbortController(),
        onComplete,
        onAllComplete,
      }
      jobsRef.current.set(taskId, job)

      if (import.meta.env.DEV) {
        console.log('[UploadManager] startTranscode - Created job for taskId:', taskId)
        console.log('[UploadManager] jobsRef now has keys:', Array.from(jobsRef.current.keys()))
      }

      const completedResolutions: string[] = []

      try {
        // Discover DVM
        updateTasksState(taskId, {
          status: 'transcoding',
          transcodeState: {
            status: 'discovering',
            resolutionQueue: resolutions,
            completedResolutions: [],
            message: 'Finding transcoding service...',
          },
        })

        const dvm = await discoverDvm()
        if (!dvm) {
          throw new Error('No DVM transcoding service found')
        }

        if (job.abortController.signal.aborted) {
          return
        }

        // Process each resolution
        for (let i = 0; i < resolutions.length; i++) {
          const resolution = resolutions[i]
          const queueInfo: ResolutionQueueInfo = {
            resolutions,
            currentIndex: i,
            completed: [...completedResolutions],
          }

          const mirroredVideo = await processResolution(
            taskId,
            inputVideoUrl,
            resolution,
            dvm,
            originalDuration,
            queueInfo
          )

          completedResolutions.push(resolution)

          // Store completed video in state for persistence (in case callbacks are stale)
          const currentState = tasks.get(taskId)?.transcodeState
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
          const draft = getDraftFromStorage(taskId)
          if (draft) {
            const existingVideos = draft.uploadInfo?.videos || []
            // Check for duplicates by URL
            const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
            if (!isDuplicate) {
              const updatedVideos = [...existingVideos, mirroredVideo]
              updateDraftInStorage(taskId, {
                uploadInfo: { videos: updatedVideos },
              })
              // Trigger re-render for any listening components
              setDraftsVersion(v => v + 1)
              // Immediate Nostr sync for uploads
              const freshDrafts = getDraftsFromStorage()
              saveToNostr(freshDrafts)

              if (import.meta.env.DEV) {
                console.log(
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
    [updateTasksState, tasks, discoverDvm, processResolution, completeTask, failTask, saveToNostr]
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
          console.log('[UploadManager] resumeTranscode - job already exists for:', taskId)
        }
        return
      }

      const task = tasks.get(taskId)
      if (!task || !task.transcodeState) {
        console.warn('[UploadManager] Cannot resume - no transcode state')
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

      // Create job entry
      const job: TranscodeJob = {
        subscription: null,
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
        updateTasksState(taskId, {
          status: 'transcoding',
          transcodeState: {
            ...state,
            status: 'transcoding',
            message: `Resuming ${currentResolution} transcode...`,
          },
        })

        // Check if we have a pending request to resume
        if (state.requestEventId && state.dvmPubkey) {
          // Try to get existing result first
          const existingResult = await queryForExistingResult(state.requestEventId, state.dvmPubkey)

          if (existingResult) {
            // DVM finished while we were away
            const result = parseDvmResultContent(existingResult.content)
            if (result?.urls?.length) {
              const { videoCodec, audioCodec } = parseCodecsFromMimetype(result.mimetype || '')
              const duration = result.duration || state.originalDuration || 0
              let bitrate = result.bitrate
              if (!bitrate && result.size_bytes && duration > 0) {
                bitrate = Math.round((result.size_bytes * 8) / duration)
              }

              const videoVariant: VideoVariant = {
                url: result.urls[0],
                dimension: RESOLUTION_DIMENSIONS[currentResolution] || '1280x720',
                sizeMB: result.size_bytes ? result.size_bytes / (1024 * 1024) : undefined,
                duration,
                bitrate,
                videoCodec,
                audioCodec,
                uploadedBlobs: [],
                mirroredBlobs: [],
                inputMethod: 'url',
                qualityLabel: currentResolution,
              }

              // Mirror it
              updateTasksState(taskId, {
                status: 'mirroring',
                transcodeState: {
                  ...state,
                  status: 'mirroring',
                  message: `Copying ${currentResolution} to your servers...`,
                },
              })

              const mirroredVideo = await mirrorTranscodedVideo(videoVariant)
              completedResolutions.push(currentResolution)

              // DIRECTLY UPDATE DRAFT
              const draft = getDraftFromStorage(taskId)
              if (draft) {
                const existingVideos = draft.uploadInfo?.videos || []
                const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
                if (!isDuplicate) {
                  const updatedVideos = [...existingVideos, mirroredVideo]
                  updateDraftInStorage(taskId, { uploadInfo: { videos: updatedVideos } })
                  setDraftsVersion(v => v + 1)
                  const freshDrafts = getDraftsFromStorage()
                  saveToNostr(freshDrafts)
                }
              }

              job.onComplete?.(mirroredVideo)
            }
          } else {
            // Still processing - resubscribe
            const transcodedResult = await subscribeToDvmResponses(
              taskId,
              state.requestEventId,
              state.dvmPubkey,
              state.originalDuration,
              currentResolution
            )

            // Mirror
            updateTasksState(taskId, {
              status: 'mirroring',
              transcodeState: {
                ...state,
                status: 'mirroring',
                message: `Copying ${currentResolution} to your servers...`,
              },
            })

            const mirroredVideo = await mirrorTranscodedVideo(transcodedResult)
            completedResolutions.push(currentResolution)

            // DIRECTLY UPDATE DRAFT
            const draft = getDraftFromStorage(taskId)
            if (draft) {
              const existingVideos = draft.uploadInfo?.videos || []
              const isDuplicate = existingVideos.some(v => v.url === mirroredVideo.url)
              if (!isDuplicate) {
                const updatedVideos = [...existingVideos, mirroredVideo]
                updateDraftInStorage(taskId, { uploadInfo: { videos: updatedVideos } })
                setDraftsVersion(v => v + 1)
                const freshDrafts = getDraftsFromStorage()
                saveToNostr(freshDrafts)
              }
            }

            job.onComplete?.(mirroredVideo)
          }
        }

        // Continue with remaining resolutions
        const remainingResolutions = resolutionQueue.slice(currentIndex >= 0 ? currentIndex + 1 : 0)

        if (remainingResolutions.length > 0) {
          const dvm = await discoverDvm()
          if (!dvm) {
            throw new Error('No DVM transcoding service found')
          }

          for (let i = 0; i < remainingResolutions.length; i++) {
            const resolution = remainingResolutions[i]
            const queueInfo: ResolutionQueueInfo = {
              resolutions: resolutionQueue,
              currentIndex: resolutionQueue.indexOf(resolution),
              completed: [...completedResolutions],
            }

            const video = await processResolution(
              taskId,
              state.inputVideoUrl!,
              resolution,
              dvm,
              state.originalDuration,
              queueInfo
            )

            completedResolutions.push(resolution)

            // DIRECTLY UPDATE DRAFT
            const draft = getDraftFromStorage(taskId)
            if (draft) {
              const existingVideos = draft.uploadInfo?.videos || []
              const isDuplicate = existingVideos.some(v => v.url === video.url)
              if (!isDuplicate) {
                const updatedVideos = [...existingVideos, video]
                updateDraftInStorage(taskId, { uploadInfo: { videos: updatedVideos } })
                setDraftsVersion(v => v + 1)
                const freshDrafts = getDraftsFromStorage()
                saveToNostr(freshDrafts)
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
      tasks,
      updateTasksState,
      discoverDvm,
      processResolution,
      subscribeToDvmResponses,
      mirrorTranscodedVideo,
      completeTask,
      failTask,
      saveToNostr,
    ]
  )

  // Query for existing DVM result
  const queryForExistingResult = useCallback(
    async (requestEventId: string, dvmPubkey: string): Promise<NostrEvent | null> => {
      const readRelays = configRef.current.relays
        .filter(r => r.tags.includes('read'))
        .map(r => r.url)

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
              if (typeof event === 'string') return
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
    []
  )

  // Cancel transcode
  const cancelTranscode = useCallback(
    (taskId: string) => {
      const job = jobsRef.current.get(taskId)
      if (job) {
        job.abortController.abort()
        job.subscription?.unsubscribe()
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
      console.log('[UploadManager] Found resumable tasks:', resumable.length)
    }

    // Auto-resume transcoding tasks
    for (const task of resumable) {
      if (task.status === 'transcoding' && task.transcodeState) {
        // Skip if task is currently being started or already has a job
        if (startingTasksRef.current.has(task.id)) {
          if (import.meta.env.DEV) {
            console.log('[UploadManager] Skipping auto-resume for task being started:', task.id)
          }
          continue
        }
        if (jobsRef.current.has(task.id)) {
          if (import.meta.env.DEV) {
            console.log('[UploadManager] Skipping auto-resume for task with existing job:', task.id)
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

export function useUploadManager(): UploadManagerContextType {
  const context = useContext(UploadManagerContext)
  if (!context) {
    throw new Error('useUploadManager must be used within UploadManagerProvider')
  }
  return context
}
