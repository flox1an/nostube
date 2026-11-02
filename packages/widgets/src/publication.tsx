import { useSyncExternalStore } from 'react'

export type PublicationTarget = {
  url: string
  status: 'pending' | 'confirmed' | 'failed' | 'timeout'
  message?: string
  nextAttemptAt?: number
}
export type PublicationActivity = {
  id: string
  hidden?: boolean
  label: string
  phase:
    'signing' | 'preparing' | 'uploading' | 'processing' | 'mirroring' | 'publishing' | 'background'
  status: 'pending' | 'success' | 'partial' | 'failed'
  startedAt: number
  updatedAt: number
  targets?: PublicationTarget[]
  completed?: number
  total?: number
  unit?: 'bytes' | 'files'
  error?: string
  lifetime?: 'browser' | 'server'
  retry?: () => Promise<unknown>
  retryLabel?: string
  cancel?: () => void
  href?: string
}
type ActivityPatch = Partial<Omit<PublicationActivity, 'id' | 'startedAt'>>
let activities: PublicationActivity[] = []
let nextId = 0
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

export function beginPublication(
  activity: Omit<PublicationActivity, 'id' | 'startedAt' | 'updatedAt' | 'status'>
): string {
  const id = `publication-${++nextId}`
  const now = Date.now()
  activities = [
    ...activities,
    { ...activity, id, startedAt: now, updatedAt: now, status: 'pending' },
  ]
  emit()
  return id
}
export function updatePublication(id: string, patch: ActivityPatch) {
  const current = activities.find(activity => activity.id === id)
  if (!current) return
  if (current.hidden && patch.status === 'success') {
    activities = activities.filter(activity => activity.id !== id)
    emit()
    return
  }
  const keys = Object.keys(patch) as (keyof ActivityPatch)[]
  const changed = keys.some(key =>
    key === 'targets'
      ? JSON.stringify(patch.targets) !== JSON.stringify(current.targets)
      : patch[key] !== current[key]
  )
  if (!changed) return
  const progressed = keys.some(key => {
    if (key === 'targets') {
      const states = (targets?: PublicationTarget[]) =>
        targets?.map(target => [target.url, target.status])
      return JSON.stringify(states(patch.targets)) !== JSON.stringify(states(current.targets))
    }
    return ['phase', 'status', 'completed', 'total'].includes(key) && patch[key] !== current[key]
  })
  activities = activities.map(activity =>
    activity.id === id
      ? {
          ...activity,
          ...patch,
          updatedAt: progressed ? Date.now() : activity.updatedAt,
          hidden:
            patch.status === 'partial' ||
            patch.status === 'failed' ||
            patch.targets?.some(target => target.status === 'failed' || target.status === 'timeout')
              ? false
              : activity.hidden,
        }
      : activity
  )
  emit()
}
export function dismissPublication(id: string) {
  activities = activities.flatMap(activity =>
    activity.id !== id
      ? [activity]
      : activity.status === 'pending'
        ? [{ ...activity, hidden: true }]
        : []
  )
  emit()
}
export function usePublications() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => activities
  )
}
