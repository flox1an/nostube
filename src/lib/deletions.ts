import type { IEventStore } from 'applesauce-core'
import type { NostrEvent } from 'nostr-tools'

export function isDeletedByEvent(deletionEvent: NostrEvent, event: NostrEvent): boolean {
  if (deletionEvent.kind !== 5) return false
  if (deletionEvent.pubkey !== event.pubkey) return false
  if (deletionEvent.created_at < event.created_at) return false

  const deletedIds = deletionEvent.tags.filter(t => t[0] === 'e').map(t => t[1])
  if (deletedIds.includes(event.id)) {
    return true
  }

  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(t => t[0] === 'd')?.[1] || ''
    const coordinate = `${event.kind}:${event.pubkey}:${dTag}`
    const deletedCoordinates = deletionEvent.tags.filter(t => t[0] === 'a').map(t => t[1])
    if (deletedCoordinates.includes(coordinate)) {
      return true
    }
  }

  return false
}

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
    if (isDeletedByEvent(deletionEvent, event)) return true
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
