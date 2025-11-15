import type { IEventStore } from 'applesauce-core'
import type { NostrEvent } from 'nostr-tools'

/**
 * Check if an event has been deleted by its author
 * @param eventStore The EventStore instance
 * @param event The event to check
 * @returns true if the event has been deleted
 */
export function isEventDeleted(eventStore: IEventStore, event: NostrEvent): boolean {
  // Get all deletion events (kind 5) by the same author
  const deletionEvents = eventStore.getByFilters({
    kinds: [5],
    authors: [event.pubkey],
  })

  // Check if any deletion event references this event
  for (const deletionEvent of deletionEvents) {
    // Check if this deletion is newer than the event
    if (deletionEvent.created_at < event.created_at) {
      continue
    }

    // Check for 'e' tags (event deletion by ID)
    const deletedIds = deletionEvent.tags.filter(t => t[0] === 'e').map(t => t[1])
    if (deletedIds.includes(event.id)) {
      return true
    }

    // Check for 'a' tags (addressable/replaceable event deletion)
    // Format: kind:pubkey:d-tag
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find(t => t[0] === 'd')?.[1] || ''
      const coordinate = `${event.kind}:${event.pubkey}:${dTag}`
      const deletedCoordinates = deletionEvent.tags.filter(t => t[0] === 'a').map(t => t[1])
      if (deletedCoordinates.includes(coordinate)) {
        return true
      }
    }
  }

  return false
}

/**
 * Filter out deleted events from an array of events
 * @param eventStore The EventStore instance
 * @param events Array of events to filter
 * @returns Array of events that haven't been deleted
 */
export function filterDeletedEvents<T extends NostrEvent>(
  eventStore: IEventStore,
  events: T[]
): T[] {
  return events.filter(event => !isEventDeleted(eventStore, event))
}
