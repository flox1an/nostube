# DVM Availability Tracker Design

## Problem

The current `useDvmAvailability` hook queries for NIP-89 kind 31990 handler announcements every time the DVM transcode UI mounts. It accepts any announcement regardless of age, so a DVM that announced itself months ago but is now offline still shows as "available". This leads to failed transcode attempts.

## Solution

Replace the on-demand per-component check with a module-level singleton that runs a background relay subscription on app startup, tracking which DVMs have recently announced themselves (within the last 10 minutes). Store discovered DVMs in a `Map<pubkey, TrackedDvm>` so downstream components can display DVM info (name, about).

## Signal

Query kind 31990 (NIP-89 handler announcements) with:

- `#k: ['5207']` (supports video transform requests)
- `#d: ['video-transform-hls']` (HLS video transform specialization)
- `since: now - 10 minutes`

Future: can add kind 7000/6207 signals for stronger "proof of life" if needed.

## Data Structure

```ts
interface TrackedDvm {
  pubkey: string
  name?: string
  about?: string
  lastSeenAt: number // timestamp of most recent event
}
```

Stored in a module-level `Map<string, TrackedDvm>`.

## Architecture

### New file: `src/hooks/useDvmTracker.ts`

Module-level singleton pattern:

- `dvmHandlers: Map<string, TrackedDvm>` — the hashmap
- `isDvmAvailable: boolean` — derived from `map.size > 0`
- `isLoading: boolean` — true until first EOSE or timeout
- Background subscription starts on first hook mount, stays open
- Pruning: every 60 seconds, remove entries whose `lastSeenAt` is older than 10 minutes
- Uses `useSyncExternalStore` for React integration (subscribe to map changes)

### Export

```ts
export function useDvmTracker(): {
  isDvmAvailable: boolean
  isLoading: boolean
  dvmHandlers: Map<string, TrackedDvm>
}
```

### Changes

- `DvmTranscodeAlert.tsx`: replace `useDvmAvailability()` with `useDvmTracker()`
- `useDvmTranscode.ts`: `discoverDvm()` can optionally use tracked map to skip 5s discovery when DVMs are already known
- Delete `src/hooks/useDvmAvailability.ts`

## Relay Selection

Same relay set as existing code:

- User's read + write relays
- `DEFAULT_RELAYS` (fallback)
- `relayOverride` (if set)

Since this is a module-level singleton without React context access, the relay list is passed on first initialization and can be updated via a setter function.

## Lifecycle

1. First component mounts `useDvmTracker()` → starts subscription
2. Events arrive → populate map, notify subscribers
3. EOSE or 5s timeout → `isLoading = false`
4. Every 60s → prune stale entries (> 10 min old)
5. Component unmounts → subscription stays (singleton)
6. App unmount → cleanup subscription
