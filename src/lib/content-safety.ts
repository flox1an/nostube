import type { NsfwFilter } from '@/contexts/AppContext'

export type ContentSafetyGate = 'visible' | 'hidden'

interface ContentSafetySources {
  nsfwPubkeys: string[]
  blockedPubkeys?: Record<string, unknown>
}

/**
 * Page-level gate for profiles and videos. In `warning` mode the page stays
 * reachable; individual media is blurred instead (VideoCard, VideoPlayer).
 */
export function getContentSafetyGate(
  pubkey: string | undefined,
  nsfwFilter: NsfwFilter | undefined,
  { nsfwPubkeys, blockedPubkeys }: ContentSafetySources
): ContentSafetyGate {
  if (!pubkey) return 'visible'
  if (blockedPubkeys?.[pubkey]) return 'hidden'
  if (!nsfwPubkeys.includes(pubkey)) return 'visible'

  if (nsfwFilter === 'hide' || nsfwFilter === undefined) return 'hidden'

  return 'visible'
}
