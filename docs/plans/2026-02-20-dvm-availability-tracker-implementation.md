# DVM Availability Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the on-demand DVM availability check with a background tracker that monitors recent DVM announcements and exposes a hashmap of active DVMs.

**Architecture:** Module-level singleton store using `useSyncExternalStore` for React integration. A background relay subscription queries for kind 31990 handler announcements from the last 10 minutes. Results populate a `Map<pubkey, TrackedDvm>`. Stale entries are pruned every 60 seconds. The hook replaces `useDvmAvailability` in `DvmTranscodeAlert`.

**Tech Stack:** React 18 (`useSyncExternalStore`), nostr-tools, applesauce-relay (`relayPool`), TypeScript

---

### Task 1: Create `TrackedDvm` type in `dvm-utils.ts`

**Files:**

- Modify: `src/lib/dvm-utils.ts:117-125`

**Step 1: Add `TrackedDvm` interface**

Add the new interface after the existing `DvmHandlerInfo` interface at line 125:

```ts
/**
 * Tracked DVM with activity timestamp for availability tracking
 */
export interface TrackedDvm {
  pubkey: string
  name?: string
  about?: string
  lastSeenAt: number // unix timestamp of most recent event from this DVM
}
```

**Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/lib/dvm-utils.ts
git commit -m "feat: add TrackedDvm type for DVM availability tracking"
```

---

### Task 2: Create `useDvmTracker` singleton hook

**Files:**

- Create: `src/hooks/useDvmTracker.ts`

**Step 1: Create the module-level singleton tracker**

Create `src/hooks/useDvmTracker.ts` with this content:

```ts
import { useSyncExternalStore, useEffect, useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import { type NostrEvent } from 'nostr-tools'
import type { TrackedDvm } from '@/lib/dvm-utils'

/** How far back to look for DVM announcements (seconds) */
const DVM_ACTIVITY_WINDOW_SECS = 10 * 60 // 10 minutes

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
let listeners = new Set<() => void>()
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
  return () => listeners.delete(listener)
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
  const relaysKey = relays.sort().join(',')
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
```

**Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/hooks/useDvmTracker.ts
git commit -m "feat: add useDvmTracker singleton hook for background DVM monitoring"
```

---

### Task 3: Wire `DvmTranscodeAlert` to use `useDvmTracker`

**Files:**

- Modify: `src/components/video-upload/DvmTranscodeAlert.tsx:10,51,83`

**Step 1: Replace import**

At line 10, change:

```ts
import { useDvmAvailability } from '@/hooks/useDvmAvailability'
```

to:

```ts
import { useDvmTracker } from '@/hooks/useDvmTracker'
```

**Step 2: Replace hook call**

At line 51, change:

```ts
const { isAvailable: isDvmAvailable, isLoading: isDvmLoading } = useDvmAvailability()
```

to:

```ts
const { isDvmAvailable, isLoading: isDvmLoading } = useDvmTracker()
```

**Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/components/video-upload/DvmTranscodeAlert.tsx
git commit -m "refactor: switch DvmTranscodeAlert to useDvmTracker"
```

---

### Task 4: Optimize `discoverDvm` in `useDvmTranscode.ts` to use tracked DVMs

**Files:**

- Modify: `src/hooks/useDvmTranscode.ts:1-19,166-248`

**Step 1: Import the tracker's getter**

Add import at the top of the file (after existing imports around line 19):

```ts
import type { TrackedDvm } from '@/lib/dvm-utils'
```

The `DvmHandlerInfo` type is already imported from `@/lib/dvm-utils`.

**Step 2: Add a `trackedDvms` parameter to the hook**

The `useDvmTranscode` hook currently builds its own relay list and discovers DVMs from scratch. Add an optional parameter so callers can pass in the tracked DVM map. Modify the hook's parameter type (find its function signature) to accept `trackedDvms?: Map<string, TrackedDvm>`.

In `discoverDvm` (lines 166-248), add an early return at the top that converts the first tracked DVM to a `DvmHandlerInfo` if available:

```ts
const discoverDvm = useCallback(async (): Promise<DvmHandlerInfo | null> => {
  // Fast path: use pre-tracked DVMs from background tracker
  if (trackedDvms && trackedDvms.size > 0) {
    // Pick the most recently seen DVM
    let best: TrackedDvm | undefined
    for (const dvm of trackedDvms.values()) {
      if (!best || dvm.lastSeenAt > best.lastSeenAt) {
        best = dvm
      }
    }
    if (best) {
      if (import.meta.env.DEV) {
        console.log('[DVM] Using pre-tracked DVM:', { pubkey: best.pubkey, name: best.name })
      }
      return { pubkey: best.pubkey, name: best.name, about: best.about, createdAt: best.lastSeenAt }
    }
  }

  // Fallback: discover from relay query (existing code)
  if (dvmRelays.length === 0) {
    throw new Error('No relays configured')
  }
  // ... rest of existing discoverDvm code ...
```

**Step 3: Pass tracked DVMs from `useDvmTranscodeManager`**

Check `src/hooks/useDvmTranscodeManager.ts` — if it wraps `useDvmTranscode`, thread the `trackedDvms` parameter through. If `useDvmTranscodeManager` uses `UploadManagerProvider` instead, pass through the provider.

The exact wiring depends on the call chain. The key change: wherever `discoverDvm()` is called, the tracked map should be accessible via the `useDvmTracker` hook's `dvmHandlers`.

**Step 4: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/hooks/useDvmTranscode.ts src/hooks/useDvmTranscodeManager.ts
git commit -m "feat: use tracked DVMs for instant DVM discovery in transcode flow"
```

---

### Task 5: Delete `useDvmAvailability.ts`

**Files:**

- Delete: `src/hooks/useDvmAvailability.ts`

**Step 1: Verify no remaining imports**

Run: `grep -r "useDvmAvailability" src/`
Expected: No results (all references were updated in Task 3)

**Step 2: Delete the file**

```bash
rm src/hooks/useDvmAvailability.ts
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add -u src/hooks/useDvmAvailability.ts
git commit -m "chore: remove deprecated useDvmAvailability hook"
```

---

### Task 6: Format, build, update changelog

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Format**

Run: `npm run format`

**Step 2: Build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Update CHANGELOG.md**

Under `## [Unreleased]` → `### Changed`, add:

```markdown
- DVM transcoding: replaced on-demand DVM availability check with background tracker that monitors recent NIP-89 handler announcements (kind 31990) from the last 10 minutes; DVMs are stored in a hashmap by pubkey with name/about metadata for future UI display; tracker uses module-level singleton pattern with `useSyncExternalStore` for zero-overhead React integration; stale entries pruned every 60 seconds; `discoverDvm()` now uses tracked DVMs for instant discovery (skips 5-second relay query); deleted `useDvmAvailability.ts` in favor of new `useDvmTracker.ts`
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: background DVM availability tracker with handler hashmap"
```
