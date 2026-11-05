/**
 * Regenerates src/data/trust-scores.json from the live Relatr ContextVM server.
 *
 * 1. Collects authors of recent video events (kinds 21, 22, 34235, 34236) from VIDEO_RELAYS.
 * 2. Asks Relatr `calculate_trust_scores` for them with a throwaway client key. The server
 *    scores from its configured default source pubkey (it ignores client identity).
 * 3. Keeps only results Relatr actually computed validators for (expired/missing metrics
 *    come back as `validators: {}`, which must not be treated as trusted).
 *
 * Usage (from apps/web): npx tsx scripts/refresh-trust-snapshot.ts [days=60]
 */
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client'
import { NostrClientTransport, PrivateKeySigner, ApplesauceRelayPool } from '@contextvm/sdk'
import { SimplePool, generateSecretKey, nip19 } from 'nostr-tools'
import { bytesToHex } from 'nostr-tools/utils'
import { extractTrustScoresFromPayload, type TrustScoreResult } from '../src/nostr/contextvm'

const SERVER_NPUB = 'npub16w48u4xvtlp7ywgfsjlud74tlgdfx9s33scdlafmgl3a40n9tthsu6ty8g'
const CONTEXTVM_RELAYS = [
  'wss://relay2.contextvm.org',
  'wss://relay.contextvm.org',
  'wss://relay.nostu.be',
]
const VIDEO_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.divine.video',
]
const VIDEO_KINDS = [21, 22, 34235, 34236]
const BATCH = 20 // Match useTrustScore; larger replies risk the NIP-44 plaintext limit.
const ATTEMPTS = 3
const PACE_MS = 1500
const HEX = /^[0-9a-f]{64}$/
const OUT = fileURLToPath(new URL('../src/data/trust-scores.json', import.meta.url))

const days = Number(process.argv[2] ?? 60)
const since = Math.floor(Date.now() / 1000) - days * 86400
const serverPubkey = nip19.decode(SERVER_NPUB).data as string

async function collectAuthors(): Promise<string[]> {
  const pool = new SimplePool()
  const authors = new Set<string>()
  await Promise.all(
    VIDEO_RELAYS.map(async relay => {
      // Page backwards with `until` until the relay has nothing older than `since`.
      for (let until = Math.floor(Date.now() / 1000); ;) {
        const events = await pool
          .querySync([relay], { kinds: VIDEO_KINDS, since, until, limit: 500 }, { maxWait: 15000 })
          .catch(error => {
            console.error(`${relay}: ${error}`)
            return []
          })
        if (events.length === 0) break
        for (const e of events) authors.add(e.pubkey)
        const oldest = Math.min(...events.map(e => e.created_at))
        if (oldest >= until) break
        until = oldest - 1
      }
    })
  )
  pool.close(VIDEO_RELAYS)
  return [...authors].sort()
}

const isUnit = (n: unknown) => typeof n === 'number' && n >= 0 && n <= 1

/** Full Relatr result with sane values; rejects anything we could misread as trust. */
function isValidScore(s: TrustScoreResult, now: number): boolean {
  const c = s?.components
  return (
    HEX.test(s?.sourcePubkey) &&
    HEX.test(s.targetPubkey) &&
    isUnit(s.score) &&
    isUnit(c?.distanceWeight) &&
    isUnit(c.normalizedDistance) &&
    Number.isFinite(c.socialDistance) &&
    c.socialDistance >= 0 &&
    typeof c.validators === 'object' &&
    c.validators !== null &&
    Object.values(c.validators).every(v => isUnit(v?.score)) &&
    typeof s.computedAt === 'number' &&
    s.computedAt > 1_600_000_000 &&
    s.computedAt <= now + 86400
  )
}

async function main() {
  const authors = await collectAuthors()
  console.error(`video authors since ${days}d: ${authors.length}`)
  if (authors.length === 0) throw new Error('No video authors found; keeping existing snapshot')

  const client = new Client({ name: 'nostube-trust-snapshot', version: '1.0.0' })
  const relayPool = new ApplesauceRelayPool(CONTEXTVM_RELAYS)
  const transport = new NostrClientTransport({
    serverPubkey,
    signer: new PrivateKeySigner(bytesToHex(generateSecretKey())),
    relayHandler: relayPool,
    isStateless: true,
  })
  await client.connect(transport)

  const now = Math.floor(Date.now() / 1000)
  const scores: TrustScoreResult[] = []
  let empty = 0
  let omitted = 0
  for (let i = 0; i < authors.length; i += BATCH) {
    const chunk = authors.slice(i, i + BATCH)
    // Relatr's rate limiter is shared with app users (15 burst, 2/s refill); stay well below it.
    await sleep(i === 0 ? 0 : PACE_MS)
    let result
    for (let attempt = 1; !result; attempt++) {
      try {
        const res = await client.callTool({
          name: 'calculate_trust_scores',
          arguments: { targetPubkeys: chunk },
        })
        if (res.isError) throw new Error(`Relatr error: ${JSON.stringify(res.content)}`)
        result = res
      } catch (error) {
        // Any batch failing for good aborts the run, so a partial snapshot never overwrites a good one.
        if (attempt >= ATTEMPTS) throw error
        console.error(`batch ${i} attempt ${attempt} failed: ${error}`)
        await sleep(10_000)
      }
    }

    const batch = extractTrustScoresFromPayload(result.structuredContent)
    for (const s of batch) {
      if (!isValidScore(s, now) || !chunk.includes(s.targetPubkey)) {
        throw new Error(`Unexpected Relatr result: ${JSON.stringify(s)}`)
      }
      if (s.sourcePubkey !== (scores[0]?.sourcePubkey ?? s.sourcePubkey)) {
        throw new Error(`Mixed source pubkeys: ${scores[0].sourcePubkey} vs ${s.sourcePubkey}`)
      }
      // Missing/expired metrics come back as validators: {} — not a real score.
      if (Object.keys(s.components.validators).length === 0) {
        empty++
        continue
      }
      for (const v of Object.values(s.components.validators)) delete v.description
      scores.push(s)
    }
    // Relatr omits targets it has neither metrics nor a profile for.
    omitted += chunk.length - batch.length
    console.error(
      `${i + chunk.length}/${authors.length} scored=${scores.length} empty=${empty} omitted=${omitted}`
    )
  }
  await client.close()
  await relayPool.disconnect()

  if (scores.length === 0)
    throw new Error('Relatr returned no full scores; keeping existing snapshot')
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), serverPubkey, scores }) + '\n'
  )
  console.error(`wrote ${scores.length} scores (source ${scores[0].sourcePubkey}) to ${OUT}`)
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error)
    process.exit(1)
  }
)
