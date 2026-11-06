import { describe, expect, it } from 'vitest'
import { packTrustSnapshot, unpackTrustScore } from './trust-snapshot'
import type { TrustScoreResult } from '@/nostr/contextvm'

describe('compact stale trust baseline', () => {
  it('preserves missing validators, zero scores, timestamps and full breakdowns', () => {
    const results: TrustScoreResult[] = [
      {
        sourcePubkey: 'source',
        targetPubkey: 'a',
        score: 0,
        computedAt: 123,
        components: {
          distanceWeight: 0,
          socialDistance: 0,
          normalizedDistance: 0,
          validators: { activity: { score: 0 } },
        },
      },
      {
        sourcePubkey: 'source',
        targetPubkey: 'b',
        score: 0.8,
        computedAt: '2026-11-05',
        components: {
          distanceWeight: 0.5,
          socialDistance: 2,
          normalizedDistance: 0.2,
          validators: { viewer: { score: 0.9 } },
        },
      },
    ]
    const snapshot = packTrustSnapshot('today', 'server', results)
    expect(results.map(r => unpackTrustScore(snapshot, r.targetPubkey))).toEqual(results)
    expect(unpackTrustScore(snapshot, 'unknown')).toBeNull()
  })
})
