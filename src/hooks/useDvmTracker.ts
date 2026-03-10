import { useSyncExternalStore, useEffect, useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import { type NostrEvent } from 'nostr-tools'
import type { TrackedDvm } from '@/lib/dvm-utils'

/** How far back to look for DVM announcements (seconds) */
const DVM_ACTIVITY_WINDOW_SECS = 30 * 60 // 30 minutes

/** How often to prune stale entries (ms) */
const PRUNE_INTERVAL_MS = 60_000 // 1 minute

/** Timeout for initial loading state (ms) */
const LOADING_TIMEOUT_MS = 5_000 // 5 seconds

// ── Module-level singleton state ──

let dvmHandlers = new Map<string, TrackedDvm>()
let isLoading = true
let subscription: { unsubscribe: () => void } | null = null
let pruneTimer: ReturnType<typeof setInterval> | null = null
let loadingTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
let currentRelaysKey = '' // Track relay list to detect changes

function getSnapshot(): {
  isDvmAvailable: boolean
  isLoading: boolean
  dvmHandlers: Map<string, TrackedDvm>
} {
  return {
    isDvmAvailable: dvmHandlers.size > 0,
    isLoading,
    dvmHandlers,
  }
}

// Cached snapshot for useSyncExternalStore (only changes on notify)
let cachedSnapshot = getSnapshot()

function notify() {
  cachedSnapshot = getSnapshot()
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getStoreSnapshot() {
  return cachedSnapshot
}

/** Parse DVM handler info from a kind 31990 event */
function parseDvmEvent(event: NostrEvent): TrackedDvm {
  let name: string | undefined
  let about: string | undefined

  try {
    const content = JSON.parse(event.content || '{}')
    name = content.name
    about = content.about
  } catch {
    // Content is not JSON, check tags
  }

  const nameTag = event.tags.find(t => t[0] === 'name')
  const aboutTag = event.tags.find(t => t[0] === 'about')
  if (nameTag?.[1]) name = nameTag[1]
  if (aboutTag?.[1]) about = aboutTag[1]

  return {
    pubkey: event.pubkey,
    name,
    about,
    lastSeenAt: event.created_at,
  }
}

/** Remove entries older than the activity window */
function pruneStale() {
  const cutoff = Math.floor(Date.now() / 1000) - DVM_ACTIVITY_WINDOW_SECS
  let changed = false
  for (const [pubkey, dvm] of dvmHandlers) {
    if (dvm.lastSeenAt < cutoff) {
      dvmHandlers.delete(pubkey)
      changed = true
    }
  }
  if (changed) {
    // Create a new Map reference so React detects the change
    dvmHandlers = new Map(dvmHandlers)
    notify()
  }
}

/** Start (or restart) the background subscription */
function startTracking(relays: string[]) {
  const relaysKey = [...relays].sort().join(',')
  if (relaysKey === currentRelaysKey && subscription) return // Already tracking same relays

  // Cleanup previous
  stopTracking()
  currentRelaysKey = relaysKey

  if (relays.length === 0) {
    isLoading = false
    notify()
    return
  }

  isLoading = true
  dvmHandlers = new Map()
  notify()

  if (import.meta.env.DEV) {
    console.log('[DVM Tracker] Starting background tracking on relays:', relays)
  }

  const since = Math.floor(Date.now() / 1000) - DVM_ACTIVITY_WINDOW_SECS

  subscription = relayPool
    .request(relays, [
      {
        kinds: [31990],
        '#k': ['5207'],
        '#d': ['video-transform-hls'],
        since,
      },
    ])
    .subscribe({
      next: event => {
        if (typeof event === 'string') {
          // EOSE - mark loading as done
          if (isLoading) {
            isLoading = false
            if (loadingTimer) {
              clearTimeout(loadingTimer)
              loadingTimer = null
            }
            if (import.meta.env.DEV) {
              console.log('[DVM Tracker] EOSE received, found', dvmHandlers.size, 'DVMs')
            }
            notify()
          }
          return
        }

        const nostrEvent = event as NostrEvent
        const tracked = parseDvmEvent(nostrEvent)

        // Only update if this event is newer than what we have
        const existing = dvmHandlers.get(tracked.pubkey)
        if (!existing || tracked.lastSeenAt > existing.lastSeenAt) {
          dvmHandlers = new Map(dvmHandlers)
          dvmHandlers.set(tracked.pubkey, tracked)
          if (import.meta.env.DEV) {
            console.log('[DVM Tracker] Found DVM:', {
              pubkey: tracked.pubkey,
              name: tracked.name,
              lastSeenAt: new Date(tracked.lastSeenAt * 1000).toISOString(),
            })
          }
          notify()
        }
      },
      error: err => {
        if (import.meta.env.DEV) {
          console.log('[DVM Tracker] Subscription error:', err)
        }
        if (isLoading) {
          isLoading = false
          if (loadingTimer) {
            clearTimeout(loadingTimer)
            loadingTimer = null
          }
          notify()
        }
      },
      complete: () => {
        if (isLoading) {
          isLoading = false
          if (loadingTimer) {
            clearTimeout(loadingTimer)
            loadingTimer = null
          }
          notify()
        }
      },
    })

  // Loading timeout fallback
  loadingTimer = setTimeout(() => {
    if (isLoading) {
      isLoading = false
      if (import.meta.env.DEV) {
        console.log('[DVM Tracker] Loading timeout, found', dvmHandlers.size, 'DVMs')
      }
      notify()
    }
    loadingTimer = null
  }, LOADING_TIMEOUT_MS)

  // Start pruning timer
  pruneTimer = setInterval(pruneStale, PRUNE_INTERVAL_MS)
}

function stopTracking() {
  if (subscription) {
    subscription.unsubscribe()
    subscription = null
  }
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
  if (loadingTimer) {
    clearTimeout(loadingTimer)
    loadingTimer = null
  }
  currentRelaysKey = ''
}

/**
 * Non-hook getter for tracked DVMs. Can be called from anywhere (not just React components).
 * Returns the current map of tracked DVMs from the module-level singleton.
 */
export function getTrackedDvms(): Map<string, TrackedDvm> {
  return dvmHandlers
}

/**
 * Hook to track available DVM transcoding services in the background.
 *
 * Uses a module-level singleton subscription that persists across component
 * mounts/unmounts. Queries for NIP-89 kind 31990 handler announcements from
 * the last 10 minutes and exposes a Map of active DVMs.
 */
export function useDvmTracker(): {
  isDvmAvailable: boolean
  isLoading: boolean
  dvmHandlers: Map<string, TrackedDvm>
} {
  const { config, relayOverride } = useAppContext()

  const dvmRelays = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const combined = new Set([...readRelays, ...writeRelays, ...DEFAULT_RELAYS])
    if (relayOverride) combined.add(relayOverride)
    return Array.from(combined)
  }, [config.relays, relayOverride])

  // Start/restart tracking when relays change
  useEffect(() => {
    startTracking(dvmRelays)
  }, [dvmRelays])

  const snapshot = useSyncExternalStore(subscribe, getStoreSnapshot, getStoreSnapshot)
  return snapshot
}
