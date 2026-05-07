import type { BrowserTranscodeState } from '@/types/upload-draft'
import type { VideoVariant } from '@/lib/video-processing'

const STORAGE_KEY = 'nostube_browser_transcode_jobs'
const STORAGE_VERSION = '1'

export interface BrowserTranscodeJob {
  id: string
  draftId: string
  state: BrowserTranscodeState
  resultVideos?: VideoVariant[]
  createdAt: number
  updatedAt: number
}

interface BrowserTranscodeJobStorage {
  version: string
  jobs: BrowserTranscodeJob[]
  lastUpdated: number
}

type BrowserTranscodeJobListener = (job: BrowserTranscodeJob) => void

const listeners = new Set<BrowserTranscodeJobListener>()

function getDefaultStorage(): BrowserTranscodeJobStorage {
  return {
    version: STORAGE_VERSION,
    jobs: [],
    lastUpdated: Date.now(),
  }
}

function getStorage(): BrowserTranscodeJobStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultStorage()

    const parsed = JSON.parse(raw) as BrowserTranscodeJobStorage
    if (parsed.version !== STORAGE_VERSION) return getDefaultStorage()

    return parsed
  } catch (error) {
    console.error('[BrowserTranscodeJobStorage] Failed to load storage:', error)
    return getDefaultStorage()
  }
}

function saveStorage(storage: BrowserTranscodeJobStorage): void {
  try {
    storage.lastUpdated = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (error) {
    console.error('[BrowserTranscodeJobStorage] Failed to save storage:', error)
  }
}

function notify(job: BrowserTranscodeJob): void {
  listeners.forEach(listener => listener(job))
}

export function getBrowserTranscodeJobs(): BrowserTranscodeJob[] {
  return getStorage().jobs
}

export function getBrowserTranscodeJob(draftId: string): BrowserTranscodeJob | undefined {
  return getBrowserTranscodeJobs().find(job => job.draftId === draftId)
}

export function upsertBrowserTranscodeJob(
  draftId: string,
  state: BrowserTranscodeState,
  resultVideos?: VideoVariant[]
): BrowserTranscodeJob {
  const storage = getStorage()
  const existingIndex = storage.jobs.findIndex(job => job.draftId === draftId)
  const now = Date.now()

  const job: BrowserTranscodeJob = {
    id: storage.jobs[existingIndex]?.id ?? draftId,
    draftId,
    state,
    resultVideos,
    createdAt: storage.jobs[existingIndex]?.createdAt ?? now,
    updatedAt: now,
  }

  if (existingIndex === -1) {
    storage.jobs.push(job)
  } else {
    storage.jobs[existingIndex] = job
  }

  saveStorage(storage)
  notify(job)
  return job
}

export function updateBrowserTranscodeJob(
  draftId: string,
  updater: (job: BrowserTranscodeJob) => BrowserTranscodeJob
): BrowserTranscodeJob | undefined {
  const existing = getBrowserTranscodeJob(draftId)
  if (!existing) return undefined

  const updated = updater(existing)
  return upsertBrowserTranscodeJob(draftId, updated.state, updated.resultVideos)
}

export function removeBrowserTranscodeJob(draftId: string): void {
  const storage = getStorage()
  const filtered = storage.jobs.filter(job => job.draftId !== draftId)
  if (filtered.length === storage.jobs.length) return

  storage.jobs = filtered
  saveStorage(storage)
}

export function subscribeToBrowserTranscodeJobs(listener: BrowserTranscodeJobListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
