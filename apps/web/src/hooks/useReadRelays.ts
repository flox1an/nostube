import { useMemo } from 'react'
import { useAppContext } from './useAppContext'

/**
 * Returns read relays from app configuration (localStorage config with "read" tag)
 * Does NOT use NIP-65 relay list - uses explicit app config only
 */
export function useReadRelays(): string[] {
  const { config } = useAppContext()

  // Content-stable: config updates rebuild the relays array, but the URLs usually
  // stay the same — key on the URLs so callers get a stable reference.
  const relayKey = config.relays
    .filter(r => r.tags.includes('read'))
    .map(r => r.url)
    .join(',')

  return useMemo(() => (relayKey ? relayKey.split(',') : []), [relayKey])
}
