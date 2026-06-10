import { describe, expect, it } from 'vitest'
import { extractTrustScoresFromPayload, type TrustScoreResult } from './contextvm'

function trustScore(targetPubkey: string, score: number): TrustScoreResult {
  return {
    sourcePubkey: 'source',
    targetPubkey,
    score,
    components: {
      distanceWeight: 1,
      socialDistance: 1,
      normalizedDistance: 1,
      validators: {},
    },
    computedAt: '2026-06-10T00:00:00.000Z',
  }
}

describe('extractTrustScoresFromPayload', () => {
  it('reads batch scores from a top-level array', () => {
    const scores = [trustScore('alice', 0.8), trustScore('bob', 0.6)]

    expect(extractTrustScoresFromPayload(scores)).toEqual(scores)
  })

  it('reads batch scores from a trustScores object', () => {
    const scores = [trustScore('alice', 0.8), trustScore('bob', 0.6)]

    expect(extractTrustScoresFromPayload({ trustScores: scores })).toEqual(scores)
  })

  it('reads single scores from a trustScore object', () => {
    const score = trustScore('alice', 0.8)

    expect(extractTrustScoresFromPayload({ trustScore: score })).toEqual([score])
  })
})
