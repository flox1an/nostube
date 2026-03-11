/**
 * Trust score hooks with batching and caching.
 *
 * - useTrustScoreProvider() — mount once near app root to wire the signer into the batch system
 * - useTrustScore(pubkey) — returns { score, isLoading } for a single pubkey
 * - useTrustScores(pubkeys) — returns Map<string, number | null> for multiple pubkeys
 *
 * Follows the caching pattern from useEventStats (in-memory Map + localStorage)
 * and the batching pattern from useBatchedProfiles (collect over a delay, batch request).
 */
import { useEffect, useMemo, useState } from 'react'
import { bytesToHex } from 'nostr-tools/utils'
import { generateSecretKey } from 'nostr-tools'
import { PrivateKeySigner as ApplesaucePrivateKeySigner } from 'applesauce-signers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  connectContextVM,
  disconnectContextVM,
  calculateTrustScores,
  type TrustScoreResult,
} from '@/nostr/contextvm'

// ---------------------------------------------------------------------------
// Cache layer (in-memory Map backed by localStorage)
// ---------------------------------------------------------------------------

const CACHE_KEY = 'trust-scores-cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

interface CacheEntry {
  score: number
  timestamp: number
}

const scoreCache = new Map<string, CacheEntry>()

function loadCache() {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const data = JSON.parse(stored) as Record<string, CacheEntry>
      const now = Date.now()
      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.timestamp < CACHE_TTL) {
          scoreCache.set(key, entry)
        }
      }
    }
  } catch {
    // Ignore cache errors
  }
}

function saveCache() {
  try {
    const data: Record<string, CacheEntry> = {}
    scoreCache.forEach((entry, key) => {
      data[key] = entry
    })
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // Ignore cache errors
  }
}

function getCached(pubkey: string): number | null {
  const entry = scoreCache.get(pubkey)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.score
  }
  return null
}

function setCached(pubkey: string, score: number) {
  scoreCache.set(pubkey, { score, timestamp: Date.now() })
  saveCache()
}

// Load cache on module init
loadCache()

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

const BATCH_DELAY = 200 // ms
let batchTimeout: ReturnType<typeof setTimeout> | null = null
const pendingPubkeys = new Set<string>()
let currentPrivateKeyHex: string | null = null

function requestTrustScore(pubkey: string) {
  if (!pubkey || pubkey.trim() === '') return
  // Skip if already cached and fresh
  if (getCached(pubkey) !== null) return
  pendingPubkeys.add(pubkey)
  scheduleBatch()
}

function scheduleBatch() {
  if (batchTimeout) clearTimeout(batchTimeout)
  batchTimeout = setTimeout(() => {
    processBatch()
    batchTimeout = null
  }, BATCH_DELAY)
}

async function processBatch() {
  if (pendingPubkeys.size === 0 || !currentPrivateKeyHex) return

  const pubkeys = Array.from(pendingPubkeys)
  pendingPubkeys.clear()

  try {
    const client = await connectContextVM(currentPrivateKeyHex)
    const results: TrustScoreResult[] = await calculateTrustScores(client, pubkeys)

    for (const result of results) {
      if (result && typeof result.score === 'number') {
        setCached(result.targetPubkey, result.score)
      }
    }

    notifyListeners()
  } catch (error) {
    console.error('[TrustScore] Batch processing error:', error)
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

  useEffect(() => {
    if (!user) {
      currentPrivateKeyHex = null
      return
    }

    // If user has an applesauce PrivateKeySigner (nsec login), extract the raw key
    if (user.signer instanceof ApplesaucePrivateKeySigner) {
      currentPrivateKeyHex = bytesToHex(user.signer.key)
    } else {
      // NIP-07 / bunker: use an ephemeral key for ContextVM communication
      currentPrivateKeyHex = getOrCreateEphemeralKey()
    }

    return () => {
      currentPrivateKeyHex = null
      disconnectContextVM()
    }
  }, [user])
}

/**
 * Get trust score for a single pubkey.
 * Returns cached value immediately, fetches in background if needed.
 */
export function useTrustScore(pubkey: string | undefined): {
  score: number | null
  isLoading: boolean
} {
  const [, forceUpdate] = useState(0)

  // Subscribe to score updates
  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  // Request score when pubkey changes
  useEffect(() => {
    if (pubkey) requestTrustScore(pubkey)
  }, [pubkey])

  const cached = pubkey ? getCached(pubkey) : null
  const isLoading = pubkey ? cached === null && pendingPubkeys.has(pubkey) : false

  return { score: cached, isLoading }
}

/**
 * Get trust scores for multiple pubkeys.
 * Returns a Map of pubkey -> score (null if not yet loaded).
 */
export function useTrustScores(pubkeys: string[]): Map<string, number | null> {
  const [, forceUpdate] = useState(0)

  // Subscribe to score updates
  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1))
  }, [])

  // Request scores when pubkeys change
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
      map.set(pk, getCached(pk))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey, forceUpdate])
}
