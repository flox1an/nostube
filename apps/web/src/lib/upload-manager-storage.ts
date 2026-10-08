/**
 * Upload Manager Storage
 *
 * localStorage persistence for upload tasks, enabling background uploads
 * to survive page refreshes and navigation.
 */

import type { UploadTask, UploadManagerStorage } from '@/types/upload-manager'

const STORAGE_KEY = 'nostube_upload_tasks'
const STORAGE_VERSION = '1'

// Max age for completed/error/cancelled tasks before cleanup (24 hours)
const MAX_COMPLETED_TASK_AGE_MS = 24 * 60 * 60 * 1000

function getDefaultStorage(): UploadManagerStorage {
  return {
    version: STORAGE_VERSION,
    tasks: [],
    lastUpdated: Date.now(),
  }
}

export function getUploadManagerStorage(): UploadManagerStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultStorage()

    const parsed = JSON.parse(raw) as UploadManagerStorage

    // Version migration if needed
    if (parsed.version !== STORAGE_VERSION) {
      // For now, just reset on version mismatch
      return getDefaultStorage()
    }

    return parsed
  } catch (error) {
    console.error('[UploadManagerStorage] Failed to load storage:', error)
    return getDefaultStorage()
  }
}

export function saveUploadManagerStorage(storage: UploadManagerStorage): void {
  try {
    storage.lastUpdated = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (error) {
    console.error('[UploadManagerStorage] Failed to save storage:', error)
  }
}

export function getUploadTasks(): UploadTask[] {
  return getUploadManagerStorage().tasks
}

export function saveUploadTasks(tasks: UploadTask[]): void {
  const storage = getUploadManagerStorage()
  storage.tasks = tasks
  saveUploadManagerStorage(storage)
}

export function getUploadTask(taskId: string): UploadTask | undefined {
  const tasks = getUploadTasks()
  return tasks.find(t => t.id === taskId)
}

export function updateUploadTask(
  taskId: string,
  updates: Partial<UploadTask>
): UploadTask | undefined {
  const tasks = getUploadTasks()
  const index = tasks.findIndex(t => t.id === taskId)

  if (index === -1) return undefined

  const updatedTask = {
    ...tasks[index],
    ...updates,
    updatedAt: Date.now(),
  }
  tasks[index] = updatedTask
  saveUploadTasks(tasks)

  return updatedTask
}

export function addUploadTask(task: UploadTask): void {
  const tasks = getUploadTasks()

  // Remove existing task with same ID if present
  const filtered = tasks.filter(t => t.id !== task.id)
  filtered.push(task)

  saveUploadTasks(filtered)
}

export function removeUploadTask(taskId: string): void {
  const tasks = getUploadTasks()
  const filtered = tasks.filter(t => t.id !== taskId)
  saveUploadTasks(filtered)
}

/**
 * Remove old completed/error/cancelled tasks
 */
export function cleanupCompletedTasks(): number {
  const tasks = getUploadTasks()
  const now = Date.now()
  const cutoff = now - MAX_COMPLETED_TASK_AGE_MS

  const filtered = tasks.filter(task => {
    // Keep active tasks
    if (['pending', 'uploading', 'mirroring', 'transcoding'].includes(task.status)) {
      return true
    }

    // Remove old completed/error/cancelled tasks
    const taskTime = task.completedAt || task.updatedAt
    return taskTime > cutoff
  })

  const removed = tasks.length - filtered.length
  if (removed > 0) {
    saveUploadTasks(filtered)
  }

  return removed
}

/**
 * Get tasks that can be resumed (were in progress when app closed)
 */
export function getResumableTasks(): UploadTask[] {
  const tasks = getUploadTasks()

  return tasks.filter(task => {
    // Can resume transcoding tasks
    if (task.status === 'transcoding' && task.transcodeState) {
      // Check if not expired (12 hours)
      const startedAt = task.transcodeState.startedAt || task.createdAt
      const elapsed = Date.now() - startedAt
      const maxAge = 12 * 60 * 60 * 1000 // 12 hours
      return elapsed < maxAge
    }

    // Can't resume file uploads (need to restart)
    // Mirroring can potentially resume if we have the blob info

    return false
  })
}
