/**
 * Persistent storage for the installed app (#140).
 *
 * Only requested in standalone mode: in a normal tab Firefox would prompt the user,
 * while WebKit grants it to home-screen apps by heuristic. Without it, the browser
 * may evict play positions, the view-event outbox and drafts.
 */

const REQUESTED_KEY = 'nostube_persist_requested'

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Resolves to whether storage is persistent, or `null` when the API is missing. */
export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null
  } catch {
    return null
  }
}

/** Once per session, standalone only; missing API or errors are silent. */
export async function requestPersistentStorage(): Promise<void> {
  if (!isStandalone() || !navigator.storage?.persist) return
  if (sessionStorage.getItem(REQUESTED_KEY)) return
  sessionStorage.setItem(REQUESTED_KEY, '1')
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // unsupported or denied: storage stays best-effort
  }
}
