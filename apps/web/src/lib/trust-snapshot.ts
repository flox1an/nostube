import type { TrustScoreResult } from '@/nostr/contextvm'

// Columnar storage keeps the full stale baseline without repeating validator names 2,888 times.
export interface TrustSnapshot {
  generatedAt: string
  serverPubkey: string
  sourcePubkey: string
  validatorKeys: string[]
  scores: Record<string, [number, number, number, number, string | number, (number | null)[]]>
}

export function packTrustSnapshot(
  generatedAt: string,
  serverPubkey: string,
  results: TrustScoreResult[]
): TrustSnapshot {
  const validatorKeys = [...new Set(results.flatMap(r => Object.keys(r.components.validators)))]
  const sourcePubkey = results[0]?.sourcePubkey ?? ''
  return {
    generatedAt,
    serverPubkey,
    sourcePubkey,
    validatorKeys,
    scores: Object.fromEntries(
      results.map(result => {
        if (result.sourcePubkey !== sourcePubkey) throw new Error('Mixed snapshot source pubkeys')
        const { distanceWeight, socialDistance, normalizedDistance, validators } = result.components
        return [
          result.targetPubkey,
          [
            result.score,
            distanceWeight,
            socialDistance,
            normalizedDistance,
            result.computedAt,
            validatorKeys.map(key => validators[key]?.score ?? null),
          ],
        ]
      })
    ),
  }
}

export function unpackTrustScore(snapshot: TrustSnapshot, pubkey: string): TrustScoreResult | null {
  const row = snapshot.scores[pubkey]
  if (!row) return null
  const [score, distanceWeight, socialDistance, normalizedDistance, computedAt, values] = row
  return {
    sourcePubkey: snapshot.sourcePubkey,
    targetPubkey: pubkey,
    score,
    computedAt,
    components: {
      distanceWeight,
      socialDistance,
      normalizedDistance,
      validators: Object.fromEntries(
        snapshot.validatorKeys.flatMap((key, i) =>
          values[i] == null ? [] : [[key, { score: values[i] }]]
        )
      ),
    },
  }
}
