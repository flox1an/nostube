import type { NsfwFilter } from '@/contexts/AppContext'

export type ContentSafetyGate = 'visible' | 'hidden' | 'warning'

interface ContentSafetySources {
  nsfwPubkeys: string[]
  blockedPubkeys?: Record<string, unknown>
}

export function getContentSafetyGate(
  pubkey: string | undefined,
  nsfwFilter: NsfwFilter | undefined,
  { nsfwPubkeys, blockedPubkeys }: ContentSafetySources
): ContentSafetyGate {
  if (!pubkey) return 'visible'
  if (blockedPubkeys?.[pubkey]) return 'hidden'
  if (!nsfwPubkeys.includes(pubkey)) return 'visible'

  if (nsfwFilter === 'warning') return 'warning'
  if (nsfwFilter === 'hide' || nsfwFilter === undefined) return 'hidden'

  return 'visible'
}
