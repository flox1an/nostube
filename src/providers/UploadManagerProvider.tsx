/**
 * Upload Manager Provider
 *
 * Global context for managing background uploads and transcoding.
 * Uploads and transcodes continue even when navigating away from the upload page.
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
import type { Subscription } from 'rxjs'
import type { UploadTask, TranscodeState } from '@/types/upload-manager'
import {
  getUploadTasks,
  saveUploadTasks,
  addUploadTask,
  updateUploadTask,
  removeUploadTask,
  cleanupCompletedTasks,
  getResumableTasks,
} from '@/lib/upload-manager-storage'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export interface UploadManagerContextType {
  // Task state
  tasks: Map<string, UploadTask>

  // Upload operations
  registerTask(draftId: string, title?: string): UploadTask
  updateTaskProgress(taskId: string, progress: Partial<UploadTask>): void
  completeTask(taskId: string): void
  failTask(taskId: string, error: string, retryable?: boolean): void
  cancelTask(taskId: string): void
  removeTask(taskId: string): void

  // Transcode operations
  startTranscodeTracking(taskId: string, state: TranscodeState, subscription?: Subscription): void
  updateTranscodeState(taskId: string, state: Partial<TranscodeState>): void
  completeTranscode(taskId: string, resolution: string): void

  // Query helpers
  getTask(taskId: string): UploadTask | undefined
  hasActiveTask(draftId: string): boolean
  getActiveTasksForDraft(draftId: string): UploadTask[]

  // Global state
  hasActiveUploads: boolean
  activeTaskCount: number

  // Subscription management (for DVM)
  registerSubscription(taskId: string, subscription: Subscription): void
  unregisterSubscription(taskId: string): void
}

const UploadManagerContext = createContext<UploadManagerContextType | undefined>(undefined)

interface UploadManagerProviderProps {
  children: ReactNode
}

export function UploadManagerProvider({ children }: UploadManagerProviderProps) {
  const { user } = useCurrentUser()

  // Task state - Map for O(1) lookups
  const [tasks, setTasks] = useState<Map<string, UploadTask>>(() => {
    const storedTasks = getUploadTasks()
    return new Map(storedTasks.map(t => [t.id, t]))
  })

  // Subscriptions for DVM transcode (survive re-renders)
  const subscriptionsRef = useRef<Map<string, Subscription>>(new Map())

  // Abort controllers for uploads (survive re-renders)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Cleanup old tasks on mount
  useEffect(() => {
    cleanupCompletedTasks()
  }, [])

  // Persist tasks to storage when they change
  useEffect(() => {
    const taskArray = Array.from(tasks.values())
    saveUploadTasks(taskArray)
  }, [tasks])

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach(sub => sub.unsubscribe())
      subscriptionsRef.current.clear()
      abortControllersRef.current.forEach(ctrl => ctrl.abort())
      abortControllersRef.current.clear()
    }
  }, [])

  // Auto-resume resumable tasks when user logs in
  useEffect(() => {
    if (!user) return

    const resumable = getResumableTasks()
    if (resumable.length > 0 && import.meta.env.DEV) {
      console.log('[UploadManager] Found resumable tasks:', resumable.length)
    }

    // Note: Actual resume logic for DVM subscriptions should be triggered
    // by the component that owns the transcode (e.g., DvmTranscodeAlert)
    // This provider just maintains the state
  }, [user])

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
      updateTasksState(taskId, {
        status: 'complete',
        completedAt: Date.now(),
      })

      // Cleanup subscription if exists
      const sub = subscriptionsRef.current.get(taskId)
      if (sub) {
        sub.unsubscribe()
        subscriptionsRef.current.delete(taskId)
      }
    },
    [updateTasksState]
  )

  // Fail a task
  const failTask = useCallback(
    (taskId: string, error: string, retryable = true) => {
      updateTasksState(taskId, {
        status: 'error',
        error: { message: error, retryable },
      })

      // Cleanup subscription if exists
      const sub = subscriptionsRef.current.get(taskId)
      if (sub) {
        sub.unsubscribe()
        subscriptionsRef.current.delete(taskId)
      }
    },
    [updateTasksState]
  )

  // Cancel a task
  const cancelTask = useCallback(
    (taskId: string) => {
      updateTasksState(taskId, { status: 'cancelled' })

      // Abort upload if in progress
      const abortController = abortControllersRef.current.get(taskId)
      if (abortController) {
        abortController.abort()
        abortControllersRef.current.delete(taskId)
      }

      // Cleanup subscription if exists
      const sub = subscriptionsRef.current.get(taskId)
      if (sub) {
        sub.unsubscribe()
        subscriptionsRef.current.delete(taskId)
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

    // Cleanup subscription if exists
    const sub = subscriptionsRef.current.get(taskId)
    if (sub) {
      sub.unsubscribe()
      subscriptionsRef.current.delete(taskId)
    }
  }, [])

  // Start tracking a transcode
  const startTranscodeTracking = useCallback(
    (taskId: string, state: TranscodeState, subscription?: Subscription) => {
      updateTasksState(taskId, {
        status: 'transcoding',
        transcodeState: state,
      })

      if (subscription) {
        subscriptionsRef.current.set(taskId, subscription)
      }
    },
    [updateTasksState]
  )

  // Update transcode state
  const updateTranscodeState = useCallback(
    (taskId: string, state: Partial<TranscodeState>) => {
      setTasks(prev => {
        const task = prev.get(taskId)
        if (!task) return prev

        const newMap = new Map(prev)
        newMap.set(taskId, {
          ...task,
          transcodeState: {
            ...task.transcodeState,
            ...state,
          } as TranscodeState,
          updatedAt: Date.now(),
        })
        return newMap
      })

      // Update storage
      const task = tasks.get(taskId)
      if (task) {
        updateUploadTask(taskId, {
          transcodeState: { ...task.transcodeState, ...state } as TranscodeState,
        })
      }
    },
    [tasks]
  )

  // Complete a single resolution transcode
  const completeTranscode = useCallback((taskId: string, resolution: string) => {
    setTasks(prev => {
      const task = prev.get(taskId)
      if (!task || !task.transcodeState) return prev

      const completedResolutions = [...(task.transcodeState.completedResolutions || []), resolution]

      const remainingQueue = task.transcodeState.resolutionQueue.filter(
        r => !completedResolutions.includes(r)
      )

      const isAllComplete = remainingQueue.length === 0

      const newMap = new Map(prev)
      newMap.set(taskId, {
        ...task,
        status: isAllComplete ? 'complete' : 'transcoding',
        completedAt: isAllComplete ? Date.now() : undefined,
        transcodeState: {
          ...task.transcodeState,
          completedResolutions,
          currentResolution: remainingQueue[0],
        },
        updatedAt: Date.now(),
      })
      return newMap
    })
  }, [])

  // Get a specific task
  const getTask = useCallback(
    (taskId: string): UploadTask | undefined => {
      return tasks.get(taskId)
    },
    [tasks]
  )

  // Check if draft has an active task
  const hasActiveTask = useCallback(
    (draftId: string): boolean => {
      const task = tasks.get(draftId)
      if (!task) return false
      return ['pending', 'uploading', 'mirroring', 'transcoding'].includes(task.status)
    },
    [tasks]
  )

  // Get all active tasks for a draft
  const getActiveTasksForDraft = useCallback(
    (draftId: string): UploadTask[] => {
      return Array.from(tasks.values()).filter(
        t =>
          t.draftId === draftId &&
          ['pending', 'uploading', 'mirroring', 'transcoding'].includes(t.status)
      )
    },
    [tasks]
  )

  // Register a subscription
  const registerSubscription = useCallback((taskId: string, subscription: Subscription) => {
    // Unsubscribe from existing if any
    const existing = subscriptionsRef.current.get(taskId)
    if (existing) {
      existing.unsubscribe()
    }
    subscriptionsRef.current.set(taskId, subscription)
  }, [])

  // Unregister a subscription
  const unregisterSubscription = useCallback((taskId: string) => {
    const sub = subscriptionsRef.current.get(taskId)
    if (sub) {
      sub.unsubscribe()
      subscriptionsRef.current.delete(taskId)
    }
  }, [])

  // Computed values
  const hasActiveUploads = useMemo(() => {
    return Array.from(tasks.values()).some(t =>
      ['pending', 'uploading', 'mirroring', 'transcoding'].includes(t.status)
    )
  }, [tasks])

  const activeTaskCount = useMemo(() => {
    return Array.from(tasks.values()).filter(t =>
      ['pending', 'uploading', 'mirroring', 'transcoding'].includes(t.status)
    ).length
  }, [tasks])

  const contextValue: UploadManagerContextType = useMemo(
    () => ({
      tasks,
      registerTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      removeTask: removeTaskFn,
      startTranscodeTracking,
      updateTranscodeState,
      completeTranscode,
      getTask,
      hasActiveTask,
      getActiveTasksForDraft,
      hasActiveUploads,
      activeTaskCount,
      registerSubscription,
      unregisterSubscription,
    }),
    [
      tasks,
      registerTask,
      updateTaskProgress,
      completeTask,
      failTask,
      cancelTask,
      removeTaskFn,
      startTranscodeTracking,
      updateTranscodeState,
      completeTranscode,
      getTask,
      hasActiveTask,
      getActiveTasksForDraft,
      hasActiveUploads,
      activeTaskCount,
      registerSubscription,
      unregisterSubscription,
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
