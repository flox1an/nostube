import { useSyncExternalStore } from 'react'

const KEY = 'feed.groupPerDay'
const listeners = new Set<() => void>()

const getSnapshot = () => localStorage.getItem(KEY) !== 'false'

function subscribe(callback: () => void) {
  listeners.add(callback)
  window.addEventListener('storage', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', callback)
  }
}

/**
 * Whether feeds show at most one long-form video and one short per creator per day (default on).
 * Shared across components in this tab, so the toggle on the home page also drives the
 * subscriptions shelf and page.
 */
export function useGroupPerDay() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot)
  const setEnabled = (value: boolean) => {
    localStorage.setItem(KEY, String(value))
    listeners.forEach(callback => callback())
  }
  return [enabled, setEnabled] as const
}
