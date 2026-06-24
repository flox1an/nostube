import { create } from 'zustand'

/**
 * Runtime telemetry for the image proxy (imgproxy-compatible).
 * Not persisted — purely reflects the current session's health probe + circuit-breaker state.
 *
 * Lifecycle:
 * - status starts as 'unknown'. Callers treat 'unknown' as 'up' (optimistic) and try the proxy.
 * - A bootstrap probe (useProxyHealthMonitor) flips status to 'up' or 'down' once it completes.
 * - Image load errors call recordFailure(); after FAILURE_THRESHOLD consecutive failures within
 *   FAILURE_WINDOW_MS, status flips to 'down' (circuit breaker).
 * - A successful image load calls recordSuccess() and resets the counter.
 * - The monitor re-probes periodically (PROBE_INTERVAL_MS) and on window focus to flip back.
 */

/** Consecutive failures within FAILURE_WINDOW_MS that flip the breaker. */
export const FAILURE_THRESHOLD = 5
/** Sliding window for counting failures. Older failures don't accumulate. */
export const FAILURE_WINDOW_MS = 10_000

export type ProxyHealthStatus = 'unknown' | 'up' | 'down'

interface ProxyHealthState {
  status: ProxyHealthStatus
  /** Timestamp of the most recent failure that incremented the counter. */
  lastFailureAt: number
  /** Count of failures within the current sliding window. */
  recentFailures: number
  /** Timestamp of the last completed probe (success or failure). 0 = never. */
  lastProbedAt: number
  /** Last raw URL that failed via the proxy — useful for debugging in DevTools. */
  lastFailedUrl: string | null
}

interface ProxyHealthActions {
  /** Probe succeeded — reset counters and mark proxy up. */
  markUp: () => void
  /** Probe failed — mark proxy down. Failure counters preserved. */
  markDown: () => void
  /** An <img> via the proxy failed to load. Trip the breaker if threshold crossed. */
  recordFailure: (rawUrl: string) => void
  /** An <img> via the proxy loaded successfully. Reset the failure window. */
  recordSuccess: () => void
  /** Record that a probe finished (success or failure). Updates lastProbedAt. */
  markProbed: () => void
  /** Test-only: restore defaults. */
  reset: () => void
}

type ProxyHealthStore = ProxyHealthState & ProxyHealthActions

const initialState: ProxyHealthState = {
  status: 'unknown',
  lastFailureAt: 0,
  recentFailures: 0,
  lastProbedAt: 0,
  lastFailedUrl: null,
}

export const useProxyHealthStore = create<ProxyHealthStore>(set => ({
  ...initialState,

  markUp: () =>
    set(state => {
      if (state.status === 'up' && state.recentFailures === 0) return state
      return {
        ...state,
        status: 'up',
        recentFailures: 0,
        lastFailureAt: 0,
        lastFailedUrl: null,
        lastProbedAt: Date.now(),
      }
    }),

  markDown: () =>
    set(state => {
      if (state.status === 'down') return { ...state, lastProbedAt: Date.now() }
      return { ...state, status: 'down', lastProbedAt: Date.now() }
    }),

  recordFailure: (rawUrl: string) =>
    set(state => {
      const now = Date.now()
      const inWindow = now - state.lastFailureAt <= FAILURE_WINDOW_MS
      const recentFailures = inWindow ? state.recentFailures + 1 : 1
      const tripped = recentFailures >= FAILURE_THRESHOLD
      return {
        ...state,
        recentFailures,
        lastFailureAt: now,
        lastFailedUrl: rawUrl,
        status: tripped ? 'down' : state.status,
      }
    }),

  recordSuccess: () =>
    set(state => {
      // A live success means the proxy is at least partially serving — clear the window
      // and (if we were guessing 'unknown' or had tripped) flip back to 'up'.
      if (state.recentFailures === 0 && state.status === 'up') return state
      return {
        ...state,
        recentFailures: 0,
        lastFailureAt: 0,
        status: 'up',
      }
    }),

  markProbed: () => set(state => ({ ...state, lastProbedAt: Date.now() })),

  reset: () => set(() => ({ ...initialState })),
}))

/** Non-reactive read of the current status — safe to call from non-React code (helpers). */
export const getProxyStatus = (): ProxyHealthStatus => useProxyHealthStore.getState().status

/** True when the proxy is known to be down (i.e. we should bypass it). */
export const isProxyDown = (): boolean => useProxyHealthStore.getState().status === 'down'
