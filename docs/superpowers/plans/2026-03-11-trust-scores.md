# Trust Score Integration via ContextVM

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display personalized trust scores from a ContextVM instance next to usernames in comments and on author profile pages, with 24-hour caching.

**Architecture:** A singleton ContextVM MCP client connects to the relatr instance over Nostr relays using the logged-in user's signer. A batched hook collects pubkey requests (100ms window), sends `calculate_trust_scores` for batch or `calculate_trust_score` for single queries, and caches results in localStorage with a 24h TTL. A `TrustBadge` component renders a colored score pill next to author names.

**Tech Stack:** `@contextvm/sdk`, `@modelcontextprotocol/sdk`, Applesauce signers, React hooks, localStorage caching, Tailwind + shadcn Badge component.

---

## Chunk 1: ContextVM Client & Trust Score Hook

### Task 1: Install ContextVM SDK dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install @contextvm/sdk @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify installation**

```bash
npm ls @contextvm/sdk @modelcontextprotocol/sdk
```

Expected: Both packages listed without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @contextvm/sdk and @modelcontextprotocol/sdk dependencies"
```

---

### Task 2: Create ContextVM client singleton

**Files:**

- Create: `src/nostr/contextvm.ts`

This module manages a singleton MCP client connected to the relatr ContextVM instance. It adapts the Applesauce signer (NIP-07/bunker/nsec) into a ContextVM-compatible signer interface.

- [ ] **Step 1: Create the client module**

```typescript
/**
 * ContextVM client singleton for trust score queries.
 *
 * Connects to the relatr ContextVM instance over Nostr relays
 * using the logged-in user's signer for personalized scores.
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import { NostrClientTransport, PrivateKeySigner, SimpleRelayPool } from '@contextvm/sdk'
import { nip19 } from 'nostr-tools'

// Relatr ContextVM instance
const CONTEXTVM_NPUB = 'npub16w48u4xvtlp7ywgfsjlud74tlgdfx9s33scdlafmgl3a40n9tthsu6ty8g'
const CONTEXTVM_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol']

// Decode npub to hex pubkey
const { data: CONTEXTVM_PUBKEY } = nip19.decode(CONTEXTVM_NPUB) as { data: string }

export interface TrustScoreResult {
  sourcePubkey: string
  targetPubkey: string
  score: number
  components: {
    distanceWeight: number
    socialDistance: number
    normalizedDistance: number
    validators: Record<
      string,
      {
        score: number
        description: string
      }
    >
  }
  computedAt: number
}

let mcpClient: Client | null = null
let clientTransport: NostrClientTransport | null = null
let currentSignerKey: string | null = null

/**
 * Connect to the ContextVM instance using a private key hex string.
 * For NIP-07 or bunker signers that don't expose a private key,
 * we generate an ephemeral keypair — scores will not be personalized.
 */
export async function connectContextVM(privateKeyHex: string): Promise<Client> {
  // Reuse existing connection if signer hasn't changed
  if (mcpClient && currentSignerKey === privateKeyHex) {
    return mcpClient
  }

  // Close previous connection
  await disconnectContextVM()

  const signer = new PrivateKeySigner(privateKeyHex)
  const relayPool = new SimpleRelayPool(CONTEXTVM_RELAYS)

  clientTransport = new NostrClientTransport({
    signer,
    relayHandler: relayPool,
    serverPubkey: CONTEXTVM_PUBKEY,
  })

  mcpClient = new Client({
    name: 'nostube',
    version: '0.0.1',
  })

  await mcpClient.connect(clientTransport)
  currentSignerKey = privateKeyHex
  console.log('[ContextVM] Connected to relatr instance')

  return mcpClient
}

export async function disconnectContextVM(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close()
    } catch {
      // Ignore close errors
    }
    mcpClient = null
    clientTransport = null
    currentSignerKey = null
  }
}

/**
 * Calculate trust score for a single pubkey.
 */
export async function calculateTrustScore(
  client: Client,
  targetPubkey: string
): Promise<TrustScoreResult | null> {
  try {
    const result = await client.callTool({
      name: 'calculate_trust_score',
      arguments: { targetPubkey },
    })
    return parseTrustScoreResult(result)
  } catch (err) {
    console.error('[ContextVM] Failed to calculate trust score:', err)
    return null
  }
}

/**
 * Calculate trust scores for multiple pubkeys in one call.
 */
export async function calculateTrustScores(
  client: Client,
  targetPubkeys: string[]
): Promise<Map<string, TrustScoreResult>> {
  const results = new Map<string, TrustScoreResult>()

  try {
    const result = await client.callTool({
      name: 'calculate_trust_scores',
      arguments: { targetPubkeys: JSON.stringify(targetPubkeys) },
    })
    const parsed = parseTrustScoresResult(result)
    for (const score of parsed) {
      results.set(score.targetPubkey, score)
    }
  } catch (err) {
    console.error('[ContextVM] Failed to calculate trust scores:', err)
  }

  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTrustScoreResult(result: any): TrustScoreResult | null {
  try {
    // MCP tool results come as content array with text entries
    const content = result?.content
    if (!content || !Array.isArray(content)) return null

    const textBlock = content.find((c: { type: string }) => c.type === 'text')
    if (!textBlock?.text) return null

    const data = JSON.parse(textBlock.text)
    return data?.trustScore ?? data ?? null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTrustScoresResult(result: any): TrustScoreResult[] {
  try {
    const content = result?.content
    if (!content || !Array.isArray(content)) return []

    const textBlock = content.find((c: { type: string }) => c.type === 'text')
    if (!textBlock?.text) return []

    const data = JSON.parse(textBlock.text)
    // Batch response may be an array or object with trustScores key
    if (Array.isArray(data)) return data
    if (data?.trustScores && Array.isArray(data.trustScores)) return data.trustScores
    return []
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | head -20`
Expected: No errors related to `contextvm.ts`. Note: there may be import errors if the SDK types differ — adjust the imports based on actual package exports.

- [ ] **Step 3: Commit**

```bash
git add src/nostr/contextvm.ts
git commit -m "feat: add ContextVM client singleton for trust score queries"
```

---

### Task 3: Create trust score cache and hook

**Files:**

- Create: `src/hooks/useTrustScore.ts`

This hook provides `useTrustScore(pubkey)` for single users and `useTrustScores(pubkeys)` for batch queries. It follows the `useEventStats` caching pattern (in-memory Map + localStorage with TTL) and the `useBatchedProfiles` batching pattern (100ms window).

- [ ] **Step 1: Create the hook**

```typescript
/**
 * Trust score hooks with batching and caching.
 *
 * - useTrustScore(pubkey): single user, returns cached immediately + fetches fresh
 * - useTrustScores(pubkeys): batch of users (e.g. comment authors)
 *
 * Follows useEventStats caching pattern (localStorage + in-memory Map, 24h TTL)
 * and useBatchedProfiles batching pattern (100ms collection window).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { connectContextVM, calculateTrustScores, type TrustScoreResult } from '@/nostr/contextvm'
import { useCurrentUser } from './useCurrentUser'
import { bytesToHex } from '@noble/hashes/utils'
import { SimpleSigner } from 'applesauce-signers'

// ============================================================================
// CACHE
// ============================================================================

const CACHE_KEY = 'trust-scores-cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

interface CachedTrustScore {
  score: number
  components: TrustScoreResult['components']
  computedAt: number
  cachedAt: number
}

const scoreCache = new Map<string, CachedTrustScore>()

function loadCache(): void {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (!stored) return
    const data = JSON.parse(stored) as Record<string, CachedTrustScore>
    const now = Date.now()
    for (const [key, entry] of Object.entries(data)) {
      if (now - entry.cachedAt < CACHE_TTL) {
        scoreCache.set(key, entry)
      }
    }
  } catch {
    // Ignore
  }
}

function saveCache(): void {
  try {
    const data: Record<string, CachedTrustScore> = {}
    scoreCache.forEach((entry, key) => {
      data[key] = entry
    })
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // Ignore
  }
}

function getCached(pubkey: string): CachedTrustScore | null {
  const entry = scoreCache.get(pubkey)
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL) {
    return entry
  }
  return null
}

function setCached(pubkey: string, result: TrustScoreResult): void {
  scoreCache.set(pubkey, {
    score: result.score,
    components: result.components,
    computedAt: result.computedAt,
    cachedAt: Date.now(),
  })
  saveCache()
}

// Load on module init
loadCache()

// ============================================================================
// BATCHING
// ============================================================================

const BATCH_DELAY = 200 // ms to collect pubkeys before sending
let batchTimeout: NodeJS.Timeout | null = null
const pendingPubkeys = new Set<string>()
const listeners = new Map<string, Set<() => void>>()

function notifyListeners(pubkey: string): void {
  const set = listeners.get(pubkey)
  if (set) {
    for (const cb of set) cb()
  }
}

function subscribe(pubkey: string, cb: () => void): () => void {
  let set = listeners.get(pubkey)
  if (!set) {
    set = new Set()
    listeners.set(pubkey, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) listeners.delete(pubkey)
  }
}

let getSignerKeyFn: (() => Promise<string | null>) | null = null

export function setSignerKeyProvider(fn: () => Promise<string | null>): void {
  getSignerKeyFn = fn
}

async function processBatch(): Promise<void> {
  if (pendingPubkeys.size === 0) return
  if (!getSignerKeyFn) return

  const pubkeys = Array.from(pendingPubkeys)
  pendingPubkeys.clear()

  // Filter out already-cached pubkeys
  const uncached = pubkeys.filter(pk => !getCached(pk))
  if (uncached.length === 0) return

  try {
    const signerKey = await getSignerKeyFn()
    if (!signerKey) return

    const client = await connectContextVM(signerKey)
    const results = await calculateTrustScores(client, uncached)

    for (const [pubkey, result] of results) {
      setCached(pubkey, result)
      notifyListeners(pubkey)
    }
  } catch (err) {
    console.error('[TrustScore] Batch fetch failed:', err)
  }
}

function scheduleBatch(): void {
  if (batchTimeout) clearTimeout(batchTimeout)
  batchTimeout = setTimeout(() => {
    processBatch()
    batchTimeout = null
  }, BATCH_DELAY)
}

function requestTrustScore(pubkey: string): void {
  if (!pubkey || pubkey.trim() === '') return
  if (getCached(pubkey)) return // Already cached
  pendingPubkeys.add(pubkey)
  scheduleBatch()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get a signer key from the current user's account.
 * For SimpleSigner (nsec login): extracts the private key directly.
 * For NIP-07/bunker: generates a stable ephemeral key per session.
 */
function useSignerKey(): string | null {
  const { user } = useCurrentUser()

  return useMemo(() => {
    if (!user?.signer) return null

    // SimpleSigner has the private key directly
    if (user.signer instanceof SimpleSigner) {
      try {
        return bytesToHex(user.signer.key)
      } catch {
        // Fall through to ephemeral
      }
    }

    // For NIP-07 and bunker signers, generate a stable ephemeral key
    // stored in sessionStorage so it persists across component remounts
    const storageKey = `contextvm-ephemeral-key-${user.pubkey}`
    let key = sessionStorage.getItem(storageKey)
    if (!key) {
      // Generate random 32-byte key
      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      key = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      sessionStorage.setItem(storageKey, key)
    }
    return key
  }, [user?.signer, user?.pubkey])
}

/**
 * Hook to initialize the signer key provider for the batch system.
 * Mount this once near the app root (e.g., in a provider).
 */
export function useTrustScoreProvider(): void {
  const signerKey = useSignerKey()
  const signerKeyRef = useRef(signerKey)
  signerKeyRef.current = signerKey

  useEffect(() => {
    setSignerKeyProvider(async () => signerKeyRef.current)
    return () => {
      setSignerKeyProvider(null)
    }
  }, [])
}

/**
 * Get trust score for a single pubkey.
 * Returns cached value immediately, fetches fresh in background.
 */
export function useTrustScore(pubkey: string | undefined): {
  score: number | null
  isLoading: boolean
} {
  const [, forceUpdate] = useState(0)
  const cached = pubkey ? getCached(pubkey) : null

  useEffect(() => {
    if (!pubkey) return
    // Request score (will be batched)
    requestTrustScore(pubkey)
    // Subscribe to updates
    return subscribe(pubkey, () => forceUpdate(n => n + 1))
  }, [pubkey])

  if (!pubkey) return { score: null, isLoading: false }

  return {
    score: cached?.score ?? null,
    isLoading: !cached && pendingPubkeys.has(pubkey),
  }
}

/**
 * Get trust scores for multiple pubkeys (e.g., comment authors).
 * Returns a Map of pubkey -> score.
 */
export function useTrustScores(pubkeys: string[]): Map<string, number | null> {
  const [, forceUpdate] = useState(0)

  // Stabilize pubkeys array
  const pubkeysKey = pubkeys.join(',')
  const stablePubkeys = useMemo(() => pubkeys, [pubkeysKey])

  useEffect(() => {
    if (stablePubkeys.length === 0) return

    // Request all scores
    for (const pk of stablePubkeys) {
      requestTrustScore(pk)
    }

    // Subscribe to updates for all pubkeys
    const unsubs = stablePubkeys.map(pk => subscribe(pk, () => forceUpdate(n => n + 1)))

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [stablePubkeys])

  const result = useCallback(() => {
    const map = new Map<string, number | null>()
    for (const pk of stablePubkeys) {
      const cached = getCached(pk)
      map.set(pk, cached?.score ?? null)
    }
    return map
  }, [stablePubkeys])

  return result()
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | head -20`
Expected: No errors related to `useTrustScore.ts`. May need to adjust `bytesToHex` import if not available from `@noble/hashes` — check what the existing codebase uses.

- [ ] **Step 3: Export from hooks barrel**

Add to `src/hooks/index.ts` in the "PROFILE & SOCIAL" section, after the `useReports` exports:

```typescript
export { useTrustScore, useTrustScores, useTrustScoreProvider } from './useTrustScore'
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTrustScore.ts src/hooks/index.ts
git commit -m "feat: add useTrustScore hook with batching and 24h cache"
```

---

### Task 4: Mount trust score provider in app

**Files:**

- Modify: Find the root provider/layout that wraps the app (likely `src/App.tsx` or `src/providers/`)

The `useTrustScoreProvider()` hook must be called once to wire the signer key into the batch system.

- [ ] **Step 1: Find the right location**

Look for where `useBatchedProfileLoader()` is mounted — the trust score provider should go in the same place.

Run: `grep -r "useBatchedProfileLoader" src/ --include="*.tsx" --include="*.ts" -l`

- [ ] **Step 2: Add `useTrustScoreProvider()` call next to `useBatchedProfileLoader()`**

Import and call the hook in the same component:

```typescript
import { useTrustScoreProvider } from '@/hooks/useTrustScore'

// Inside the component function body, alongside useBatchedProfileLoader():
useTrustScoreProvider()
```

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add <modified-file>
git commit -m "feat: mount trust score provider in app root"
```

---

## Chunk 2: TrustBadge Component & UI Integration

### Task 5: Create TrustBadge component

**Files:**

- Create: `src/components/TrustBadge.tsx`

A small colored pill/badge that shows a trust score next to a username. Color-coded:

- Green (>=0.7): high trust
- Yellow (>=0.4): medium trust
- Red (<0.4): low trust
- Gray: loading/unknown

Uses Tooltip to show details on hover.

- [ ] **Step 1: Create the component**

```tsx
import { useTrustScore } from '@/hooks/useTrustScore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrustBadgeProps {
  pubkey: string
  className?: string
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-green-500'
  if (score >= 0.4) return 'text-yellow-500'
  return 'text-red-500'
}

function scoreLabel(score: number): string {
  if (score >= 0.7) return 'High trust'
  if (score >= 0.4) return 'Medium trust'
  return 'Low trust'
}

export function TrustBadge({ pubkey, className }: TrustBadgeProps) {
  const { score, isLoading } = useTrustScore(pubkey)

  if (score === null && !isLoading) return null
  if (isLoading) return null // Don't show anything while loading

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs',
              score !== null ? scoreColor(score) : 'text-muted-foreground',
              className
            )}
          >
            <Shield className="h-3 w-3" />
            {score !== null && <span>{Math.round(score * 100)}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {score !== null ? (
            <span>
              {scoreLabel(score)} ({(score * 100).toFixed(0)}%)
            </span>
          ) : (
            <span>Loading trust score...</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i "trustbadge\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrustBadge.tsx
git commit -m "feat: add TrustBadge component with color-coded score display"
```

---

### Task 6: Add TrustBadge to CommentItem

**Files:**

- Modify: `src/components/comments/CommentItem.tsx`

Insert the badge after the author name (line 106), before the timestamp.

- [ ] **Step 1: Add import**

Add at the top of `CommentItem.tsx`:

```typescript
import { TrustBadge } from '@/components/TrustBadge'
```

- [ ] **Step 2: Insert badge after author name**

In the author header section (around line 105-106), after the name div and before the timestamp div:

```tsx
{/* Existing: */}
<div className="flex items-center gap-2">
  <div className="font-semibold text-sm">{name}</div>
  <TrustBadge pubkey={comment.pubkey} />
  <div className="text-xs text-muted-foreground">
    {/* timestamp... */}
  </div>
```

The change is inserting `<TrustBadge pubkey={comment.pubkey} />` between the name `<div>` (line 106) and the timestamp `<div>` (line 107).

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/comments/CommentItem.tsx
git commit -m "feat: show trust score badge next to comment author names"
```

---

### Task 7: Add TrustBadge to AuthorPage profile

**Files:**

- Modify: `src/pages/AuthorPage.tsx`

Insert the badge next to the author's display name in the `AuthorProfile` component.

- [ ] **Step 1: Add import**

Add at the top of `AuthorPage.tsx`:

```typescript
import { TrustBadge } from '@/components/TrustBadge'
```

- [ ] **Step 2: Insert badge after display name**

In the `AuthorProfile` component, around line 133-134, modify the heading to include the badge:

```tsx
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-2">
    <h1 className="text-xl font-semibold text-foreground">{displayName}</h1>
    <TrustBadge pubkey={pubkey} />
  </div>
  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 pr-4">
```

This wraps the `<h1>` and `<TrustBadge>` in a flex container so they sit inline.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AuthorPage.tsx
git commit -m "feat: show trust score badge on author profile page"
```

---

### Task 8: Final verification, format, and changelog

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no new errors.

- [ ] **Step 2: Run formatter**

Run: `npm run format`

- [ ] **Step 3: Update CHANGELOG.md**

Add under `## [Unreleased]` → `### Added`:

```markdown
- Trust score badges next to usernames in comments and on author profile pages — scores are fetched from a ContextVM relatr instance, personalized per viewer, batched (200ms window), and cached for 24 hours
```

- [ ] **Step 4: Manual testing**

Start dev server with `npm run dev`. Verify:

1. Trust badges appear next to comment author names (small shield icon + number)
2. Trust badge appears on author profile pages next to display name
3. Scores are color-coded (green/yellow/red)
4. Hover tooltip shows "High/Medium/Low trust (X%)"
5. Cache works — reload page, scores appear instantly from cache
6. No console errors related to ContextVM

- [ ] **Step 5: Commit all changes**

```bash
git add -A
git commit -m "feat: integrate ContextVM trust scores with badges on comments and profiles"
```
