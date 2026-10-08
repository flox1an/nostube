import type { NsfwFilter } from '@/types/app-config'

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

/**
 * Deployment switch, read at build time. Only the exact value `off` disables
 * nostube's NSFW safety (age confirmation, embed gate) — for self-hosted
 * builds whose operator takes responsibility. Anything else keeps it on.
 */
export const NSFW_SAFETY_ENABLED = import.meta.env.VITE_NSFW_SAFETY !== 'off'

/**
 * The viewer's effective NSFW mode from a stored (untrusted) app config.
 * Opting in to `warning`/`show` only counts after the 18+ confirmation;
 * missing, unknown or unconfirmed values mean `hide`.
 */
export function getEffectiveNsfwFilter(
  stored: { nsfwFilter?: unknown; nsfwAgeConfirmed?: unknown } | null | undefined,
  safetyEnabled = NSFW_SAFETY_ENABLED
): NsfwFilter {
  const filter = stored?.nsfwFilter
  if (filter !== 'warning' && filter !== 'show') return 'hide'
  if (safetyEnabled && stored?.nsfwAgeConfirmed !== true) return 'hide'
  return filter
}

export type VideoPlayback = 'play' | 'warn' | 'hidden'

/**
 * Whether a single video may play. `contentWarning` comes from `processEvent`,
 * which flags explicit `content-warning` tags, NSFW platform attributes and
 * preset NSFW authors alike.
 */
export function getVideoPlayback(
  contentWarning: string | undefined,
  nsfwFilter: NsfwFilter | undefined
): VideoPlayback {
  if (!contentWarning || nsfwFilter === 'show') return 'play'
  return nsfwFilter === 'warning' ? 'warn' : 'hidden'
}
