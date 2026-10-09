import { loadInstanceConfig, type InstanceConfig } from '@nostube/core/instance-config'

/**
 * The embed served by a nostube-server instance is part of the creator's website: it follows the
 * instance config (accent colour, which videos are the creator's, where links go) and registers it
 * the way the site does, which also switches off the image proxy and lets the instance's own
 * address through the media URL checks. The server build sets VITE_EMBED_INSTANCE; the embed on
 * nostu.be never asks, so it makes no extra request there.
 */
export const EMBED_ON_INSTANCE = import.meta.env.VITE_EMBED_INSTANCE === 'true'

/** The instance's public config (registered), or null on nostu.be and when it cannot be read. */
export async function loadEmbedInstance(
  fetcher: typeof fetch = fetch,
  enabled: boolean = EMBED_ON_INSTANCE
): Promise<InstanceConfig | null> {
  if (!enabled) return null
  try {
    return await loadInstanceConfig(fetcher)
  } catch {
    return null
  }
}

/** The accent of the instance as six hex digits (no `#`), unless the embed URL names a colour. */
export function accentFor(instance: InstanceConfig | null, search: string): string | null {
  if (!instance || new URLSearchParams(search).has('color')) return null
  const accent = instance.site.theme.accent
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.slice(1) : null
}
