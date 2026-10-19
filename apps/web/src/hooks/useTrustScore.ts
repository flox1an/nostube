/**
 * Trust score hooks with batching and IndexedDB caching.
 *
 * Flow:
 * 1. Components call useTrustScore(pubkey) or useTrustScores(pubkeys[])
 * 2. Pubkeys are checked against in-memory cache (instant) then IndexedDB (async)
 * 3. Uncached pubkeys are collected into a batch over BATCH_DELAY ms
 * 4. Batch is sent to ContextVM relatr service (groups of MAX_BATCH_SIZE)
 * 5. Results are stored in IndexedDB (24h TTL) and in-memory cache
 * 6. Listeners are notified to re-render components
 *
 * Hooks:
 * - useTrustScoreProvider() — mount once near app root
 * - useTrustScore(pubkey) — returns { score, isLoading }
 * - useTrustScoreDetail(pubkey) — returns { result, isLoading } (full breakdown)
 * - useTrustScores(pubkeys) — returns Map<string, number | null>
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { bytesToHex } from 'nostr-tools/utils'
import { generateSecretKey } from 'nostr-tools'
import { PrivateKeySigner as ApplesaucePrivateKeySigner } from 'applesauce-signers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  connectContextVM,
  disconnectContextVM,
  calculateTrustScores,
  getGlobalScore,
  type TrustScoreResult,
} from '@/nostr/contextvm'
import {
  getCachedResults,
  setCachedResults,
  clearAllCached,
  pruneExpired,
} from '@/lib/trust-score-db'
import { getInstanceConfig } from '@nostube/core/instance-config'

// ---------------------------------------------------------------------------
// In-memory cache (fast synchronous reads, backed by IndexedDB)
// ---------------------------------------------------------------------------

const memCache = new Map<string, TrustScoreResult>()

function getMemCached(pubkey: string): TrustScoreResult | null {
  return memCache.get(pubkey) ?? null
}

function setMemCached(results: TrustScoreResult[]) {
  for (const r of results) {
    memCache.set(r.targetPubkey, r)
  }
}

// ---------------------------------------------------------------------------
// Listener / subscribe pattern for reactive updates
// ---------------------------------------------------------------------------

type Listener = () => void
const listeners = new Set<Listener>()

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners() {
  listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// Batching system
// ---------------------------------------------------------------------------

const BATCH_DELAY = 300 // ms — collect pubkeys over this window
const MAX_BATCH_SIZE = 20 // max pubkeys per relatr request (NIP-44 plaintext limit is 65535 bytes)
const REQUEST_DELAY = 10000 // ms — send at most one trust score request every 10 seconds
const MAX_FETCH_ATTEMPTS = 3
let batchTimeout: ReturnType<typeof setTimeout> | null = null
const pendingPubkeys = new Set<string>()
const refreshPubkeys = new Set<string>()
const inFlightPubkeys = new Set<string>()
// Pubkeys that have been checked against IDB and confirmed missing/stale
const confirmedMissing = new Set<string>()
const fetchAttempts = new Map<string, number>()
let currentPrivateKeyHex: string | null = null
let isProcessingBatches = false

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function retryPubkeys(pubkeys: string[]) {
  const retryable: string[] = []
  let exhausted = false

  for (const pubkey of pubkeys) {
    const attempts = (fetchAttempts.get(pubkey) ?? 0) + 1
    fetchAttempts.set(pubkey, attempts)

    if (attempts < MAX_FETCH_ATTEMPTS) {
      retryable.push(pubkey)
    } else {
      confirmedMissing.add(pubkey)
      exhausted = true
    }
  }

  if (exhausted) notifyListeners()
  if (retryable.length === 0) return

  setTimeout(() => {
    for (const pubkey of retryable) pendingPubkeys.add(pubkey)
    void processBatches()
  }, REQUEST_DELAY)
}

/**
 * Request trust score for a pubkey.
 * Keeps cached scores visible; explicit refreshes bypass the cache freshness checks.
 */
function requestTrustScore(pubkey: string, refresh = false) {
  if (!pubkey || pubkey.trim() === '') return
  // Instance build: no trust provider (ContextVM is a hosted service); never ask, no score.
  if (getInstanceConfig()) {
    confirmedMissing.add(pubkey)
    return
  }
  if (inFlightPubkeys.has(pubkey)) return
  if (refresh) {
    refreshPubkeys.add(pubkey)
    fetchAttempts.delete(pubkey)
    confirmedMissing.delete(pubkey)
  } else if (getMemCached(pubkey)) return
  if (pendingPubkeys.has(pubkey)) return

  pendingPubkeys.add(pubkey)
  scheduleBatch()
}

function scheduleBatch() {
  if (batchTimeout) clearTimeout(batchTimeout)
  batchTimeout = setTimeout(() => {
    batchTimeout = null
    void checkCacheAndFetch()
  }, BATCH_DELAY)
}

/**
 * Step 1: Check IndexedDB for cached results (stale-while-revalidate).
 * Step 2: Serve stale results immediately, refetch expired ones in background.
 * Step 3: Fetch missing pubkeys from relatr.
 */
async function checkCacheAndFetch() {
  if (pendingPubkeys.size === 0) return

  const pubkeys = Array.from(pendingPubkeys)
  pendingPubkeys.clear()

  // Check IndexedDB for cached results
  try {
    const { results: cached, stale } = await getCachedResults(pubkeys)
    const missing: string[] = []

    for (const [pk, result] of cached) {
      if (result) {
        if (!getMemCached(pk)) memCache.set(pk, result)
      } else {
        missing.push(pk)
      }
    }

    // Notify immediately for any cache hits (fresh or stale)
    if (cached.size > missing.length) {
      notifyListeners()
    }

    // Explicit visits revalidate even fresh entries; all other callers retain the cache TTL.
    const toFetch = pubkeys.filter(
      pk =>
        !inFlightPubkeys.has(pk) && (refreshPubkeys.delete(pk) || !cached.get(pk) || stale.has(pk))
    )
    if (toFetch.length > 0) {
      for (const pk of toFetch) pendingPubkeys.add(pk)
      void processBatches()
    }
  } catch {
    // IDB failed — treat all as uncached
    for (const pk of pubkeys) {
      pendingPubkeys.add(pk)
    }
    void processBatches()
  }
}

/**
 * Fetch uncached pubkeys from relatr in groups of MAX_BATCH_SIZE.
 */
async function processBatches() {
  if (pendingPubkeys.size === 0 || !currentPrivateKeyHex) {
    return
  }
  if (isProcessingBatches) {
    return
  }

  isProcessingBatches = true

  try {
    while (pendingPubkeys.size > 0 && currentPrivateKeyHex) {
      const allPubkeys = Array.from(pendingPubkeys)
      pendingPubkeys.clear()
      for (const pubkey of allPubkeys) inFlightPubkeys.add(pubkey)

      if (import.meta.env.DEV) {
        console.log('[TrustScore] Fetching', allPubkeys.length, 'pubkeys from relatr')
      }

      // Split into chunks of MAX_BATCH_SIZE
      const chunks: string[][] = []
      for (let i = 0; i < allPubkeys.length; i += MAX_BATCH_SIZE) {
        chunks.push(allPubkeys.slice(i, i + MAX_BATCH_SIZE))
      }

      const client = await connectContextVM(currentPrivateKeyHex)

      for (const [index, chunk] of chunks.entries()) {
        if (index > 0) await wait(REQUEST_DELAY)

        try {
          const results: TrustScoreResult[] = await calculateTrustScores(client, chunk)

          if (import.meta.env.DEV) {
            console.log(
              '[TrustScore] Got',
              results.length,
              'results for',
              chunk.length,
              'requested'
            )
          }

          const validResults = results.filter(
            r => r && typeof r.score === 'number' && typeof r.targetPubkey === 'string'
          )

          // Update in-memory cache
          setMemCached(validResults)

          // Remove from confirmedMissing
          for (const r of validResults) {
            confirmedMissing.delete(r.targetPubkey)
            fetchAttempts.delete(r.targetPubkey)
            refreshPubkeys.delete(r.targetPubkey)
          }

          // Persist to IndexedDB
          await setCachedResults(validResults)

          const returnedPubkeys = new Set(validResults.map(r => r.targetPubkey))
          const missingFromResponse = chunk.filter(pubkey => !returnedPubkeys.has(pubkey))
          retryPubkeys(missingFromResponse)

          // Notify after each chunk so UI updates progressively
          notifyListeners()
        } catch (error) {
          console.error('[TrustScore] Chunk fetch error:', error)
          retryPubkeys(chunk)
        } finally {
          for (const pubkey of chunk) inFlightPubkeys.delete(pubkey)
        }
      }
    }
  } catch (error) {
    console.error('[TrustScore] Connection error:', error)
  } finally {
    inFlightPubkeys.clear()
    isProcessingBatches = false
  }
}

// ---------------------------------------------------------------------------
// Ephemeral key management (for NIP-07 / bunker users without raw nsec)
// ---------------------------------------------------------------------------

const EPHEMERAL_KEY_STORAGE = 'trust-score-ephemeral-key'

function getOrCreateEphemeralKey(): string {
  const existing = sessionStorage.getItem(EPHEMERAL_KEY_STORAGE)
  if (existing) return existing

  const key = generateSecretKey()
  const hex = bytesToHex(key)
  sessionStorage.setItem(EPHEMERAL_KEY_STORAGE, hex)
  return hex
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Mount once near the app root. Wires the current user's signer key
 * (or an ephemeral key) into the trust score batch system.
 */
export function useTrustScoreProvider() {
  const { user } = useCurrentUser()
  // Depend on pubkey string (stable) instead of user object (new ref every render)
  const userPubkey = user?.pubkey
  const prevPubkeyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prevPubkey = prevPubkeyRef.current
    prevPubkeyRef.current = userPubkey

    // Only clear caches when switching between different logged-in accounts.
    // Logout (userPubkey becomes undefined) keeps cached scores so the
    // ephemeral key can continue serving requests.
    if (prevPubkey && userPubkey && prevPubkey !== userPubkey) {
      memCache.clear()
      pendingPubkeys.clear()
      refreshPubkeys.clear()
      inFlightPubkeys.clear()
      confirmedMissing.clear()
      fetchAttempts.clear()
      void clearAllCached()
      notifyListeners()
      if (import.meta.env.DEV) console.log('[TrustScore] Account switch, cleared caches')
    }

    if (!user) {
      // Use ephemeral key for non-personalized trust scores when logged out
      currentPrivateKeyHex = getOrCreateEphemeralKey()
      if (import.meta.env.DEV)
        console.log('[TrustScore] No user, using ephemeral key for ContextVM')
    } else if (user.signer instanceof ApplesaucePrivateKeySigner) {
      currentPrivateKeyHex = bytesToHex(user.signer.key)
      if (import.meta.env.DEV) console.log('[TrustScore] Using user private key for ContextVM')
    } else {
      currentPrivateKeyHex = getOrCreateEphemeralKey()
      if (import.meta.env.DEV) {
        console.log(
          '[TrustScore] Using ephemeral key for ContextVM (signer type:',
          user.signer?.constructor?.name,
          ')'
        )
      }
    }

    // Reconnect with new identity
    disconnectContextVM()

    // Flush any pubkeys that were requested before the key was available
    if (pendingPubkeys.size > 0) {
      if (import.meta.env.DEV) {
        console.log(
          '[TrustScore] Flushing',
          pendingPubkeys.size,
          'pending pubkeys after key became available'
        )
      }
      void processBatches()
    }

    // Prune very old entries
    void pruneExpired()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPubkey])
}

/**
 * Get trust score for a single pubkey.
 * Returns cached value immediately, fetches in background if needed.
 */
export function useTrustScore(pubkey: string | undefined): {
  score: number | null
  globalScore: number | null
  isLoading: boolean
} {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  useEffect(() => {
    if (pubkey) requestTrustScore(pubkey)
  }, [pubkey])

  const cached = pubkey ? getMemCached(pubkey) : null
  // Loading if we have a pubkey but no cached result and it hasn't been confirmed missing
  const isLoading = pubkey ? !cached && !confirmedMissing.has(pubkey) : false

  return {
    score: cached?.score ?? null,
    globalScore: cached ? getGlobalScore(cached) : null,
    isLoading,
  }
}

/**
 * Get the full trust score result for a pubkey (includes component breakdown).
 * Revalidates on activation, keeping the in-memory or IndexedDB result as a fallback.
 */
export function useTrustScoreDetail(pubkey: string | undefined): {
  result: TrustScoreResult | null
  isLoading: boolean
} {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  useEffect(() => {
    if (pubkey) requestTrustScore(pubkey, true)
  }, [pubkey])

  const result = pubkey ? getMemCached(pubkey) : null
  const isLoading = pubkey
    ? !result && !!currentPrivateKeyHex && !confirmedMissing.has(pubkey)
    : false

  return { result, isLoading }
}

/**
 * Get trust scores for multiple pubkeys.
 * Returns a Map of pubkey -> score (null if not yet loaded).
 */
export function useTrustScores(pubkeys: string[]): Map<string, number | null> {
  const [version, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const pubkeyKey = pubkeys.join(',')
  useEffect(() => {
    for (const pk of pubkeys) {
      requestTrustScore(pk)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey])

  return useMemo(() => {
    const map = new Map<string, number | null>()
    for (const pk of pubkeys) {
      const cached = getMemCached(pk)
      map.set(pk, cached?.score ?? null)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey, version])
}

/** True while any of these pubkeys still has neither a score nor a final "no score" verdict. */
export function hasPendingTrustScores(pubkeys: string[]): boolean {
  return pubkeys.some(pk => !memCache.has(pk) && !confirmedMissing.has(pk))
}

/**
 * Get global NosTube scores for multiple pubkeys.
 * Like useTrustScores but returns the global (non-personalized) score.
 */
export function useGlobalScores(pubkeys: string[]): Map<string, number | null> {
  const [version, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const pubkeyKey = pubkeys.join(',')
  useEffect(() => {
    for (const pk of pubkeys) {
      requestTrustScore(pk)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey])

  return useMemo(() => {
    const map = new Map<string, number | null>()
    for (const pk of pubkeys) {
      const cached = getMemCached(pk)
      map.set(pk, cached ? getGlobalScore(cached) : null)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey, version])
}

/**
 * Get the global NosTube score for a pubkey.
 * This is the average of the 4 video validators (activity, community,
 * engagement, viewer) — a non-personalized platform score for feature gating.
 */
export function useGlobalScore(pubkey: string | undefined): {
  globalScore: number | null
  isLoading: boolean
} {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  useEffect(() => {
    if (pubkey) requestTrustScore(pubkey)
  }, [pubkey])

  const cached = pubkey ? getMemCached(pubkey) : null
  // Loading if we have a pubkey but no cached result and it hasn't been confirmed missing
  const isLoading = pubkey ? !cached && !confirmedMissing.has(pubkey) : false

  return {
    globalScore: cached ? getGlobalScore(cached) : null,
    isLoading,
  }
}

// Re-export for direct use
export { getGlobalScore } from '@/nostr/contextvm'
