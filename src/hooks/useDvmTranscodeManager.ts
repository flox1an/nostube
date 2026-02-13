/**
 * DVM Transcode Manager Hook
 *
 * A thin wrapper around useUploadManager that provides the same API as useDvmTranscode.
 * This allows DvmTranscodeAlert to use the global upload manager for background transcoding.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useUploadManager } from '@/providers/UploadManagerProvider'
import type { VideoVariant } from '@/lib/video-processing'
import type { UploadTask } from '@/types/upload-manager'

export type TranscodeStatus =
  | 'idle'
  | 'discovering'
  | 'transcoding'
  | 'resuming'
  | 'mirroring'
  | 'complete'
  | 'error'

export interface StatusMessage {
  timestamp: number
  message: string
  percentage?: number
}

export interface TranscodeProgress {
  status: TranscodeStatus
  message: string
  eta?: number
  percentage?: number
  statusMessages: StatusMessage[]
  queue?: {
    resolutions: string[]
    currentIndex: number
    completed: string[]
  }
}

export interface PersistableTranscodeState {
  requestEventId: string
  dvmPubkey: string
  inputVideoUrl: string
  originalDuration?: number
  startedAt: number
  status: 'transcoding' | 'mirroring'
  lastStatusMessage?: string
  lastPercentage?: number
  resolutionQueue: string[]
  completedResolutions: string[]
  currentResolution: string
}

export interface UseDvmTranscodeManagerOptions {
  taskId: string
  onComplete?: (video: VideoVariant) => void
  onAllComplete?: () => void
  onStateChange?: (state: PersistableTranscodeState | null) => void
}

export interface UseDvmTranscodeManagerResult {
  status: TranscodeStatus
  progress: TranscodeProgress
  error: string | null
  startTranscode: (
    inputVideoUrl: string,
    originalDuration?: number,
    resolutions?: string[]
  ) => Promise<void>
  resumeTranscode: () => Promise<void>
  cancel: () => void
  transcodedVideo: VideoVariant | null
}

function mapTaskStatusToTranscodeStatus(task: UploadTask | undefined): TranscodeStatus {
  if (!task) return 'idle'

  switch (task.status) {
    case 'pending':
      return 'idle'
    case 'transcoding':
      if (task.transcodeState?.status === 'discovering') return 'discovering'
      if (task.transcodeState?.status === 'mirroring') return 'mirroring'
      return 'transcoding'
    case 'mirroring':
      return 'mirroring'
    case 'complete':
      return 'complete'
    case 'error':
      return 'error'
    case 'cancelled':
      return 'idle'
    default:
      return 'idle'
  }
}

function mapTaskToProgress(task: UploadTask | undefined): TranscodeProgress {
  if (!task || !task.transcodeState) {
    return {
      status: 'idle',
      message: '',
      statusMessages: [],
    }
  }

  const state = task.transcodeState
  const currentIndex = state.currentResolution
    ? state.resolutionQueue.indexOf(state.currentResolution)
    : 0

  return {
    status: mapTaskStatusToTranscodeStatus(task),
    message: state.message || '',
    eta: state.eta,
    percentage: state.percentage,
    statusMessages: [], // Manager doesn't track status messages individually
    queue: {
      resolutions: state.resolutionQueue || [],
      currentIndex: currentIndex >= 0 ? currentIndex : 0,
      completed: state.completedResolutions || [],
    },
  }
}

/**
 * Hook that wraps useUploadManager to provide useDvmTranscode-like API
 * for background transcoding that survives navigation.
 */
export function useDvmTranscodeManager({
  taskId,
  onComplete,
  onAllComplete,
}: UseDvmTranscodeManagerOptions): UseDvmTranscodeManagerResult {
  const manager = useUploadManager()

  const task = manager.getTask(taskId)
  const status = mapTaskStatusToTranscodeStatus(task)
  const progress = mapTaskToProgress(task)
  const error = task?.error?.message || null

  // Track which videos we've already delivered to avoid duplicates
  const deliveredVideosRef = useRef<Set<string>>(new Set())

  // Deliver any completed videos that haven't been delivered yet
  // This handles the case where the component remounts after videos completed
  useEffect(() => {
    const completedVideos = task?.transcodeState?.completedVideos
    if (!completedVideos || completedVideos.length === 0 || !onComplete) return

    // Collect all undelivered videos first
    const videosToDeliver: VideoVariant[] = []

    for (const video of completedVideos) {
      if (!deliveredVideosRef.current.has(video.url)) {
        deliveredVideosRef.current.add(video.url)

        // Convert to VideoVariant
        const videoVariant: VideoVariant = {
          url: video.url,
          dimension: video.dimension,
          sizeMB: video.sizeMB,
          duration: video.duration ?? 0,
          bitrate: video.bitrate,
          videoCodec: video.videoCodec,
          audioCodec: video.audioCodec,
          qualityLabel: video.qualityLabel,
          uploadedBlobs: [],
          mirroredBlobs: [],
          inputMethod: 'url',
        }

        videosToDeliver.push(videoVariant)
      }
    }

    // Deliver all videos with a small delay between each to allow React to process
    if (videosToDeliver.length > 0) {
      if (import.meta.env.DEV) {
        console.log(
          '[useDvmTranscodeManager] Delivering',
          videosToDeliver.length,
          'completed videos on mount'
        )
      }

      // Use setTimeout to ensure each state update is processed
      videosToDeliver.forEach((video, index) => {
        setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('[useDvmTranscodeManager] Delivering video:', video.url)
          }
          onComplete(video)
        }, index * 50) // 50ms delay between each
      })
    }

    // If all videos delivered and status is complete, call onAllComplete
    if (
      status === 'complete' &&
      completedVideos.length > 0 &&
      deliveredVideosRef.current.size === completedVideos.length
    ) {
      // Only call onAllComplete once, after all videos are delivered
      const allDeliveredKey = `__all_complete_${taskId}`
      if (!deliveredVideosRef.current.has(allDeliveredKey)) {
        deliveredVideosRef.current.add(allDeliveredKey)
        // Delay to ensure all video deliveries are processed first
        setTimeout(
          () => {
            onAllComplete?.()
          },
          videosToDeliver.length * 50 + 100
        )
      }
    }
  }, [task?.transcodeState?.completedVideos, status, taskId, onComplete, onAllComplete])

  const startTranscode = useCallback(
    async (inputVideoUrl: string, originalDuration?: number, resolutions: string[] = ['720p']) => {
      // Clear delivered videos when starting a new transcode
      deliveredVideosRef.current.clear()

      // Register the task first if it doesn't exist
      if (!manager.getTask(taskId)) {
        manager.registerTask(taskId)
      }

      await manager.startTranscode(
        taskId,
        inputVideoUrl,
        resolutions,
        originalDuration,
        onComplete,
        onAllComplete
      )
    },
    [taskId, manager, onComplete, onAllComplete]
  )

  const resumeTranscode = useCallback(async () => {
    await manager.resumeTranscode(taskId, onComplete, onAllComplete)
  }, [taskId, manager, onComplete, onAllComplete])

  const cancel = useCallback(() => {
    manager.cancelTranscode(taskId)
  }, [taskId, manager])

  // For now, we don't track transcodedVideo in the manager
  // The onComplete callback receives it
  const transcodedVideo = null

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
