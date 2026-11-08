import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { NostrEvent } from 'nostr-tools'
import { buildEventRelays } from '@nostube/core/video-event'

export interface VideoHistoryEntry {
  eventId: string
  timestamp: number // Unix timestamp in milliseconds
  event: NostrEvent // The full event for display purposes
  relays?: string[] // Relay hints survive JSON serialization; seen-relay symbols do not
}

const MAX_HISTORY_SIZE = 100

/**
 * Hook for tracking and managing video watch history in local storage
 * - Tracks videos with event and timestamp
 * - Limits history to MAX_HISTORY_SIZE entries (oldest removed first)
 * - Updates timestamp if same video is watched again (moves to front)
 */
export function useVideoHistory() {
  const [history, setHistory] = useLocalStorage<VideoHistoryEntry[]>('video-history', [])

  /**
   * Add a video to the history
   * - If video already exists, updates timestamp and moves to front
   * - Limits history size to MAX_HISTORY_SIZE
   */
  const addToHistory = useCallback(
    (event: NostrEvent, hintRelays: string[] = []) => {
      setHistory(currentHistory => {
        const existing = currentHistory.find(entry => entry.eventId === event.id)
        // Remove existing entry if it exists
        const filteredHistory = currentHistory.filter(entry => entry.eventId !== event.id)

        // Add new entry at the beginning (most recent first)
        const newEntry: VideoHistoryEntry = {
          eventId: event.id,
          timestamp: Date.now(),
          event: event,
          relays: buildEventRelays(event, [...hintRelays, ...(existing?.relays ?? [])]),
        }

        const updatedHistory = [newEntry, ...filteredHistory]

        // Limit to MAX_HISTORY_SIZE entries
        return updatedHistory.slice(0, MAX_HISTORY_SIZE)
      })
    },
    [setHistory]
  )

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([])
  }, [setHistory])

  /**
   * Remove a specific video from history
   */
  const removeFromHistory = useCallback(
    (eventId: string) => {
      setHistory(currentHistory => currentHistory.filter(entry => entry.eventId !== eventId))
    },
    [setHistory]
  )

  /**
   * Get the full history (most recent first)
   */
  const getHistory = useCallback(() => {
    return history
  }, [history])

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
    getHistory,
  }
}
