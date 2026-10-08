/**
 * Replaced Events Tracker
 *
 * Tracks old event IDs when addressable (replaceable) events are edited.
 * This allows querying for kind 1 comments that reference previous versions
 * of a video event, since kind 1 events only use `e` tags (not `a` tags)
 * and break when the video is edited and gets a new event ID.
 *
 * Storage format: { [address]: string[] } where address = "kind:pubkey:d-tag"
 */

const STORAGE_KEY = 'nostube:replaced-event-ids'

/** Get all known old event IDs for an address */
export function getReplacedEventIds(address: string): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return data[address] || []
  } catch {
    return []
  }
}

/** Record an old event ID before it gets replaced by an edit */
export function trackReplacedEventId(address: string, oldEventId: string): void {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const ids: string[] = data[address] || []
    if (!ids.includes(oldEventId)) {
      ids.push(oldEventId)
      data[address] = ids
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
  } catch {
    // Ignore storage errors
  }
}
